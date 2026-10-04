import { CONFIG } from './config';
import type { TurnDir } from './dirs';
import type { Player, PlayerAction } from './player';
import { Rng } from './rng';

/**
 * 'obstacles': dodges/jumps/slides but leaves junction decisions to the human (or test).
 * 'full':      also picks a random branch at every T junction (demo mode: ?autoplay).
 */
export type AutopilotMode = 'off' | 'obstacles' | 'full';

export class Autopilot {
  mode: AutopilotMode = 'off';
  /** optional: who decides at junctions in 'full' mode (e.g. "pick the correct answer") */
  chooser: ((p: Player) => TurnDir | null) | null = null;
  private rng: Rng;

  constructor(seed = 1) {
    this.rng = new Rng(seed);
  }

  think(p: Player): PlayerAction[] {
    if (this.mode === 'off' || !p.alive) return [];
    const out: PlayerAction[] = [];
    const d = p.decider;
    const r = CONFIG.playerRadius;
    const v = p.speed;

    if (this.mode === 'full' && d.inZone(p.s) && !d.pending && d.turnPoint - p.s < 12) {
      out.push(this.chooser?.(p) ?? (this.rng.chance(0.5) ? 'left' : 'right'));
    }

    // never use left/right for lane changes inside a decision zone (they'd be turns)
    if (!d.inZone(p.s)) {
      const look = v * 1.1 + 4;
      const blocked = (lane: number) =>
        p.segment.obstacles.some(
          (o) =>
            o.kind === 'block' &&
            o.s1 + r > p.s &&
            o.s0 - r - p.s < look &&
            CONFIG.lanes[lane] + r > o.lat0 &&
            CONFIG.lanes[lane] - r < o.lat1,
        );
      if (blocked(p.lane)) {
        for (const i of [p.lane - 1, p.lane + 1, p.lane - 2, p.lane + 2]) {
          if (i >= 0 && i < CONFIG.lanes.length && !blocked(i)) {
            out.push(i < p.lane ? 'left' : 'right');
            break;
          }
        }
      }
    }

    if (p.grounded) {
      for (const o of p.segment.obstacles) {
        if (o.s1 + r < p.s) continue; // already passed
        const dist = o.s0 - r - p.s;
        if ((o.kind === 'log' || o.kind === 'gap') && dist <= v * 0.2) {
          out.push('jump');
          break;
        }
        if (o.kind === 'beam' && dist <= v * 0.15 && !p.sliding) {
          out.push('slide');
          break;
        }
      }
    }
    return out;
  }
}
