import * as THREE from 'three';

export type CameraMode = 'ready' | 'follow' | 'crash' | 'fall';

const shortest = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const damp = (k: number, dt: number) => 1 - Math.exp(-k * dt);

/**
 * Temple-Run style chase camera. Its yaw lags behind the runner's heading,
 * which produces the characteristic swing around a corner after a turn.
 */
export class CameraRig {
  private yaw = 0;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private lookAhead = 0;
  private height = 0;
  private shake = 0;
  private frozen = new THREE.Vector3();
  private tmp = new THREE.Vector3();

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  snap(anchor: THREE.Vector3, yaw: number, mode: CameraMode): void {
    this.yaw = mode === 'ready' ? yaw + Math.PI : yaw;
    this.lookAhead = mode === 'ready' ? 0 : 5;
    this.height = anchor.y;
    this.desired(anchor, this.pos);
    this.look.copy(anchor).add(this.tmp.set(0, 1.2, 0));
    this.apply();
  }

  bump(amount: number): void {
    this.shake = Math.max(this.shake, amount);
  }

  update(dt: number, anchor: THREE.Vector3, playerPos: THREE.Vector3, yawTarget: number, speed: number, mode: CameraMode): void {
    const targetYaw = mode === 'ready' ? yawTarget + Math.PI * 0.85 : yawTarget;
    this.yaw += shortest(targetYaw - this.yaw) * damp(mode === 'ready' ? 2.5 : 7, dt);
    this.lookAhead += ((mode === 'follow' ? 5 : 0) - this.lookAhead) * damp(4, dt);
    // follow jumps only partially so the view stays calm
    this.height += (anchor.y * 0.45 - this.height) * damp(6, dt);

    if (mode === 'fall') {
      // stop following and watch the runner drop into the abyss
      if (this.frozen.lengthSq() === 0) this.frozen.copy(this.pos);
      this.pos.lerp(this.frozen, damp(10, dt));
      this.look.lerp(playerPos, damp(6, dt));
    } else {
      this.frozen.set(0, 0, 0);
      this.desired(anchor, this.tmp);
      this.pos.lerp(this.tmp, damp(mode === 'ready' ? 3 : 11, dt));
      const fwd = this.tmp.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(this.lookAhead);
      const lookTarget = fwd.add(anchor).setY(this.height + 1.3);
      this.look.lerp(lookTarget, damp(14, dt));
    }

    const fov = 62 + Math.max(0, speed - 11) * 0.6;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov += (fov - this.camera.fov) * damp(2, dt);
      this.camera.updateProjectionMatrix();
    }
    this.shake = Math.max(0, this.shake - dt * 1.5);
    this.apply();
  }

  private desired(anchor: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    const back = 6.4;
    return out.set(anchor.x - Math.sin(this.yaw) * back, this.height + 3.4, anchor.z - Math.cos(this.yaw) * back);
  }

  private apply(): void {
    this.camera.position.copy(this.pos);
    if (this.shake > 0) {
      const s = this.shake * 0.35;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(this.look);
  }
}
