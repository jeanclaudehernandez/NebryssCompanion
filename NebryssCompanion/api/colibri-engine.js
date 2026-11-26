/**
 * Colibri engine manager: finds which model setup (a Qwen3.6-35B-A3B quantization and its
 * context size, all on CUDA) the server on the local port runs, stops it, and starts another,
 * reporting each stage and the engine's log to listeners (the agent WebSocket relays them to
 * the UI's switch popup). A setup runs either on Colibri (`coli serve`) or on llama.cpp's
 * llama-server (the llamacpp-* setups, see llamacpp-bridge.js); both serve the same port.
 *
 * The engine runs in a terminal window titled "colibri - <setup>" or "llama.cpp - <setup>"
 * (closing it stops the server), with its output also copied to a log file. It is started
 * outside the API's process tree, so it keeps running if the API restarts. Only a process
 * whose command line is a `coli ... serve`, or a llama-server on this port, is ever stopped.
 */
const { spawnSync, execFile } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
// FLUX image generation (ComfyUI) shares the GPU with Colibri: the switch also moves between them.
const fluxEngine = require('./flux-engine');
const FLUX_MODE = 'flux';
// llama.cpp's llama-server: its setups, launch command and /props context (see that file).
const llamacpp = require('./llamacpp-bridge');

const COLIBRI_DIR = process.env.COLIBRI_DIR || 'C:\\Users\\Jean\\Documents\\AI-models\\colibri-2.1.0';
const BASE_URL = (process.env.COLIBRI_BASE_URL || 'http://127.0.0.1:8000/v1').replace(/\/+$/, '');
const SERVER_ORIGIN = BASE_URL.replace(/\/v1$/, '');
const SERVER_PORT = Number(new URL(SERVER_ORIGIN).port) || 8000;
// One log file per launch: a fixed name could still be held open by an engine started earlier,
// and cmd's redirect then fails before the launcher even starts.
const LOG_DIR = os.tmpdir();
const LOG_PREFIX = 'nebryss-colibri-';
const KEEP_LOGS = 5;
let LOG_FILE = path.join(LOG_DIR, `${LOG_PREFIX}engine.log`);

const STOP_TIMEOUT_MS = 30000;
const READY_TIMEOUT_MS = 6 * 60 * 1000;
const LOG_TAIL_LINES = 80;

// The measured setups: unsloth's Qwen3.6-35B-A3B GGUFs (imported in link mode under
// colibri-models), each with every expert in VRAM on CUDA and the largest context that still
// leaves room on a 16 GB RTX 5080. Measured 2026-11-17 near each one's trim point (the bridge
// trims at context - 8000 - 2200): decode steps stay at ~9-10 ms with 450-650 MiB of VRAM free.
// The engine reserves VRAM by --ctx, so a larger --ctx than these leaves too little and the
// driver starts paging (UD-Q2_K_XL at 102400: decode steps 11 -> 84 ms at a 94k prompt).
// Only the IQ3_XXS default can be overridden from the environment (COLIBRI_MODEL_PATH).
const CUDA_ARGS = ['--vram', '14', '--ngen', '8000', '--cap', '32'];
function cudaProfile(id, label, detail, modelPath, contextTokens) {
  return {
    id,
    engine: 'colibri',
    label,
    detail,
    modelPath,
    contextTokens,
    kvCache: 'f16',   // Colibri's log: "KV cache: float16" (Q36_KV=f32 would keep float32)
    env: { COLI_PARK: '0' },
    args: ['--model', modelPath, '--ctx', String(contextTokens), ...CUDA_ARGS]
  };
}
const PROFILES = {
  'iq3xxs-64k': cudaProfile('iq3xxs-64k', 'IQ3_XXS', 'The original setup, longest in use',
    process.env.COLIBRI_MODEL_PATH || '.\\colibri-models\\qwen36-35b-iq3xxs', 65536),
  'q2kxl-96k': cudaProfile('q2kxl-96k', 'UD-Q2_K_XL', 'Same accuracy as IQ3_XXS, larger context',
    '.\\colibri-models\\qwen36-35b-q2kxl', 96000),
  'iq2m-120k': cudaProfile('iq2m-120k', 'UD-IQ2_M', 'Largest context; slightly weaker tool use',
    '.\\colibri-models\\qwen36-35b-iq2m', 120000),
  // The same IQ3_XXS model on llama.cpp, with 2x / 4x the context (measured 2026-11-21).
  ...llamacpp.PROFILES
};
// The setup the UI's Start button and `node api/colibri-engine.js start` use: llama.cpp
// UD-Q2_K_XL at 150k with an 8-bit KV cache, the best of the five compared on 2026-11-22.
const DEFAULT_PROFILE = 'llamacpp-q2kxl-150k-q8';
// Older names (the CUDA / Vulkan switch): 'cuda' was the IQ3_XXS 64k setup.
const PROFILE_ALIASES = { cuda: 'iq3xxs-64k' };
// Engine variables no profile sets that must not be inherited from the API's env (the old
// Vulkan profile's, which would turn the CUDA tier off).
const PROFILE_ENV_KEYS = ['COLI_VULKAN', 'COLI_CUDA', 'COLI_VK_TIER_RESERVE_GB', 'COLI_VK_KV_SPLIT'];

