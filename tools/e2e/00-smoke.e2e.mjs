/**
 * Smoke test: the page loads, WebGL works, frames are rendered and nothing throws.
 * Kept deliberately generic so it stays valid through every milestone: it relies only on the
 * `window.__LIMINAL__` debug handle exposing a growing `frames` counter.
 */
export default async function ({ openGame, shot, assert, sleep }) {
  const page = await openGame('?debug=1');
  await page.waitForFunction(() => typeof window.__LIMINAL__ === 'object', null, { timeout: 30000 });
  const before = await page.evaluate(() => window.__LIMINAL__.frames);
  await sleep(1500);
  const after = await page.evaluate(() => window.__LIMINAL__.frames);
  assert(after > before, `frames should advance (before=${before}, after=${after})`);

  const hasWebGL = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return !!c && c.width > 0 && c.height > 0;
  });
  assert(hasWebGL, 'a sized canvas should exist');
  await shot(page, 'smoke');
  assert(page.errors.length === 0, `no console/page errors, got:\n${page.errors.join('\n')}`);
}
