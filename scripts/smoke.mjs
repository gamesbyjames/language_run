// Headless browser smoke test: drives the real game to the first T junction and
// checks that left / right / no decision are handled correctly. Saves screenshots.
//   npm run smoke                (expects a server on http://localhost:5173)
//   URL=http://localhost:4173/ npm run smoke
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const URL = process.env.URL ?? 'http://localhost:5173/';
const OUT = path.resolve('scripts/out');
fs.mkdirSync(OUT, { recursive: true });

const CHROME = [
  process.env.CHROME,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => p && fs.existsSync(p));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  pipe: true,
  timeout: 60000,
  userDataDir: fs.mkdtempSync(path.join(process.env.TEMP ?? process.env.TMPDIR ?? '/tmp', 'smoke-')),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-first-run', '--window-size=1280,720', '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 1280, height: 720 },
});

let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!ok) failures++;
};

async function open(query) {
  const page = await browser.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.log(`  [browser ${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message}`));
  await page.goto(URL + query, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game?.ready === true, { timeout: 60000 });
  return page;
}

const state = (page) => page.evaluate(() => window.__game.state());
const waitFor = (page, fn, timeout = 90000) => page.waitForFunction(fn, { timeout, polling: 50 });

async function scenario(name, decision) {
  console.log(`\n--- ${name} ---`);
  const page = await open('?mode=classic&seed=7');
  console.log(`  character: ${await page.evaluate(() => window.__game.character)}`);
  // the bot only dodges obstacles; the junction decision below comes from real key presses
  await page.evaluate(() => window.__game.setAutopilot('obstacles'));
  if (decision === 'left') await page.screenshot({ path: path.join(OUT, '0-title.png') });
  await page.keyboard.press('Space');
  await waitFor(page, () => window.__game.state().phase === 'running');

  // approach: show the T junction coming up
  await waitFor(page, () => window.__game.state().toZone < 10);
  if (decision === 'left') await page.screenshot({ path: path.join(OUT, '1-approach.png') });

  await waitFor(page, () => window.__game.state().inZone);
  const before = await state(page);
  check(before.alive && before.turns.length === 0, `${name}: reached the decision zone alive (s=${before.s.toFixed(1)})`);

  if (decision) {
    await page.keyboard.press(decision === 'left' ? 'ArrowLeft' : 'ArrowRight');
    await waitFor(page, () => window.__game.state().pending !== null || window.__game.state().turns.length > 0, 10000);
    const queued = await state(page);
    check(queued.pending === decision, `${name}: decision buffered as "${queued.pending}" ${queued.toCentre.toFixed(1)} m before the centre`);
    if (decision === 'left') await page.screenshot({ path: path.join(OUT, '2-decision.png') });
    await waitFor(page, () => window.__game.state().turns.length > 0 || !window.__game.state().alive);
    const after = await state(page);
    const expectedDir = decision === 'left' ? 3 : 1; // start heading N(0): left -> W(3), right -> E(1)
    check(after.alive, `${name}: still alive after the junction`);
    check(after.turns[0] === decision, `${name}: turned ${after.turns[0]}`);
    check(after.dir === expectedDir, `${name}: new heading ${'NESW'[after.dir]} (expected ${'NESW'[expectedDir]})`);
    check(Math.abs(after.lat) < 0.5, `${name}: lands in the centre lane (lat=${after.lat.toFixed(2)})`);
    await new Promise((r) => setTimeout(r, 700));
    await page.screenshot({ path: path.join(OUT, `3-after-${decision}.png`) });
    await waitFor(page, () => window.__game.state().segments.length === 3 || !window.__game.state().alive, 60000);
    const later = await state(page);
    check(later.segments.length === 3, `${name}: unchosen branch + old segment retired (alive segments: ${later.segments.join(',')})`);
  } else {
    await waitFor(page, () => !window.__game.state().alive);
    const dead = await state(page);
    check(dead.deathCause === 'wall', `${name}: no decision -> crashed into the dead end (cause=${dead.deathCause})`);
    check(dead.turns.length === 0, `${name}: no turn taken`);
    await new Promise((r) => setTimeout(r, 1600));
    await page.screenshot({ path: path.join(OUT, '4-no-decision.png') });
  }
  await page.close();
}

