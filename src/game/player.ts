import { Vector3 } from 'three';
import { CONFIG } from './config';
import type { TurnDir } from './dirs';
import { JunctionDecider, type TurnInput } from './junction';
import type { Coin, Obstacle, Segment, Track } from './track';

export type DeathCause = 'wall' | 'log' | 'beam' | 'block' | 'gap' | 'hearts';
export type PlayerAction = 'left' | 'right' | 'jump' | 'slide';

export interface PlayerEvents {
  turnQueued?(dir: TurnDir, how: TurnInput): void;
  turned?(dir: TurnDir, from: Segment, to: Segment): void;
  laneChanged?(lane: number): void;
  jumped?(): void;
  slid?(): void;
  landed?(): void;
  coin?(coin: Coin, seg: Segment): void;
  died?(cause: DeathCause): void;
}

const _p = new Vector3();
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function nearestLane(lat: number): number {
  let best = 0;
  CONFIG.lanes.forEach((l, i) => {
    if (Math.abs(l - lat) < Math.abs(CONFIG.lanes[best] - lat)) best = i;
  });
  return best;
}

/**
 * Runner kinematics in segment-local coordinates:
 *   s   = distance along the current segment
 *   lat = lateral offset (right positive)
 *   y   = feet height above the path
 */
export class Player {
  segment!: Segment;
  decider!: JunctionDecider;
  s = 0;
  lat = 0;
  latVel = 0;
  y = 0;
  vy = 0;
  lane = 1;
  speed = CONFIG.startSpeed;
  grounded = true;
  slideT = 0;
  alive = true;
  deathCause: DeathCause | null = null;
  deadTime = 0;
  distance = 0;
  coins = 0;
  turns: TurnDir[] = [];
  private jumpBuf = 0;
  private slideBuf = 0;
  private coyote = 0;

  constructor(private track: Track, public events: PlayerEvents = {}) {}

  reset(seg: Segment, s = 0): void {
    this.segment = seg;
    this.decider = this.deciderFor(seg);
    this.s = s;
    this.lat = 0;
    this.latVel = 0;
    this.y = 0;
    this.vy = 0;
    this.lane = nearestLane(0);
    this.speed = CONFIG.startSpeed;
    this.grounded = true;
    this.slideT = 0;
    this.alive = true;
    this.deathCause = null;
    this.deadTime = 0;
    this.distance = 0;
    this.coins = 0;
    this.turns = [];
    this.jumpBuf = this.slideBuf = this.coyote = 0;
  }

  get sliding(): boolean {
    return this.slideT > 0;
  }

  get height(): number {
    return this.sliding ? CONFIG.slideHeight : CONFIG.standHeight;
  }

  worldPosition(out = new Vector3()): Vector3 {
    return this.track.localToWorld(this.segment, this.s, this.lat, this.y, out);
  }

  handle(action: PlayerAction): void {
    if (!this.alive) return;
    switch (action) {
      case 'left':
      case 'right': {
        const res = this.decider.input(action, this.s);
        if (res === 'too-early') this.changeLane(action === 'left' ? -1 : 1);
        else if (res === 'queued' || res === 'immediate') this.events.turnQueued?.(action, res);
        break;
      }
      case 'jump':
        if (this.grounded || (this.coyote > 0 && this.y > -0.3)) this.doJump();
        else this.jumpBuf = CONFIG.inputBuffer;
        break;
      case 'slide':
        if (this.grounded) this.startSlide();
        else {
          // in the air: slam down and slide on landing
          this.vy = Math.min(this.vy, -CONFIG.fastFallVelocity);
          this.slideBuf = CONFIG.inputBuffer * 2;
        }
        break;
    }
  }

  update(dt: number): void {
    if (!this.alive) {
      this.updateDead(dt);
      return;
    }
    this.speed = Math.min(CONFIG.maxSpeed, this.speed + CONFIG.speedRamp * dt);
    this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    this.slideBuf = Math.max(0, this.slideBuf - dt);
    if (this.slideT > 0) this.slideT = Math.max(0, this.slideT - dt);

    // lateral: glide to the target lane
    const dl = CONFIG.lanes[this.lane] - this.lat;
    const maxStep = CONFIG.laneSpeed * dt;
    const step = Math.abs(dl) <= maxStep ? dl : Math.sign(dl) * maxStep;
    this.lat += step;
    this.latVel = step / dt;

    this.moveForward(this.speed * dt);
    if (!this.alive) return;
    this.updateVertical(dt);
    if (!this.alive) return;
    this.checkObstacles();
    if (!this.alive) return;
    this.collectCoins();
    this.track.update(this.segment, this.s);
  }

  private deciderFor(seg: Segment): JunctionDecider {
    return new JunctionDecider({
      center: seg.length,
      halfWidth: CONFIG.pathWidth / 2,
      exits: seg.exits,
      zoneLength: CONFIG.decisionZone,
    });
  }

  private changeLane(delta: number): void {
    const lane = clamp(this.lane + delta, 0, CONFIG.lanes.length - 1);
    if (lane === this.lane) return;
    this.lane = lane;
    this.events.laneChanged?.(lane);
  }

