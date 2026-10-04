// Pre-generates Hindi audio for every lesson sentence (and chunk) with ElevenLabs.
// The API key stays on your machine: the game only ships the resulting MP3 files.
//
//   npm run tts              key from ELEVENLABS_API_KEY or ./info.txt (git-ignored)
//   VOICE=<voice_id> npm run tts
//
// Files are cached by a hash of voice + model + settings + text, so re-running only
// generates audio for new or changed sentences, and removes files no longer used.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { HINDI_LESSON_1 } from '../src/learn/lessons.ts';

const KEY = process.env.ELEVENLABS_API_KEY ?? (fs.existsSync('info.txt') ? fs.readFileSync('info.txt', 'utf8').trim() : '');
if (!KEY) {
  console.error('No ElevenLabs key: set ELEVENLABS_API_KEY or put it in info.txt');
  process.exit(1);
}

const VOICE = process.env.VOICE ?? 'Xb7hH8MSUJpSbSDYk0k2'; // "Alice - Clear, Engaging Educator" (verified for Hindi)
const MODEL = 'eleven_multilingual_v2';
const SETTINGS = { stability: 0.6, similarity_boost: 0.8, speed: 0.85 };
const OUT = path.resolve('public/audio/hi');
fs.mkdirSync(OUT, { recursive: true });

const clean = (t) => t.replace(/।/g, '').trim();
const texts = new Set();
for (const s of HINDI_LESSON_1.sentences) {
  texts.add(clean(s.hi));
  for (const c of s.chunks) texts.add(clean(c.hi));
}

const files = {};
let made = 0;
for (const text of texts) {
  const hash = crypto.createHash('sha1').update(JSON.stringify([VOICE, MODEL, SETTINGS, text])).digest('hex').slice(0, 12);
  const file = `${hash}.mp3`;
  files[text] = file;
  if (fs.existsSync(path.join(OUT, file))) continue;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: MODEL, voice_settings: SETTINGS }),
  });
  if (!res.ok) {
    console.error(`FAILED "${text}": ${res.status} ${(await res.text()).slice(0, 300)}`);
    process.exit(1);
  }
  fs.writeFileSync(path.join(OUT, file), Buffer.from(await res.arrayBuffer()));
  made++;
  console.log(`  ${file}  ${text}`);
}

for (const f of fs.readdirSync(OUT)) {
  if (f.endsWith('.mp3') && !Object.values(files).includes(f)) fs.rmSync(path.join(OUT, f));
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ voice: 'ElevenLabs · Alice', model: MODEL, files }, null, 2));
console.log(`${texts.size} clips (${made} new) → public/audio/hi/`);
