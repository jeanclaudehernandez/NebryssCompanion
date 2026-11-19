/**
 * FLUX image generation through the local ComfyUI (the image studio in the AI Session Manager).
 *
 * - Starting and stopping ComfyUI: colibri-engine.js calls start/stop/waitUntilReady when the UI
 *   switches the GPU between Colibri and FLUX (both do not fit in the 16 GB together). ComfyUI
 *   runs in a minimized "ComfyUI - FLUX" window (closing it stops ComfyUI), its output copied to
 *   a log file per launch that the switch popup follows.
 * - The studio's choices: the FLUX workflows saved in ComfyUI (read from disk, so they show
 *   before ComfyUI runs) and the LoRAs in models/loras, named and given trigger words by
 *   flux-loras.json.
 * - Making an image: the same FLUX graph the saved workflows use is built from the studio's
 *   settings and queued; progress comes from ComfyUI's WebSocket. The finished picture is moved
 *   out of ComfyUI's output folder into a temporary folder (TEMP_DIR), where it stays until the
 *   GM saves it (moved to src/assets/images/flux) or discards it (deleted).
 */
const { execFile } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const COMFY_DIR = process.env.COMFYUI_DIR || 'C:\\Users\\Jean\\Desktop\\ComfyUI';
const COMFY_URL = (process.env.COMFYUI_URL || 'http://127.0.0.1:8188').replace(/\/+$/, '');
const COMFY_PORT = Number(new URL(COMFY_URL).port) || 8188;
const APP_DIR = path.join(COMFY_DIR, 'ComfyUI');
const PYTHON = path.join(COMFY_DIR, 'python_embeded', 'python.exe');
const WORKFLOW_DIR = path.join(APP_DIR, 'user', 'default', 'workflows');
const LORA_DIR = path.join(APP_DIR, 'models', 'loras');
const CHECKPOINT_DIR = path.join(APP_DIR, 'models', 'checkpoints');
const OUTPUT_DIR = path.join(APP_DIR, 'output');
const OUTPUT_SUBFOLDER = 'nebryss-flux';

// Made but not yet saved or discarded.
const TEMP_DIR = process.env.FLUX_TEMP_DIR || path.join(os.tmpdir(), 'nebryss-flux');
// Saved: the app's assets folder (and the built app's copy, when there is one).
const SAVE_DIR = process.env.FLUX_SAVE_DIR || path.resolve(__dirname, '../src/assets/images/flux');
const DIST_ASSETS_DIR = process.env.FLUX_DIST_ASSETS_DIR || path.resolve(__dirname, '../dist/nebryss-companion/browser/assets');
const SAVE_URL_PREFIX = 'assets/images/flux/';

const LOG_DIR = os.tmpdir();
const LOG_PREFIX = 'nebryss-comfyui-';
const KEEP_LOGS = 5;
const CONSOLE_SCRIPT = path.join(__dirname, 'colibri-console.js');
const WINDOW_TITLE = 'ComfyUI - FLUX';
const STOP_TIMEOUT_MS = 30000;
const READY_TIMEOUT_MS = 3 * 60 * 1000;
const JOB_TIMEOUT_MS = 15 * 60 * 1000;

const LORA_TABLE_FILE = path.join(__dirname, 'flux-loras.json');
const SIZES = [
  { id: 'portrait', label: 'Portrait', width: 832, height: 1216 },
  { id: 'landscape', label: 'Landscape', width: 1216, height: 832 },
  { id: 'square', label: 'Square', width: 1024, height: 1024 }
];
const DEFAULTS = { checkpoint: 'flux1-dev-fp8.safetensors', guidance: 3.5, steps: 20, sampler: 'euler', scheduler: 'simple' };
// The one workflow the studio uses (its base settings); LoRAs are picked in the studio, up to MAX_LORAS.
const STUDIO_WORKFLOW = 'FLUX (Nebryss studio).json';
const MAX_LORAS = 4;
const LORA_NODE_IDS = ['2', '10', '11', '12'];

// Image files the studio hands out: our own names only, never a path.
const IMAGE_ID_RE = /^flux-[0-9a-z-]+$/;
const SAVED_FILE_RE = /^[a-z0-9][a-z0-9-]*\.png$/;

let logFile = path.join(LOG_DIR, `${LOG_PREFIX}engine.log`);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function run(file, args, timeout = 15000, env = process.env) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout, windowsHide: true, env }, (err, stdout, stderr) => {
      resolve({ err, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

async function fetchJson(url, options = {}, timeoutMs = 5000) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }
  if (!res.ok) {
    const err = new Error(`ComfyUI answered ${res.status}`);
    err.body = body;
    throw err;
  }
  return body;
}

// ─── ComfyUI process ─────────────────────────────────────────────

/** True when ComfyUI answers on its port (an HTTP call, no extra process). */
async function isRunning() {
  try {
    await fetchJson(`${COMFY_URL}/system_stats`, {}, 2500);
    return true;
  } catch (_) {
    return false;
  }
}

/** True while something accepts connections on ComfyUI's port. */
function portInUse() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port: COMFY_PORT });
    const done = (inUse) => { socket.destroy(); resolve(inUse); };
    socket.setTimeout(1000, () => done(true));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

