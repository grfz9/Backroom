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
  for (let i = 0; i < 120 && !drained; i++) {
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

  // Reaching the exit door leads to the next floor, and the run is saved.
  const before = await state();
  assert(before.depth === 0, 'starts on floor 0');
  await page.evaluate((s) => window.__LIMINAL__.teleport(s.exitX - 4, s.exitZ - 0.4), before);
  await sleep(1200);
  await shot(page, 'exit');
  await page.evaluate((s) => window.__LIMINAL__.teleport(s.exitX - 0.5, s.exitZ), before);
  await sleep(600);
  const next = await state();
  assert(next.depth === 1, `walking into the exit goes down one floor (depth=${next.depth})`);
  assert(Math.hypot(next.x - 1, next.z - 1) < 0.5, 'the player starts the new floor at its spawn');

  // The entity catches a player it has reached: death screen, then retry the same floor.
  await page.evaluate(() => window.__LIMINAL__.summon());
  await sleep(700);
  await shot(page, 'entity');
  const hunted = await state();
  assert(hunted.chased || hunted.screen !== 'playing', 'a chasing Prowler marks the player as chased');
  // While chased, sprinting costs nothing.
  if (hunted.screen === 'playing') {
    await page.evaluate(() => window.__LIMINAL__.setInput({ mx: 0, mz: 1, run: true, crouch: false }));
    await sleep(800);
    const fled = await state();
    assert(fled.screen !== 'playing' || fled.stamina >= hunted.stamina, 'stamina does not drain during a chase');
    await page.evaluate(() => window.__LIMINAL__.setInput(null));
  }
  await page.waitForFunction(() => window.__LIMINAL__.state().screen === 'scare', null, { timeout: 30000 });
  await sleep(350);
  await shot(page, 'jumpscare');
  await page.waitForFunction(() => window.__LIMINAL__.state().screen === 'dead', null, { timeout: 15000 });
  await shot(page, 'dead');
  await page.click('button.retry');
  await sleep(400);
  const retry = await state();
  assert(retry.screen === 'playing' && retry.depth === 1, 'retry restarts the same floor');
  assert(retry.prowler === 'dormant', 'the entity is gone after a retry');

  // The disguised entity kills too, with its own explanation.
  await page.evaluate(() => window.__LIMINAL__.summon('mimic'));
  await page.waitForFunction(() => window.__LIMINAL__.state().screen === 'dead', null, { timeout: 15000 });
  assert((await page.textContent('.dead-text')).includes('arpenteur'), 'the death screen explains the disguise');
  await page.click('button.retry');
  await sleep(300);

  // Co-op entry points are on the title; an invalid code is refused without leaving it.
  // Quitting offers to continue the saved run.
  await page.keyboard.press('Escape');
  await page.click('button.quit');
  await sleep(300);
  assert(await page.isVisible('button.continue'), 'the title offers to continue');
  assert(await page.isVisible('button.host') && await page.isVisible('button.join'), 'co-op buttons are on the title');
  await page.fill('input[name=code]', 'AB');
  await page.click('button.join');
  assert((await page.textContent('.status')).includes('5 lettres'), 'a short room code is refused');
  await page.click('button.continue');
  await sleep(400);
  assert((await state()).depth === 1, 'continue resumes at the saved floor');

  assert(page.errors.length === 0, `no console/page errors, got:\n${page.errors.join('\n')}`);
}
