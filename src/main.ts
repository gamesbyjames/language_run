import * as THREE from 'three';
import './style.css';
import { applyLearnMode } from './game/config';
import { dirYaw, type TurnDir } from './game/dirs';
import { GameSim } from './game/sim';
import type { DeathCause } from './game/player';
import type { Segment } from './game/track';
import { Input } from './input';
import { LessonDirector, type Outcome } from './learn/director';
import { HINDI_LESSON_1 } from './learn/lessons';
import { DEVANAGARI_FONT, signTexture } from './learn/sign';
import { Speech } from './learn/speech';
import { ClipPlayer, Clips } from './learn/clips';
import { Narrator } from './learn/narrator';
import { StudyPage } from './ui/studyPage';
import { CameraRig, type CameraMode } from './render/cameraRig';
import { CharacterRig, DEFAULT_CHARACTER, DummyBody, loadAnimatedBody, type CharMode } from './render/character';
import { Environment } from './render/environment';
import { TrackView } from './render/trackView';
import { Hud, turnLabel } from './ui/hud';
import { LearnHud } from './ui/learnHud';

const params = new URLSearchParams(location.search);
const fixedSeed = params.has('seed') ? Number(params.get('seed')) : null;
const newSeed = () => fixedSeed ?? Math.floor(Math.random() * 1e9);
/** ?autoplay = demo mode: the bot runs, dodges and picks branches by itself */
const autoplay = params.has('autoplay');
/** default: learn Hindi; ?mode=classic = plain Temple Run prototype */
const learn = params.get('mode') !== 'classic';
if (learn) applyLearnMode();

// --- renderer / scene ----------------------------------------------------------
const app = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.className = 'view';
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
const env = new Environment(scene);
const trackView = new TrackView();
scene.add(trackView.group);

const hud = new Hud(document.body);
const input = new Input(renderer.domElement);
const cameraRig = new CameraRig(camera);
const rig = new CharacterRig(new DummyBody());
scene.add(rig.root);
let characterName = 'dummy (procedural)';

// --- learning layer (Hindi) ---------------------------------------------------------
const lesson = HINDI_LESSON_1;
const director = learn ? new LessonDirector(lesson, Math.floor(Math.random() * 1e9)) : null;
const learnHud = learn ? new LearnHud(document.body) : null;
const speech = new Speech(lesson.speechLang);
const clips = new Clips();
const narrator = new Narrator(clips, speech);
const voiceLabel = () => (clips.loaded ? clips.voice : speech.available ? speech.voiceName : 'none found (text only)');
const study = learn ? new StudyPage(document.body, lesson, new ClipPlayer(clips, speech), voiceLabel) : null;
// browsers only allow audio after a user gesture: unlock on the first key / tap
for (const ev of ['keydown', 'pointerdown'] as const) window.addEventListener(ev, () => narrator.unlock(), { capture: true });
hud.classicPrompt = !learn;

function assignQuestion(seg: Segment): void {
  if (!director) return;
  const q = director.assign(seg.id);
  trackView.setSign(seg, signTexture(q.left, q.right));
}

function onAnswer(dir: TurnDir, from: Segment, to: Segment): void {
  if (!director) {
    hud.flash(dir === 'left' ? '◀ LEFT' : 'RIGHT ▶');
    return;
  }
  const out: Outcome | null = director.resolve(from.id, dir);
  trackView.clearSign(from); // answered: don't let the old sign slide past
  if (out) {
    learnHud?.showOutcome(out);
    if (out.correct) sim.player.coins += 5;
    else {
      cameraRig.bump(0.5);
      if (out.hearts <= 0) sim.player.kill('hearts');
    }
  }
  if (sim.player.alive) assignQuestion(to);
}

// --- simulation ------------------------------------------------------------------
let deathShownAt = -1;
const sim = new GameSim(newSeed(), {
  segmentAdded: (seg) => trackView.add(seg),
  segmentRemoved: (seg) => trackView.remove(seg),
  coin: (coin, seg) => trackView.takeCoin(seg, coin),
  turnQueued: (dir) => {
    if (!learn) hud.flash(turnLabel(dir), 'queued');
  },
  turned: onAnswer,
  died: (cause: DeathCause) => {
    cameraRig.bump(cause === 'gap' ? 0 : 1);
    deathShownAt = clock + 1.1;
  },
});
assignQuestion(sim.track.root);
sim.autopilot.chooser = () => director?.questionFor(sim.player.segment.id)?.correct ?? null;

