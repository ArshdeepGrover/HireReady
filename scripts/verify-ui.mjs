/**
 * Drives the analyser page in a real browser over the DevTools Protocol.
 *
 * `scripts/verify-browser.sh` uses `--dump-dom --virtual-time-budget`, which is
 * fine for asserting on a rendered page but no good for interaction: Chrome
 * advances virtual time by jumping to the next pending timer, so a test that
 * waits for anything either starves the pdf.js worker or fast-forwards past it.
 * CDP gives real time and real clicks instead.
 *
 * The assertions themselves live in tests/ui-checks.js, which this loads into an
 * already-booted /resume-score.html.
 *
 * Usage: node scripts/verify-ui.mjs [--port 5199] [--keep-server]
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.env['PORT'] ?? 5199);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const DEBUG_PORT = Number(process.env['CDP_PORT'] ?? 9333);

const CHROME_CANDIDATES = [
  process.env['CHROME_PATH'],
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

function findChrome() {
  const found = CHROME_CANDIDATES.find((path) => existsSync(path));
  if (!found) {
    throw new Error('Could not find Chrome. Set CHROME_PATH to its binary.');
  }
  return found;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForHttp(url, timeout = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.text();
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

/** Minimal CDP client: enough to navigate one page and evaluate in it. */
class Session {
  #socket;
  #nextId = 1;
  #pending = new Map();
  #listeners = new Map();

  constructor(socket) {
    this.#socket = socket;
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== undefined) {
        const entry = this.#pending.get(message.id);
        if (!entry) return;
        this.#pending.delete(message.id);
        if (message.error) entry.reject(new Error(message.error.message));
        else entry.resolve(message.result);
        return;
      }
      for (const handler of this.#listeners.get(message.method) ?? []) {
        handler(message.params);
      }
    });
  }

  static async connect(webSocketDebuggerUrl) {
    const socket = new WebSocket(webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', () => reject(new Error('CDP socket failed')), {
        once: true,
      });
    });
    return new Session(socket);
  }

  send(method, params = {}) {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, handler) {
    const existing = this.#listeners.get(method) ?? [];
    existing.push(handler);
    this.#listeners.set(method, existing);
  }

  close() {
    this.#socket.close();
  }
}

let server;
let chrome;
let profileDir;
/** Only remove the fixtures if this run is what created them. */
let madeFixtures = false;

function cleanup() {
  chrome?.kill('SIGKILL');
  server?.kill('SIGKILL');
  if (profileDir) rmSync(profileDir, { recursive: true, force: true });
  if (madeFixtures) rmSync(FIXTURE_DIR, { recursive: true, force: true });
}

process.on('exit', cleanup);
process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});

/** The PDF fixture the read-progress checks upload. */
const FIXTURE_DIR = 'public/__fixtures';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)),
    );
  });
}

async function main() {
  const chromePath = findChrome();

  if (!existsSync(join(FIXTURE_DIR, 'single-column.pdf'))) {
    console.log('Generating PDF fixtures');
    await run('node', ['scripts/make-test-pdfs.mjs', FIXTURE_DIR]);
    madeFixtures = true;
  }

  console.log('Starting dev server');
  server = spawn(
    'npx',
    ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
    { stdio: 'ignore' },
  );
  await waitForHttp(`${ORIGIN}/resume-score.html`);

  console.log('Starting Chrome');
  profileDir = mkdtempSync(join(tmpdir(), 'hireready-cdp-'));
  chrome = spawn(
    chromePath,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--no-first-run',
      '--disable-extensions',
      // Keeps the page running full speed while it is not visible.
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      `--user-data-dir=${profileDir}`,
      `--remote-debugging-port=${DEBUG_PORT}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  const version = JSON.parse(await waitForHttp(`http://127.0.0.1:${DEBUG_PORT}/json/version`));
  console.log(`  ${version['Browser']}`);

  const targets = JSON.parse(await waitForHttp(`http://127.0.0.1:${DEBUG_PORT}/json/list`));
  const page = targets.find((target) => target.type === 'page');
  if (!page) throw new Error('Chrome exposed no page target');

  const session = await Session.connect(page.webSocketDebuggerUrl);
  await session.send('Page.enable');
  await session.send('Runtime.enable');

  // Surface page-side errors, which would otherwise vanish.
  const consoleErrors = [];
  session.on('Runtime.exceptionThrown', (params) => {
    consoleErrors.push(params?.exceptionDetails?.exception?.description ?? 'unknown exception');
  });

  const loaded = new Promise((resolve) => session.on('Page.loadEventFired', resolve));
  await session.send('Page.navigate', { url: `${ORIGIN}/resume-score.html` });
  await loaded;

  console.log(`Running checks against ${ORIGIN}/resume-score.html\n`);
  const result = await session.send('Runtime.evaluate', {
    expression: `import('/tests/ui-checks.js').then((module) => module.run())`,
    awaitPromise: true,
    returnByValue: true,
    timeout: 120000,
  });

  if (result.exceptionDetails) {
    console.error('Checks threw:', JSON.stringify(result.exceptionDetails, null, 2));
    session.close();
    process.exitCode = 1;
    return;
  }

  const { lines, failures } = result.result.value;
  for (const line of lines) console.log(line.startsWith('#') ? line : `  ${line}`);

  if (consoleErrors.length > 0) {
    console.log('\nUncaught page errors:');
    for (const error of consoleErrors) console.log(`  ${error}`);
  }

  session.close();

  const total = failures + consoleErrors.length;
  console.log(total === 0 ? 'All UI checks passed.' : `${total} UI check(s) failed.`);
  return total === 0 ? 0 : 1;
}

const code = await main().catch((error) => {
  console.error(error.message ?? error);
  return 1;
});

// The dev server and Chrome would otherwise hold the event loop open, so exit
// deliberately. The short wait lets stdout drain when it is a pipe.
cleanup();
await sleep(50);
process.exit(code);