/** The profile for an id or an older alias; null for anything else (own keys only). */
function resolveProfile(id) {
  const own = (obj, key) => (typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : null);
  return own(PROFILES, id) || own(PROFILES, own(PROFILE_ALIASES, id)) || null;
}

const listeners = new Set();
let state = {
  // A profile id | 'custom' (a Colibri server started some other way) | 'offline' |
  // 'unknown' (the port is used by another program) | 'flux' (no Colibri; ComfyUI has the GPU)
  mode: 'unknown',
  runningModel: '',       // the model folder of the running server, e.g. 'qwen36-35b-iq2m'
  runningEngine: '',      // 'colibri' | 'llamacpp' for a 'custom' server (started some other way)
  contextTokens: 0,
  switching: false,
  targetMode: null,
  phase: 'idle',          // 'idle' | 'stopping' | 'starting' | 'loading' | 'ready' | 'error'
  failedPhase: null,
  message: '',
  error: null,
  startedAt: null,
  logFile: LOG_FILE,
  log: []
};
let pythonCommand = null;
let emitTimer = null;

/**
 * The setups the UI's switch offers, best first. 2026-11-22, 4 runs each on the same bridge:
 * llama.cpp UD-Q2_K_XL 150k with an 8-bit KV cache (the default: 98.25 of 100, planning 8/9),
 * Colibri IQ3_XXS 64k (97.75) and llama.cpp IQ3_XXS 120k with an 8-bit KV cache (97.75);
 * llama.cpp IQ3_XXS 256k (2026-11-21: 92) stays for very long contexts. The others stay
 * defined, so a server running one of them is still recognised and can be stopped.
 */
const OFFERED_PROFILES = [DEFAULT_PROFILE, 'llamacpp-q2kxl-256k-q8', 'llamacpp-qwen38-iq3s-150k-q4'];

/** 'Colibri' or 'llama.cpp' for an engine id ('colibri' | 'llamacpp'); '' for none. */
function engineLabel(engine) {
  return engine === 'llamacpp' ? llamacpp.ENGINE_NAME : engine === 'colibri' ? 'Colibri' : '';
}

/** What the UI shows for a setup: names, context and KV cache type. */
function profileSummary(p) {
  return {
    id: p.id, label: p.label, detail: p.detail, contextTokens: p.contextTokens,
    engine: p.engine, engineName: engineLabel(p.engine), modelGroup: p.modelGroup || '', kvCache: p.kvCache || 'f16'
  };
}

/** The engine a mode runs on: a setup's engine, or the running server's when it is 'custom'. */
function engineOfMode(mode) {
  const p = resolveProfile(mode);
  if (p) return p.engine;
  return mode === 'custom' ? state.runningEngine || '' : '';
}

function publicState() {
  const running = resolveProfile(state.mode);
  return {
    ...state,
    log: state.log.slice(-LOG_TAIL_LINES),
    profiles: OFFERED_PROFILES.map(id => PROFILES[id]).filter(Boolean).map(profileSummary),
    // What the UI's Start button starts.
    defaultProfile: PROFILES[DEFAULT_PROFILE] ? profileSummary(PROFILES[DEFAULT_PROFILE]) : null,
    // The running setup, also when it is not one of the offered ones (e.g. started from the CLI).
    runningProfile: running ? profileSummary(running) : null,
    // 'Colibri' / 'llama.cpp' for messages: the engine running now, and the one being switched to.
    engineName: engineLabel(engineOfMode(state.mode)),
    targetEngineName: engineLabel(engineOfMode(state.targetMode)),
    flux: { id: FLUX_MODE, label: fluxEngine.label, detail: fluxEngine.detail }
  };
}

function emitNow() {
  if (emitTimer) { clearTimeout(emitTimer); emitTimer = null; }
  const snapshot = publicState();
  for (const fn of listeners) {
    try { fn(snapshot); } catch (_) { }
  }
}

