import type { TurnDir } from '../game/dirs';
import type { LessonDirector, Outcome, Question } from '../learn/director';

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

/** Language-learning overlay: sentence being built, answer cards, hearts, feedback. */
export class LearnHud {
  private root: HTMLDivElement;
  private card: HTMLDivElement;
  private left: HTMLDivElement;
  private right: HTMLDivElement;
  private hearts: HTMLDivElement;
  private feedback: HTMLDivElement;
  private banner: HTMLDivElement;
  private feedbackT = 0;
  private bannerT = 0;
  private lastKey = '';

  constructor(parent: HTMLElement) {
    this.root = div('learn', parent);
    this.card = div('sentence-card', this.root);
    this.left = div('answer left', this.root);
    this.right = div('answer right', this.root);
    this.hearts = div('hearts', this.root);
    this.feedback = div('feedback', this.root);
    this.banner = div('banner', this.root);
  }

  /**
   * @param q       question at the junction ahead (if any)
   * @param pending answer currently selected (buffered turn)
   */
  update(dt: number, director: LessonDirector, q: Question | undefined, pending: TurnDir | null, active: boolean, speaking = false): void {
    this.root.classList.toggle('show', active);
    this.card.classList.toggle('speaking', speaking);

    // sentence card: English prompt + Hindi built so far + blanks
    const s = director.sentence;
    const idx = q ? q.chunkIndex : director.chunkIndex;
    const key = `${s.id}:${idx}:${director.hearts}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      const parts = s.chunks.map((c, i) =>
        i < idx ? `<span class="done">${esc(c.hi)}</span>` : i === idx ? '<span class="blank now">?</span>' : '<span class="blank">…</span>',
      );
      const tr = s.chunks.slice(0, idx).map((c) => esc(c.tr)).join(' ');
      this.card.innerHTML = `
        <div class="en"><span class="spk">♪</span> ${esc(s.en)}</div>
        <div class="hi">${parts.join(' ')}</div>
        <div class="tr">${tr || '&nbsp;'}</div>`;
      this.hearts.innerHTML = Array.from({ length: director.maxHearts }, (_, i) => `<span class="${i < director.hearts ? 'on' : 'off'}">♥</span>`).join('');
    }

    const showCards = active && !!q;
    for (const [elm, side] of [[this.left, 'left'], [this.right, 'right']] as const) {
      elm.classList.toggle('show', showCards);
      elm.classList.toggle('picked', showCards && pending === side);
      if (q) {
        const opt = q[side];
        const html = `<div class="hi">${esc(opt.hi)}</div><div class="tr">${esc(opt.tr)}</div><div class="key">${side === 'left' ? '◀ turn left' : 'turn right ▶'}</div>`;
        if (elm.dataset.q !== html) {
          elm.dataset.q = html;
          elm.innerHTML = html;
        }
      }
    }

    if (this.feedbackT > 0 && (this.feedbackT -= dt) <= 0) this.feedback.classList.remove('show');
    if (this.bannerT > 0 && (this.bannerT -= dt) <= 0) this.banner.classList.remove('show');
  }

  showOutcome(o: Outcome): void {
    const c = o.question.chunk;
    if (o.correct) {
      this.feedback.className = 'feedback show good';
      this.feedback.innerHTML = `✓ सही! <small>(sahi, "correct")</small> &nbsp;${esc(c.hi)} = ${esc(c.en)}`;
      this.feedbackT = 1.6;
    } else {
      this.feedback.className = 'feedback show bad';
      this.feedback.innerHTML = `✗ Correct: <b>${esc(c.hi)}</b> <small>(${esc(c.tr)})</small><div class="why">${esc(c.decoy.why)}</div>`;
      this.feedbackT = 4;
    }
    if (o.sentenceDone) {
      const s = o.question.sentence;
      this.banner.innerHTML = `
        <div class="hi">${esc(s.hi)}</div>
        <div class="tr">${esc(s.tr)}</div>
        <div class="en">${esc(s.en)}</div>
        ${o.lessonDone ? '<div class="done">Lesson complete! Keep running to practise.</div>' : ''}`;
      this.banner.classList.add('show');
      this.bannerT = 4.5;
    }
  }

  reset(): void {
    this.lastKey = '';
    this.feedback.classList.remove('show');
    this.banner.classList.remove('show');
    this.feedbackT = this.bannerT = 0;
  }
}

function div(cls: string, parent: HTMLElement): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  parent.appendChild(d);
  return d;
}
