/**
 * llama.cpp bridge: what the Session Planner needs to run on llama.cpp's llama-server instead
 * of Colibri. The agent harness (colibri-bridge.js) and the engine switch (colibri-engine.js)
 * stay shared; this module holds everything that differs:
 * - the measured launch profiles (offered by the UI's engine switch next to Colibri's),
 * - finding llama-server.exe (LLAMACPP_SERVER, else the CUDA build that Ollama ships),
 * - the batch-file lines that start it, and recognising a running llama-server,
 * - reading the context size from /props (llama-server's /health has no context_tokens),
 * - the request fields llama-server understands, and its per-request timings for the log.
 *
 * The server listens on the same port as Colibri (COLIBRI_BASE_URL) and answers to the same
 * model name (--alias), so the bridge's requests and the UI need nothing else.
 */
const fs = require('fs');
const path = require('path');

const COLIBRI_DIR = process.env.COLIBRI_DIR || 'C:\\Users\\Jean\\Desktop\\colibri-2.1.0';
const MODEL_ALIAS = process.env.COLIBRI_MODEL || 'qwen3.6-colibri';
const ENGINE_NAME = 'llama.cpp';
// The same unsloth GGUF that Colibri's IQ3_XXS setup links to.
const QWEN_IQ3XXS_GGUF = process.env.LLAMACPP_MODEL_PATH
  || path.join(COLIBRI_DIR, 'colibri-models', 'gguf', 'Qwen3.6-35B-A3B-UD-IQ3_XXS.gguf');
// The unsloth UD-Q2_K_XL GGUF of the same model (Colibri's q2kxl setup links to it too).
const QWEN_Q2KXL_GGUF = process.env.LLAMACPP_Q2KXL_MODEL_PATH
  || path.join(COLIBRI_DIR, 'colibri-models', 'gguf', 'Qwen3.6-35B-A3B-UD-Q2_K_XL.gguf');
const REPLY_TOKENS = 8000; // as Colibri's --ngen: the bridge's history budget is context - this

/**
 * Measured 2026-11-21 on the RTX 5080 (16 GB) with Ollama's llama-server (CUDA 13), on the real
 * campaign data. --n-cpu-moe keeps the expert weights of the first N layers in system RAM; it is
 * set so about 1 GB of VRAM stays free (below ~200 MiB Windows pages VRAM out and prompt reading
 * drops 5-10x). --reasoning off matches Colibri, which runs Qwen without thinking.
 * - 256k, --n-cpu-moe 18: quality suite 33/37 (Colibri IQ3_XXS 64k: 33/37, the same 4 misses),
 *   archive recall 15/17 at 235k tokens, long conversation 6/6; a cold 235k-token read takes
 *   ~91 s, replies ~60 tok/s at that depth; ~4 GB of system RAM left free.
 * - 128k, --n-cpu-moe 4: a 73k-token cold read in 14 s, replies 118-150 tok/s (speed measured;
 *   the quality suite was not rerun on this setup).
 * - 120k with an 8-bit KV cache (q8_0), --n-cpu-moe 0: every expert on the GPU, 217-672 MiB of VRAM
 *   free depending on the desktop's own use; a 98k-token cold read in 17 s, ~100 tok/s at 98k and
 *   175 tok/s on short prompts, ~12% CPU. 100-test suite 89-94 (6 runs), 95-98 after the bridge
 *   fixes (2026-11-21), 170-210 s per run.
 * - UD-Q2_K_XL at 150k with an 8-bit KV cache, --n-cpu-moe 0 (measured 2026-11-22, the default):
 *   every expert on the GPU, ~500-700 MiB of VRAM free during runs; 100-test suite 98.25 on
 *   average over 4 runs (the best of the five setups compared, ~155 s per run), all 80 staging
 *   tests passed with no wrong cards, planning suite 8/9 in 4 of 4 runs. Near the limit (fill to
 *   ~120k real tokens, tests at 121-135k): 11 of 12 tests in 9 of 10 runs.
 * kvCache: 'f16' (llama-server's default) or 'q8_0' (--cache-type-k/-v q8_0, about half the size).
 */
function llamaProfile(id, label, detail, modelPath, contextTokens, nCpuMoe, kvCache = 'f16') {
  return {
    id,
    engine: 'llamacpp',
    label,
    detail,
    modelPath,
    contextTokens,
    nCpuMoe,
    kvCache,
    env: {}
  };
}
const PROFILES = {
  'llamacpp-q2kxl-150k-q8': llamaProfile('llamacpp-q2kxl-150k-q8', 'UD-Q2_K_XL',
    'Every expert on the GPU: the best-scoring local setup', QWEN_Q2KXL_GGUF, 150000, 0, 'q8_0'),
  'llamacpp-iq3xxs-120k-q8': llamaProfile('llamacpp-iq3xxs-120k-q8', 'IQ3_XXS',
    'Every expert on the GPU: the fastest local setup', QWEN_IQ3XXS_GGUF, 120000, 0, 'q8_0'),
  'llamacpp-iq3xxs-128k': llamaProfile('llamacpp-iq3xxs-128k', 'IQ3_XXS',
    'Twice the IQ3_XXS context and the fastest replies', QWEN_IQ3XXS_GGUF, 131072, 4),
  'llamacpp-iq3xxs-256k': llamaProfile('llamacpp-iq3xxs-256k', 'IQ3_XXS',
    'Same model as IQ3_XXS with 4x the context; slower on very long prompts', QWEN_IQ3XXS_GGUF, 262144, 18)
};

