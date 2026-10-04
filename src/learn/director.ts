import type { TurnDir } from '../game/dirs';
import { Rng } from '../game/rng';
import type { Chunk, Lesson, Sentence } from './lessons';

export interface AnswerOption {
  hi: string;
  tr: string;
}

/** The question attached to one T junction. */
export interface Question {
  sentence: Sentence;
  chunkIndex: number;
  chunk: Chunk;
  left: AnswerOption;
  right: AnswerOption;
  correct: TurnDir;
}

export interface Outcome {
  question: Question;
  chosen: TurnDir;
  correct: boolean;
  sentenceDone: boolean;
  /** every sentence answered without a mistake in its last attempt */
  lessonDone: boolean;
  hearts: number;
}

/**
 * Turns a lesson into junction questions (rendering-free, unit-tested).
 * - one chunk per junction; the correct side is random
 * - a wrong turn costs a heart; the correct chunk is still added so the
 *   sentence keeps building in its right form
 * - a sentence with any mistake is queued again two sentences later
 */
export class LessonDirector {
  hearts: number;
  correctCount = 0;
  wrongCount = 0;
  sentencesDone = 0;
  laps = 0;
  private queue: Sentence[];
  private chunk = 0;
  private missed = false;
  private rng: Rng;
  private bySegment = new Map<number, Question>();

  constructor(readonly lesson: Lesson, seed = 1, readonly maxHearts = 3) {
    this.rng = new Rng(seed);
    this.queue = [...lesson.sentences];
    this.hearts = maxHearts;
  }

  get sentence(): Sentence {
    return this.queue[0];
  }

  get chunkIndex(): number {
    return this.chunk;
  }

  get remaining(): number {
    return this.queue.length;
  }

  /** New run after a game over: same sentence from its first chunk, full hearts. */
  restartRun(): void {
    this.hearts = this.maxHearts;
    this.chunk = 0;
    this.missed = false;
    this.bySegment.clear();
  }

  questionFor(segmentId: number): Question | undefined {
    return this.bySegment.get(segmentId);
  }

  /** Attach the next chunk question to the junction at the end of a segment. */
  assign(segmentId: number): Question {
    const existing = this.bySegment.get(segmentId);
    if (existing) return existing;
    const sentence = this.sentence;
    const chunk = sentence.chunks[this.chunk];
    const correct: TurnDir = this.rng.chance(0.5) ? 'left' : 'right';
    const good = { hi: chunk.hi, tr: chunk.tr };
    const bad = { hi: chunk.decoy.hi, tr: chunk.decoy.tr };
    const q: Question = {
      sentence,
      chunkIndex: this.chunk,
      chunk,
      correct,
      left: correct === 'left' ? good : bad,
      right: correct === 'right' ? good : bad,
    };
    this.bySegment.set(segmentId, q);
    return q;
  }

  /** The runner turned `chosen` at the junction of `segmentId`. */
  resolve(segmentId: number, chosen: TurnDir): Outcome | null {
    const q = this.bySegment.get(segmentId);
    if (!q) return null;
    this.bySegment.delete(segmentId);
    const correct = chosen === q.correct;
    if (correct) this.correctCount++;
    else {
      this.wrongCount++;
      this.hearts = Math.max(0, this.hearts - 1);
      this.missed = true;
    }

    this.chunk++;
    let sentenceDone = false;
    let lessonDone = false;
    if (this.chunk >= q.sentence.chunks.length) {
      sentenceDone = true;
      this.sentencesDone++;
      this.chunk = 0;
      const done = this.queue.shift()!;
      if (this.missed) this.queue.splice(Math.min(2, this.queue.length), 0, done); // practise it again soon
      this.missed = false;
      if (this.queue.length === 0) {
        lessonDone = true;
        this.laps++;
        this.queue = this.shuffled(this.lesson.sentences); // keep practising in a new order
      }
    }
    return { question: q, chosen, correct, sentenceDone, lessonDone, hearts: this.hearts };
  }

  private shuffled<T>(items: readonly T[]): T[] {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}
