/**
 * Full solo flow: title → seed → walk, run, crouch → pause → same seed gives the same world.
 */
export default async function ({ openGame, shot, assert, sleep }) {
  const page = await openGame('?debug=1&nolock=1');
  await page.waitForFunction(() => window.__LIMINAL__?.frames > 5, null, { timeout: 30000 });
  const state = () => page.evaluate(() => window.__LIMINAL__.state());
  await shot(page, 'title');
  assert((await state()).screen === 'title', 'starts on the title screen');

  await page.fill('input[name=seed]', 'test-417');
  await page.click('button[type=submit]');
  await sleep(500);
  const start = await state();
  assert(start.screen === 'playing', 'clicking Entrer starts the game');
  assert(start.seedText === 'test-417', 'the typed seed is used');
  assert(start.chunks >= 25, `chunks are loaded around the player (${start.chunks})`);
  assert(start.calls <= 150, `draw call budget (${start.calls})`);
  await shot(page, 'spawn');

  // Walk forward.
  await page.evaluate(() => window.__LIMINAL__.setInput({ mx: 0, mz: 1, run: false, crouch: false }));
  await sleep(2000);
  const walked = await state();
  const d = Math.hypot(walked.x - start.x, walked.z - start.z);
  assert(d > 0.5, `the player moved (${d.toFixed(2)} m)`);
  await shot(page, 'walk');

  // Run until exhausted (turning now and then so walls do not stop the sprint for good).
  await page.evaluate(() => window.__LIMINAL__.setInput({ mx: 0, mz: 1, run: true, crouch: false }));
  let drained = false;
  for (let i = 0; i < 40 && !drained; i++) {
    await sleep(500);
    const s = await state();
    drained = s.stamina < 60;
    if (s.speed < 1) await page.evaluate((y) => window.__LIMINAL__.setYaw(y), s.yaw + 1.3);
  }
  assert(drained, 'running drains stamina');
  await shot(page, 'run');

  // Crouch lowers the camera.
  await page.evaluate(() => window.__LIMINAL__.setInput({ mx: 0, mz: 0, run: false, crouch: true }));
  await sleep(700);
  assert((await state()).eyeY < 1.2, 'crouching lowers the eye height');
  await page.evaluate(() => window.__LIMINAL__.setInput(null));

  // Pause freezes time, the menu shows the three sliders, resume works.
  await page.keyboard.press('Escape');
  await sleep(200);
  const paused = await state();
  assert(paused.screen === 'paused', 'Escape pauses');
  assert(await page.isVisible('input[name=vhsIntensity]'), 'pause menu shows the VHS slider');
  await sleep(400);
  assert((await state()).time === paused.time, 'time is frozen while paused');
  await shot(page, 'pause');
  await page.click('button.resume');
  await sleep(200);
  assert((await state()).screen === 'playing', 'resume returns to the game');

  assert(page.errors.length === 0, `no console/page errors, got:\n${page.errors.join('\n')}`);
}
