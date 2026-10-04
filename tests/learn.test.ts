import { describe, expect, it } from 'vitest';
import { applyLearnMode, CONFIG } from '../src/game/config';
import { GameSim } from '../src/game/sim';
import { LessonDirector } from '../src/learn/director';
import { HINDI_LESSON_1 } from '../src/learn/lessons';

const lesson = HINDI_LESSON_1;

describe('Hindi lesson data', () => {
  it('each sentence is exactly its chunks in order', () => {
    for (const s of lesson.sentences) {
      expect(s.chunks.map((c) => c.hi).join(' ') + '।').toBe(s.hi);
      expect(s.chunks.map((c) => c.tr).join(' ')).toBe(s.tr);
    }
  });

  it('every decoy differs from the correct chunk and explains why', () => {
    for (const s of lesson.sentences)
      for (const c of s.chunks) {
        expect(c.decoy.hi).not.toBe(c.hi);
        expect(c.decoy.why.length).toBeGreaterThan(10);
      }
  });
});

describe('LessonDirector', () => {
  /** answer every question of the current sentence (correctly or not) */
  const answer = (d: LessonDirector, segStart: number, right: (i: number) => boolean) => {
    const n = d.sentence.chunks.length;
    const outs = [];
    for (let i = 0; i < n; i++) {
      const q = d.assign(segStart + i);
      const wrong = q.correct === 'left' ? 'right' : 'left';
      outs.push(d.resolve(segStart + i, right(i) ? q.correct : wrong)!);
    }
    return outs;
  };

  it('starts with the first sentence, one chunk per junction, correct side randomised', () => {
    const d = new LessonDirector(lesson, 3);
    const sides = new Set<string>();
    for (let i = 0; i < 20; i++) sides.add(new LessonDirector(lesson, i).assign(1).correct);
    expect(sides).toEqual(new Set(['left', 'right']));
    const q = d.assign(1);
    expect(q.sentence.id).toBe('want');
    expect(q.chunk.hi).toBe('मैं');
    expect(q[q.correct].hi).toBe('मैं');
    expect(q[q.correct === 'left' ? 'right' : 'left'].hi).toBe('मेरा');
    expect(d.assign(1)).toBe(q); // stable per junction
  });

  it('a correct run builds the sentence and moves to the next one', () => {
    const d = new LessonDirector(lesson, 1);
    const outs = answer(d, 1, () => true);
    expect(outs.every((o) => o.correct)).toBe(true);
    expect(outs.slice(0, -1).some((o) => o.sentenceDone)).toBe(false);
    expect(outs.at(-1)!.sentenceDone).toBe(true);
    expect(d.hearts).toBe(3);
    expect(d.sentence.id).toBe('name');
    expect(d.chunkIndex).toBe(0);
  });

  it('a wrong answer costs a heart, still advances, and the sentence comes back soon', () => {
    const d = new LessonDirector(lesson, 1);
    const outs = answer(d, 1, (i) => i !== 1);
    expect(outs[1].correct).toBe(false);
    expect(outs[1].hearts).toBe(2);
    expect(d.wrongCount).toBe(1);
    // queue: name, decided, want(again), speak
    answer(d, 10, () => true);
    answer(d, 20, () => true);
    expect(d.sentence.id).toBe('want');
  });

  it('the lesson completes only when every sentence was answered cleanly', () => {
    const d = new LessonDirector(lesson, 1);
    let done = false;
    for (let k = 0; k < 4; k++) done = answer(d, k * 10, () => true).at(-1)!.lessonDone;
    expect(done).toBe(true);
    expect(d.laps).toBe(1);
    expect(d.remaining).toBe(lesson.sentences.length); // keeps practising
  });

  it('restartRun keeps the sentence but resets chunk progress and hearts', () => {
    const d = new LessonDirector(lesson, 1);
    answer(d, 1, () => true);
    const q = d.assign(50);
    d.resolve(50, q.correct === 'left' ? 'right' : 'left');
    expect(d.chunkIndex).toBe(1);
    d.restartRun();
    expect(d.sentence.id).toBe('name');
    expect(d.chunkIndex).toBe(0);
    expect(d.hearts).toBe(3);
  });
});

describe('learn-mode track', () => {
  it('whole straight is the decision zone: left/right is always an answer, never a lane change', () => {
    const saved = { ...CONFIG };
    applyLearnMode();
    try {
      const sim = new GameSim(5);
      sim.start();
      for (let i = 0; i < 120; i++) sim.tick();
      sim.act('left');
      expect(sim.player.decider.pending).toBe('left');
      expect(sim.player.lane).toBe(1);
      sim.act('right'); // change of mind
      for (let i = 0; i < 120 * 20 && sim.player.turns.length === 0; i++) sim.tick();
      expect(sim.player.turns).toEqual(['right']);
      // no lane-blocking obstacles in learn mode, and the autopilot gets through
      sim.autopilot.mode = 'full';
      for (let i = 0; i < 120 * 120 && sim.player.alive; i++) sim.tick();
      expect(sim.player.alive).toBe(true);
      for (const seg of sim.track.segments) expect(seg.obstacles.some((o) => o.kind === 'block')).toBe(false);
    } finally {
      Object.assign(CONFIG, saved);
    }
  });
});
