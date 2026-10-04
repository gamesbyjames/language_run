import type { Speech } from './speech';

interface Manifest {
  voice: string;
  files: Record<string, string>;
}

export const cleanText = (t: string) => t.replace(/।/g, '').trim();

/** Pre-generated audio clips (scripts/tts.mjs → public/audio/hi/manifest.json). */
export class Clips {
  voice = 'browser speech';
  private manifest: Manifest | null = null;
  private base = '';

  async load(base: string): Promise<void> {
    try {
      const res = await fetch(`${base}audio/hi/manifest.json`);
      if (!res.ok) return;
      this.manifest = (await res.json()) as Manifest;
      this.base = `${base}audio/hi/`;
      this.voice = this.manifest.voice;
      // warm the HTTP cache so clips start instantly
      for (const f of new Set(Object.values(this.manifest.files))) fetch(this.base + f).catch(() => null);
    } catch {
      /* no clips: browser speech only */
    }
  }

  get loaded(): boolean {
    return this.manifest !== null;
  }

  url(text: string): string | null {
    const f = this.manifest?.files[cleanText(text)];
    return f ? this.base + f : null;
  }
}

/** Plays one clip at a time (falls back to browser speech); resolves when finished or stopped. */
export class ClipPlayer {
  private audio = new Audio();
  private done: (() => void) | null = null;

  constructor(private clips: Clips, private fallback: Speech) {
    this.audio.preload = 'auto';
    this.audio.addEventListener('ended', () => this.finish());
    this.audio.addEventListener('error', () => this.finish());
  }

  get element(): HTMLAudioElement {
    return this.audio;
  }

  play(text: string, rate = 1): Promise<void> {
    this.stop();
    return new Promise((resolve) => {
      this.done = resolve;
      const url = this.clips.url(text);
      if (url) {
        this.audio.src = url;
        this.audio.playbackRate = rate;
        this.audio.currentTime = 0;
        this.audio.play().catch(() => this.finish());
      } else {
        this.fallback.say(text, 0.8 * rate, () => this.finish());
      }
    });
  }

  stop(): void {
    this.audio.pause();
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    this.finish();
  }

  private finish(): void {
    const d = this.done;
    this.done = null;
    d?.();
  }
}
