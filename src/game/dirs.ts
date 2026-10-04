import { Vector3 } from 'three';

/** Cardinal directions, clockwise seen from above: 0=N(-Z) 1=E(+X) 2=S(+Z) 3=W(-X). */
export type Dir = 0 | 1 | 2 | 3;
export type TurnDir = 'left' | 'right';

const DX = [0, 1, 0, -1] as const;
const DZ = [-1, 0, 1, 0] as const;
export const DIR_NAMES = ['N', 'E', 'S', 'W'] as const;

export function turnDir(d: Dir, t: TurnDir): Dir {
  return ((d + (t === 'right' ? 1 : 3)) % 4) as Dir;
}

export function dirVec(d: Dir, out = new Vector3()): Vector3 {
  return out.set(DX[d], 0, DZ[d]);
}

/** Unit vector pointing to the runner's right-hand side when facing d. */
export function rightVec(d: Dir, out = new Vector3()): Vector3 {
  return dirVec(turnDir(d, 'right'), out);
}

/** rotation.y that makes an object whose front is +Z face direction d. */
export function dirYaw(d: Dir): number {
  return Math.atan2(DX[d], DZ[d]);
}