  private doJump(): void {
    this.vy = CONFIG.jumpVelocity;
    this.grounded = false;
    this.slideT = 0;
    this.jumpBuf = 0;
    this.coyote = 0;
    this.events.jumped?.();
  }

  private startSlide(): void {
    this.slideT = CONFIG.slideTime;
    this.slideBuf = 0;
    this.events.slid?.();
  }

  /** Advance along the path, splitting the step exactly at a turn point. */
  private moveForward(dist: number): void {
    // once we've dropped below the rim of a gap we can't run through its far wall
    if (this.y < -0.05) {
      const gap = this.track.gapAt(this.segment, this.s);
      if (gap) dist = Math.max(0, Math.min(dist, gap.s1 - CONFIG.playerRadius - this.s));
    }
    let remaining = dist;
    for (let guard = 0; remaining > 1e-9 && guard < 4; guard++) {
      const s0 = this.s;
      const s1 = s0 + remaining;
      const ev = this.decider.advance(s0, s1, CONFIG.playerRadius);
      if (ev.kind === 'turn') {
        this.distance += ev.at - s0;
        this.s = ev.at;
        remaining = s1 - ev.at;
        this.executeTurn(ev.dir);
        continue;
      }
      if (ev.kind === 'crash') {
        this.distance += Math.max(0, ev.at - s0);
        this.s = ev.at;
        this.die('wall');
        return;
      }
      this.s = s1;
      this.distance += remaining;
      remaining = 0;
    }
  }

  /** Re-express the runner's world position in the chosen branch's frame. */
  private executeTurn(dir: TurnDir): void {
    const from = this.segment;
    const to = from.children[dir];
    if (!to) {
      this.die('wall');
      return;
    }
    const p = this.track.localToWorld(from, this.s, this.lat, 0, _p);
    const local = this.track.worldToLocal(to, p);
    const maxLat = CONFIG.pathWidth / 2 - CONFIG.playerRadius;
    this.segment = to;
    this.s = local.s;
    this.lat = clamp(local.lat, -maxLat, maxLat);
    this.lane = nearestLane(this.lat);
    this.decider = this.deciderFor(to);
    this.turns.push(dir);
    this.track.commitTurn(from, to);
    this.events.turned?.(dir, from, to);
  }

  private updateVertical(dt: number): void {
    const floor = this.track.hasFloor(this.segment, this.s);
    if (this.grounded && !floor) {
      // ran off an edge: brief coyote time to still jump
      this.grounded = false;
      this.coyote = CONFIG.coyoteTime;
      this.vy = 0;
    }
    if (this.grounded) {
      if (this.jumpBuf > 0) this.doJump();
      else if (this.slideBuf > 0) this.startSlide();
      return;
    }
    this.coyote = Math.max(0, this.coyote - dt);
    const prevY = this.y;
    this.vy -= CONFIG.gravity * dt;
    this.y += this.vy * dt;
    if (this.y <= 0 && floor && prevY >= -0.05) {
      this.y = 0;
      this.vy = 0;
      this.grounded = true;
      this.events.landed?.();
      if (this.jumpBuf > 0) this.doJump();
      else if (this.slideBuf > 0) this.startSlide();
    } else if (this.y < CONFIG.fallDeathY) {
      this.die('gap');
    }
  }

  private checkObstacles(): void {
    const r = CONFIG.playerRadius;
    const h = this.height;
    for (const o of this.segment.obstacles) {
      if (o.kind === 'gap') continue;
      if (this.s + r < o.s0 || this.s - r > o.s1) continue;
      let hit = false;
      if (o.kind === 'log') hit = this.y < o.height;
      else if (o.kind === 'beam') hit = this.y + h > o.height;
      else if (o.kind === 'block') hit = this.lat + r > o.lat0 && this.lat - r < o.lat1 && this.y < o.height;
      if (hit) {
        this.hit(o);
        return;
      }
    }
  }

  private hit(o: Obstacle): void {
    if (this.s < o.s0) this.s = o.s0 - CONFIG.playerRadius;
    this.die(o.kind);
  }

  private collectCoins(): void {
    const cy = this.y + this.height * 0.5;
    for (const c of this.segment.coins) {
      if (c.taken) continue;
      if (Math.abs(c.s - this.s) < 0.9 && Math.abs(c.lat - this.lat) < 0.95 && Math.abs(c.y - cy) < 1.15) {
        c.taken = true;
        this.coins++;
        this.events.coin?.(c, this.segment);
      }
    }
  }

  /** End the run from outside (e.g. out of hearts in learn mode). */
  kill(cause: DeathCause): void {
    this.die(cause);
  }

  private die(cause: DeathCause): void {
    if (!this.alive) return;
    this.alive = false;
    this.deathCause = cause;
    this.slideT = 0;
    this.latVel = 0;
    this.events.died?.(cause);
  }

  private updateDead(dt: number): void {
    this.deadTime += dt;
    if (this.deathCause === 'gap') {
      this.vy -= CONFIG.gravity * dt;
      this.y = Math.max(-80, this.y + this.vy * dt);
    } else if (this.y > 0) {
      this.vy -= CONFIG.gravity * dt;
      this.y = Math.max(0, this.y + this.vy * dt);
    }
  }
}
