import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../game/config';
import { dirYaw } from '../game/dirs';
import { Rng } from '../game/rng';
import type { Coin, Obstacle, Segment } from '../game/track';
import { barkTexture, emblemTexture, stoneFloorTexture, stoneWallTexture } from './textures';

const FLOOR_T = 0.8;
const CURB_H = 0.35;
const WALL_H = 5;

/** BoxGeometry with UVs in world units so textures tile instead of stretching. */
export function boxUV(w: number, h: number, d: number, tile: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const dims: Array<[number, number]> = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = dims[f];
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * su) / tile, (uv.getY(k) * sv) / tile);
    }
  }
  return g;
}

class Library {
  readonly floor = new THREE.MeshStandardMaterial({ map: stoneFloorTexture(), roughness: 0.95 });
  readonly wall = new THREE.MeshStandardMaterial({ map: stoneWallTexture(), roughness: 0.95 });
  readonly under = new THREE.MeshStandardMaterial({ color: 0x3b352c, roughness: 1 });
  readonly bark = new THREE.MeshStandardMaterial({ map: barkTexture(), roughness: 1 });
  readonly leaves = new THREE.MeshStandardMaterial({ color: 0x3f7d35, roughness: 0.9, flatShading: true });
  readonly leavesDark = new THREE.MeshStandardMaterial({ color: 0x2a5a2a, roughness: 0.9, flatShading: true });
  readonly moss = new THREE.MeshStandardMaterial({ color: 0x55803c, roughness: 1, flatShading: true });
  readonly metal = new THREE.MeshStandardMaterial({ color: 0x8d877a, metalness: 0.5, roughness: 0.45 });
  readonly gold = new THREE.MeshStandardMaterial({ color: 0xffc94a, metalness: 0.85, roughness: 0.25, emissive: 0x7a4f00, emissiveIntensity: 0.55 });
  readonly flame = new THREE.MeshBasicMaterial({ color: 0xffa63d, fog: false });
  readonly flameCore = new THREE.MeshBasicMaterial({ color: 0xfff0a0, fog: false });
  readonly emblem = new THREE.MeshStandardMaterial({
    map: emblemTexture(),
    transparent: true,
    roughness: 0.9,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    depthWrite: false,
  });

  readonly coin = new THREE.CylinderGeometry(0.32, 0.32, 0.07, 22).rotateX(Math.PI / 2);
  readonly shaft = new THREE.CylinderGeometry(0.4, 0.48, 1, 10);
  readonly cap = boxUV(1.15, 0.35, 1.15, 1.2);
  readonly flameGeo = new THREE.ConeGeometry(0.17, 0.55, 8).translate(0, 0.27, 0);
  readonly flameCoreGeo = new THREE.ConeGeometry(0.09, 0.32, 6).translate(0, 0.16, 0);
  readonly trunk = new THREE.CylinderGeometry(0.3, 0.55, 1, 7);
  readonly canopy = new THREE.IcosahedronGeometry(1, 0);
  readonly log = new THREE.CylinderGeometry(0.38, 0.38, CONFIG.pathWidth + 0.9, 14).rotateZ(Math.PI / 2);
  readonly spike = new THREE.ConeGeometry(0.11, 0.34, 6).rotateX(Math.PI);
  readonly emblemGeo = new THREE.PlaneGeometry(CONFIG.pathWidth * 0.82, CONFIG.pathWidth * 0.82);
}

interface SegmentVisual {
  group: THREE.Group;
  coins: Map<number, THREE.Mesh>;
  flames: THREE.Object3D[];
  disposables: THREE.BufferGeometry[];
}

/** Builds and recycles the meshes for track segments. */
export class TrackView {
  readonly group = new THREE.Group();
  private lib: Library | null = null;
  private visuals = new Map<number, SegmentVisual>();
  private time = 0;

  private get L(): Library {
    return (this.lib ??= new Library());
  }

  add(seg: Segment): void {
    if (this.visuals.has(seg.id)) return;
    const v = this.build(seg);
    this.visuals.set(seg.id, v);
    this.group.add(v.group);
  }