async function learnScenario() {
  console.log('\n--- learn Hindi: right answer, then wrong answer ---');
  const page = await open('?seed=7');
  await page.evaluate(() => window.__game.setAutopilot('obstacles'));
  // study page first
  const st0 = (await page.evaluate(() => window.__game.learn())).study;
  check(st0.visible, 'study page is shown before playing');
  await page.click('.s-card .chip:nth-child(3)');
  await waitFor(page, () => window.__game.learn().study.playing !== null, 5000).catch(() => null);
  const st1 = (await page.evaluate(() => window.__game.learn())).study;
  check(st1.playing === 'सीखना', `tapping a word plays it (playing=${st1.playing})`);
  await new Promise((r) => setTimeout(r, 200));
  await page.screenshot({ path: path.join(OUT, 'S0-study.png') });
  await page.click('[data-act="test"]');
  await page.screenshot({ path: path.join(OUT, 'S1-study-test.png') });
  await page.click('[data-act="test"]');
  await page.click('[data-act="start"]');
  await waitFor(page, () => window.__game.state().phase === 'running');
  check(!(await page.evaluate(() => window.__game.learn())).study.visible, 'Start running closes the study page and starts the run');

  const q1 = (await page.evaluate(() => window.__game.learn())).question;
  check(q1 && q1.chunk.hi === 'मैं', `first question asks for the first chunk (${q1?.chunk.hi} vs decoy ${q1?.chunk.decoy.hi})`);
  // the sentence is spoken on a loop while running
  const n0 = (await page.evaluate(() => window.__game.learn())).narrator;
  check(n0.clips, `ElevenLabs clips loaded (${n0.voice})`);
  await waitFor(page, () => window.__game.learn().narrator.speaking, 5000).catch(() => null);
  const n1 = (await page.evaluate(() => window.__game.learn())).narrator;
  check(n1.speaking && n1.plays >= 1, `sentence is being spoken (plays=${n1.plays})`);
  await waitFor(page, () => !window.__game.learn().narrator.speaking, 8000).catch(() => null);
  const tEnd = Date.now();
  await waitFor(page, () => window.__game.learn().narrator.plays >= 2, 8000).catch(() => null);
  const gap = (Date.now() - tEnd) / 1000;
  const n2 = (await page.evaluate(() => window.__game.learn())).narrator;
  check(n2.plays >= 2 && gap > 1 && gap < 3, `repeats after a pause (plays=${n2.plays}, gap≈${gap.toFixed(1)}s)`);
  await waitFor(page, () => window.__game.state().toCentre < 30);
  await page.screenshot({ path: path.join(OUT, 'L1-question.png') });

  // answer correctly with the real arrow key
  await page.keyboard.press(q1.correct === 'left' ? 'ArrowLeft' : 'ArrowRight');
  await waitFor(page, () => window.__game.state().turns.length === 1 || !window.__game.state().alive);
  let l = await page.evaluate(() => window.__game.learn());
  check(l.correctCount === 1 && l.hearts === 3 && l.chunkIndex === 1, `correct answer accepted (right=${l.correctCount}, hearts=${l.hearts}, chunk=${l.chunkIndex})`);
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: path.join(OUT, 'L2-correct.png') });

  // second junction: deliberately pick the decoy
  const q2 = l.question;
  check(q2 && q2.chunk.hi === 'हिंदी', `second question asks for the next chunk (${q2?.chunk.hi})`);
  await waitFor(page, () => window.__game.state().toCentre < 25);
  await page.keyboard.press(q2.correct === 'left' ? 'ArrowRight' : 'ArrowLeft');
  await waitFor(page, () => window.__game.state().turns.length === 2 || !window.__game.state().alive);
  l = await page.evaluate(() => window.__game.learn());
  const st = await state(page);
  check(st.alive && l.wrongCount === 1 && l.hearts === 2 && l.chunkIndex === 2, `wrong answer costs a heart and the run continues (hearts=${l.hearts}, chunk=${l.chunkIndex})`);
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: path.join(OUT, 'L3-wrong.png') });
  await page.close();
}

try {
  await learnScenario();
  await scenario('turn left', 'left');
  await scenario('turn right', 'right');
  await scenario('no decision', null);
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall smoke checks passed');
process.exit(failures ? 1 : 0);
