/**
 * Lesson content. Each sentence is built chunk by chunk: one T junction per
 * chunk, the correct chunk on one branch and a close-miss decoy on the other.
 * Decoys target real pitfalls (gender, word order, ने, tense) and carry a short
 * explanation that is shown when the learner picks them.
 *
 * Add your own lessons by copying the structure below.
 */
export interface Decoy {
  hi: string;
  tr: string;
  why: string;
}

export interface Chunk {
  /** Devanagari */
  hi: string;
  /** romanised (Hinglish-style) spelling */
  tr: string;
  /** English gloss */
  en: string;
  decoy: Decoy;
}

export interface Sentence {
  id: string;
  en: string;
  hi: string;
  tr: string;
  chunks: Chunk[];
}

export interface Lesson {
  id: string;
  title: string;
  language: string;
  /** BCP-47 tag for the browser's speech synthesis */
  speechLang: string;
  sentences: Sentence[];
}

// Written for a male learner (James): चाहता / सकता. A woman would say चाहती / सकती.
export const HINDI_LESSON_1: Lesson = {
  id: 'hi-1',
  title: 'Hindi 1 · About me',
  language: 'Hindi',
  speechLang: 'hi-IN',
  sentences: [
    {
      id: 'want',
      en: 'I want to learn Hindi.',
      hi: 'मैं हिंदी सीखना चाहता हूँ।',
      tr: 'main Hindi seekhna chahta hoon',
      chunks: [
        { hi: 'मैं', tr: 'main', en: 'I', decoy: { hi: 'मेरा', tr: 'mera', why: 'मेरा means "my". "I" is मैं.' } },
        { hi: 'हिंदी', tr: 'Hindi', en: 'Hindi', decoy: { hi: 'सीखना', tr: 'seekhna', why: 'The object comes before the verb: मैं हिंदी सीखना…' } },
        { hi: 'सीखना', tr: 'seekhna', en: 'to learn', decoy: { hi: 'सीखता', tr: 'seekhta', why: 'चाहना ("to want") takes the infinitive सीखना ("to learn").' } },
        { hi: 'चाहता हूँ', tr: 'chahta hoon', en: 'want', decoy: { hi: 'चाहती हूँ', tr: 'chahti hoon', why: 'चाहती is what a woman says. James says चाहता.' } },
      ],
    },
    {
      id: 'name',
      en: 'My name is James.',
      hi: 'मेरा नाम जेम्स है।',
      tr: 'mera naam James hai',
      chunks: [
        { hi: 'मेरा', tr: 'mera', en: 'my', decoy: { hi: 'मेरी', tr: 'meri', why: 'नाम is masculine, so "my" is मेरा.' } },
        { hi: 'नाम', tr: 'naam', en: 'name', decoy: { hi: 'काम', tr: 'kaam', why: 'काम means "work". "Name" is नाम.' } },
        { hi: 'जेम्स', tr: 'James', en: 'James', decoy: { hi: 'है', tr: 'hai', why: 'The verb goes last in Hindi: मेरा नाम जेम्स है.' } },
        { hi: 'है', tr: 'hai', en: 'is', decoy: { hi: 'हूँ', tr: 'hoon', why: 'हूँ only goes with मैं ("I am"). "(It) is" is है.' } },
      ],
    },
    {
      id: 'decided',
      en: 'Yesterday I decided to learn Hindi.',
      hi: 'कल मैंने हिंदी सीखने का फ़ैसला किया।',
      tr: 'kal maine Hindi seekhne ka faisla kiya',
      chunks: [
        { hi: 'कल', tr: 'kal', en: 'yesterday', decoy: { hi: 'आज', tr: 'aaj', why: 'आज = today. कल = yesterday (and also tomorrow!).' } },
        { hi: 'मैंने', tr: 'maine', en: 'I (did)', decoy: { hi: 'मैं', tr: 'main', why: 'In the past tense with किया ("did"), "I" becomes मैंने.' } },
        { hi: 'हिंदी सीखने का', tr: 'Hindi seekhne ka', en: 'of learning Hindi', decoy: { hi: 'हिंदी सीखना का', tr: 'Hindi seekhna ka', why: 'Before का, सीखना changes to सीखने.' } },
        { hi: 'फ़ैसला किया', tr: 'faisla kiya', en: 'made the decision', decoy: { hi: 'फ़ैसला करूँगा', tr: 'faisla karoonga', why: 'करूँगा = "I will do" (future). The past tense किया is what makes कल mean "yesterday".' } },
      ],
    },
    {
      id: 'speak',
      en: 'Today I can (already) speak a little Hindi.',
      hi: 'आज मैं थोड़ी हिंदी बोल सकता हूँ।',
      tr: 'aaj main thodi Hindi bol sakta hoon',
      chunks: [
        { hi: 'आज', tr: 'aaj', en: 'today', decoy: { hi: 'कल', tr: 'kal', why: 'कल = yesterday/tomorrow. "Today" is आज.' } },
        { hi: 'मैं', tr: 'main', en: 'I', decoy: { hi: 'मैंने', tr: 'maine', why: 'सकना ("can") never takes ने: मैं … बोल सकता हूँ.' } },
        { hi: 'थोड़ी हिंदी', tr: 'thodi Hindi', en: 'a little Hindi', decoy: { hi: 'थोड़ा हिंदी', tr: 'thoda Hindi', why: 'हिंदी is feminine, so "a little" is थोड़ी.' } },
        { hi: 'बोल सकता हूँ', tr: 'bol sakta hoon', en: 'can speak', decoy: { hi: 'बोलना सकता हूँ', tr: 'bolna sakta hoon', why: 'With सकना ("can") use the bare stem: बोल सकता हूँ.' } },
      ],
    },
  ],
};
