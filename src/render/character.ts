import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

export type CharMode = 'idle' | 'run' | 'jump' | 'slide' | 'dead-crash' | 'dead-fall';
export type ClipKey = 'idle' | 'run' | 'jump' | 'slide' | 'death' | 'fall';

/**
 * Character manifest. `url` loads a clip from a separate file (e.g. a Mixamo FBX
 * downloaded "without skin"); `name` picks a clip embedded in the model file.
 * Missing/broken clips are skipped and replaced by procedural motion.
 */
export interface CharacterManifest {
  model: string;
  clips: Partial<Record<ClipKey, { url?: string; name?: string }>>;
}

export const DEFAULT_CHARACTER: CharacterManifest = {
  // Mixamo "X Bot" (as shipped in the three.js examples) with idle + run clips.
  model: 'models/Xbot.glb',
  clips: {
    idle: { name: 'idle' },
    run: { name: 'run' },
    // Drop Mixamo FBX files here and uncomment to use real animations:
    // jump: { url: 'models/mixamo/Jump.fbx' },
    // slide: { url: 'models/mixamo/Running Slide.fbx' },
    // death: { url: 'models/mixamo/Falling Back Death.fbx' },
    // fall: { url: 'models/mixamo/Falling.fbx' },
  },
};

/** Something that can pose a character model for a given mode. */
export interface CharacterBody {
  readonly object: THREE.Object3D;
  /** modes covered by real animation clips (the rig skips procedural tilts for them) */
  readonly clipFor: Partial<Record<CharMode, boolean>>;
  update(dt: number, mode: CharMode, modeTime: number, speed: number): void;
}

const TARGET_HEIGHT = 1.8;
const damp = (k: number, dt: number) => 1 - Math.exp(-k * dt);
const shortest = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

// -----------------------------------------------------------------------------
// Rig: places the body in the world and adds procedural leaning/tilting.
// -----------------------------------------------------------------------------

export interface RigInput {
  pos: THREE.Vector3;
  yaw: number;
  mode: CharMode;
  speed: number;
  latVel: number;
}

export class CharacterRig {
  readonly root = new THREE.Group();
  private tilt = new THREE.Group();
  private body: CharacterBody;
  private yaw = 0;
  private mode: CharMode = 'idle';
  private modeTime = 0;
  private pitch = 0;
  private roll = 0;

  constructor(body: CharacterBody) {
    this.body = body;
    this.root.add(this.tilt);
    this.tilt.add(body.object);
  }

  setBody(body: CharacterBody): void {
    this.tilt.remove(this.body.object);
    this.body = body;
    this.tilt.add(body.object);
  }

  snap(yaw: number): void {
    this.yaw = yaw;
    this.pitch = this.roll = 0;
    this.mode = 'idle';
    this.modeTime = 0;
    this.tilt.position.set(0, 0, 0);
  }

  update(dt: number, s: RigInput): void {
    if (s.mode !== this.mode) {
      this.mode = s.mode;
      this.modeTime = 0;
    } else {
      this.modeTime += dt;
    }
    const t = this.modeTime;
    const clip = this.body.clipFor;

    this.root.position.copy(s.pos);
    const yawErr = shortest(s.yaw - this.yaw);
    this.yaw += yawErr * damp(18, dt);
    this.root.rotation.y = this.yaw;

    // lean into turns and lane changes (positive roll leans right)
    let roll = Math.max(-0.45, Math.min(0.45, -yawErr * 0.55 + s.latVel * 0.022));
    let pitch = 0;
    let back = 0;
    switch (s.mode) {
      case 'run':
        pitch = 0.07;
        break;
      case 'jump':
        pitch = clip.jump ? 0 : 0.14;
        break;
      case 'slide':
        pitch = clip.slide ? 0 : -1.12;
        break;
      case 'dead-crash':
        roll = 0;
        if (!clip['dead-crash']) {
          pitch = -Math.PI / 2 * easeOut(Math.min(1, t / 0.45));
          back = -0.8 * easeOut(Math.min(1, t / 0.35));
        }
        break;
      case 'dead-fall':
        roll = 0;
        pitch = clip['dead-fall'] ? 0 : t * 2.4;
        break;
      default:
        break;
    }
    const direct = s.mode === 'dead-crash' || s.mode === 'dead-fall';
    this.pitch = direct ? pitch : this.pitch + (pitch - this.pitch) * damp(16, dt);
    this.roll += (roll - this.roll) * damp(10, dt);
    this.tilt.rotation.set(this.pitch, 0, this.roll);
    this.tilt.position.set(0, 0, back);

    this.body.update(dt, s.mode, t, s.speed);
  }
}

// -----------------------------------------------------------------------------
// Mixamo / glTF body
// -----------------------------------------------------------------------------

const MODE_CLIP: Record<CharMode, ClipKey> = {
  idle: 'idle',
  run: 'run',
  jump: 'jump',
  slide: 'slide',
  'dead-crash': 'death',
  'dead-fall': 'fall',
};

