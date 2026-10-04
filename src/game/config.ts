/** Every tunable gameplay number in one place (metres, seconds, m/s). */
export const CONFIG = {
  /** walkable width of the stone path (and of the square junction area) */
  pathWidth: 6,
  /** lateral lane centres, right is positive */
  lanes: [-2, 0, 2] as readonly number[],
  laneSpeed: 13,
  playerRadius: 0.4,
  standHeight: 1.8,
  slideHeight: 0.85,

  startSpeed: 11,
  maxSpeed: 21,
  speedRamp: 0.1,

  gravity: 34,
  jumpVelocity: 11, // apex ~1.8 m, air time ~0.65 s
  fastFallVelocity: 20,
  slideTime: 0.7,
  inputBuffer: 0.15,
  coyoteTime: 0.08,

  /**
   * Length of the "decision zone" in front of a junction square. Inside it,
   * left/right means "turn here"; before it, left/right just changes lane.
   */
  decisionZone: 14,
  /** no obstacles in this stretch before the junction square */
  approachClear: 14,
  /** lane changes + lane-blocking obstacles (off in learn mode, where left/right = answer) */
  laneChanges: true,
  firstSegmentLength: 66,
  segmentLength: [85, 125] as readonly [number, number],
  /** keep obstacles away from the start of a branch... */
  clearAfterJunction: 20,
  /** ...and from the approach to the decision zone */
  clearBeforeZone: 6,
  /** drop the old segment + unchosen branch once this far into the new one */
  retireDistance: 28,
  fallDeathY: -4,
};

/**
 * Language-learning mode: slower, shorter straights (one question each), and
 * left/right is always an answer (the whole straight is the decision zone).
 */
export function applyLearnMode(): void {
  Object.assign(CONFIG, {
    startSpeed: 9,
    maxSpeed: 13,
    speedRamp: 0.03,
    decisionZone: 1000,
    laneChanges: false,
    firstSegmentLength: 70,
    segmentLength: [62, 80],
  });
}