/** Log lines arrive in bursts; send at most ~3 updates a second for them. */
function emitSoon() {
  if (!emitTimer) emitTimer = setTimeout(emitNow, 300);
}

function update(patch) {
  state = { ...state, ...patch };
  emitNow();
}

function addLog(lines) {
  if (!lines.length) return;
  state.log.push(...lines);
  if (state.log.length > 400) state.log = state.log.slice(-400);
  emitSoon();
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function run(file, args, timeout = 15000, env = process.env) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout, windowsHide: true, env }, (err, stdout, stderr) => {
      resolve({ err, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

/**
 * The Colibri server: the process listening on the port or, when none listens yet, a launcher
 * from this Colibri folder that is still loading the model (15-60 s). Without the second case
 * a start or switch during that window would launch a second engine. Null when neither.
 */
async function findServerProcess() {
  const script =
    `$c = Get-NetTCPConnection -LocalPort ${SERVER_PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; ` +
    `if ($c) { $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)" } ` +
    `else { $launcher = $env:NEBRYSS_COLI_DIR.TrimEnd('\\') + '\\coli'; ` +
    `$p = Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='py.exe'" | ` +
    `Where-Object { $_.CommandLine -and $_.CommandLine.Contains($launcher) -and $_.CommandLine -match '\\sserve\\s' } | Select-Object -First 1; ` +
    `if (-not $p) { $p = Get-CimInstance Win32_Process -Filter "Name='llama-server.exe'" | ` +
    `Where-Object { $_.CommandLine -match '--port[\\s=]+${SERVER_PORT}(\\s|$)' } | Select-Object -First 1 } }; ` +
    `if ($p) { Write-Output ("$($p.ProcessId)" + [char]9 + "$($p.Name)" + [char]9 + "$($p.CommandLine)") }`;
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], 15000,
    { ...process.env, NEBRYSS_COLI_DIR: COLIBRI_DIR });
  const line = stdout.trim().split(/\r?\n/).pop();
  if (!line) return null;
  const [pid, name, commandLine = ''] = line.split('\t');
  return { pid: Number(pid), name, commandLine };
}

/** A server this switch may stop and describe: Colibri's `coli serve`, or a llama-server (on this port: findServerProcess). */
function isColibriServer(proc) {
  return (/\bcoli(\.cmd)?\b/i.test(proc.commandLine) && /\bserve\b/i.test(proc.commandLine))
    || llamacpp.isLlamaServer(proc.commandLine);
}

/** 'C:\\x\\colibri-models\\qwen36-35b-iq2m\\' or './colibri-models/qwen36-35b-iq2m' -> 'qwen36-35b-iq2m'. */
function modelFolder(modelPath) {
  return String(modelPath || '').replace(/^["']|["']$/g, '').replace(/[\\/]+$/, '').split(/[\\/]/).pop().toLowerCase();
}

function argValue(commandLine, name) {
  const m = String(commandLine).match(new RegExp(`--${name}(?:\\s+|=)("[^"]*"|\\S+)`, 'i'));
  return m ? m[1].replace(/^"|"$/g, '') : '';
}

/**
 * Which profile a running server's command line is: its --model folder, and its --ctx when
 * several profiles share a folder. Another folder (or the old Vulkan setup, --gpu none) is
 * 'custom': a Colibri server, but not one of these setups.
 */
function describeServer(commandLine) {
  if (llamacpp.isLlamaServer(commandLine)) return llamacpp.describeServer(commandLine);
  const runningModel = modelFolder(argValue(commandLine, 'model'));
  const ctx = Number(argValue(commandLine, 'ctx')) || 0;
  const sameModel = Object.values(PROFILES).filter(p => !llamacpp.isLlamaProfile(p) && modelFolder(p.modelPath) === runningModel);
  const profile = /--gpu\s+none/i.test(commandLine) ? null
    : (sameModel.find(p => p.contextTokens === ctx) || (sameModel.length === 1 ? sameModel[0] : null));
  return { mode: profile ? profile.id : 'custom', runningModel, runningEngine: 'colibri' };
}

/** 65536 -> "64k", 96000 -> "96k", 120000 -> "120k" (as the UI shows them). */
function formatContext(tokens) {
  return `${tokens % 1024 === 0 ? tokens / 1024 : Math.round(tokens / 1000)}k`;
}

function profileLabel(id) {
  const p = resolveProfile(id);
  return p ? `${p.label} · ${formatContext(p.contextTokens)}` : 'the running setup';
}

async function fetchHealth() {
  try {
    const res = await fetch(`${SERVER_ORIGIN}/health`, { signal: AbortSignal.timeout(3000) });
    return await res.json();
  } catch (_) {
    return null;
  }
}

/** The running server's context size: Colibri's /health, else llama-server's /props; 0 if neither says. */
async function serverContextTokens(health) {
  const ctx = Number(health?.context_tokens) || 0;
  if (ctx || !health) return ctx;
  return (await llamacpp.readServerContext(SERVER_ORIGIN))?.contextTokens || 0;
}

/** 'Colibri' or 'llama.cpp', for messages. */
function engineName(profile) {
  return llamacpp.isLlamaProfile(profile) ? llamacpp.ENGINE_NAME : 'Colibri';
}

/** A profile's label without the engine prefix, for "<engine> is running <label>". */
function shortLabel(profile) {
  return profile.label.replace(/^llama\.cpp\s+/, '');
}

/** Re-reads which engine is running (no-op while a switch is in progress). */
async function refreshStatus() {
  if (state.switching) return publicState();
  const proc = await findServerProcess();
  if (!proc) {
    update({ mode: (await fluxEngine.isRunning()) ? FLUX_MODE : 'offline', runningModel: '', contextTokens: 0 });
  } else if (!isColibriServer(proc)) {
    update({ mode: 'unknown', runningModel: '', contextTokens: 0 });
  } else {
    const health = await fetchHealth();
    update({ ...describeServer(proc.commandLine), contextTokens: await serverContextTokens(health) });
  }
  return publicState();
}

/** Full path of a Python 3 interpreter (Colibri's launcher is a Python script). */
function resolvePython() {
  if (pythonCommand) return pythonCommand;
  const candidates = process.env.COLIBRI_PYTHON
    ? [[process.env.COLIBRI_PYTHON, []]]
    : [['python', []], ['py', ['-3']], ['python3', []]];
  for (const [cmd, pre] of candidates) {
    const r = spawnSync(cmd, [...pre, '-c', 'import sys; print(sys.executable) if sys.version_info[0] == 3 else sys.exit(1)'], { windowsHide: true });
    const exe = String(r.stdout || '').trim();
    if (r.status === 0 && exe) {
      pythonCommand = exe;
      return pythonCommand;
    }
  }
  throw new Error('Python 3 was not found (Colibri\'s launcher needs it). Set COLIBRI_PYTHON to python.exe.');
}

/**
 * PIDs of `pid` and every process under it (the launcher and its engine, e.g. qwen36.exe).
 * A child must have started after its parent: Windows reuses PIDs, so an older process whose
 * long-gone parent had the same PID would otherwise count as a child.
 */
async function processTree(pid) {
  const script =
    `$all = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, CreationDate); ` +
    `$root = $all | Where-Object { $_.ProcessId -eq ${Number(pid)} } | Select-Object -First 1; ` +
    `if (-not $root) { '${Number(pid)}'; return }; ` +
    `$queue = @($root); $ids = @(); $i = 0; ` +
    `while ($i -lt $queue.Count) { $p = $queue[$i]; $ids += $p.ProcessId; ` +
    `$queue += @($all | Where-Object { $_.ParentProcessId -eq $p.ProcessId -and $_.CreationDate -ge $p.CreationDate }); $i++ }; ` +
    `$ids -join ','`;
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
  const ids = stdout.trim().split(',').map(Number).filter(n => n > 0);
  return ids.length ? ids : [Number(pid)];
}

/** True while something accepts connections on the server's port (no extra process needed). */
function portInUse() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port: SERVER_PORT });
    const done = (inUse) => { socket.destroy(); resolve(inUse); };
    socket.setTimeout(1000, () => done(true));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

async function stopServer(proc) {
  const tree = await processTree(proc.pid);
  addLog([`[switch] stopping ${proc.name} (pid ${proc.pid}${tree.length > 1 ? ` and ${tree.length - 1} child process(es)` : ''})`]);
  const r = await run('taskkill.exe', ['/PID', String(proc.pid), '/T', '/F']);
  if (r.err && !/not found/i.test(r.stderr + r.stdout)) {
    addLog([`[switch] taskkill: ${(r.stderr || r.stdout).trim()}`]);
  }
  // Wait for the port and for every process of that server (the engine holds the VRAM).
  // These checks run inside Node: polling with PowerShell started two processes a second.
  const deadline = Date.now() + STOP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!tree.some(isAlive) && !(await portInUse())) {
      addLog(['[switch] previous engine stopped; its GPU memory is released']);
      return;
    }
    await sleep(1000);
  }
  throw new Error(`The previous engine was still running ${STOP_TIMEOUT_MS / 1000}s after it was told to stop.`);
}