let clock = 0;
let paused = false;
let ready = false;
const focus = new THREE.Vector3();
const anchor = new THREE.Vector3();
const playerPos = new THREE.Vector3();

function placeCameraAtStart(): void {
  sim.player.worldPosition(playerPos);
  rig.snap(dirYaw(sim.player.segment.dir));
  cameraRig.snap(playerPos, dirYaw(sim.player.segment.dir), 'ready');
}

function restart(): void {
  trackView.clear();
  sim.reset(newSeed());
  director?.restartRun();
  learnHud?.reset();
  assignQuestion(sim.track.root);
  deathShownAt = -1;
  placeCameraAtStart();
  hud.hidePanel();
  sim.start();
}

function charMode(): CharMode {
  const p = sim.player;
  if (!p.alive) return p.deathCause === 'gap' ? 'dead-fall' : 'dead-crash';
  if (sim.phase === 'ready') return 'idle';
  if (p.sliding) return 'slide';
  if (!p.grounded) return p.y < -0.3 ? 'dead-fall' : 'jump';
  return 'run';
}

function cameraMode(): CameraMode {
  const p = sim.player;
  if (sim.phase === 'ready') return 'ready';
  if (!p.alive) return p.deathCause === 'gap' ? 'fall' : 'crash';
  return p.y < -0.6 ? 'fall' : 'follow';
}

function openStudy(): void {
  if (!study) return;
  hud.hidePanel();
  study.show();
}

/** "Start running" from the study page: first run, or a new run after a game over. */
function startFromStudy(): void {
  if (!study || !ready) return;
  study.hide();
  if (sim.phase === 'ready') {
    hud.hidePanel();
    sim.start();
  } else if (sim.phase === 'dead') restart();
}

if (study) study.onStart = startFromStudy;
hud.onAction = (a) => {
  if (a === 'study') openStudy();
  else if (a === 'run' && sim.phase === 'dead' && clock >= deathShownAt) restart();
};

function handleInput(): void {
  for (const a of input.drain()) {
    if (study?.visible) {
      // only "start" (Space / Enter) and sound toggling while studying
      if (a === 'start') startFromStudy();
      else if (a === 'mute') narrator.toggle();
      continue;
    }
    if (a === 'debug') hud.toggleDebug();
    else if (a === 'study') {
      if (sim.phase !== 'running') openStudy();
    } else if (a === 'mute') {
      const on = narrator.toggle();
      hud.flash(on ? 'sound on' : 'sound off');
    } else if (a === 'pause') {
      if (sim.phase === 'running') {
        paused = !paused;
        hud.paused(paused);
      }
    } else if (a === 'start') {
      if (!ready) continue;
      if (sim.phase === 'ready') {
        hud.hidePanel();
        sim.start();
      } else if (sim.phase === 'dead' && clock >= deathShownAt) restart();
      else if (paused) {
        paused = false;
        hud.paused(false);
      }
    } else if (!paused) {
      sim.act(a);
    }
  }
}