/**
 * ComfyUI's Python process: the one listening on the port or, while it is still starting, a
 * python.exe of this ComfyUI folder running main.py. Null when neither.
 */
async function findProcess() {
  const script =
    `$c = Get-NetTCPConnection -LocalPort ${COMFY_PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; ` +
    `if ($c) { $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)" } ` +
    `else { $p = Get-CimInstance Win32_Process -Filter "Name='python.exe'" | ` +
    `Where-Object { $_.CommandLine -and $_.CommandLine -match 'main\\.py' -and $_.ExecutablePath -and ` +
    `$_.ExecutablePath.StartsWith($env:NEBRYSS_COMFY_DIR, [StringComparison]::OrdinalIgnoreCase) } | Select-Object -First 1 }; ` +
    `if ($p) { Write-Output ("$($p.ProcessId)" + [char]9 + "$($p.Name)" + [char]9 + "$($p.ExecutablePath)" + [char]9 + "$($p.CommandLine)") }`;
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], 15000,
    { ...process.env, NEBRYSS_COMFY_DIR: COMFY_DIR });
  const line = stdout.trim().split(/\r?\n/).pop();
  if (!line) return null;
  const [pid, name, exe = '', commandLine = ''] = line.split('\t');
  return { pid: Number(pid), name, exe, commandLine };
}

/** Only ComfyUI's own main.py is ever stopped. */
function isComfyProcess(proc) {
  return !!proc && /main\.py/i.test(proc.commandLine) && /comfy/i.test(`${proc.exe} ${proc.commandLine}`);
}

/** Stops ComfyUI's process (and anything under it); resolves once its port is free. */
async function stop(proc, addLog = () => { }) {
  addLog([`[switch] stopping ComfyUI (pid ${proc.pid})`]);
  const r = await run('taskkill.exe', ['/PID', String(proc.pid), '/T', '/F']);
  if (r.err && !/not found/i.test(r.stderr + r.stdout)) addLog([`[switch] taskkill: ${(r.stderr || r.stdout).trim()}`]);
  const deadline = Date.now() + STOP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!isAlive(proc.pid) && !(await portInUse())) {
      addLog(['[switch] ComfyUI stopped; its GPU memory is released']);
      return;
    }
    await sleep(1000);
  }
  throw new Error(`ComfyUI was still running ${STOP_TIMEOUT_MS / 1000}s after it was told to stop.`);
}

const q = (s) => `"${String(s).replace(/"/g, '')}"`;