export class AnimatedBody implements CharacterBody {
  readonly object: THREE.Object3D;
  readonly clipFor: Partial<Record<CharMode, boolean>>;
  private mixer: THREE.AnimationMixer;
  private actions: Partial<Record<ClipKey, THREE.AnimationAction>> = {};
  private current: THREE.AnimationAction | null = null;
  private lastMode: CharMode | null = null;

  constructor(object: THREE.Object3D, clips: Partial<Record<ClipKey, THREE.AnimationClip>>) {
    this.object = object;
    this.mixer = new THREE.AnimationMixer(object);
    for (const [key, clip] of Object.entries(clips) as Array<[ClipKey, THREE.AnimationClip]>) {
      const a = this.mixer.clipAction(clip);
      if (key === 'jump' || key === 'death' || key === 'slide') {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions[key] = a;
    }
    this.clipFor = {
      jump: !!this.actions.jump,
      slide: !!this.actions.slide,
      'dead-crash': !!this.actions.death,
      'dead-fall': !!this.actions.fall,
    };
  }

  update(dt: number, mode: CharMode, modeTime: number, speed: number): void {
    if (mode !== this.lastMode) {
      this.lastMode = mode;
      const action = this.actions[MODE_CLIP[mode]] ?? (mode === 'idle' ? null : this.actions.run) ?? this.actions.idle ?? null;
      if (action && action !== this.current) {
        action.reset().setEffectiveWeight(1).fadeIn(mode === 'dead-crash' ? 0.1 : 0.18).play();
        this.current?.fadeOut(0.18);
        this.current = action;
      } else if (action && this.actions[MODE_CLIP[mode]] === action) {
        action.reset().play();
      }
    }
    const a = this.current;
    if (a) {
      const own = this.actions[MODE_CLIP[mode]] === a;
      let ts = 1;
      if (mode === 'run' || (mode === 'idle' && a === this.actions.run)) ts = 0.95 + (speed - 11) * 0.045;
      else if (mode === 'jump') ts = own ? Math.max(1, a.getClip().duration / 0.8) : 0.3;
      else if (mode === 'slide') ts = own ? Math.max(1, a.getClip().duration / 0.75) : 0.12;
      else if (mode === 'dead-crash') ts = own ? 1 : Math.max(0, 1 - modeTime * 4);
      else if (mode === 'dead-fall') ts = own ? 1 : 2.2;
      a.setEffectiveTimeScale(ts);
    }
    this.mixer.update(dt);
  }
}

function loadAny(url: string): Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }> {
  if (/\.fbx$/i.test(url)) {
    return new FBXLoader().loadAsync(url).then((g) => ({ scene: g, animations: g.animations }));
  }
  return new GLTFLoader().loadAsync(url).then((g) => ({ scene: g.scene, animations: g.animations }));
}

/** Remove horizontal root motion so clips downloaded without "In Place" still run on the spot. */
export function makeInPlace(clip: THREE.AnimationClip): THREE.AnimationClip {
  for (const track of clip.tracks) {
    if (!/hips\.position$/i.test(track.name)) continue;
    const v = track.values;
    const x0 = v[0];
    const z0 = v[2];
    for (let i = 0; i < v.length; i += 3) {
      v[i] = x0;
      v[i + 2] = z0;
    }
  }
  return clip;
}

/** Load a (Mixamo) character + clips, normalised to 1.8 m, feet at y=0, facing +Z. */
export async function loadAnimatedBody(manifest: CharacterManifest, base: string): Promise<AnimatedBody> {
  const model = await loadAny(base + manifest.model);
  const inner = model.scene;
  inner.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.frustumCulled = false;
    }
  });

  const holder = new THREE.Group();
  holder.add(inner);
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  const h = box.max.y - box.min.y;
  if (h > 0.01 && Number.isFinite(h)) {
    inner.scale.multiplyScalar(TARGET_HEIGHT / h);
    holder.updateMatrixWorld(true);
    box.setFromObject(inner);
    const c = box.getCenter(new THREE.Vector3());
    inner.position.x -= c.x;
    inner.position.z -= c.z;
    inner.position.y -= box.min.y;
  }

  const clips: Partial<Record<ClipKey, THREE.AnimationClip>> = {};
  const byName = (name: string) => model.animations.find((a) => a.name.toLowerCase() === name.toLowerCase());
  await Promise.all(
    (Object.entries(manifest.clips) as Array<[ClipKey, { url?: string; name?: string }]>).map(async ([key, spec]) => {
      try {
        if (spec.url) {
          const file = await loadAny(base + spec.url);
          const clip = (spec.name ? file.animations.find((a) => a.name === spec.name) : undefined) ?? file.animations[0];
          if (clip) clips[key] = makeInPlace(clip);
        } else if (spec.name) {
          const clip = byName(spec.name);
          if (clip) clips[key] = clip;
        }
      } catch (err) {
        console.warn(`[character] clip "${key}" unavailable, using procedural fallback`, err);
      }
    }),
  );
  if (!clips.run) clips.run = model.animations[0];
  return new AnimatedBody(holder, clips);
}

