import type { TurnDir } from './dirs';

/**
 * Pure decision logic for one junction, expressed in the incoming segment's
 * along-track coordinate `s`:
 *
 *        zoneStart          squareStart   centre   wall
 *   ---------|-------------------|----------|--------|##
 *     too early: L/R =      decision zone: L/R      dead end
 *     lane change           selects a turn
 *
 * Rules:
 *  - left/right before the zone is NOT a turn (the caller changes lane instead).
 *  - inside the zone the input is buffered; the latest input wins, so the player
 *    can change their mind until the turn executes.
 *  - a buffered turn executes exactly at the junction centre (sub-step accurate),
 *    an input that arrives after the centre executes immediately.
 *  - with no decision the runner hits the dead-end wall at `wall - radius`.
 */
export interface JunctionGeometry {
  /** s of the junction centre (= length of the incoming segment) */
  center: number;
  /** half the path width: the junction square spans centre ± halfWidth */
  halfWidth: number;
  /** exits that exist; a T junction has both */
  exits: readonly TurnDir[];
  /** length of the zone in front of the square where left/right means "turn" */
  zoneLength: number;
}

export type TurnInput = 'too-early' | 'queued' | 'immediate' | 'invalid' | 'resolved';

export type JunctionEvent =
  | { kind: 'none' }
  | { kind: 'turn'; dir: TurnDir; at: number }
  | { kind: 'crash'; at: number };

const NONE: JunctionEvent = { kind: 'none' };

export class JunctionDecider {
  pending: TurnDir | null = null;
  resolved: TurnDir | null = null;

  constructor(readonly geo: JunctionGeometry) {}

  get zoneStart(): number {
    return this.geo.center - this.geo.halfWidth - this.geo.zoneLength;
  }

  get squareStart(): number {
    return this.geo.center - this.geo.halfWidth;
  }

  get turnPoint(): number {
    return this.geo.center;
  }

  get wall(): number {
    return this.geo.center + this.geo.halfWidth;
  }

  inZone(s: number): boolean {
    return this.resolved === null && s >= this.zoneStart;
  }

  input(dir: TurnDir, s: number): TurnInput {
    if (this.resolved) return 'resolved';
    if (s < this.zoneStart) return 'too-early';
    if (!this.geo.exits.includes(dir)) return 'invalid';
    this.pending = dir;
    return s >= this.turnPoint ? 'immediate' : 'queued';
  }

  /** The runner moves from s0 to s1 (s1 >= s0). Returns the first event in that span. */
  advance(s0: number, s1: number, radius: number): JunctionEvent {
    if (this.resolved) return NONE;
    if (this.pending) {
      const at = Math.max(s0, this.turnPoint);
      if (at <= s1) {
        this.resolved = this.pending;
        return { kind: 'turn', dir: this.pending, at };
      }
    }
    const crashAt = this.wall - radius;
    if (s1 >= crashAt) return { kind: 'crash', at: crashAt };
    return NONE;
  }
}