function isLlamaProfile(profile) {
  return !!profile && profile.engine === 'llamacpp';
}

/** llama-server.exe: LLAMACPP_SERVER, else the one Ollama installs (it bundles a CUDA build). */
function resolveServerExe() {
  const candidates = [
    process.env.LLAMACPP_SERVER,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Ollama', 'lib', 'ollama', 'llama-server.exe')
  ].filter(Boolean);
  const found = candidates.find(f => fs.existsSync(f));
  if (!found) throw new Error('llama-server.exe was not found. Install Ollama or set LLAMACPP_SERVER to the path of llama-server.exe.');
  return found;
}

/**
 * The folder with the GPU backend DLLs. Ollama's llama-server loads ggml-cuda from its working
 * directory and PATH, so without this folder it runs on the CPU only.
 */
function resolveBackendDir(exe) {
  if (process.env.LLAMACPP_BACKEND_DIR) return process.env.LLAMACPP_BACKEND_DIR;
  const dir = path.dirname(exe);
  return ['cuda_v13', 'cuda_v12'].map(d => path.join(dir, d)).find(d => fs.existsSync(d)) || dir;
}

/** llama-server's arguments for a profile, as an array (long option names, so they are easy to read back). */
function serverArgs(profile, port) {
  return [
    '--model', profile.modelPath,
    '--host', '127.0.0.1',
    '--port', String(port),
    '--ctx-size', String(profile.contextTokens),
    '--parallel', '1',
    '--n-gpu-layers', '99',
    '--n-cpu-moe', String(profile.nCpuMoe),
    '--flash-attn', 'on',
    '--batch-size', '2048',
    '--ubatch-size', '2048',
    '--threads', String(Number(process.env.LLAMACPP_THREADS) || 8),
    '--n-predict', String(REPLY_TOKENS),
    // 'auto' lets each request toggle thinking via chat_template_kwargs.enable_thinking
    // (default false in requestExtras) without restarting llama-server.
    '--reasoning', 'auto',
    // A RAM prompt cache, so a short unrelated request (a RAG rerank, another tab) does not
    // evict the conversation's prefix. 2 GB: the 256k setup leaves ~4 GB free, and the default
    // (8 GB) once starved Docker's MongoDB.
    '--cache-ram', '2048',
    ...(profile.kvCache && profile.kvCache !== 'f16'
      ? ['--cache-type-k', profile.kvCache, '--cache-type-v', profile.kvCache] : []),
    '--jinja',
    '--alias', MODEL_ALIAS,
    '--metrics'
  ];
}

const q = (s) => `"${String(s).replace(/"/g, '')}"`;

/**
 * The batch-file lines that start llama-server for a profile (the engine switch adds the title
 * and the pipe to its console/log), and the folder to start in.
 */
function launchSpec(profile, port) {
  if (!fs.existsSync(profile.modelPath)) {
    throw new Error(`The model file was not found: ${profile.modelPath} (set LLAMACPP_MODEL_PATH).`);
  }
  const exe = resolveServerExe();
  const backendDir = resolveBackendDir(exe);
  const args = serverArgs(profile, port);
  return {
    cwd: backendDir,
    setupLines: [`set "PATH=${backendDir};${path.dirname(exe)};%PATH%"`, `cd /d ${q(backendDir)}`],
    command: [q(exe), ...args.map(a => (/[\s&|<>^]/.test(a) ? q(a) : a))].join(' '),
    display: `llama-server ${args.join(' ')}`
  };
}

