import { ClipPlayer, type Clips } from './clips';
import type { Speech } from './speech';

/**
 * Speaks the current sentence over and over while the game runs, with a short
 * pause between repeats.
 */
export class Narrator {
  enabled = true;
  /** pause between repeats, seconds */
  gap = 1.6;
  plays = 0;
  private player: ClipPlayer;
  private text: string | null = null;
  private active = false;
  private state: 'idle' | 'playing' | 'waiting' = 'idle';
  private wait = 0;
  private unlocked = false;
  private run = 0;

  constructor(private clips: Clips, fallback: Speech) {
    this.player = new ClipPlayer(clips, fallback);
  }

  get hasClips(): boolean {
    return this.clips.loaded;
  }

  get voice(): string {
    return this.clips.voice;
  }

  get speaking(): boolean {
    return this.state === 'playing';
  }

  /** Call from a real user gesture (key/tap) so mobile browsers allow playback later. */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    const a = this.player.element;
    a.src = SILENCE;
    a.play().catch(() => null);
  }

  /** Text to repeat (null = nothing). A change takes effect at the next repeat. */
  setText(text: string | null): void {
    this.text = text;
  }

  /** Running (true) or paused / title / game over (false). */
  setActive(on: boolean): void {
    if (on === this.active) return;
    this.active = on;
    if (!on) this.stop();
    else this.waitFor(0.4);
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    if (!this.enabled) this.stop();
    else if (this.active) this.waitFor(0.2);
    return this.enabled;
  }

  update(dt: number): void {
    if (!this.active || !this.enabled || !this.text) return;
    if (this.state === 'waiting') {
      this.wait -= dt;
      if (this.wait <= 0) this.play(this.text);
    } else if (this.state === 'idle') {
      this.play(this.text);
    }
  }

  private play(text: string): void {
    this.state = 'playing';
    this.plays++;
    const run = ++this.run;
    void this.player.play(text).then(() => {
      if (run === this.run && this.state === 'playing') this.waitFor(this.gap);
    });
  }

  private waitFor(s: number): void {
    this.state = 'waiting';
    this.wait = s;
  }

  private stop(): void {
    this.run++;
    this.player.stop();
    this.state = 'idle';
  }
}

/** 0.1 s of silent 8 kHz mono WAV, used to unlock audio on the first gesture. */
const SILENCE = (() => {
  const n = 800;
  const b = new DataView(new ArrayBuffer(44 + n));
  const s = (o: number, t: string) => [...t].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
  s(0, 'RIFF');
  b.setUint32(4, 36 + n, true);
  s(8, 'WAVEfmt ');
  b.setUint32(16, 16, true);
  b.setUint16(20, 1, true);
  b.setUint16(22, 1, true);
  b.setUint32(24, 8000, true);
  b.setUint32(28, 8000, true);
  b.setUint16(32, 1, true);
  b.setUint16(34, 8, true);
  s(36, 'data');
  b.setUint32(40, n, true);
  for (let i = 0; i < n; i++) b.setUint8(44 + i, 128);
  let bin = '';
  new Uint8Array(b.buffer).forEach((x) => (bin += String.fromCharCode(x)));
  return `data:audio/wav;base64,${btoa(bin)}`;
})();
