import { ClipPlayer } from '../learn/clips';
import type { Lesson } from '../learn/lessons';

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

/**
 * Pre-game study screen: every sentence with audio, tappable words, meanings and
 * the traps you will meet at the junctions. "Test yourself" hides the Hindi so
 * you can try to recall it before revealing.
 */
export class StudyPage {
  readonly root: HTMLDivElement;
  onStart: () => void = () => {};
  playing: string | null = null;
  plays = 0;
  private slow = false;
  private seq = 0;

  constructor(parent: HTMLElement, private lesson: Lesson, private player: ClipPlayer, voice: () => string) {
    this.root = document.createElement('div');
    this.root.className = 'study';
    parent.appendChild(this.root);
    this.render(voice);

    this.root.addEventListener('pointerdown', (e) => e.preventDefault()); // keep focus off buttons (Space = start)
    this.root.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!el) return;
      const act = el.dataset.act!;
      if (act === 'say') {
        el.closest('.s-card')?.classList.add('revealed');
        void this.say(el.dataset.text!, el);
      } else if (act === 'all') void this.sayAll();
      else if (act === 'slow') {
        this.slow = !this.slow;
        el.classList.toggle('on', this.slow);
      } else if (act === 'test') {
        this.root.classList.toggle('testing');
        el.classList.toggle('on', this.root.classList.contains('testing'));
        this.root.querySelectorAll('.s-card').forEach((c) => c.classList.remove('revealed'));
      } else if (act === 'start') this.onStart();
    });
  }

  get visible(): boolean {
    return this.root.classList.contains('show');
  }

  show(): void {
    this.root.classList.add('show');
    this.root.scrollTop = 0;
  }

  hide(): void {
    this.seq++;
    this.player.stop();
    this.root.classList.remove('show');
  }

  /** Play one clip, highlighting the element while it sounds. */
  async say(text: string, el?: HTMLElement): Promise<void> {
    this.root.querySelectorAll('.speaking').forEach((x) => x.classList.remove('speaking'));
    el?.classList.add('speaking');
    this.playing = text;
    this.plays++;
    await this.player.play(text, this.slow ? 0.75 : 1);
    el?.classList.remove('speaking');
    if (this.playing === text) this.playing = null;
  }

  private async sayAll(): Promise<void> {
    const run = ++this.seq;
    for (const card of this.root.querySelectorAll<HTMLElement>('.s-card')) {
      if (run !== this.seq || !this.visible) return;
      card.classList.add('revealed');
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const hi = card.querySelector<HTMLElement>('.s-hi')!;
      await this.say(hi.dataset.text!, hi);
      await new Promise((r) => setTimeout(r, 900));
    }
  }

  private render(voice: () => string): void {
    const cards = this.lesson.sentences
      .map((s, i) => {
        const chips = s.chunks
          .map(
            (c) => `<button tabindex="-1" class="chip" data-act="say" data-text="${esc(c.hi)}">
              <span class="c-hi">${esc(c.hi)}</span><span class="c-tr">${esc(c.tr)}</span><span class="c-en">${esc(c.en)}</span>
            </button>`,
          )
          .join('');
        const traps = s.chunks.map((c) => `<li><span class="bad">✗ ${esc(c.decoy.hi)}</span> ${esc(c.decoy.why)}</li>`).join('');
        return `
          <section class="s-card">
            <div class="s-num">${i + 1}</div>
            <div class="s-en">${esc(s.en)}</div>
            <button tabindex="-1" class="s-hi" data-act="say" data-text="${esc(s.hi)}"><span class="play">▶</span> <span class="txt">${esc(s.hi)}</span></button>
            <div class="s-tr">${esc(s.tr)}</div>
            <div class="chips">${chips}</div>
            <details><summary>Traps at the junctions</summary><ul>${traps}</ul></details>
          </section>`;
      })
      .join('');
    this.root.innerHTML = `
      <div class="s-inner">
        <header>
          <h1>Study first<small>${esc(this.lesson.title)}</small></h1>
          <p>Tap a sentence or a word to hear it. In the game you'll build these sentences one word-group per junction,
          so learn the pieces and the traps.</p>
          <div class="s-tools">
            <button tabindex="-1" data-act="all">▶ Listen to all</button>
            <button tabindex="-1" data-act="slow">Slow</button>
            <button tabindex="-1" data-act="test">Test yourself (hide Hindi)</button>
          </div>
        </header>
        ${cards}
        <footer>
          <button tabindex="-1" class="start" data-act="start">Start running ▶</button>
          <p class="hint">or press <b>Space</b><br>
          In the game the English sentence is shown and the Hindi is spoken on a loop. Turn towards the correct
          next word-group (← →, any time before the junction) · ↑ jump · ↓ slide · M sound · P pause · L back here after a run<br>
          Voice: <span class="voice"></span> · <a href="?mode=classic" style="color:#ffc94a">classic mode (no learning)</a></p>
        </footer>
      </div>`;
    const v = this.root.querySelector<HTMLElement>('.voice')!;
    const update = () => (v.textContent = voice());
    update();
    this.root.addEventListener('pointerenter', update);
    this.refreshVoice = update;
  }

  refreshVoice: () => void = () => {};
}