/** Follows an engine's log file (this launch's Colibri log by default), calling back with whole new lines. */
function tailLog(onLines, file = LOG_FILE) {
  let offset = 0;
  let partial = '';
  const timer = setInterval(() => {
    let fd;
    try {
      const size = fs.statSync(file).size;
      if (size <= offset) return;
      fd = fs.openSync(file, 'r');
      const buf = Buffer.alloc(size - offset);
      fs.readSync(fd, buf, 0, buf.length, offset);
      offset = size;
      const text = partial + buf.toString('utf8');
      const parts = text.split(/\r?\n/);
      partial = parts.pop();
      onLines(parts.filter(l => l.trim()));
    } catch (_) {
      // the file may not exist yet
    } finally {
      if (fd !== undefined) try { fs.closeSync(fd); } catch (_) { }
    }
  }, 400);
  return () => {
    clearInterval(timer);
    if (partial.trim()) onLines([partial]);
  };
}

/** A cmd.exe argument, quoted. */
const q = (s) => `"${String(s).replace(/"/g, '')}"`;

const CONSOLE_SCRIPT = path.join(__dirname, 'colibri-console.js');

/** The terminal's title, also what Task Manager lists under the app: "colibri - UD-IQ2_M 120k". */
function windowTitle(profile) {
  return `${llamacpp.isLlamaProfile(profile) ? 'llama.cpp' : 'colibri'} - ${shortLabel(profile)} ${formatContext(profile.contextTokens)}`;
}

