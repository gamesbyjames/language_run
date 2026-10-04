import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/game/config';
import { turnDir } from '../src/game/dirs';
import { GameSim } from '../src/game/sim';

const HALF = CONFIG.pathWidth / 2;

function started(seed = 7): GameSim {
  const sim = new GameSim(seed);
  sim.start();
  return sim;
}

/** tick until the predicate holds (or fail after a simulated time limit) */
function runUntil(sim: GameSim, pred: () => boolean, seconds = 60): void {
  for (let i = 0; i < seconds * 120; i++) {
    if (pred()) return;
    sim.tick();
  }
  throw new Error('condition not reached');
}

describe('run to the first T junction', () => {
  it('the opening straight has no obstacles, so the runner always reaches the junction', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const sim = new GameSim(seed);
      expect(sim.track.root.obstacles).toHaveLength(0);
      expect(sim.track.root.children.left).toBeDefined();
      expect(sim.track.root.children.right).toBeDefined();
    }
  });

  it('no decision: the runner crashes into the dead-end wall of the T', () => {
    const sim = started();
    runUntil(sim, () => !sim.player.alive);
    expect(sim.phase).toBe('dead');
    expect(sim.player.deathCause).toBe('wall');
    expect(sim.player.segment).toBe(sim.track.root);
    expect(sim.player.s).toBeCloseTo(sim.track.root.length + HALF - CONFIG.playerRadius, 6);
  });

  for (const dir of ['left', 'right'] as const) {
    it(`turning ${dir}: continues on the ${dir} branch, heading and position consistent`, () => {
      const sim = started();
      const root = sim.track.root;
      const branch = root.children[dir]!;
      const other = root.children[dir === 'left' ? 'right' : 'left']!;
      runUntil(sim, () => sim.player.decider.inZone(sim.player.s));
      sim.act(dir);
      expect(sim.player.decider.pending).toBe(dir);

      // track the world position across the turn: it must be continuous
      let before = new Vector3();
      runUntil(sim, () => {
        if (sim.player.segment === root) before = sim.player.worldPosition();
        return sim.player.segment !== root || !sim.player.alive;
      });
      const after = sim.player.worldPosition();
      expect(sim.player.alive).toBe(true);
      expect(sim.player.segment).toBe(branch);
      expect(sim.player.segment.dir).toBe(turnDir(root.dir, dir));
      expect(sim.player.turns).toEqual([dir]);
      expect(after.distanceTo(before)).toBeLessThan(sim.player.speed / 120 + 1e-6);
      // turned exactly at the junction centre -> centre lane of the branch
      expect(sim.player.lat).toBeCloseTo(0, 6);
      expect(sim.player.lane).toBe(1);

      // the chosen branch's own branches are generated; the old segment and the
      // unchosen branch are retired once they are safely behind the camera
      expect(branch.children.left).toBeDefined();
      expect(branch.children.right).toBeDefined();
      expect(sim.track.segments).toContain(other);
      sim.autopilot.mode = 'obstacles';
      runUntil(sim, () => sim.player.s >= CONFIG.retireDistance);
      expect(sim.track.segments).not.toContain(other);
      expect(sim.track.segments).not.toContain(root);
      expect(sim.track.segments.map((s) => s.id).sort()).toEqual(
        [branch.id, branch.children.left!.id, branch.children.right!.id].sort(),
      );
    });
  }

  it('pressing too early is a lane change, not a turn (and you still need to decide)', () => {
    const sim = started();
    runUntil(sim, () => sim.player.s > 10);
    sim.act('left');
    expect(sim.player.decider.pending).toBeNull();
    expect(sim.player.lane).toBe(0);
    runUntil(sim, () => !sim.player.alive);
    expect(sim.player.deathCause).toBe('wall');
    expect(sim.player.turns).toEqual([]);
  });

  it('the latest input inside the zone wins', () => {
    const sim = started();
    runUntil(sim, () => sim.player.decider.inZone(sim.player.s));
    sim.act('left');
    runUntil(sim, () => sim.player.s > sim.player.decider.squareStart);
    sim.act('right');
    runUntil(sim, () => sim.player.turns.length > 0);
    expect(sim.player.turns).toEqual(['right']);
    expect(sim.player.segment).toBe(sim.track.root.children.right);
  });

  it('a late input (past the centre, before the wall) still turns, onto the outer side', () => {
    const sim = started();
    const root = sim.track.root;
    runUntil(sim, () => sim.player.s > root.length + 1);
    sim.act('left');
    sim.tick();
    expect(sim.player.alive).toBe(true);
    expect(sim.player.segment).toBe(root.children.left);
    expect(sim.player.lat).toBeGreaterThan(0.9); // overshot the centre -> wall side of the branch
    runUntil(sim, () => Math.abs(sim.player.lat - CONFIG.lanes[sim.player.lane]) < 1e-6, 2);
  });

  it('is deterministic for a seed and a sequence of choices', () => {
    const play = () => {
      const sim = started(1234);
      sim.autopilot.mode = 'obstacles';
      for (const dir of ['left', 'right', 'left'] as const) {
        runUntil(sim, () => sim.player.decider.inZone(sim.player.s));
        sim.act(dir);
        runUntil(sim, () => sim.player.decider.pending === null);
      }
      return sim.track.segments.map((s) => `${s.id}:${s.dir}:${s.length}:${s.obstacles.length}`);
    };
    expect(play()).toEqual(play());
  });
});

describe('generated tracks are fair', () => {
  it('no obstacles in the decision zone, the junction square or right after a turn', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const sim = new GameSim(seed);
      for (const seg of sim.track.segments) {
        for (const o of seg.obstacles) {
          expect(o.s0).toBeGreaterThanOrEqual(HALF + CONFIG.clearAfterJunction - 1e-9);
          expect(o.s1).toBeLessThanOrEqual(seg.length - HALF - CONFIG.decisionZone);
        }
        // never all three lanes blocked at once
        const blocks = seg.obstacles.filter((o) => o.kind === 'block');
        for (const b of blocks) expect(blocks.filter((o) => o.s0 === b.s0).length).toBeLessThan(CONFIG.lanes.length);
      }
    }
  });

  it('the autopilot survives 2.5 km on many seeds (every pattern is passable)', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const sim = started(seed);
      sim.autopilot.mode = 'full';
      runUntil(sim, () => !sim.player.alive || sim.player.distance > 2500, 600);
      expect({ seed, alive: sim.player.alive, cause: sim.player.deathCause }).toEqual({ seed, alive: true, cause: null });
      expect(sim.player.turns.length).toBeGreaterThan(10);
      expect(sim.track.segments.length).toBeLessThanOrEqual(5);
    }
  });
});
