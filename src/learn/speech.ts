/** Thin wrapper around the browser's speech synthesis (free, works offline on most systems). */
export class Speech {
  enabled = true;
  private voice: SpeechSynthesisVoice | null = null;
  private readonly supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  constructor(private lang: string) {
    if (!this.supported) return;
    const pick = () => {
      const voices = speechSynthesis.getVoices();
      const base = lang.split('-')[0];
      this.voice =
        voices.find((v) => v.lang === lang && /natural|online|google/i.test(v.name)) ??
        voices.find((v) => v.lang === lang) ??
        voices.find((v) => v.lang.startsWith(base)) ??
        null;
    };
    pick();
    speechSynthesis.addEventListener('voiceschanged', pick);
  }

  get available(): boolean {
    return this.supported && this.voice !== null;
  }

  get voiceName(): string {
    return this.voice?.name ?? 'none';
  }

  say(text: string, rate = 0.85, onEnd?: () => void): void {
    if (!this.available || !this.enabled) {
      onEnd?.();
      return;
    }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[।]/g, ''));
    u.lang = this.lang;
    u.voice = this.voice;
    u.rate = rate;
    if (onEnd) {
      u.onend = () => onEnd();
      u.onerror = () => onEnd();
    }
    speechSynthesis.speak(u);
  }
}
