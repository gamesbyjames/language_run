import { Vector3 } from 'three';
import { CONFIG } from './config';
import { type Dir, type TurnDir, dirVec, rightVec, turnDir } from './dirs';
import { Rng } from './rng';

export type ObstacleKind = 'log' | 'beam' | 'block' | 'gap';

export interface Obstacle {
  id: number;
  kind: ObstacleKind;
  /** along-track extent (segment-local s) */
  s0: number;
  s1: number;
  /** lateral extent (right is positive) */
  lat0: number;
  lat1: number;
  /** log/block: top height, beam: clearance underneath, gap: unused */
  height: number;
}

export interface Coin {
  id: number;
  s: number;
  lat: number;
  y: number;
  taken: boolean;
}

/**
 * A straight corridor that always ends in a T junction.
 * s = 0 is the junction centre it starts from (or the start point for the first segment),
 * s = length is the centre of the T junction at its end.
 */
export interface Segment {
  id: number;
  start: Vector3;
  dir: Dir;
  length: number;
  /** where this segment's own floor starts (the junction square before it belongs to the parent) */
  floorStart: number;
  exits: TurnDir[];
  obstacles: Obstacle[];
  coins: Coin[];
  parent: Segment | null;
  via: TurnDir | null;
  children: Partial<Record<TurnDir, Segment>>;
  depth: number;
}

export interface TrackListener {
  segmentAdded?(seg: Segment): void;
  segmentRemoved?(seg: Segment): void;
}

type Pattern = 'coins' | 'log' | 'beam' | 'gap' | 'block' | 'block2';

/** feet can stand this far into a gap before falling */
const GAP_EDGE = 0.25;
const _a = new Vector3();
const _b = new Vector3();
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Procedural track as a tree: the current segment, both branches of the T
 * junction ahead, and (briefly) the segment just left behind. When the player
 * commits to a branch, the other branch is retired and the chosen branch's own
 * two branches are generated.
 */
export class Track {
  readonly segments: Segment[] = [];
  root!: Segment;
  private rng: Rng;
  private nextId = 1;
  private doomed: Segment[] = [];
  private doomAfter: { seg: Segment; s: number } | null = null;

  constructor(seed: number, public listener: TrackListener = {}) {
    this.rng = new Rng(seed);
  }

  reset(seed: number): Segment {
    for (const seg of [...this.segments]) this.remove(seg);
    this.rng = new Rng(seed);
    this.nextId = 1;
    this.doomed = [];
    this.doomAfter = null;
    this.root = this.addSegment(new Vector3(), 0, CONFIG.firstSegmentLength, null, null);
    this.ensureChildren(this.root);
    return this.root;
  }

  junctionCenter(seg: Segment, out = new Vector3()): Vector3 {
    return dirVec(seg.dir, out).multiplyScalar(seg.length).add(seg.start);
  }

  localToWorld(seg: Segment, s: number, lat: number, y = 0, out = new Vector3()): Vector3 {
    dirVec(seg.dir, out).multiplyScalar(s).add(seg.start);
    out.addScaledVector(rightVec(seg.dir, _a), lat);
    out.y = y;
    return out;
  }

  worldToLocal(seg: Segment, p: Vector3): { s: number; lat: number } {
    _b.subVectors(p, seg.start);
    const s = _b.dot(dirVec(seg.dir, _a));
    const lat = _b.dot(rightVec(seg.dir, _a));
    return { s, lat };
  }

  gapAt(seg: Segment, s: number): Obstacle | null {
    for (const o of seg.obstacles) {
      if (o.kind === 'gap' && s > o.s0 + GAP_EDGE && s < o.s1 - GAP_EDGE) return o;
    }
    return null;
  }

  hasFloor(seg: Segment, s: number): boolean {
    return this.gapAt(seg, s) === null;
  }

  ensureChildren(seg: Segment): void {
    const center = this.junctionCenter(seg);
    const [lo, hi] = CONFIG.segmentLength;
    for (const exit of seg.exits) {
      if (seg.children[exit]) continue;
      const len = Math.round(this.rng.range(lo, hi));
      seg.children[exit] = this.addSegment(center.clone(), turnDir(seg.dir, exit), len, seg, exit);
    }
  }

  /** The runner turned from `from` into its child `to`. */
  commitTurn(from: Segment, to: Segment): void {
    this.flushDoomed();
    const doomed: Segment[] = [from];
    for (const exit of from.exits) {
      const child = from.children[exit];
      if (child && child !== to) this.collectSubtree(child, doomed);
    }
    this.doomed = doomed;
    this.doomAfter = { seg: to, s: CONFIG.retireDistance };
    this.ensureChildren(to);
  }

  /** Retire old geometry once it is safely behind the camera. */
  update(current: Segment, s: number): void {
    if (this.doomAfter && (this.doomAfter.seg !== current || s >= this.doomAfter.s)) this.flushDoomed();
  }

  remove(seg: Segment): void {
    const i = this.segments.indexOf(seg);
    if (i < 0) return;
    this.segments.splice(i, 1);
    if (seg.parent && seg.via && seg.parent.children[seg.via] === seg) delete seg.parent.children[seg.via];
    for (const exit of seg.exits) {
      const child = seg.children[exit];
      if (child && child.parent === seg) child.parent = null;
    }
    this.listener.segmentRemoved?.(seg);
  }

