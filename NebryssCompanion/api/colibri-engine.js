/**
 * Colibri engine manager: finds which Colibri server (CUDA or Vulkan) is running on the local
 * port, stops it, and starts the other one, reporting each stage and the engine's log to
 * listeners (the agent WebSocket relays them to the UI's switch popup).
 *
 * The engine runs in a terminal window titled "colibri - <engine>" (closing it stops the
 * server), with its output also copied to a log file. It is started outside the API's process
 * tree, so it keeps running if the API restarts. Only a process whose command line is a
 * `coli ... serve` is ever stopped.
 */
const { spawnSync, execFile } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const COLIBRI_DIR = process.env.COLIBRI_DIR || 'C:\\Users\\Jean\\Desktop\\colibri-2.1.0';
const COLIBRI_MODEL_PATH = process.env.COLIBRI_MODEL_PATH || '.\\colibri-models\\qwen36-35b-iq3xxs';
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

// The two measured setups (see the bridge's notes): CUDA is 2-3x faster, Vulkan holds a
// 100k context entirely in VRAM. `--gpu none` keeps the CUDA tier off so Vulkan runs.
const PROFILES = {
  cuda: {
    id: 'cuda',
    label: 'CUDA',
    contextTokens: 65536,
    env: { COLI_PARK: '0' },
    args: ['--model', COLIBRI_MODEL_PATH, '--ctx', '65536', '--vram', '14', '--ngen', '8000', '--cap', '32']
  },
  vulkan: {
    id: 'vulkan',
    label: 'Vulkan',
    contextTokens: 102400,
    // Vulkan sizes its expert tier from the VRAM other apps leave free, keeping only 1 GiB by
    // default for everything else, KV cache included. At 100k the cache alone grows to ~2 GiB,
    // so with a browser or launcher holding VRAM it split, switched to float32 and lost the
    // device (engine crash, seen at ~60k). The reserve leaves room for the full cache, prompt
    // scratch and the driver (a few % of experts then run on the CPU); with the split off the
    // engine falls back to the CPU instead of taking the path that crashed.
    env: { COLI_PARK: '0', COLI_VULKAN: '1', COLI_VK_TIER_RESERVE_GB: '3.5', COLI_VK_KV_SPLIT: '0' },
    args: ['--model', COLIBRI_MODEL_PATH, '--ctx', '102400', '--gpu', 'none', '--ngen', '8000', '--cap', '32']
  }
};
// Engine variables that one profile sets and the other must not inherit from the API's env.
const PROFILE_ENV_KEYS = ['COLI_VULKAN', 'COLI_CUDA', 'COLI_VK_TIER_RESERVE_GB', 'COLI_VK_KV_SPLIT'];

const listeners = new Set();
let state = {
  mode: 'unknown',        // 'cuda' | 'vulkan' | 'offline' | 'unknown' (a server we did not recognise)
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

function publicState() {
  return {
    ...state,
    log: state.log.slice(-LOG_TAIL_LINES),
    profiles: Object.values(PROFILES).map(p => ({ id: p.id, label: p.label, contextTokens: p.contextTokens }))
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
    `Where-Object { $_.CommandLine -and $_.CommandLine.Contains($launcher) -and $_.CommandLine -match '\\sserve\\s' } | Select-Object -First 1 }; ` +
    `if ($p) { Write-Output ("$($p.ProcessId)" + [char]9 + "$($p.Name)" + [char]9 + "$($p.CommandLine)") }`;
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], 15000,
    { ...process.env, NEBRYSS_COLI_DIR: COLIBRI_DIR });
  const line = stdout.trim().split(/\r?\n/).pop();
  if (!line) return null;
  const [pid, name, commandLine = ''] = line.split('\t');
  return { pid: Number(pid), name, commandLine };
}

function isColibriServer(proc) {
  return /\bcoli(\.cmd)?\b/i.test(proc.commandLine) && /\bserve\b/i.test(proc.commandLine);
}

