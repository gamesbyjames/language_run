import { describe, expect, it } from 'vitest';
import { JunctionDecider } from '../src/game/junction';

// incoming segment of length 100: square spans 97..103, zone starts at 97 - 14 = 83
const make = (exits: Array<'left' | 'right'> = ['left', 'right']) =>
  new JunctionDecider({ center: 100, halfWidth: 3, exits, zoneLength: 14 });
const R = 0.4;

describe('JunctionDecider', () => {
  it('derives the zone, turn point and wall from the geometry', () => {
    const d = make();
    expect(d.zoneStart).toBe(83);
    expect(d.squareStart).toBe(97);
    expect(d.turnPoint).toBe(100);
    expect(d.wall).toBe(103);
  });

  it('treats left/right before the zone as "too early" (lane change, not a turn)', () => {
    const d = make();
    expect(d.input('left', 82.9)).toBe('too-early');
    expect(d.pending).toBeNull();
    expect(d.inZone(82.9)).toBe(false);
    expect(d.inZone(83)).toBe(true);
  });

  it('buffers a decision inside the zone and turns exactly at the centre', () => {
    const d = make();
    expect(d.input('left', 90)).toBe('queued');
    expect(d.pending).toBe('left');
    expect(d.advance(90, 99.9, R)).toEqual({ kind: 'none' });
    expect(d.advance(99.9, 100.1, R)).toEqual({ kind: 'turn', dir: 'left', at: 100 });
    expect(d.resolved).toBe('left');
  });

  it('lets the player change their mind until the turn executes (latest input wins)', () => {
    const d = make();
    d.input('left', 85);
    d.input('right', 95);
    expect(d.advance(95, 101, R)).toEqual({ kind: 'turn', dir: 'right', at: 100 });
  });

  it('executes a late decision (past the centre) immediately', () => {
    const d = make();
    expect(d.input('right', 101.5)).toBe('immediate');
    expect(d.advance(101.5, 101.7, R)).toEqual({ kind: 'turn', dir: 'right', at: 101.5 });
  });

  it('crashes into the dead end when no decision is made', () => {
    const d = make();
    expect(d.advance(90, 102.5, R)).toEqual({ kind: 'none' });
    expect(d.advance(102.5, 102.7, R)).toEqual({ kind: 'crash', at: 103 - R });
  });

  it('turns rather than crashes when the decision and the wall fall in the same step', () => {
    const d = make();
    d.input('left', 99);
    expect(d.advance(99, 105, R)).toEqual({ kind: 'turn', dir: 'left', at: 100 });
  });

  it('ignores inputs once the junction is resolved', () => {
    const d = make();
    d.input('left', 99);
    d.advance(99, 100.5, R);
    expect(d.input('right', 100.5)).toBe('resolved');
    expect(d.advance(100.5, 110, R)).toEqual({ kind: 'none' });
  });

  it('rejects an exit that does not exist (L-shaped corner)', () => {
    const d = make(['right']);
    expect(d.input('left', 95)).toBe('invalid');
    expect(d.pending).toBeNull();
    expect(d.input('right', 95)).toBe('queued');
  });
});
