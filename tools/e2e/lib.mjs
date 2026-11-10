/**
 * LIMINAL — shared helpers for browser end-to-end tests (Playwright + headless Chromium).
 *
 * Usage from a test file (tools/e2e/*.e2e.mjs):
 *   export default async function (ctx) { const page = await ctx.openGame('?debug=1'); ... }
 *
 * WebGL runs on SwiftShader (software) in headless mode: it is correct but slow, so never assert
 * on real FPS here — assert on draw calls, triangle counts and CPU frame time instead.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const OUT = path.join(ROOT, 'tools/e2e/out');
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForHttp(url, timeoutMs = 60000) {
  const start = Date.now();
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
    } catch {
      // not up yet
    }
    if (Date.now() - start > timeoutMs) throw new Error(`Timeout waiting for ${url}`);
    await sleep(250);
  }
}

function spawnNode(args, env = {}) {
  const child = spawn(process.execPath, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  return {
    child,
    getLog: () => log,
    stop: () =>
      new Promise((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.once('exit', () => resolve());
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 3000).unref();
      }),
  };
}

/** Start the Vite dev server on a fixed port. Returns { url, stop, getLog }. */
export async function startVite(port, env = {}) {
  const proc = spawnNode([path.join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort'], env);
  const url = `http://localhost:${port}`;
  try {
    await waitForHttp(url);
  } catch (e) {
    await proc.stop();
    throw new Error(`${e.message}\n--- vite log ---\n${proc.getLog()}`);
  }
  return { url, stop: proc.stop, getLog: proc.getLog };
}

/** Start the Node game server on a fixed port. Returns { url, wsUrl, stop, getLog }. */
export async function startGameServer(port, env = {}) {
  const proc = spawnNode(
    [path.join(ROOT, 'node_modules/tsx/dist/cli.mjs'), '--tsconfig', 'server/tsconfig.json', 'server/src/index.ts'],
    { PORT: String(port), ...env },
  );
  const url = `http://localhost:${port}`;
  try {
    await waitForHttp(url);
  } catch (e) {
    await proc.stop();
    throw new Error(`${e.message}\n--- server log ---\n${proc.getLog()}`);
  }
  return { url, wsUrl: `ws://localhost:${port}`, stop: proc.stop, getLog: proc.getLog };
}

/** Headless Chromium with software WebGL, autoplaying audio and a fake microphone. */
export async function launchBrowser() {
  return chromium.launch({
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--autoplay-policy=no-user-gesture-required',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
  });
}

/**
 * Open a page on the game and collect console errors / page errors.
 * Returns the Playwright page, with page.errors (array of strings) attached.
 */
export async function openPage(browser, url, { width = 1280, height = 720 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (err) => page.errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') page.errors.push(`console.error: ${msg.text()}`);
  });
  await page.goto(url, { waitUntil: 'load' });
  return page;
}

/** Save a screenshot under tools/e2e/out/<name>.png and return its path. */
export async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  return file;
}

export function assert(cond, message) {
  if (!cond) throw new Error(`Assertion failed: ${message}`);
}

export { sleep };