  remove(seg: Segment): void {
    const v = this.visuals.get(seg.id);
    if (!v) return;
    this.dispose(v);
    this.visuals.delete(seg.id);
  }

  clear(): void {
    for (const v of this.visuals.values()) this.dispose(v);
    this.visuals.clear();
  }

  private dispose(v: SegmentVisual): void {
    this.disposeSign(v);
    this.group.remove(v.group);
    for (const g of v.disposables) g.dispose();
  }

  takeCoin(seg: Segment, coin: Coin): void {
    const m = this.visuals.get(seg.id)?.coins.get(coin.id);
    if (m) m.visible = false;
  }

  /** Put a signboard (e.g. the two answers) on the dead-end wall of this segment's T junction. */
  setSign(seg: Segment, texture: THREE.Texture): void {
    const v = this.visuals.get(seg.id);
    if (!v) return;
    this.disposeSign(v);
    const w = CONFIG.pathWidth + 0.6;
    const img = texture.image as { width: number; height: number };
    const geo = new THREE.PlaneGeometry(w, (w * img.height) / img.width);
    const mat = new THREE.MeshBasicMaterial({ map: texture, fog: false, toneMapped: false, transparent: true });
    const sign = new THREE.Mesh(geo, mat);
    sign.name = 'sign';
    sign.rotation.y = Math.PI; // face the approaching runner (canvas left = runner's left)
    sign.position.set(0, 2.9, seg.length + CONFIG.pathWidth / 2 - 0.3);
    v.group.add(sign);
  }

  clearSign(seg: Segment): void {
    const v = this.visuals.get(seg.id);
    if (v) this.disposeSign(v);
  }

  private disposeSign(v: SegmentVisual): void {
    const old = v.group.getObjectByName('sign') as THREE.Mesh | undefined;
    if (!old) return;
    v.group.remove(old);
    const mat = old.material as THREE.MeshBasicMaterial;
    mat.map?.dispose();
    mat.dispose();
    old.geometry.dispose();
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    for (const v of this.visuals.values()) {
      for (const m of v.coins.values()) if (m.visible) m.rotation.y = t * 3.2 + m.position.z * 0.3;
      for (let i = 0; i < v.flames.length; i++) {
        const f = v.flames[i];
        const k = 1 + 0.18 * Math.sin(t * 17 + i * 1.7) + 0.1 * Math.sin(t * 29 + i);
        f.scale.set(1, k, 1);
      }
    }
  }

  // ---------------------------------------------------------------------------