// -----------------------------------------------------------------------------
// Dummy body: blocky explorer with procedural animation (no assets required).
// -----------------------------------------------------------------------------

export class DummyBody implements CharacterBody {
  readonly object = new THREE.Group();
  readonly clipFor: Partial<Record<CharMode, boolean>> = { jump: true };
  private hips = new THREE.Group();
  private torso = new THREE.Group();
  private limbs: Record<'lArm' | 'rArm' | 'lLeg' | 'rLeg', { upper: THREE.Group; lower: THREE.Group }>;
  private phase = 0;

  constructor() {
    const skin = new THREE.MeshStandardMaterial({ color: 0xd9a27a, roughness: 0.8 });
    const shirt = new THREE.MeshStandardMaterial({ color: 0xc9b48a, roughness: 0.9 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x5b4a36, roughness: 0.9 });
    const hat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.8 });
    const box = (w: number, h: number, d: number, m: THREE.Material, y: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.y = y;
      mesh.castShadow = true;
      return mesh;
    };

    this.hips.position.y = 0.95;
    this.object.add(this.hips);
    this.hips.add(this.torso);
    this.torso.add(box(0.46, 0.6, 0.26, shirt, 0.32));
    const head = new THREE.Group();
    head.position.y = 0.72;
    head.add(box(0.26, 0.28, 0.26, skin, 0.14));
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 16), hat);
    brim.position.y = 0.3;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.16, 12), hat);
    crown.position.y = 0.38;
    head.add(brim, crown);
    this.torso.add(head);

    const limb = (x: number, y: number, len: number, w: number, m1: THREE.Material, m2: THREE.Material, parent: THREE.Object3D) => {
      const upper = new THREE.Group();
      upper.position.set(x, y, 0);
      upper.add(box(w, len, w, m1, -len / 2));
      const lower = new THREE.Group();
      lower.position.y = -len;
      lower.add(box(w * 0.9, len, w * 0.9, m2, -len / 2));
      upper.add(lower);
      parent.add(upper);
      return { upper, lower };
    };
    this.limbs = {
      lArm: limb(0.3, 0.58, 0.3, 0.12, shirt, skin, this.torso),
      rArm: limb(-0.3, 0.58, 0.3, 0.12, shirt, skin, this.torso),
      lLeg: limb(0.12, 0, 0.46, 0.16, pants, pants, this.hips),
      rLeg: limb(-0.12, 0, 0.46, 0.16, pants, pants, this.hips),
    };
  }

  update(dt: number, mode: CharMode, modeTime: number, speed: number): void {
    const { lArm, rArm, lLeg, rLeg } = this.limbs;
    let lHip = 0, rHip = 0, lKnee = 0, rKnee = 0, lSh = 0, rSh = 0, lEl = -0.3, rEl = -0.3, lean = 0;
    let hipY = 0.95;
    if (mode === 'run') {
      this.phase += dt * (6 + speed * 0.45);
      const p = this.phase;
      lHip = Math.sin(p) * 0.9;
      rHip = -lHip;
      lKnee = Math.max(0, -Math.sin(p - 0.9)) * 1.4 + 0.15;
      rKnee = Math.max(0, Math.sin(p - 0.9)) * 1.4 + 0.15;
      lSh = -Math.sin(p) * 0.9;
      rSh = -lSh;
      lEl = rEl = -1.3;
      lean = 0.2;
      hipY = 0.95 + Math.abs(Math.cos(p)) * 0.06;
    } else if (mode === 'jump') {
      const k = Math.min(1, modeTime / 0.12);
      lHip = -1.1 * k;
      rHip = 0.3 * k;
      lKnee = 1.6 * k;
      rKnee = 0.9 * k;
      lSh = rSh = -2.4 * k;
      lean = 0.15;
    } else if (mode === 'slide') {
      lHip = rHip = -1.0;
      lKnee = 0.2;
      rKnee = 0.7;
      lSh = rSh = -0.6;
      hipY = 0.95;
    } else if (mode === 'dead-crash' || mode === 'dead-fall') {
      const w = Math.sin(modeTime * 14) * (mode === 'dead-fall' ? 0.8 : 0);
      lSh = -2.6 + w;
      rSh = -2.6 - w;
      lHip = 0.3 + w * 0.5;
      rHip = -0.3 - w * 0.5;
      lKnee = rKnee = 0.4;
    } else {
      const b = Math.sin(modeTime * 2) * 0.03;
      lSh = 0.1 + b;
      rSh = 0.1 - b;
      lEl = rEl = -0.15;
    }
    // positive rotation.x swings a hanging limb backwards, so negate for "forward"
    lLeg.upper.rotation.x = -lHip;
    rLeg.upper.rotation.x = -rHip;
    lLeg.lower.rotation.x = lKnee;
    rLeg.lower.rotation.x = rKnee;
    lArm.upper.rotation.x = -lSh;
    rArm.upper.rotation.x = -rSh;
    lArm.lower.rotation.x = lEl;
    rArm.lower.rotation.x = rEl;
    this.torso.rotation.x = lean;
    this.hips.position.y = hipY;
  }
}
