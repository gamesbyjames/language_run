import { Autopilot } from './autopilot';
import { Player, type PlayerAction, type PlayerEvents } from './player';
import { Track, type TrackListener } from './track';

export type Phase = 'ready' | 'running' | 'dead';
export type SimHooks = TrackListener & PlayerEvents;

/** Rendering-free game simulation: deterministic, fixed time step, unit-testable. */
export class GameSim {
  static readonly STEP = 1 / 120;
  readonly track: Track;
  readonly player: Player;
  readonly autopilot = new Autopilot();
  phase: Phase = 'ready';
  seed: number;
  private acc = 0;

  constructor(seed: number, hooks: SimHooks = {}) {
    this.seed = seed;
    this.track = new Track(seed, hooks);
    this.player = new Player(this.track, hooks);
    this.reset(seed);
  }

  reset(seed = this.seed): void {
    this.seed = seed;
    const root = this.track.reset(seed);
    this.player.reset(root, 0);
    this.phase = 'ready';
    this.acc = 0;
  }

  start(): void {
    if (this.phase === 'ready') this.phase = 'running';
  }

  act(action: PlayerAction): void {
    if (this.phase === 'running') this.player.handle(action);
  }

  /** Advance by a frame's worth of time (clamped), in fixed sub-steps. */
  update(dt: number): void {
    if (this.phase === 'ready') return;
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= GameSim.STEP) {
      this.acc -= GameSim.STEP;
      this.tick();
    }
  }

  /** Exactly one fixed tick. */
  tick(): void {
    if (this.phase === 'ready') return;
    if (this.phase === 'running') for (const a of this.autopilot.think(this.player)) this.player.handle(a);
    this.player.update(GameSim.STEP);
    if (this.phase === 'running' && !this.player.alive) this.phase = 'dead';
  }
}