/** True for a llama-server command line (Ollama's own runners are `ollama.exe runner`, not this). */
function isLlamaServer(commandLine) {
  return /(^|[\\/"\s])llama-server(\.exe)?["\s]/i.test(` ${commandLine} `);
}

/** Reads `-m X` / `--model X` / `--model=X` style options from a command line. */
function optionValue(commandLine, names) {
  for (const name of names) {
    const flag = name.length === 1 ? `-${name}` : `--${name}`;
    const m = String(commandLine).match(new RegExp(`(?:^|\\s)${flag}(?:\\s+|=)("[^"]*"|\\S+)`, 'i'));
    if (m) return m[1].replace(/^"|"$/g, '');
  }
  return '';
}

function modelName(modelPath) {
  return path.basename(String(modelPath || '')).replace(/\.gguf$/i, '').toLowerCase();
}

/**
 * Which llama.cpp profile a running llama-server is (same GGUF and --ctx-size), else 'custom'.
 * `runningModel` is the GGUF's name, e.g. 'qwen3.6-35b-a3b-ud-iq3_xxs'.
 */
function describeServer(commandLine) {
  const runningModel = modelName(optionValue(commandLine, ['model', 'm']));
  const ctx = Number(optionValue(commandLine, ['ctx-size', 'c'])) || 0;
  const kv = optionValue(commandLine, ['cache-type-k', 'ctk']) || 'f16';
  const profile = Object.values(PROFILES).find(p =>
    modelName(p.modelPath) === runningModel && p.contextTokens === ctx && (p.kvCache || 'f16') === kv);
  return { mode: profile ? profile.id : 'custom', runningModel, runningEngine: 'llamacpp' };
}

/** True when the command line starts the server on `port` (llama-server's default port is not ours). */
function listensOnPort(commandLine, port) {
  return Number(optionValue(commandLine, ['port'])) === Number(port);
}

/**
 * The context and reply limit of a llama-server, from GET /props; null for a server without
 * it (Colibri) or one that does not answer. `origin` is e.g. http://127.0.0.1:8000.
 */
async function readServerContext(origin, headers = {}) {
  try {
    const res = await fetch(`${origin}/props`, { headers, signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const props = await res.json();
    const settings = props.default_generation_settings || {};
    const contextTokens = Number(settings.n_ctx ?? props.n_ctx) || 0;
    if (!contextTokens) return null;
    // Ollama's build reports params.n_predict -1 even when started with --n-predict 8000 (checked
    // 2026-11-21), so a value <= 0 means REPLY_TOKENS, the --n-predict this module starts it with.
    const predict = Number(settings.params?.n_predict ?? settings.n_predict ?? props.n_predict);
    return {
      engine: 'llamacpp',
      contextTokens,
      replyTokens: predict > 0 ? predict : REPLY_TOKENS,
      modelPath: props.model_path || ''
    };
  } catch (_) {
    return null;
  }
}

/**
 * Extra request fields for llama-server. cache_prompt keeps the conversation's KV prefix (the
 * default, set so it stays on), and enable_thinking toggles Qwen's reasoning per request
 * (default false unless options.thinking is true or LLAMACPP_THINKING=true).
 */
function requestExtras(options = {}) {
  const enableThinking = options.thinking !== undefined
    ? Boolean(options.thinking)
    : process.env.LLAMACPP_THINKING === 'true';
  return {
    cache_prompt: true,
    chat_template_kwargs: { enable_thinking: enableThinking }
  };
}

/** One log line from llama-server's `timings` (sent with the last stream chunk). */
function formatTimings(t) {
  if (!t || typeof t !== 'object') return '';
  const n = (v) => Number(v || 0).toLocaleString('en-US');
  const rate = (v) => (Number(v) > 0 ? `${Math.round(Number(v))} tok/s` : '-');
  return `prompt ${n(t.prompt_n)} new + ${n(t.cache_n)} reused tokens (${rate(t.prompt_per_second)}), ` +
    `reply ${n(t.predicted_n)} tokens (${rate(t.predicted_per_second)})`;
}

/**
 * OpenAI-style usage from llama-server's timings, for a build that sends no `usage` chunk:
 * the prompt is the reused part (cache_n) plus the newly read part (prompt_n).
 */
function usageFromTimings(t) {
  if (!t || typeof t !== 'object' || !(Number(t.prompt_n) >= 0)) return null;
  const prompt = Number(t.prompt_n || 0) + Number(t.cache_n || 0);
  const completion = Number(t.predicted_n || 0);
  return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion };
}

/**
 * The context report's llama.cpp fields (the UI's Model Context gauge shows them): of the last
 * request's prompt, how many tokens came from the server's cache and how many it read anew, and
 * that request's prompt-reading and reply speeds (tok/s). {} without timings (Colibri).
 */
function cacheReport(t) {
  if (!t || typeof t !== 'object' || t.cache_n === undefined) return {};
  const round = (v) => (Number(v) > 0 ? Math.round(Number(v)) : 0);
  return {
    cachedTokens: Number(t.cache_n) || 0,
    newPromptTokens: Number(t.prompt_n) || 0,
    promptPerSecond: round(t.prompt_per_second),
    replyPerSecond: round(t.predicted_per_second)
  };
}

module.exports = {
  usageFromTimings,
  cacheReport,
  ENGINE_NAME,
  PROFILES,
  isLlamaProfile,
  resolveServerExe,
  serverArgs,
  launchSpec,
  isLlamaServer,
  listensOnPort,
  describeServer,
  readServerContext,
  requestExtras,
  formatTimings
};