/**
 * Starts the server through PowerShell's Start-Process with a hidden window: the launcher
 * runs in a hidden console, and the engine it starts (qwen36.exe) inherits that console.
 * (A Node "detached" process has no console at all, so Windows gave the engine a new,
 * visible and empty one; closing it killed the engine and Colibri started it again.)
 * Started this way, the server is not a child of the API and keeps running if the API stops.
 * Resolves with the PID of the hidden cmd.exe that holds the server.
 */
/** A fresh log file for this launch; older ones beyond the last few are removed (locked ones stay). */
function newLogFile(profile) {
  try {
    const old = fs.readdirSync(LOG_DIR)
      .filter(f => f.startsWith(LOG_PREFIX) && f.endsWith('.log'))
      .map(f => ({ f, t: fs.statSync(path.join(LOG_DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
      .slice(KEEP_LOGS - 1);
    for (const { f } of old) {
      for (const file of [f, f.replace(/\.log$/, '.cmd')]) { // each log's launch batch file too
        try { fs.unlinkSync(path.join(LOG_DIR, file)); } catch (_) { }
      }
    }
  } catch (_) { }
  LOG_FILE = path.join(LOG_DIR, `${LOG_PREFIX}${profile.id}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
  fs.writeFileSync(LOG_FILE, '');
  state.logFile = LOG_FILE;
  return LOG_FILE;
}

/**
 * What the batch file runs for a profile: setup lines (folder, PATH), the server's command, the
 * working folder, and the line shown in the log. Colibri's Python launcher, or llama-server.
 */
function launchSpec(profile) {
  if (llamacpp.isLlamaProfile(profile)) return llamacpp.launchSpec(profile, SERVER_PORT);
  const python = resolvePython();
  return {
    cwd: COLIBRI_DIR,
    setupLines: [`cd /d ${q(COLIBRI_DIR)}`],
    command: [q(python), q(path.join(COLIBRI_DIR, 'coli')), 'serve', ...profile.args.map(a => (/\s/.test(a) ? q(a) : a))].join(' '),
    display: `${Object.entries(profile.env).map(([k, v]) => `${k}=${v}`).join(' ')} coli serve ${profile.args.join(' ')}`
  };
}

async function startServer(profile) {
  const launch = launchSpec(profile);
  newLogFile(profile);
  const env = { ...process.env };
  for (const k of PROFILE_ENV_KEYS) delete env[k];
  Object.assign(env, profile.env, { PYTHONUNBUFFERED: '1' });
  addLog([`[switch] ${launch.display}`]);

  // A visible terminal of its own (a classic console, so closing it never takes other Windows
  // Terminal tabs along), titled "colibri - <engine>". The server's output goes through
  // colibri-console.js, which shows it in the window and copies it to the log the UI follows.
  // Closing the window ends every process attached to it: launcher, engine and all.
  const title = windowTitle(profile);
  const tee = [q(process.execPath), q(CONSOLE_SCRIPT), q(LOG_FILE), q(title)].join(' ');
  // The commands go in a small batch file beside the log: conhost re-parses its command line
  // and drops inner quotes (the title arrived as "colibri", Node's path split at the space).
  const batchFile = LOG_FILE.replace(/\.log$/, '.cmd');
  // chcp 65001: colibri-console.js writes the output's UTF-8 bytes to the window as they are.
  fs.writeFileSync(batchFile, ['@echo off', 'chcp 65001 >nul', `title ${title}`, ...launch.setupLines, `${launch.command} 2>&1 | ${tee}`, ''].join('\r\n'));
  // The batch path and folder reach PowerShell as environment variables: passing them inside
  // the -Command text breaks on quotes when Node escapes the argument.
  env.NEBRYSS_COLI_CMDLINE = `cmd.exe /d /c ${/\s/.test(batchFile) ? q(batchFile) : batchFile}`;
  env.NEBRYSS_COLI_DIR = launch.cwd;
  const script =
    '$p = Start-Process -FilePath conhost.exe -ArgumentList $env:NEBRYSS_COLI_CMDLINE ' +
    '-WorkingDirectory $env:NEBRYSS_COLI_DIR -PassThru; $p.Id';
  const result = await new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
      { env, windowsHide: true, timeout: 20000 },
      (err, stdout, stderr) => resolve({ err, stdout: String(stdout || ''), stderr: String(stderr || '') }));
  });
  const pid = Number(result.stdout.trim().split(/\r?\n/).pop());
  if (!pid) {
    throw new Error(`Could not start ${engineName(profile)}: ${(result.stderr || result.err?.message || 'no process id returned').trim()}`);
  }
  addLog([`[switch] started (pid ${pid}), output in ${LOG_FILE}`]);
  return pid;
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

/** Waits until /health reports ready; rejects if the server's process exits or the timeout passes. */
function waitUntilReady(pid, name = 'Colibri') {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn, value) => {
      if (done) return;
      done = true;
      clearInterval(poll);
      fn(value);
    };
    const deadline = Date.now() + READY_TIMEOUT_MS;
    const poll = setInterval(async () => {
      if (done) return;
      const health = await fetchHealth();
      if (health && health.status === 'ok') return finish(resolve, health);
      if (!isAlive(pid)) {
        const err = new Error(`${name} exited before it was ready`);
        err.engineExited = true;
        return finish(reject, err);
      }
      if (Date.now() > deadline) finish(reject, new Error(`${name} was not ready after ${READY_TIMEOUT_MS / 60000} minutes.`));
    }, 1000);
  });
}

let windowWatch = null;

/** Reports the engine offline once its terminal (pid = the window's console host) is closed. */
function watchWindow(pid, title, engineName = 'Colibri') {
  stopWatchingWindow();
  windowWatch = setInterval(() => {
    if (state.switching || isAlive(pid)) return;
    stopWatchingWindow();
    update({
      mode: 'offline', contextTokens: 0, phase: 'idle', error: null,
      message: `The "${title}" window was closed, so ${engineName} stopped.`
    });
  }, 3000);
  windowWatch.unref();
}

function stopWatchingWindow() {
  if (windowWatch) clearInterval(windowWatch);
  windowWatch = null;
}

/**
 * Switches the GPU to the Colibri profile `targetId` (a PROFILES key) or to FLUX ('flux':
 * Colibri stopped, ComfyUI started). Resolves with the final state; failures are reported in
 * the state (phase 'error'), not thrown.
 */
async function switchEngine(targetId, { onReady } = {}) {
  const toFlux = targetId === FLUX_MODE;
  const profile = toFlux ? null : resolveProfile(targetId);
  if (!toFlux && !profile) throw new Error(`Unknown local setup: ${targetId}`);
  const targetMode = toFlux ? FLUX_MODE : profile.id;
  if (state.switching) throw new Error('An engine switch is already in progress.');

  stopWatchingWindow(); // the stop below closes that window on purpose
  update({
    switching: true, targetMode, phase: 'stopping', failedPhase: null, error: null,
    message: 'Looking for the running engine...', startedAt: Date.now(), log: []
  });

  let stopTail = null;
  try {
    const proc = await findServerProcess();
    if (proc) {
      if (!isColibriServer(proc)) {
        throw new Error(`Port ${SERVER_PORT} is used by another program (${proc.name}, pid ${proc.pid}), not a Colibri or llama.cpp server; it was left running.`);
      }
      const running = describeServer(proc.commandLine);
      update({ message: `Stopping ${running.mode === 'custom' ? `the running server (${running.runningModel || 'unknown model'})` : profileLabel(running.mode)}...` });
      await stopServer(proc);
    } else {
      addLog([toFlux ? '[switch] no local model server was running' : '[switch] no engine was running']);
    }

    if (toFlux) {
      let windowPid = null;
      if (await fluxEngine.isRunning()) {
        addLog(['[switch] ComfyUI is already running']);
      } else {
        update({ phase: 'starting', message: 'Starting ComfyUI for FLUX...' });
        windowPid = await fluxEngine.start(addLog);
        state.logFile = fluxEngine.getLogFile();
        stopTail = tailLog((lines) => {
          addLog(lines);
          if (state.phase === 'starting') update({ phase: 'loading', message: 'ComfyUI is loading...' });
        }, fluxEngine.getLogFile());
        await fluxEngine.waitUntilReady(windowPid);
        stopTail();
        stopTail = null;
      }
      update({
        switching: false, phase: 'ready', mode: FLUX_MODE, runningModel: '', contextTokens: 0,
        message: 'FLUX is ready. The first image also loads the model, about a minute.'
      });
      if (windowPid) watchWindow(windowPid, 'ComfyUI - FLUX', 'ComfyUI');
      if (onReady) onReady();
      return publicState();
    }

    // ComfyUI keeps FLUX (about 12 GB) in VRAM once it has made an image: free it before Colibri loads.
    const comfy = await fluxEngine.findProcess().catch(() => null);
    if (comfy && fluxEngine.isComfyProcess(comfy)) {
      update({ message: 'Stopping ComfyUI (FLUX)...' });
      await fluxEngine.stop(comfy, addLog);
    }

    update({ phase: 'starting', message: `Starting ${engineName(profile)} with ${profileLabel(profile.id)}...` });
    const pid = await startServer(profile);
    // Follows this launch's log file from its start, so no line written meanwhile is lost.
    stopTail = tailLog((lines) => {
      addLog(lines);
      if (state.phase === 'starting') update({ phase: 'loading', message: 'Loading the model...' });
    });
    const health = await waitUntilReady(pid, engineName(profile));
    stopTail();
    stopTail = null;

    const readyContext = (await serverContextTokens(health)) || profile.contextTokens;
    update({
      switching: false, phase: 'ready', mode: targetMode,
      runningModel: llamacpp.isLlamaProfile(profile) ? llamacpp.describeServer(`--model "${profile.modelPath}"`).runningModel : modelFolder(profile.modelPath),
      contextTokens: readyContext,
      message: `${engineName(profile)} is running ${shortLabel(profile)} with a ${formatContext(readyContext)} context.`
    });
    watchWindow(pid, windowTitle(profile), engineName(profile));
    if (onReady) onReady();
  } catch (err) {
    // Let the tail pick up the engine's last words before reporting.
    if (stopTail) { await sleep(800); stopTail(); }
    let error = err.message;
    if (err.engineExited) {
      const lastLine = [...state.log].reverse().find(l => !l.startsWith('[switch]'));
      error += lastLine ? `: ${lastLine.trim()}` : '. The engine wrote nothing to its log.';
    }
    const proc = await findServerProcess().catch(() => null);
    const running = proc
      ? (isColibriServer(proc) ? describeServer(proc.commandLine) : { mode: 'unknown', runningModel: '' })
      : { mode: (await fluxEngine.isRunning()) ? FLUX_MODE : 'offline', runningModel: '' };
    update({
      switching: false,
      failedPhase: state.phase,
      phase: 'error',
      error,
      message: 'The switch failed.',
      ...running,
      contextTokens: running.mode === 'offline' || running.mode === 'unknown' || running.mode === FLUX_MODE ? 0 : state.contextTokens
    });
  }
  return publicState();
}

/** The stop target: Colibri and ComfyUI both stopped, the GPU left free. */
const STOP_MODE = 'offline';

/**
 * Stops whatever has the GPU (the Colibri server and/or ComfyUI) and starts nothing, so the
 * GPU is free. Reported like a switch (targetMode 'offline', phases stopping -> ready), so every
 * open UI shows the same progress popup. Resolves with the final state; failures are reported
 * in the state (phase 'error'), not thrown. Only a Colibri server or ComfyUI is ever stopped.
 */
async function stopEngine({ onStopped } = {}) {
  if (state.switching) throw new Error('An engine switch is already in progress.');
  stopWatchingWindow(); // the stop below closes that window on purpose
  update({
    switching: true, targetMode: STOP_MODE, phase: 'stopping', failedPhase: null, error: null,
    message: 'Looking for the running engine...', startedAt: Date.now(), log: []
  });

  try {
    let stopped = 0;
    const proc = await findServerProcess();
    if (proc && isColibriServer(proc)) {
      const running = describeServer(proc.commandLine);
      update({ message: `Stopping ${running.mode === 'custom' ? `the running server (${running.runningModel || 'unknown model'})` : profileLabel(running.mode)}...` });
      await stopServer(proc);
      stopped++;
    } else if (proc) {
      addLog([`[stop] port ${SERVER_PORT} is used by another program (${proc.name}, pid ${proc.pid}); it was left running`]);
    }

    const comfy = await fluxEngine.findProcess().catch(() => null);
    if (comfy && fluxEngine.isComfyProcess(comfy)) {
      update({ message: 'Stopping ComfyUI (FLUX)...' });
      await fluxEngine.cancel().catch(() => { }); // an image in progress ends as cancelled
      await fluxEngine.stop(comfy, addLog);
      stopped++;
    }
    if (!stopped) addLog(['[stop] no engine was running']);

    update({
      switching: false, phase: 'ready', mode: proc && !isColibriServer(proc) ? 'unknown' : 'offline',
      runningModel: '', contextTokens: 0,
      message: stopped ? 'The engine is stopped and the GPU is free.' : 'No engine was running.'
    });
    if (onStopped) onStopped();
  } catch (err) {
    const proc = await findServerProcess().catch(() => null);
    const running = proc
      ? (isColibriServer(proc) ? describeServer(proc.commandLine) : { mode: 'unknown', runningModel: '' })
      : { mode: (await fluxEngine.isRunning()) ? FLUX_MODE : 'offline', runningModel: '' };
    update({
      switching: false, failedPhase: state.phase, phase: 'error', error: err.message,
      message: 'The stop failed.', ...running,
      contextTokens: running.mode === 'offline' || running.mode === 'unknown' || running.mode === FLUX_MODE ? 0 : state.contextTokens
    });
  }
  return publicState();
}

/**
 * Command line:  node api/colibri-engine.js start [setup] [--wait]
 * (setup: iq3xxs-64k, the default, q2kxl-96k, iq2m-120k, llamacpp-iq3xxs-128k or
 * llamacpp-iq3xxs-256k; `cuda` still means iq3xxs-64k).
 * Opens Colibri in its "colibri - <setup>" window, the same way the UI's switch does, unless a
 * Colibri server already answers on the port. --wait returns only once it is ready.
 * Exit code: 0 started or already running, 1 failed, 2 port used by another program.
 */
async function cli(argv) {
  const [command, modeArg = DEFAULT_PROFILE, ...flags] = argv;
  const profile = resolveProfile(modeArg);
  if (command !== 'start' || !profile) {
    console.log(`Usage: node api/colibri-engine.js start [${Object.keys(PROFILES).join('|')}] [--wait]`);
    return 1;
  }
  const proc = await findServerProcess();
  if (proc) {
    if (!isColibriServer(proc)) {
      console.log(`[Colibri] Port ${SERVER_PORT} is used by another program (${proc.name}, pid ${proc.pid}); ${engineName(profile)} was not started.`);
      return 2;
    }
    const running = describeServer(proc.commandLine);
    console.log(`[Colibri] Already running (or still loading) ${running.mode === 'custom' ? running.runningModel || 'a setup of its own' : profileLabel(running.mode)} (pid ${proc.pid}); nothing started.`);
    return 0;
  }
  try {
    const pid = await startServer(profile);
    console.log(`[Colibri] Opened the "${windowTitle(profile)}" window (closing it stops ${engineName(profile)}). Log: ${LOG_FILE}`);
    if (flags.includes('--wait')) {
      await waitUntilReady(pid, engineName(profile));
      console.log('[Colibri] Ready.');
    }
    return 0;
  } catch (err) {
    console.log(`[Colibri] Could not start: ${err.message}${err.engineExited ? '. See the log above.' : ''}`);
    return 1;
  }
}

if (require.main === module) {
  cli(process.argv.slice(2)).then((code) => process.exit(code));
}

module.exports = {
  subscribe,
  refreshStatus,
  switchEngine,
  stopEngine,
  isSwitching: () => state.switching,
  getState: publicState,
  resolveProfile,
  PROFILES,
  FLUX_MODE,
  STOP_MODE,
  // for tests
  _describeServer: describeServer
};