  private build(seg: Segment): SegmentVisual {
    const L = this.L;
    const W = CONFIG.pathWidth;
    const half = W / 2;
    const len = seg.length;
    const rng = new Rng(seg.id * 7919 + 13);

    const group = new THREE.Group();
    group.position.copy(seg.start);
    group.rotation.y = dirYaw(seg.dir);
    group.name = `segment-${seg.id}`;

    const statics = new THREE.Group(); // merged into a few draw calls at the end
    const flames: THREE.Object3D[] = [];
    const coins = new Map<number, THREE.Mesh>();
    const disposables: THREE.BufferGeometry[] = [];

    // local frame: x = -lat (runner's right is -X), y up, z = s
    const put = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = statics) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };

    // --- floor intervals (the corridor minus gaps) -------------------------------
    const gaps = seg.obstacles.filter((o) => o.kind === 'gap').sort((a, b) => a.s0 - b.s0);
    const intervals: Array<[number, number]> = [];
    let cur = seg.floorStart;
    for (const g of gaps) {
      if (g.s0 > cur) intervals.push([cur, g.s0]);
      cur = g.s1;
    }
    if (len - half > cur) intervals.push([cur, len - half]);

    for (const [a, b] of intervals) {
      const l = b - a;
      const mid = (a + b) / 2;
      put(boxUV(W, FLOOR_T, l, 3), L.floor, 0, -FLOOR_T / 2, mid);
      put(boxUV(W - 0.6, 2.2, l, 3), L.under, 0, -FLOOR_T - 1.1, mid);
      for (const side of [-1, 1]) put(boxUV(0.5, CURB_H + FLOOR_T, l, 1.5), L.wall, side * (half + 0.25), (CURB_H - FLOOR_T) / 2, mid);
    }

    // --- T junction at the end ------------------------------------------------
    put(boxUV(W, FLOOR_T, W, 3), L.floor, 0, -FLOOR_T / 2, len);
    put(boxUV(W - 0.6, 2.2, W - 0.6, 3), L.under, 0, -FLOOR_T - 1.1, len);
    const emblem = new THREE.Mesh(L.emblemGeo, L.emblem);
    emblem.rotation.set(-Math.PI / 2, 0, Math.PI);
    emblem.position.set(0, 0.02, len);
    group.add(emblem);
    // the dead end the runner smashes into without a decision
    put(boxUV(W + 1.4, WALL_H + FLOOR_T, 1.2, 2), L.wall, 0, (WALL_H - FLOOR_T) / 2, len + half + 0.6);
    put(boxUV(W - 1.5, 1.2, 0.3, 1.2), L.under, 0, WALL_H * 0.55, len + half - 0.1);
    for (const side of [-1, 1]) {
      this.pillar(statics, flames, side * (half + 0.55), len + half + 0.6, WALL_H + 1.4, true);
      this.pillar(statics, flames, side * (half + 0.55), len - half - 0.55, 4.4, true);
      // torches marking the start of the decision zone (when it is a real zone)
      const zs = len - half - CONFIG.decisionZone;
      if (zs > seg.floorStart + 2) this.pillar(statics, flames, side * (half + 0.9), zs, 3.4, true);
    }

    // --- obstacles ---------------------------------------------------------------
    for (const o of seg.obstacles) this.obstacle(o, put);

    // --- coins ---------------------------------------------------------------------
    for (const c of seg.coins) {
      const m = put(L.coin, L.gold, -c.lat, c.y, c.s, group);
      m.castShadow = true;
      coins.set(c.id, m);
    }

    // --- scenery: pillars along the path, jungle trees rising from the abyss -------
    const sceneryEnd = len - half - 2;
    const nearZone = (s: number) => Math.abs(s - (len - half - CONFIG.decisionZone)) < 3;
    for (let s = Math.max(seg.floorStart, half) + 4 + rng.range(0, 6); s < sceneryEnd; s += rng.range(8, 14)) {
      if (nearZone(s)) continue;
      const side = rng.chance(0.5) ? -1 : 1;
      const broken = rng.chance(0.35);
      this.pillar(statics, flames, side * (half + 0.9), s, broken ? rng.range(1.2, 2.4) : rng.range(3.2, 5), !broken && rng.chance(0.2));
    }
    for (let s = seg.floorStart + rng.range(0, 6); s < len + half; s += rng.range(6, 11)) {
      for (const side of [-1, 1]) {
        if (rng.chance(0.25)) continue;
        if (s > len - half - 2 && s < len + half + 2) continue; // keep the branch openings clear
        this.tree(statics, rng, side * (half + rng.range(3.2, 11)), s);
      }
    }
    // a couple of big trees behind the dead-end wall
    for (const side of [-1, 1]) this.tree(statics, rng, side * rng.range(1, 4), len + half + rng.range(5, 9), 1.6);

    this.mergeStatics(statics, group, disposables);
    return { group, coins, flames, disposables };
  }

  private obstacle(o: Obstacle, put: (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => THREE.Mesh): void {
    const L = this.L;
    const half = CONFIG.pathWidth / 2;
    const mid = (o.s0 + o.s1) / 2;
    switch (o.kind) {
      case 'log': {
        put(L.log, L.bark, 0, 0.38, mid);
        put(boxUV(0.5, 0.25, 0.9, 1), L.moss, -0.8, 0.72, mid);
        break;
      }
      case 'beam': {
        const postH = 3.6 + FLOOR_T;
        for (const side of [-1, 1]) put(boxUV(0.6, postH, 0.6, 1.5), L.wall, side * (half + 0.35), postH / 2 - FLOOR_T, mid);
        put(boxUV(CONFIG.pathWidth + 1.3, 0.6, 0.62, 1.5), L.wall, 0, 1.45 + 0.3, mid);
        for (let x = -half + 0.3; x <= half - 0.3; x += 0.5) put(L.spike, L.metal, x, 1.45 - 0.17, mid);
        break;
      }
      case 'block': {
        const x = -(o.lat0 + o.lat1) / 2;
        const w = o.lat1 - o.lat0;
        put(boxUV(w, o.height, o.s1 - o.s0, 1.5), L.wall, x, o.height / 2, mid);
        put(boxUV(w + 0.1, 0.18, o.s1 - o.s0 + 0.1, 1), L.moss, x, o.height + 0.05, mid);
        break;
      }
      case 'gap':
        // the floor and curbs simply aren't built here; add some rubble on the rims
        put(boxUV(0.6, 0.3, 0.4, 1), L.wall, -1.6, -0.1, o.s0 - 0.1);
        put(boxUV(0.5, 0.25, 0.4, 1), L.wall, 1.9, -0.1, o.s1 + 0.15);
        break;
    }
  }

  private pillar(statics: THREE.Group, flames: THREE.Object3D[], x: number, z: number, h: number, torch: boolean): void {
    const L = this.L;
    const depth = 22; // columns rise out of the abyss
    const shaft = new THREE.Mesh(L.shaft, L.wall);
    shaft.scale.set(1, h + depth, 1);
    shaft.position.set(x, (h - depth) / 2, z);
    statics.add(shaft);
    const cap = new THREE.Mesh(L.cap, L.wall);
    cap.position.set(x, h + 0.17, z);
    statics.add(cap);
    if (torch) {
      // flames are animated, so they are not merged
      const f = new THREE.Group();
      f.position.set(x, h + 0.35, z);
      f.add(new THREE.Mesh(L.flameGeo, L.flame), new THREE.Mesh(L.flameCoreGeo, L.flameCore));
      flames.push(f);
      this.pendingFlames.push(f);
    }
  }

  private pendingFlames: THREE.Object3D[] = [];

  private tree(statics: THREE.Group, rng: Rng, x: number, z: number, scale = 1): void {
    const L = this.L;
    const top = rng.range(1.5, 7) * scale;
    const depth = 30;
    const trunk = new THREE.Mesh(L.trunk, L.bark);
    trunk.scale.set(scale, top + depth, scale);
    trunk.position.set(x, (top - depth) / 2, z);
    statics.add(trunk);
    const blobs = rng.int(2, 4);
    for (let i = 0; i < blobs; i++) {
      const c = new THREE.Mesh(L.canopy, rng.chance(0.5) ? L.leaves : L.leavesDark);
      const r = rng.range(1.6, 3.2) * scale;
      c.scale.set(r, r * rng.range(0.7, 1), r);
      c.rotation.set(rng.range(0, 3), rng.range(0, 3), 0);
      c.position.set(x + rng.range(-1.5, 1.5) * scale, top + rng.range(0, 1.8) * scale, z + rng.range(-1.5, 1.5) * scale);
      statics.add(c);
    }
  }

  /** Bake all static meshes into one merged geometry per material. */
  private mergeStatics(statics: THREE.Group, group: THREE.Group, disposables: THREE.BufferGeometry[]): void {
    for (const f of this.pendingFlames) group.add(f);
    this.pendingFlames = [];
    statics.updateMatrixWorld(true);
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    statics.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.applyMatrix4(m.matrix);
      const mat = m.material as THREE.Material;
      if (!byMat.has(mat)) byMat.set(mat, []);
      byMat.get(mat)!.push(g);
    });
    for (const [mat, geos] of byMat) {
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      disposables.push(merged);
    }
  }
}