function newLogFile() {
  try {
    const old = fs.readdirSync(LOG_DIR)
      .filter(f => f.startsWith(LOG_PREFIX) && f.endsWith('.log'))
      .map(f => ({ f, t: fs.statSync(path.join(LOG_DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
      .slice(KEEP_LOGS - 1);
    for (const { f } of old) {
      for (const file of [f, f.replace(/\.log$/, '.cmd')]) {
        try { fs.unlinkSync(path.join(LOG_DIR, file)); } catch (_) { }
      }
    }
  } catch (_) { }
  logFile = path.join(LOG_DIR, `${LOG_PREFIX}${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
  fs.writeFileSync(logFile, '');
  return logFile;
}

/**
 * Starts ComfyUI the way colibri-engine.js starts Colibri: a batch file run by its own console
 * host (outside the API's process tree, so it survives an API restart), minimized and titled
 * "ComfyUI - FLUX", its output shown there and copied to a fresh log file.
 * Resolves with the console host's PID (the window: closing it stops ComfyUI).
 */
async function start(addLog = () => { }) {
  if (!fs.existsSync(PYTHON)) throw new Error(`ComfyUI was not found: ${PYTHON} does not exist (set COMFYUI_DIR).`);
  newLogFile();
  const serve = [q(PYTHON), '-s', q(path.join('ComfyUI', 'main.py')), '--windows-standalone-build', '--disable-auto-launch'].join(' ');
  const tee = [q(process.execPath), q(CONSOLE_SCRIPT), q(logFile), q(WINDOW_TITLE)].join(' ');
  const batchFile = logFile.replace(/\.log$/, '.cmd');
  fs.writeFileSync(batchFile, ['@echo off', 'chcp 65001 >nul', `title ${WINDOW_TITLE}`, `cd /d ${q(COMFY_DIR)}`, `${serve} 2>&1 | ${tee}`, ''].join('\r\n'));
  addLog([`[switch] ${serve}`]);
  const env = {
    ...process.env,
    PYTHONUNBUFFERED: '1',
    PYTHONIOENCODING: 'utf-8',
    NEBRYSS_COMFY_CMDLINE: `cmd.exe /d /c ${/\s/.test(batchFile) ? q(batchFile) : batchFile}`,
    NEBRYSS_COMFY_DIR: COMFY_DIR
  };
  const script =
    '$p = Start-Process -FilePath conhost.exe -ArgumentList $env:NEBRYSS_COMFY_CMDLINE ' +
    '-WorkingDirectory $env:NEBRYSS_COMFY_DIR -WindowStyle Minimized -PassThru; $p.Id';
  const result = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], 20000, env);
  const pid = Number(result.stdout.trim().split(/\r?\n/).pop());
  if (!pid) throw new Error(`Could not start ComfyUI: ${(result.stderr || result.err?.message || 'no process id returned').trim()}`);
  addLog([`[switch] started ComfyUI (window pid ${pid}), output in ${logFile}`]);
  return pid;
}

/** Waits until ComfyUI answers; rejects if its window closes first or the timeout passes. */
async function waitUntilReady(pid) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isRunning()) return;
    if (pid && !isAlive(pid)) {
      const err = new Error('ComfyUI exited before it was ready');
      err.engineExited = true;
      throw err;
    }
    await sleep(1000);
  }
  throw new Error(`ComfyUI was not ready after ${READY_TIMEOUT_MS / 60000} minutes.`);
}

// ─── Workflows and LoRAs ─────────────────────────────────────────

function readLoraTable() {
  try {
    const table = JSON.parse(fs.readFileSync(LORA_TABLE_FILE, 'utf8'));
    delete table._comment;
    return table;
  } catch (_) {
    return {};
  }
}

const widget = (node, i, fallback) => (node && Array.isArray(node.widgets_values) && node.widgets_values[i] !== undefined ? node.widgets_values[i] : fallback);

/**
 * The studio's one workflow (STUDIO_WORKFLOW in ComfyUI's workflows folder): its checkpoint,
 * size, steps, guidance and sampler are the studio's base settings. The LoRAs come from the
 * studio's picker, not from the file. Built-in defaults when the file is missing or unreadable.
 */
function readStudioWorkflow() {
  const base = { id: STUDIO_WORKFLOW, name: STUDIO_WORKFLOW.replace(/\.json$/i, ''), found: false, checkpoint: DEFAULTS.checkpoint, width: 832, height: 1216, guidance: DEFAULTS.guidance, steps: DEFAULTS.steps, sampler: DEFAULTS.sampler, scheduler: DEFAULTS.scheduler };
  let wf;
  try { wf = JSON.parse(fs.readFileSync(path.join(WORKFLOW_DIR, STUDIO_WORKFLOW), 'utf8')); } catch (_) { return base; }
  const nodes = Array.isArray(wf?.nodes) ? wf.nodes.filter(n => n && n.mode !== 4) : []; // mode 4 = bypassed
  const find = (type) => nodes.find(n => n.type === type);
  const ckpt = find('CheckpointLoaderSimple');
  const sampler = find('KSampler');
  const latent = find('EmptySD3LatentImage') || find('EmptyLatentImage');
  return {
    ...base,
    found: true,
    checkpoint: String(widget(ckpt, 0, base.checkpoint)) || base.checkpoint,
    width: Number(widget(latent, 0, base.width)) || base.width,
    height: Number(widget(latent, 1, base.height)) || base.height,
    guidance: Number(widget(find('FluxGuidance'), 0, base.guidance)) || base.guidance,
    steps: Number(widget(sampler, 2, base.steps)) || base.steps,
    sampler: String(widget(sampler, 4, base.sampler)),
    scheduler: String(widget(sampler, 5, base.scheduler))
  };
}

/**
 * The LoRA files, with a readable name and trigger words, in two groups: 'best' (each LoRA's
 * recommended file: flux-loras.json's "best", else its final/only file) and 'other' (training
 * checkpoints, older finals, LoRAs marked "best": false, and files flux-loras.json does not know).
 */
function listLoras() {
  let files = [];
  try { files = fs.readdirSync(LORA_DIR).filter(f => f.toLowerCase().endsWith('.safetensors')); } catch (_) { }
  const table = readLoraTable();
  const keys = Object.keys(table).sort((a, b) => b.length - a.length);
  const keyOf = (base) => keys.find(k => base.startsWith(k));
  // Families with training checkpoints (name-stepNNNN): their plain file is the final one.
  const trained = new Set(files.map(f => f.replace(/\.safetensors$/i, '')).filter(b => /-step\d+$/.test(b)).map(keyOf).filter(Boolean));
  const isBest = (file, key, info) => {
    if (!info || info.best === false) return false;
    if (typeof info.best === 'string') return file === info.best;
    const family = files.filter(f => keyOf(f.replace(/\.safetensors$/i, '')) === key);
    return family.length === 1 || file === `${key}.safetensors`;
  };
  return files.map((file) => {
    const base = file.replace(/\.safetensors$/i, '');
    const key = keyOf(base);
    const info = key ? table[key] : null;
    const stepMatch = base.match(/-step0*(\d+)$/);
    const label = info
      ? `${info.name}${stepMatch ? ` · step ${Number(stepMatch[1])}` : trained.has(key) ? ' · final' : ''}`
      : base;
    const best = isBest(file, key, info);
    return {
      file,
      label,
      family: info ? info.name : base,
      trigger: info ? info.trigger : '',
      strength: info && Number(info.strength) ? Number(info.strength) : 1,
      style: !!(info && info.style), // a drawing style, stacked on top of a subject LoRA
      detail: !!(info && info.detail), // a part (weapon, helmet) stacked on a subject LoRA
      step: stepMatch ? Number(stepMatch[1]) : null,
      group: best ? 'best' : 'other'
    };
  }).sort((a, b) => a.family.localeCompare(b.family) || (a.step ?? 1e9) - (b.step ?? 1e9));
}

function catalog() {
  return { workflow: readStudioWorkflow(), loras: listLoras(), sizes: SIZES, defaults: DEFAULTS, maxLoras: MAX_LORAS, tempDir: TEMP_DIR, saveDir: SAVE_DIR };
}

// ─── Images: temporary, saved, discarded ─────────────────────────

let imagesCache = null;

function listImages() {
  if (imagesCache) return imagesCache;
  let files = [];
  try { files = fs.readdirSync(TEMP_DIR).filter(f => IMAGE_ID_RE.test(f.replace(/\.png$/, '')) && f.endsWith('.png')); } catch (_) { }
  imagesCache = files.map((f) => {
    const id = f.replace(/\.png$/, '');
    let meta = {};
    try { meta = JSON.parse(fs.readFileSync(path.join(TEMP_DIR, `${id}.json`), 'utf8')); } catch (_) { }
    let createdAt = meta.createdAt;
    if (!createdAt) try { createdAt = fs.statSync(path.join(TEMP_DIR, f)).mtimeMs; } catch (_) { createdAt = 0; }
    return { ...meta, id, createdAt, file: f };
  }).sort((a, b) => b.createdAt - a.createdAt);
  return imagesCache;
}

/** Full path of an image the studio may show: a temporary one, or one saved to the assets folder. */
function imagePath(file) {
  const name = String(file || '');
  if (name.endsWith('.png') && IMAGE_ID_RE.test(name.slice(0, -4))) {
    const p = path.join(TEMP_DIR, name);
    if (fs.existsSync(p)) return p;
  }
  if (SAVED_FILE_RE.test(name)) {
    const p = path.join(SAVE_DIR, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function moveFile(from, to) {
  try {
    fs.renameSync(from, to);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    fs.copyFileSync(from, to);
    fs.unlinkSync(from);
  }
}

function slugify(text) {
  return String(text || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

function stamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

/** Moves a temporary image into the app's assets folder. Resolves with where it went. */
function save(id, name) {
  if (!IMAGE_ID_RE.test(String(id))) throw new Error('Unknown image.');
  const src = path.join(TEMP_DIR, `${id}.png`);
  if (!fs.existsSync(src)) throw new Error('That image is no longer in the temporary folder.');
  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(path.join(TEMP_DIR, `${id}.json`), 'utf8')); } catch (_) { }
  const base = slugify(name) || `${slugify(meta.loras?.[0]?.name || meta.loraName || meta.workflow || 'flux') || 'flux'}-${stamp(new Date(meta.createdAt || Date.now()))}`;
  fs.mkdirSync(SAVE_DIR, { recursive: true });
  let file = `${base}.png`;
  for (let n = 2; fs.existsSync(path.join(SAVE_DIR, file)); n++) file = `${base}-${n}.png`;
  const dest = path.join(SAVE_DIR, file);
  moveFile(src, dest);
  try { fs.unlinkSync(path.join(TEMP_DIR, `${id}.json`)); } catch (_) { }
  // The built app serves dist/, which is only rebuilt by `ng build`: copy it there too.
  if (fs.existsSync(DIST_ASSETS_DIR)) {
    try {
      const distDir = path.join(DIST_ASSETS_DIR, 'images', 'flux');
      fs.mkdirSync(distDir, { recursive: true });
      fs.copyFileSync(dest, path.join(distDir, file));
    } catch (_) { }
  }
  imagesCache = null;
  emitNow();
  return { id, file, path: dest, url: `${SAVE_URL_PREFIX}${file}` };
}

/** Deletes a temporary image (and its settings file). */
function discard(id) {
  if (!IMAGE_ID_RE.test(String(id))) throw new Error('Unknown image.');
  for (const ext of ['.png', '.json']) {
    try { fs.unlinkSync(path.join(TEMP_DIR, `${id}${ext}`)); } catch (err) { if (err.code !== 'ENOENT') throw err; }
  }
  imagesCache = null;
  emitNow();
  return { id };
}

// ─── Generation ──────────────────────────────────────────────────

const listeners = new Set();
let job = null;
let emitTimer = null;

function publicState() {
  return { job, images: listImages().slice(0, 60), tempDir: TEMP_DIR, saveDir: SAVE_DIR };
}

function emitNow() {
  if (emitTimer) { clearTimeout(emitTimer); emitTimer = null; }
  const snapshot = publicState();
  for (const fn of listeners) {
    try { fn(snapshot); } catch (_) { }
  }
}

function emitSoon() {
  if (!emitTimer) emitTimer = setTimeout(emitNow, 250);
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setJob(patch, soon = false) {
  job = { ...job, ...patch };
  if (soon) emitSoon(); else emitNow();
}

const isBusy = () => !!job && !['done', 'error', 'cancelled'].includes(job.phase);

function num(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Checks and completes the studio's settings; throws a readable error for a bad one. */
function normalizeParams(p = {}) {
  const prompt = String(p.prompt || '').trim();
  if (!prompt) throw new Error('Write a prompt first.');
  if (prompt.length > 4000) throw new Error('The prompt is too long (4000 characters at most).');
  const checkpoint = String(p.checkpoint || DEFAULTS.checkpoint);
  if (path.basename(checkpoint) !== checkpoint || !fs.existsSync(path.join(CHECKPOINT_DIR, checkpoint))) {
    throw new Error(`The checkpoint ${checkpoint} is not in ComfyUI's models/checkpoints.`);
  }
  // The LoRAs, in order: `loras` [{file, strength, name}] (or the older lora / lora2 fields).
  const requested = Array.isArray(p.loras)
    ? p.loras
    : [p.lora && { file: p.lora, strength: p.loraStrength, name: p.loraName }, p.lora2 && { file: p.lora2, strength: p.lora2Strength, name: p.lora2Name }].filter(Boolean);
  const loras = [];
  for (const item of requested) {
    const file = String(item?.file || '');
    if (!file || loras.some(l => l.file === file)) continue;
    if (path.basename(file) !== file || !fs.existsSync(path.join(LORA_DIR, file))) throw new Error(`The LoRA ${file} is not in ComfyUI's models/loras.`);
    loras.push({ file, strength: num(item.strength, 0, 2, 1), name: typeof item.name === 'string' ? item.name.slice(0, 120) : '' });
  }
  if (loras.length > MAX_LORAS) throw new Error(`At most ${MAX_LORAS} LoRAs at once.`);
  const snap16 = (v) => Math.round(v / 16) * 16;
  const word = (v, fallback) => (/^[a-z0-9_]+$/i.test(String(v || '')) ? String(v) : fallback);
  const seed = p.seed === null || p.seed === undefined || p.seed === '' || Number(p.seed) < 0
    ? crypto.randomInt(0, 2 ** 47)
    : Math.floor(num(p.seed, 0, Number.MAX_SAFE_INTEGER, 0));
  return {
    prompt,
    checkpoint,
    loras,
    width: snap16(num(p.width, 256, 2048, 832)),
    height: snap16(num(p.height, 256, 2048, 1216)),
    steps: Math.round(num(p.steps, 1, 60, DEFAULTS.steps)),
    guidance: num(p.guidance, 1, 10, DEFAULTS.guidance),
    sampler: word(p.sampler, DEFAULTS.sampler),
    scheduler: word(p.scheduler, DEFAULTS.scheduler),
    seed
  };
}

/** The studio's FLUX graph in ComfyUI's API format, with its LoRAs in a chain. */
function buildGraph(s, prefix) {
  let model = ['1', 0];
  let clip = ['1', 1];
  const loraNodes = {};
  (s.loras || []).forEach(({ file, strength }, i) => {
    const id = LORA_NODE_IDS[i];
    loraNodes[id] = { class_type: 'LoraLoader', inputs: { lora_name: file, strength_model: strength, strength_clip: strength, model, clip } };
    model = [id, 0];
    clip = [id, 1];
  });
  const graph = {
    ...loraNodes,
    1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: s.checkpoint } },
    3: { class_type: 'CLIPTextEncode', inputs: { text: s.prompt, clip } },
    4: { class_type: 'FluxGuidance', inputs: { guidance: s.guidance, conditioning: ['3', 0] } },
    5: { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['3', 0] } },
    6: { class_type: 'EmptySD3LatentImage', inputs: { width: s.width, height: s.height, batch_size: 1 } },
    7: {
      class_type: 'KSampler',
      inputs: {
        seed: s.seed, steps: s.steps, cfg: 1, sampler_name: s.sampler, scheduler: s.scheduler, denoise: 1,
        model, positive: ['4', 0], negative: ['5', 0], latent_image: ['6', 0]
      }
    },
    8: { class_type: 'VAEDecode', inputs: { samples: ['7', 0], vae: ['1', 2] } },
    9: { class_type: 'SaveImage', inputs: { filename_prefix: prefix, images: ['8', 0] } }
  };
  return graph;
}

const NODE_STAGES = {
  1: ['loading', 'Loading FLUX into memory (about a minute for the first image)...'],
  2: ['loading', 'Applying the LoRAs...'],
  10: ['loading', 'Applying the LoRAs...'],
  11: ['loading', 'Applying the LoRAs...'],
  12: ['loading', 'Applying the LoRAs...'],
  3: ['loading', 'Reading the prompt...'],
  7: ['sampling', 'Drawing...'],
  8: ['decoding', 'Decoding the image...'],
  9: ['decoding', 'Saving...'],
  28: ['loading', 'Preparing the area...'],
  31: ['decoding', 'Blending it in...']
};

/** Follows the job on ComfyUI's WebSocket (progress only; completion comes from /history). */
function watchProgress(clientId, getPromptId) {
  let ws;
  try {
    ws = new WebSocket(`${COMFY_URL.replace(/^http/, 'ws')}/ws?clientId=${encodeURIComponent(clientId)}`);
  } catch (_) {
    return () => { };
  }
  ws.onmessage = (event) => {
    if (typeof event.data !== 'string' || !job || job.id !== clientId || !isBusy()) return;
    let msg;
    try { msg = JSON.parse(event.data); } catch (_) { return; }
    const data = msg.data || {};
    if (data.prompt_id && getPromptId() && data.prompt_id !== getPromptId()) return;
    if (msg.type === 'executing' && data.node && NODE_STAGES[data.node]) {
      const [phase, message] = NODE_STAGES[data.node];
      setJob({ phase, message });
    } else if (msg.type === 'progress' && data.max) {
      setJob({ phase: 'sampling', step: data.value, totalSteps: data.max, message: `Step ${data.value} of ${data.max}` }, true);
    }
  };
  ws.onerror = () => { };
  return () => { try { ws.close(); } catch (_) { } };
}

function historyError(entry) {
  const messages = entry?.status?.messages || [];
  if (messages.some(m => m[0] === 'execution_interrupted')) return 'Cancelled.';
  const err = messages.find(m => m[0] === 'execution_error');
  return err ? `${err[1]?.exception_type || 'Error'}: ${err[1]?.exception_message || 'ComfyUI could not make the image.'}`.trim() : 'ComfyUI could not make the image.';
}

/**
 * Makes one image. Throws at once for bad settings, a busy studio or ComfyUI not running;
 * after that, progress and the result (or error) go to subscribers in the job state.
 */
async function generate(params) {
  if (isBusy()) throw new Error('An image is already being made; wait for it or cancel it.');
  const s = normalizeParams(params);
  if (!(await isRunning())) throw new Error('ComfyUI is not running. Switch the AI engine to FLUX first.');

  const clientId = crypto.randomUUID();
  const id = `flux-${stamp()}-${crypto.randomBytes(3).toString('hex')}`;
  job = {
    id: clientId, imageId: null, promptId: null, phase: 'queued', message: 'Sending to ComfyUI...',
    step: 0, totalSteps: s.steps, startedAt: Date.now(), finishedAt: null, error: null, cancelRequested: false,
    settings: s
  };
  emitNow();
  run_(clientId, id, s, buildGraph(s, `${OUTPUT_SUBFOLDER}/${id}`)).catch((err) => {
    if (job && job.id === clientId) setJob({ phase: 'error', error: err.message, message: 'The image failed.', finishedAt: Date.now() });
  });
  return { jobId: clientId };
}

// ─── Fix an area (inpainting) ────────────────────────────────────

const INPUT_DIR = path.join(APP_DIR, 'input');
const FIX_WORK_PIXELS = 1024 * 1024; // the cropped area is repainted at about this size

/** Width and height from a PNG's header; null if it is not a PNG. */
function pngSize(buf) {
  if (!buf || buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47 || buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** Puts a file in ComfyUI's input folder (for LoadImage / LoadImageMask). */
async function uploadInput(buffer, name) {
  const form = new FormData();
  form.append('image', new Blob([buffer], { type: 'image/png' }), name);
  form.append('type', 'input');
  form.append('overwrite', 'true');
  const res = await fetch(`${COMFY_URL}/upload/image`, { method: 'POST', body: form, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`ComfyUI refused the upload (${res.status}).`);
  const body = await res.json();
  return body.subfolder ? `${body.subfolder}/${body.name}` : body.name;
}

/**
 * The box repainted around the painted area: the area plus a margin (context for FLUX), at least
 * 384 px a side where the picture allows, inside the picture.
 */
function fixRegion(area, imgW, imgH) {
  const pad = Math.max(48, Math.round(0.35 * Math.max(area.w, area.h)));
  let x0 = area.x - pad; let y0 = area.y - pad; let x1 = area.x + area.w + pad; let y1 = area.y + area.h + pad;
  const grow = (a0, a1, min, max) => {
    const need = Math.min(min, max) - (a1 - a0);
    if (need > 0) { a0 -= Math.ceil(need / 2); a1 += Math.floor(need / 2); }
    if (a0 < 0) { a1 -= a0; a0 = 0; }
    if (a1 > max) { a0 -= a1 - max; a1 = max; }
    return [Math.max(0, a0), Math.min(max, a1)];
  };
  [x0, x1] = grow(x0, x1, 384, imgW);
  [y0, y1] = grow(y0, y1, 384, imgH);
  const w = x1 - x0; const h = y1 - y0;
  // Repaint at about 1 megapixel: small areas get enlarged (more detail), up to 3x.
  const k = Math.min(3, Math.max(0.75, Math.sqrt(FIX_WORK_PIXELS / (w * h))));
  const snap16 = (v) => Math.max(256, Math.round(v / 16) * 16);
  return { x: x0, y: y0, w, h, workW: snap16(w * k), workH: snap16(h * k) };
}

/**
 * The studio graph turned into an inpainting one: crop the region from the picture and the mask,
 * enlarge it, repaint where the mask is white (denoise sets how much changes), shrink it back
 * and paste it onto the original through the mask, so everything outside stays as it was.
 */
function buildFixGraph(s, prefix, src, mask, r, denoise) {
  const g = buildGraph(s, prefix);
  delete g[6]; // no empty latent: the latent comes from the picture
  Object.assign(g, {
    20: { class_type: 'LoadImage', inputs: { image: src } },
    21: { class_type: 'LoadImageMask', inputs: { image: mask, channel: 'red' } },
    22: { class_type: 'ImageCrop', inputs: { image: ['20', 0], width: r.w, height: r.h, x: r.x, y: r.y } },
    23: { class_type: 'CropMask', inputs: { mask: ['21', 0], x: r.x, y: r.y, width: r.w, height: r.h } },
    24: { class_type: 'ImageScale', inputs: { image: ['22', 0], upscale_method: 'lanczos', width: r.workW, height: r.workH, crop: 'disabled' } },
    25: { class_type: 'MaskToImage', inputs: { mask: ['23', 0] } },
    26: { class_type: 'ImageScale', inputs: { image: ['25', 0], upscale_method: 'bilinear', width: r.workW, height: r.workH, crop: 'disabled' } },
    27: { class_type: 'ImageToMask', inputs: { image: ['26', 0], channel: 'red' } },
    28: { class_type: 'VAEEncode', inputs: { pixels: ['24', 0], vae: ['1', 2] } },
    29: { class_type: 'SetLatentNoiseMask', inputs: { samples: ['28', 0], mask: ['27', 0] } },
    30: { class_type: 'ImageScale', inputs: { image: ['8', 0], upscale_method: 'lanczos', width: r.w, height: r.h, crop: 'disabled' } },
    31: { class_type: 'ImageCompositeMasked', inputs: { destination: ['20', 0], source: ['30', 0], x: r.x, y: r.y, resize_source: false, mask: ['23', 0] } }
  });
  g[7].inputs.latent_image = ['29', 0];
  g[7].inputs.denoise = denoise;
  g[9].inputs.images = ['31', 0];
  return g;
}

/**
 * Repaints the painted area of a picture (temporary or saved) with the studio's LoRAs and a
 * prompt; the result is a new temporary picture. `mask` is a PNG data URL the size of the
 * picture (white = repaint), `area` the painted box {x, y, w, h} in the picture's pixels.
 */
async function fixArea(params = {}) {
  if (isBusy()) throw new Error('An image is already being made; wait for it or cancel it.');
  const sourceFile = String(params.source || '');
  const sourcePath = imagePath(sourceFile);
  if (!sourcePath) throw new Error('That picture is no longer available.');
  const srcBuf = fs.readFileSync(sourcePath);
  const size = pngSize(srcBuf);
  if (!size) throw new Error('Only PNG pictures can be fixed.');
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(params.mask || ''));
  if (!m || m[1].length > 30 * 1024 * 1024) throw new Error('Paint over the area to fix first.');
  const maskBuf = Buffer.from(m[1], 'base64');
  const maskSize = pngSize(maskBuf);
  if (!maskSize || maskSize.width !== size.width || maskSize.height !== size.height) throw new Error('The painted mask does not match the picture; paint it again.');
  const a = params.area || {};
  const area = { x: Math.floor(num(a.x, 0, size.width - 1, 0)), y: Math.floor(num(a.y, 0, size.height - 1, 0)) };
  area.w = Math.floor(num(a.w, 1, size.width - area.x, 0));
  area.h = Math.floor(num(a.h, 1, size.height - area.y, 0));
  if (!area.w || !area.h) throw new Error('Paint over the area to fix first.');
  const s = normalizeParams({ ...params, width: size.width, height: size.height });
  s.width = size.width; // the picture's own size, not snapped
  s.height = size.height;
  const denoise = num(params.denoise, 0.3, 1, 0.85);
  if (!(await isRunning())) throw new Error('ComfyUI is not running. Switch the AI engine to FLUX first.');

  const clientId = crypto.randomUUID();
  const id = `flux-${stamp()}-${crypto.randomBytes(3).toString('hex')}`;
  job = {
    id: clientId, imageId: null, promptId: null, phase: 'queued', message: 'Preparing the area...',
    step: 0, totalSteps: s.steps, startedAt: Date.now(), finishedAt: null, error: null, cancelRequested: false,
    settings: s
  };
  emitNow();
  const inputs = [`nebryss-fix-${id}-src.png`, `nebryss-fix-${id}-mask.png`];
  (async () => {
    const [srcName, maskName] = [await uploadInput(srcBuf, inputs[0]), await uploadInput(maskBuf, inputs[1])];
    const region = fixRegion(area, size.width, size.height);
    const graph = buildFixGraph(s, `${OUTPUT_SUBFOLDER}/${id}`, srcName, maskName, region, denoise);
    await run_(clientId, id, s, graph, { fixOf: sourceFile, fixArea: area, fixRegion: region, denoise });
  })().catch((err) => {
    if (job && job.id === clientId) setJob({ phase: 'error', error: err.message, message: 'The fix failed.', finishedAt: Date.now() });
  }).finally(() => {
    for (const f of inputs) { try { fs.unlinkSync(path.join(INPUT_DIR, f)); } catch (_) { } }
  });
  return { jobId: clientId };
}

async function run_(clientId, id, s, graph, extraMeta = {}) {
  const stopWatch = watchProgress(clientId, () => job?.promptId);
  try {
    let queued;
    try {
      queued = await fetchJson(`${COMFY_URL}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: graph, client_id: clientId })
      }, 15000);
    } catch (err) {
      const nodeErrors = err.body?.node_errors ? Object.values(err.body.node_errors).flatMap(n => n.errors || []).map(e => e.details || e.message) : [];
      throw new Error(`ComfyUI refused the job: ${err.body?.error?.message || err.message}${nodeErrors.length ? ` (${nodeErrors.join('; ')})` : ''}`);
    }
    setJob({ promptId: queued.prompt_id, message: 'Queued...' });

    const deadline = Date.now() + JOB_TIMEOUT_MS;
    let entry = null;
    while (Date.now() < deadline) {
      await sleep(1000);
      try {
        const history = await fetchJson(`${COMFY_URL}/history/${encodeURIComponent(queued.prompt_id)}`, {}, 5000);
        entry = history && history[queued.prompt_id];
      } catch (_) {
        if (!(await isRunning())) throw new Error('ComfyUI stopped while making the image.');
      }
      if (entry && (entry.status?.completed || entry.status?.status_str === 'error')) break;
      entry = null;
    }
    if (!entry) throw new Error(`No image after ${JOB_TIMEOUT_MS / 60000} minutes.`);
    if (entry.status?.status_str === 'error') {
      const message = historyError(entry);
      if (job.cancelRequested || message === 'Cancelled.') {
        setJob({ phase: 'cancelled', message: 'Cancelled.', finishedAt: Date.now() });
        return;
      }
      throw new Error(message);
    }
    const image = Object.values(entry.outputs || {}).flatMap(o => o.images || []).find(i => i.type === 'output');
    if (!image) throw new Error('ComfyUI finished but returned no image.');
    const src = path.join(OUTPUT_DIR, image.subfolder || '', image.filename);
    if (!path.resolve(src).startsWith(path.resolve(OUTPUT_DIR))) throw new Error('Unexpected output path from ComfyUI.');
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    moveFile(src, path.join(TEMP_DIR, `${id}.png`));
    const meta = { ...s, ...extraMeta, id, createdAt: Date.now(), seconds: Math.round((Date.now() - job.startedAt) / 1000) };
    fs.writeFileSync(path.join(TEMP_DIR, `${id}.json`), JSON.stringify(meta, null, 1));
    imagesCache = null;
    setJob({ phase: 'done', imageId: id, step: s.steps, message: `Done in ${meta.seconds}s.`, finishedAt: Date.now() });
  } finally {
    stopWatch();
  }
}

/** Stops the image being made (ComfyUI finishes the current step first). */
async function cancel() {
  if (!isBusy()) return;
  setJob({ cancelRequested: true, message: 'Cancelling...' });
  try {
    if (job.promptId) {
      await fetchJson(`${COMFY_URL}/queue`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delete: [job.promptId] }) }).catch(() => { });
    }
    await fetchJson(`${COMFY_URL}/interrupt`, { method: 'POST' });
  } catch (_) { }
}

module.exports = {
  // ComfyUI process (used by colibri-engine.js's switch)
  isRunning,
  findProcess,
  isComfyProcess,
  start,
  stop,
  waitUntilReady,
  getLogFile: () => logFile,
  label: 'FLUX.1 [dev]',
  detail: 'Image generation with ComfyUI',
  // Studio
  catalog,
  subscribe,
  getState: publicState,
  generate,
  fixArea,
  cancel,
  save,
  discard,
  imagePath,
  // for tests
  _normalizeParams: normalizeParams,
  _buildGraph: buildGraph,
  _buildFixGraph: buildFixGraph,
  _fixRegion: fixRegion,
  _readStudioWorkflow: readStudioWorkflow,
  _listLoras: listLoras
};
