/**
 * Runs inside Colibri's terminal window, at the end of the pipe from `coli serve`:
 * shows the server's output in the window, appends it to the log file the API follows for
 * the UI's switch popup, and keeps the window titled (e.g. "colibri - UD-IQ2_M 120k").
 *
 * Usage: node colibri-console.js <log file> <window title>
 *
 * Closing the window ends every process attached to it (cmd, the Colibri launcher, the
 * engine and this script), which stops the server.
 */
const fs = require('fs');

const [logFile, title] = process.argv.slice(2);

function setTitle() {
  if (!title) return;
  try {
    process.title = title; // the console window's title on Windows
  } catch (_) { }
}

setTitle();
// The launcher may set its own title while it starts; put ours back. unref() lets the
// process end as soon as the server's output ends.
setInterval(setTitle, 3000).unref();

const log = logFile ? fs.createWriteStream(logFile, { flags: 'a' }) : null;
if (log) log.on('error', () => { }); // a locked or deleted log must not take the window down

// The window is written through its own handle on libuv's thread pool, never on this thread.
// A click in a Windows console puts it in selection mode ("Select" in the title), which blocks
// every write to it until Esc. process.stdout writes synchronously, so a click would stop this
// script reading, the pipe would fill and Colibri itself would freeze. Here the writes just
// wait (buffered) while the selection lasts, and the log and the server keep going.
// The batch file sets the console to UTF-8 (chcp 65001) for these byte writes.
let screen = fs.createWriteStream('\\\\.\\CONOUT$', { flags: 'r+' });
let screenFailed = false;
screen.on('error', () => {
  // No console to write to (e.g. started without a window): keep logging.
  screenFailed = true;
  screen = null;
});

process.stdin.on('data', (chunk) => {
  if (screen && !screenFailed) screen.write(chunk);
  if (log) log.write(chunk);
});
process.stdin.on('end', () => {
  if (log) log.end();
  if (screen && !screenFailed) screen.end();
});