  private flushDoomed(): void {
    const doomed = this.doomed;
    this.doomed = [];
    this.doomAfter = null;
    for (const seg of doomed) this.remove(seg);
  }

  private collectSubtree(seg: Segment, out: Segment[]): void {
    out.push(seg);
    for (const exit of seg.exits) {
      const child = seg.children[exit];
      if (child) this.collectSubtree(child, out);
    }
  }

  private addSegment(start: Vector3, dir: Dir, length: number, parent: Segment | null, via: TurnDir | null): Segment {
    const seg: Segment = {
      id: this.nextId++,
      start,
      dir,
      length,
      floorStart: parent ? CONFIG.pathWidth / 2 : -24,
      exits: ['left', 'right'],
      obstacles: [],
      coins: [],
      parent,
      via,
      children: {},
      depth: parent ? parent.depth + 1 : 0,
    };
    this.populate(seg);
    this.segments.push(seg);
    this.listener.segmentAdded?.(seg);
    return seg;
  }

  private populate(seg: Segment): void {
    const rng = this.rng;
    const half = CONFIG.pathWidth / 2;
    const end = seg.length - half - CONFIG.approachClear - CONFIG.clearBeforeZone;

    if (seg.depth === 0) {
      // The opening straight is a calm run up to the first T junction: coins only.
      for (let s = 12; s + 14 < end; s += 20) this.coinLine(seg, s, 6, this.lane());
      return;
    }

    const difficulty = Math.min(1, (seg.depth - 1) / 4);
    const patterns: Pattern[] = ['coins', 'log', 'beam'];
    if (CONFIG.laneChanges) patterns.push('block');
    if (seg.depth >= 2) patterns.push('gap', 'log');
    if (seg.depth >= 3 && CONFIG.laneChanges) patterns.push('block2', 'gap');

    let s = half + CONFIG.clearAfterJunction;
    for (;;) {
      const used = this.placePattern(seg, rng.pick(patterns), s, end);
      if (used < 0) break;
      s += used + rng.range(lerp(24, 13, difficulty), lerp(34, 19, difficulty));
    }
  }

  private placePattern(seg: Segment, p: Pattern, s: number, end: number): number {
    const rng = this.rng;
    const half = CONFIG.pathWidth / 2;
    const lanes = CONFIG.lanes;
    switch (p) {
      case 'coins': {
        const n = rng.int(5, 8);
        if (s + n * 2.4 > end) return -1;
        this.coinLine(seg, s, n, this.lane());
        return n * 2.4;
      }
      case 'log': {
        if (s + 0.7 > end) return -1;
        this.addObstacle(seg, 'log', s, s + 0.7, -half, half, 0.75);
        this.coinArc(seg, s + 0.35, this.lane());
        return 0.7;
      }
      case 'beam': {
        if (s + 0.6 > end) return -1;
        this.addObstacle(seg, 'beam', s, s + 0.6, -half, half, 1.15);
        this.coinLine(seg, s - 4.5, 5, this.lane(), 0.55, 2.25);
        return 0.6;
      }
      case 'gap': {
        const len = 3.2;
        if (s + len > end) return -1;
        this.addObstacle(seg, 'gap', s, s + len, -half, half, 0);
        this.coinArc(seg, s + len / 2, this.lane());
        return len;
      }
      case 'block':
      case 'block2': {
        if (s + 1.2 > end) return -1;
        const all = lanes.map((_, i) => i);
        const free = rng.int(0, lanes.length - 1);
        const others = all.filter((i) => i !== free);
        const blocked = p === 'block' ? [rng.pick(others)] : others;
        for (const i of blocked) this.addObstacle(seg, 'block', s, s + 1.2, lanes[i] - 0.9, lanes[i] + 0.9, 2.2);
        this.coinLine(seg, s - 6, 6, lanes[free], 1, 2.2);
        return 1.2;
      }
    }
  }

  /** coin lane: random when lane changes exist, otherwise the centre lane */
  private lane(): number {
    return CONFIG.laneChanges ? this.rng.pick(CONFIG.lanes) : 0;
  }

  private addObstacle(seg: Segment, kind: Obstacle['kind'], s0: number, s1: number, lat0: number, lat1: number, height: number): void {
    seg.obstacles.push({ id: this.nextId++, kind, s0, s1, lat0, lat1, height });
  }

  private coinLine(seg: Segment, s: number, n: number, lat: number, y = 1, spacing = 2.4): void {
    for (let i = 0; i < n; i++) seg.coins.push({ id: this.nextId++, s: s + i * spacing, lat, y, taken: false });
  }

  private coinArc(seg: Segment, sc: number, lat: number): void {
    for (let i = -2; i <= 2; i++) {
      const ds = i * 2;
      seg.coins.push({ id: this.nextId++, s: sc + ds, lat, y: 1 + 1.35 * (1 - (ds / 4.6) ** 2), taken: false });
    }
  }
}