function modeFromCommandLine(commandLine) {
  return /--gpu\s+none/i.test(commandLine) ? 'vulkan' : 'cuda';
}

async function fetchHealth() {
  try {
    const res = await fetch(`${SERVER_ORIGIN}/health`, { signal: AbortSignal.timeout(3000) });
    return await res.json();
  } catch (_) {
    return null;
  }
}

/** Re-reads which engine is running (no-op while a switch is in progress). */
async function refreshStatus() {
  if (state.switching) return publicState();
  const proc = await findServerProcess();
  if (!proc) {
    update({ mode: 'offline', contextTokens: 0 });
  } else if (!isColibriServer(proc)) {
    update({ mode: 'unknown', contextTokens: 0 });
  } else {
    const health = await fetchHealth();
    update({ mode: modeFromCommandLine(proc.commandLine), contextTokens: Number(health?.context_tokens) || 0 });
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

/** Follows the engine's log file from `offset`, calling back with whole new lines. */
function tailLog(onLines) {
  let offset = 0;
  let partial = '';
  const timer = setInterval(() => {
    let fd;
    try {
      const size = fs.statSync(LOG_FILE).size;
      if (size <= offset) return;
      fd = fs.openSync(LOG_FILE, 'r');
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

/** The terminal's title, also what Task Manager lists under the app: "colibri - Vulkan". */
function windowTitle(profile) {
  return `colibri - ${profile.label}`;
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

async function startServer(profile) {
  const python = resolvePython();
  newLogFile(profile);
  const env = { ...process.env };
  for (const k of PROFILE_ENV_KEYS) delete env[k];
  Object.assign(env, profile.env, { PYTHONUNBUFFERED: '1' });
  addLog([`[switch] ${Object.entries(profile.env).map(([k, v]) => `${k}=${v}`).join(' ')} coli serve ${profile.args.join(' ')}`]);

  // A visible terminal of its own (a classic console, so closing it never takes other Windows
  // Terminal tabs along), titled "colibri - <engine>". The server's output goes through
  // colibri-console.js, which shows it in the window and copies it to the log the UI follows.
  // Closing the window ends every process attached to it: launcher, engine and all.
  const title = windowTitle(profile);
  const serve = [q(python), q(path.join(COLIBRI_DIR, 'coli')), 'serve', ...profile.args.map(a => (/\s/.test(a) ? q(a) : a))].join(' ');
  const tee = [q(process.execPath), q(CONSOLE_SCRIPT), q(LOG_FILE), q(title)].join(' ');
  // The commands go in a small batch file beside the log: conhost re-parses its command line
  // and drops inner quotes (the title arrived as "colibri", Node's path split at the space).
  const batchFile = LOG_FILE.replace(/\.log$/, '.cmd');
  // chcp 65001: colibri-console.js writes the output's UTF-8 bytes to the window as they are.
  fs.writeFileSync(batchFile, ['@echo off', 'chcp 65001 >nul', `title ${title}`, `cd /d ${q(COLIBRI_DIR)}`, `${serve} 2>&1 | ${tee}`, ''].join('\r\n'));
  // The batch path and folder reach PowerShell as environment variables: passing them inside
  // the -Command text breaks on quotes when Node escapes the argument.
  env.NEBRYSS_COLI_CMDLINE = `cmd.exe /d /c ${/\s/.test(batchFile) ? q(batchFile) : batchFile}`;
  env.NEBRYSS_COLI_DIR = COLIBRI_DIR;
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
    throw new Error(`Could not start Colibri: ${(result.stderr || result.err?.message || 'no process id returned').trim()}`);
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
function waitUntilReady(pid) {
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
        const err = new Error('Colibri exited before it was ready');
        err.engineExited = true;
        return finish(reject, err);
      }
      if (Date.now() > deadline) finish(reject, new Error(`Colibri was not ready after ${READY_TIMEOUT_MS / 60000} minutes.`));
    }, 1000);
  });
}

let windowWatch = null;

/** Reports Colibri offline once its terminal (pid = the window's console host) is closed. */
function watchWindow(pid, profile) {
  stopWatchingWindow();
  windowWatch = setInterval(() => {
    if (state.switching || isAlive(pid)) return;
    stopWatchingWindow();
    update({
      mode: 'offline', contextTokens: 0, phase: 'idle', error: null,
      message: `The "${windowTitle(profile)}" window was closed, so Colibri stopped.`
    });
  }, 3000);
  windowWatch.unref();
}

function stopWatchingWindow() {
  if (windowWatch) clearInterval(windowWatch);
  windowWatch = null;
}

/**
 * Switches the running engine to `targetMode` ('cuda' | 'vulkan'). Resolves with the final
 * state; failures are reported in the state (phase 'error'), not thrown.
 */
async function switchEngine(targetMode, { onReady } = {}) {
  const profile = PROFILES[targetMode];
  if (!profile) throw new Error(`Unknown Colibri engine: ${targetMode}`);
  if (state.switching) throw new Error('A Colibri engine switch is already in progress.');

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
        throw new Error(`Port ${SERVER_PORT} is used by another program (${proc.name}, pid ${proc.pid}), not a Colibri server; it was left running.`);
      }
      update({ message: `Stopping the ${PROFILES[modeFromCommandLine(proc.commandLine)].label} engine...` });
      await stopServer(proc);
    } else {
      addLog(['[switch] no engine was running']);
    }

    update({ phase: 'starting', message: `Starting Colibri on ${profile.label}...` });
    const pid = await startServer(profile);
    // Follows this launch's log file from its start, so no line written meanwhile is lost.
    stopTail = tailLog((lines) => {
      addLog(lines);
      if (state.phase === 'starting') update({ phase: 'loading', message: 'Loading the model...' });
    });
    const health = await waitUntilReady(pid);
    stopTail();
    stopTail = null;

    update({
      switching: false, phase: 'ready', mode: targetMode,
      contextTokens: Number(health.context_tokens) || profile.contextTokens,
      message: `Colibri is running on ${profile.label} (${Math.round((Number(health.context_tokens) || profile.contextTokens) / 1024)}k context).`
    });
    watchWindow(pid, profile);
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
    const mode = proc ? (isColibriServer(proc) ? modeFromCommandLine(proc.commandLine) : 'unknown') : 'offline';
    update({
      switching: false,
      failedPhase: state.phase,
      phase: 'error',
      error,
      message: 'The switch failed.',
      mode,
      contextTokens: mode === 'cuda' || mode === 'vulkan' ? state.contextTokens : 0
    });
  }
  return publicState();
}