function frame(dt: number): void {
  clock += dt;
  handleInput();
  if (!paused) sim.update(dt);

  const p = sim.player;
  p.worldPosition(playerPos);
  // camera anchor: on the path centre-line, following lateral moves only halfway
  sim.track.localToWorld(p.segment, p.s, p.lat * 0.5, Math.max(0, p.y), anchor);
  const yaw = dirYaw(p.segment.dir);

  if (!paused) {
    rig.update(dt, { pos: playerPos, yaw, mode: charMode(), speed: p.speed, latVel: p.latVel });
    trackView.update(dt);
    cameraRig.update(dt, anchor, playerPos, yaw, p.speed, cameraMode());
  }
  focus.copy(anchor);
  env.update(focus, camera);
  hud.update(dt, p, sim.track, sim.phase === 'running');
  if (director && learnHud) {
    const q = p.alive ? director.questionFor(p.segment.id) : undefined;
    learnHud.update(dt, director, q, p.decider.pending, ready && sim.phase !== 'ready', narrator.speaking);
    narrator.setText(director.sentence.hi);
    narrator.setActive(sim.phase === 'running' && p.alive && !paused);
    narrator.update(dt);
  }

  if (sim.phase === 'dead' && deathShownAt > 0 && clock >= deathShownAt) {
    const extra = director
      ? `<p class="hint">Sentence: “${director.sentence.en}”, ${director.correctCount} right, ${director.wrongCount} wrong, ${director.sentencesDone} sentences built</p>
         <p><span class="btn" data-action="run">Run again (Space)</span><span class="btn" data-action="study">Study the words (L)</span></p>`
      : '';
    hud.gameOver(p.deathCause ?? 'wall', p, extra);
    deathShownAt = 0; // shown; any later "start" restarts
    if (autoplay) setTimeout(restart, 2500);
  }
  renderer.render(scene, camera);
}

let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  frame(dt);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && sim.phase === 'running' && !paused) {
    paused = true;
    hud.paused(true);
  }
});

// --- character loading (falls back to the dummy) -----------------------------------
placeCameraAtStart();
hud.loading('Loading character…');
(async () => {
  // make sure the Devanagari web font is ready before signs are drawn on canvases
  await Promise.race([document.fonts.load(`700 48px ${DEVANAGARI_FONT}`, 'मेरा नाम हिंदी').catch(() => null), new Promise((r) => setTimeout(r, 2500))]);
  if (director) assignQuestionRedraw();
  if (learn) await clips.load(import.meta.env.BASE_URL);
  if (params.get('char') !== 'dummy') {
    try {
      const body = await loadAnimatedBody(DEFAULT_CHARACTER, import.meta.env.BASE_URL);
      rig.setBody(body);
      characterName = 'Mixamo X Bot';
    } catch (err) {
      console.warn('[character] model failed to load, using the dummy runner', err);
    }
  }
  ready = true;
  if (autoplay) {
    sim.autopilot.mode = 'full';
    hud.hidePanel();
    sim.start();
  } else if (sim.phase === 'ready') {
    if (learn) {
      hud.hidePanel();
      study?.refreshVoice();
      openStudy();
    } else hud.title(characterName);
  }
})();

/** redraw the current sign once the font has loaded */
function assignQuestionRedraw(): void {
  const q = director?.questionFor(sim.player.segment.id);
  if (q) trackView.setSign(sim.player.segment, signTexture(q.left, q.right));
}

// --- test / debug hook --------------------------------------------------------------
declare global {
  interface Window {
    __game: unknown;
  }
}
window.__game = {
  sim,
  get ready() {
    return ready;
  },
  get character() {
    return characterName;
  },
  press: (a: Parameters<typeof input.push>[0]) => input.push(a),
  setAutopilot: (mode: 'off' | 'obstacles' | 'full') => (sim.autopilot.mode = mode),
  learn: () =>
    director && {
      sentence: director.sentence.id,
      chunkIndex: director.chunkIndex,
      hearts: director.hearts,
      correctCount: director.correctCount,
      wrongCount: director.wrongCount,
      sentencesDone: director.sentencesDone,
      question: director.questionFor(sim.player.segment.id) ?? null,
      narrator: { plays: narrator.plays, speaking: narrator.speaking, clips: narrator.hasClips, voice: narrator.voice },
      study: study && { visible: study.visible, playing: study.playing, plays: study.plays },
    },
  state: () => {
    const p = sim.player;
    return {
      phase: sim.phase,
      segment: p.segment.id,
      dir: p.segment.dir,
      s: p.s,
      lat: p.lat,
      y: p.y,
      speed: p.speed,
      alive: p.alive,
      deathCause: p.deathCause,
      turns: [...p.turns],
      inZone: p.decider.inZone(p.s),
      pending: p.decider.pending,
      toZone: p.decider.zoneStart - p.s,
      toCentre: p.decider.turnPoint - p.s,
      distance: p.distance,
      coins: p.coins,
      segments: sim.track.segments.map((s) => s.id),
    };
  },
};
