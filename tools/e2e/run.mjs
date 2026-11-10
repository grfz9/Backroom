/**
 * LIMINAL — end-to-end test runner.
 *
 *   npm run e2e                 run every tools/e2e/*.e2e.mjs
 *   npm run e2e -- smoke        run only the files whose name contains "smoke"
 *
 * Environment:
 *   E2E_PORT         Vite port (default 5190) — give each parallel run its own port.
 *   E2E_SERVER_PORT  game server port (default E2E_PORT + 1000), started on demand by tests.
 *
 * Each test file default-exports `async (ctx) => void` and throws to fail. ctx provides:
 *   url, serverPort, browser, openGame(query), shot(page, name), assert, sleep, startGameServer()
 */

import { readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, assert, launchBrowser, openPage, shot, sleep, startGameServer, startVite } from './lib.mjs';

const filter = process.argv[2] ?? '';
const port = Number(process.env.E2E_PORT ?? 5190);
const serverPort = Number(process.env.E2E_SERVER_PORT ?? port + 1000);
const dir = path.join(ROOT, 'tools/e2e');
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.e2e.mjs') && f.includes(filter))
  .sort();

if (files.length === 0) {
  console.log('No e2e test matches.');
  process.exit(1);
}

const vite = await startVite(port, { LIMINAL_SERVER_PORT: String(serverPort) });
const browser = await launchBrowser();
let failed = 0;

for (const file of files) {
  const started = Date.now();
  const pages = [];
  const servers = [];
  const ctx = {
    url: vite.url,
    serverPort,
    browser,
    assert,
    sleep,
    shot,
    /** Open the game with an optional query string such as '?debug=1&seed=test'. */
    openGame: async (query = '', size) => {
      const page = await openPage(browser, vite.url + '/' + query, size);
      pages.push(page);
      return page;
    },
    startGameServer: async (env) => {
      const s = await startGameServer(serverPort, env);
      servers.push(s);
      return s;
    },
  };
  try {
    const mod = await import(pathToFileURL(path.join(dir, file)).href);
    await mod.default(ctx);
    console.log(`✓ ${file} (${Date.now() - started} ms)`);
  } catch (err) {
    failed++;
    console.log(`✗ ${file}\n  ${String(err?.stack ?? err).split('\n').join('\n  ')}`);
    for (const [i, page] of pages.entries()) {
      try {
        await shot(page, `FAILED-${file.replace('.e2e.mjs', '')}-${i}`);
      } catch {
        // page already closed
      }
    }
  } finally {
    for (const page of pages) await page.context().close().catch(() => {});
    for (const s of servers) await s.stop();
  }
}

await browser.close();
await vite.stop();
console.log(failed === 0 ? `\nAll ${files.length} e2e test file(s) passed.` : `\n${failed} e2e test file(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