/**
 * Command line, for start-duckdns.bat:  node api/colibri-engine.js start [cuda|vulkan] [--wait]
 * Opens Colibri in its "colibri - <engine>" window, the same way the UI's switch does, unless a
 * Colibri server already answers on the port. --wait returns only once it is ready.
 * Exit code: 0 started or already running, 1 failed, 2 port used by another program.
 */
async function cli(argv) {
  const [command, modeArg = 'cuda', ...flags] = argv;
  const profile = PROFILES[modeArg];
  if (command !== 'start' || !profile) {
    console.log('Usage: node api/colibri-engine.js start [cuda|vulkan] [--wait]');
    return 1;
  }
  const proc = await findServerProcess();
  if (proc) {
    if (!isColibriServer(proc)) {
      console.log(`[Colibri] Port ${SERVER_PORT} is used by another program (${proc.name}, pid ${proc.pid}); Colibri was not started.`);
      return 2;
    }
    console.log(`[Colibri] Already running (or still loading) on ${PROFILES[modeFromCommandLine(proc.commandLine)].label} (pid ${proc.pid}); nothing started.`);
    return 0;
  }
  try {
    const pid = await startServer(profile);
    console.log(`[Colibri] Opened the "${windowTitle(profile)}" window (closing it stops Colibri). Log: ${LOG_FILE}`);
    if (flags.includes('--wait')) {
      await waitUntilReady(pid);
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
  isSwitching: () => state.switching,
  getState: publicState,
  PROFILES
};
