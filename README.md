# Temple Run prototype → Run & learn Hindi

Endless-runner prototype (Three.js + TypeScript + Vite) built around the core Temple Run moment:
**running up to a T junction and turning left or right in time**. It now opens in a
**language-learning mode**: each junction asks for the next piece of a Hindi sentence.
Static site, deployable to GitHub Pages.

## Learn mode (default)

- **Study page first:** every sentence with its meaning and audio. Tap a sentence or a single
  word-group to hear it, use *Listen to all* and *Slow* (0.75×), open each sentence's
  *Traps at the junctions*, or use *Test yourself*, which blurs the Hindi until you tap the card.
  Press Space or *Start running* to play, and **L** after a game over to come back.
- An English sentence sits at the top, e.g. *"My name is James."* You build it in Hindi,
  **one chunk per T junction**. One branch carries the right chunk, the other a close-miss trap.
- The traps target real pitfalls: gender (मेरा/मेरी), verb-last word order, मैं vs मैंने,
  कल as yesterday vs tomorrow, सीखना vs सीखने, थोड़ा vs थोड़ी.
- **Right:** "सही!", +5 coins, and the chunk is spoken (browser speech, if a Hindi voice is
  installed). **Wrong:** you lose a heart (3 per run), and the correction is shown with a one-line
  reason. Any sentence you got wrong comes back two sentences later.
- ←/→ means **"answer"** at any point on the straight (you can change your mind until the junction),
  so learn mode has no lane-blocking obstacles: only roots and gaps to jump, and beams to slide under.
- Lesson 1 is "About me" (I want to learn Hindi / My name is James / Yesterday I decided… /
  Today I can speak a little…). Add more in `src/learn/lessons.ts`.
  It is written for a male speaker (चाहता/सकता).

`?mode=classic` gives the plain Temple Run prototype (lane changes, more obstacles).

### Audio (ElevenLabs)

While you run, the current Hindi sentence is **spoken on a loop**, with a 1.6 s pause between
repeats (M toggles it). The clips are pre-generated MP3s in `public/audio/hi/`, so **no API key
ships with the game**. After adding or changing sentences, regenerate them:

```bash
npm run tts     # uses ELEVENLABS_API_KEY or the key in ./info.txt (git-ignored); only new text is generated
```

Voice: ElevenLabs "Alice" (`eleven_multilingual_v2`, verified for Hindi, speed 0.85). Change it with `VOICE=<id> npm run tts`.
Text without a clip falls back to the browser's own Hindi voice, if one is installed.

---

- Mixamo **X Bot** character (idle/run clips), with a procedural dummy runner as fallback (`?char=dummy`)
- Procedural jungle-temple track: stone path over an abyss, pillars, torches, trees, coins
- T junctions with both branches visible; the chosen branch continues, the other is discarded
- Obstacles: roots (jump), spiked beams (slide), gaps (jump), fallen blocks (change lane, classic only)
- Keyboard + swipe controls, minimap, debug overlay, autoplay demo mode

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (junction decision logic, simulation, track fairness)
npm run build      # static build in dist/
npm run smoke      # optional: drives the real game in headless Edge/Chrome (needs `npm run dev` running)
```

URL options: `?mode=classic` · `?seed=123` (reproducible track) · `?autoplay` (bot plays; in learn mode it picks the right answers) · `?char=dummy`

## Controls

| Input | Action |
| --- | --- |
| ← → / A D / swipe left-right | **turn** inside a junction's decision zone, otherwise change lane |
| ↑ / W / Space / swipe up | jump (buffered slightly if pressed in the air) |
| ↓ / S / swipe down | slide (in the air: slam down, then slide) |
| P / Esc | pause · **H** debug overlay |

## How the T-junction decision works

All of this lives in `src/game/junction.ts` (pure logic, unit-tested in `tests/junction.test.ts`):

```
        zoneStart (torches)      square   centre   wall
  ---------|------------------------|--------|--------|##
   L/R = lane change      L/R = turn decision     dead end
```

- Before the decision zone (marked by two torches), left/right only changes lanes.
- Inside the zone, the HUD shows `◀ TURN ▶`. Input is **buffered**, the latest input wins
  (you can change your mind), and the chosen arrow lights up, as does the branch on the minimap.
- A buffered turn executes **exactly at the junction centre**. The movement step is split there,
  and the runner's world position is re-expressed in the branch's frame, so there is no teleport
  and you land in the centre lane. Input that arrives after the centre turns immediately.
- No decision: you hit the dead-end wall → game over with an explanation.
- After the turn, the chosen branch's own T junction gets its two branches generated. The old
  segment and the unchosen branch are removed once they are behind the camera.

## Project layout

```
src/game/      rendering-free simulation (deterministic, fixed 120 Hz step)
  junction.ts    T-junction decision logic
  track.ts       segment tree, procedural content, retirement of unchosen branches
  player.ts      runner kinematics, lanes, jump/slide, collisions, turn execution
  autopilot.ts   bot used by tests and ?autoplay
  sim.ts         ties it together
src/render/    Three.js: track meshes (merged per material), character, camera, environment
src/learn/     lessons (data), LessonDirector (questions/hearts/repeats), wall signs, speech
src/ui/        DOM overlays: hud.ts (game) + learnHud.ts (sentence, answer cards, feedback)
tests/         vitest unit tests
scripts/smoke.mjs  headless-browser end-to-end check (left / right / no decision)
```

## Using your own Mixamo character / animations

X Bot ships with only `idle` and `run`, so jump, slide and death are procedural tilts. To use real
Mixamo animations:

1. On [mixamo.com](https://www.mixamo.com) (free Adobe account), download your character as
   **FBX Binary, With Skin**, and animations such as *Jump*, *Running Slide*, *Falling Back Death*
   and *Falling* as **FBX, Without Skin** (tick **In Place** where offered).
2. Put them in `public/models/mixamo/`.
3. Edit `DEFAULT_CHARACTER` in `src/render/character.ts`: set `model` (e.g. `models/mixamo/Character.fbx`)
   and uncomment / point the `jump`, `slide`, `death` and `fall` clip URLs at your files.

Models are auto-scaled to 1.8 m. Leftover root motion is stripped, and any clip that is missing
falls back to procedural motion.

## Deploy to GitHub Pages

The build uses relative asset paths (`base: './'` in `vite.config.ts`), so it works at
`https://<user>.github.io/<repo>/` whatever the repo is called.

1. Push this folder to a GitHub repo (default branch `main`).
2. In the repo, go to **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Each push to `main` runs `.github/workflows/deploy.yml`, which tests, builds and publishes `dist/`.

## Asset credits

- `public/models/Xbot.glb`: Mixamo "X Bot" (Adobe), as distributed with the three.js examples.
  Mixamo assets are royalty-free to use in projects; don't redistribute them as standalone assets.
- All textures are generated procedurally at runtime (`src/render/textures.ts`).
