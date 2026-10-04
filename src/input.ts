export type InputAction = 'left' | 'right' | 'jump' | 'slide' | 'start' | 'pause' | 'debug' | 'mute' | 'study';

const KEYS: Record<string, InputAction> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'jump',
  KeyW: 'jump',
  Space: 'jump',
  ArrowDown: 'slide',
  KeyS: 'slide',
  Enter: 'start',
  KeyP: 'pause',
  Escape: 'pause',
  KeyH: 'debug',
  KeyM: 'mute',
  KeyL: 'study',
};

/** Keyboard + swipe (touch or mouse drag) to a queue of discrete actions. */
export class Input {
  private queue: InputAction[] = [];
  private touch: { x: number; y: number; t: number; used: boolean; id: number } | null = null;

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      const a = KEYS[e.code];
      if (!a) return;
      e.preventDefault();
      if (e.repeat) return;
      this.queue.push(a);
      if (e.code === 'Space') this.queue.push('start'); // space also starts / restarts
    });

    target.addEventListener('pointerdown', (e) => {
      this.touch = { x: e.clientX, y: e.clientY, t: performance.now(), used: false, id: e.pointerId };
    });
    target.addEventListener('pointermove', (e) => {
      const t = this.touch;
      if (!t || t.used || e.pointerId !== t.id) return;
      const dx = e.clientX - t.x;
      const dy = e.clientY - t.y;
      const min = Math.max(24, Math.min(window.innerWidth, window.innerHeight) * 0.05);
      if (Math.hypot(dx, dy) < min) return;
      t.used = true; // one action per swipe, fired as soon as the swipe is recognised
      if (Math.abs(dx) > Math.abs(dy)) this.queue.push(dx < 0 ? 'left' : 'right');
      else this.queue.push(dy < 0 ? 'jump' : 'slide');
    });
    const end = (e: PointerEvent) => {
      const t = this.touch;
      if (t && !t.used && e.pointerId === t.id && performance.now() - t.t < 350) this.queue.push('start');
      this.touch = null;
    };
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', () => (this.touch = null));
  }

  push(a: InputAction): void {
    this.queue.push(a);
  }

  drain(): InputAction[] {
    const q = this.queue;
    this.queue = [];
    return q;
  }
}
