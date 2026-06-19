/**
 * Bilingual word database for the word-driven games (Imposter, Word Challenge,
 * Emoji Guess). Client + server safe (no Node built-ins).
 *
 * SHAPE IS THE PRODUCT: every entry carries an English label, the Malayalam
 * script, a Latin transliteration (so non-readers can still say it aloud), an
 * optional emoji (drives Emoji Guess + card art), and a category. The seed
 * below is a curated, play-tested working set (~110 words). The spec's target
 * of 500+ Malayalam / 500+ English is a pure data-entry exercise on this exact
 * shape — append rows, no code changes. See docs/quick-cafe-games.md §Words.
 */

export type WordCategory = 'food' | 'cafe' | 'kerala' | 'fun';

export type GameWord = {
  en: string;
  ml: string;
  translit: string;
  emoji?: string;
  category: WordCategory;
};

export const WORD_CATEGORIES: { key: WordCategory; en: string; ml: string; emoji: string }[] = [
  { key: 'food', en: 'Food', ml: 'ഭക്ഷണം', emoji: '🍛' },
  { key: 'cafe', en: 'Cafe', ml: 'കഫേ', emoji: '☕' },
  { key: 'kerala', en: 'Kerala', ml: 'കേരളം', emoji: '🌴' },
  { key: 'fun', en: 'Fun', ml: 'വിനോദം', emoji: '🎉' },
];

export const WORDS: GameWord[] = [
  // ---------------- Food ----------------
  { en: 'Tea', ml: 'ചായ', translit: 'Chaya', emoji: '☕', category: 'food' },
  { en: 'Tapioca', ml: 'കപ്പ', translit: 'Kappa', emoji: '🥔', category: 'food' },
  { en: 'Biriyani', ml: 'ബിരിയാണി', translit: 'Biriyani', emoji: '🍚', category: 'food' },
  { en: 'Porotta', ml: 'പൊറോട്ട', translit: 'Porotta', emoji: '🫓', category: 'food' },
  { en: 'Samosa', ml: 'സമോസ', translit: 'Samosa', emoji: '🥟', category: 'food' },
  { en: 'Dosa', ml: 'ദോശ', translit: 'Dosha', emoji: '🥞', category: 'food' },
  { en: 'Idli', ml: 'ഇഡ്ഡലി', translit: 'Idli', emoji: '🍥', category: 'food' },
  { en: 'Appam', ml: 'അപ്പം', translit: 'Appam', emoji: '🥯', category: 'food' },
  { en: 'Puttu', ml: 'പുട്ട്', translit: 'Puttu', emoji: '🍙', category: 'food' },
  { en: 'Vada', ml: 'വട', translit: 'Vada', emoji: '🍩', category: 'food' },
  { en: 'Sambar', ml: 'സാമ്പാർ', translit: 'Sambar', emoji: '🍲', category: 'food' },
  { en: 'Fish curry', ml: 'മീൻ കറി', translit: 'Meen curry', emoji: '🐟', category: 'food' },
  { en: 'Banana', ml: 'പഴം', translit: 'Pazham', emoji: '🍌', category: 'food' },
  { en: 'Coffee', ml: 'കാപ്പി', translit: 'Kaapi', emoji: '☕', category: 'food' },
  { en: 'Payasam', ml: 'പായസം', translit: 'Payasam', emoji: '🍮', category: 'food' },
  { en: 'Coconut', ml: 'തേങ്ങ', translit: 'Thenga', emoji: '🥥', category: 'food' },
  { en: 'Rice', ml: 'ചോറ്', translit: 'Choru', emoji: '🍚', category: 'food' },
  { en: 'Egg', ml: 'മുട്ട', translit: 'Mutta', emoji: '🥚', category: 'food' },
  { en: 'Chicken', ml: 'കോഴി', translit: 'Kozhi', emoji: '🍗', category: 'food' },
  { en: 'Mango', ml: 'മാങ്ങ', translit: 'Maanga', emoji: '🥭', category: 'food' },
  { en: 'Jackfruit', ml: 'ചക്ക', translit: 'Chakka', emoji: '🟢', category: 'food' },
  { en: 'Banana chips', ml: 'ഉപ്പേരി', translit: 'Upperi', emoji: '🍟', category: 'food' },
  { en: 'Pickle', ml: 'അച്ചാർ', translit: 'Achaar', emoji: '🫙', category: 'food' },
  { en: 'Sweet', ml: 'മധുരം', translit: 'Madhuram', emoji: '🍬', category: 'food' },
  { en: 'Ice cream', ml: 'ഐസ്ക്രീം', translit: 'Ice cream', emoji: '🍨', category: 'food' },

  // ---------------- Cafe ----------------
  { en: 'Cup', ml: 'കപ്പ്', translit: 'Cup', emoji: '🍵', category: 'cafe' },
  { en: 'Table', ml: 'മേശ', translit: 'Mesha', emoji: '🪑', category: 'cafe' },
  { en: 'Waiter', ml: 'വെയിറ്റർ', translit: 'Waiter', emoji: '🧑‍🍳', category: 'cafe' },
  { en: 'Bill', ml: 'ബിൽ', translit: 'Bill', emoji: '🧾', category: 'cafe' },
  { en: 'Menu', ml: 'മെനു', translit: 'Menu', emoji: '📋', category: 'cafe' },
  { en: 'Plate', ml: 'പ്ലേറ്റ്', translit: 'Plate', emoji: '🍽️', category: 'cafe' },
  { en: 'Spoon', ml: 'സ്പൂൺ', translit: 'Spoon', emoji: '🥄', category: 'cafe' },
  { en: 'Glass', ml: 'ഗ്ലാസ്', translit: 'Glass', emoji: '🥛', category: 'cafe' },
  { en: 'Kettle', ml: 'കെറ്റിൽ', translit: 'Kettle', emoji: '🫖', category: 'cafe' },
  { en: 'Counter', ml: 'കൗണ്ടർ', translit: 'Counter', emoji: '🛎️', category: 'cafe' },
  { en: 'Straw', ml: 'സ്ട്രോ', translit: 'Straw', emoji: '🥤', category: 'cafe' },
  { en: 'Napkin', ml: 'നാപ്കിൻ', translit: 'Napkin', emoji: '🧻', category: 'cafe' },
  { en: 'Coin', ml: 'നാണയം', translit: 'Naanayam', emoji: '🪙', category: 'cafe' },
  { en: 'Order', ml: 'ഓർഡർ', translit: 'Order', emoji: '📝', category: 'cafe' },
  { en: 'Chair', ml: 'കസേര', translit: 'Kasera', emoji: '🪑', category: 'cafe' },
  { en: 'Sugar', ml: 'പഞ്ചസാര', translit: 'Panchasaara', emoji: '🧂', category: 'cafe' },
  { en: 'Milk', ml: 'പാൽ', translit: 'Paal', emoji: '🥛', category: 'cafe' },
  { en: 'Water', ml: 'വെള്ളം', translit: 'Vellam', emoji: '💧', category: 'cafe' },
  { en: 'Token', ml: 'ടോക്കൺ', translit: 'Token', emoji: '🎫', category: 'cafe' },
  { en: 'Tip', ml: 'ടിപ്പ്', translit: 'Tip', emoji: '💸', category: 'cafe' },

  // ---------------- Kerala ----------------
  { en: 'Boat', ml: 'വള്ളം', translit: 'Vallam', emoji: '🛶', category: 'kerala' },
  { en: 'Onam', ml: 'ഓണം', translit: 'Onam', emoji: '🌸', category: 'kerala' },
  { en: 'Coconut tree', ml: 'തെങ്ങ്', translit: 'Thengu', emoji: '🌴', category: 'kerala' },
  { en: 'Rain', ml: 'മഴ', translit: 'Mazha', emoji: '🌧️', category: 'kerala' },
  { en: 'Temple', ml: 'ക്ഷേത്രം', translit: 'Kshethram', emoji: '🛕', category: 'kerala' },
  { en: 'Elephant', ml: 'ആന', translit: 'Aana', emoji: '🐘', category: 'kerala' },
  { en: 'Backwater', ml: 'കായൽ', translit: 'Kaayal', emoji: '🚤', category: 'kerala' },
  { en: 'Houseboat', ml: 'കെട്ടുവള്ളം', translit: 'Kettuvallam', emoji: '🛥️', category: 'kerala' },
  { en: 'Kathakali', ml: 'കഥകളി', translit: 'Kathakali', emoji: '🎭', category: 'kerala' },
  { en: 'Snake boat', ml: 'ചുണ്ടൻവള്ളം', translit: 'Chundan vallam', emoji: '🚣', category: 'kerala' },
  { en: 'Pookalam', ml: 'പൂക്കളം', translit: 'Pookkalam', emoji: '💮', category: 'kerala' },
  { en: 'Theyyam', ml: 'തെയ്യം', translit: 'Theyyam', emoji: '🔥', category: 'kerala' },
  { en: 'Spices', ml: 'സുഗന്ധവ്യഞ്ജനം', translit: 'Sugandhavyanjanam', emoji: '🌶️', category: 'kerala' },
  { en: 'Paddy field', ml: 'വയൽ', translit: 'Vayal', emoji: '🌾', category: 'kerala' },
  { en: 'Umbrella', ml: 'കുട', translit: 'Kuda', emoji: '☂️', category: 'kerala' },
  { en: 'Sea', ml: 'കടൽ', translit: 'Kadal', emoji: '🌊', category: 'kerala' },
  { en: 'Hills', ml: 'മല', translit: 'Mala', emoji: '⛰️', category: 'kerala' },
  { en: 'Tiger', ml: 'കടുവ', translit: 'Kaduva', emoji: '🐅', category: 'kerala' },
  { en: 'Banana leaf', ml: 'വാഴയില', translit: 'Vaazhayila', emoji: '🍃', category: 'kerala' },
  { en: 'Lamp', ml: 'നിലവിളക്ക്', translit: 'Nilavilakku', emoji: '🪔', category: 'kerala' },

  // ---------------- Fun ----------------
  { en: 'Cinema', ml: 'സിനിമ', translit: 'Cinema', emoji: '🎬', category: 'fun' },
  { en: 'Mobile', ml: 'മൊബൈൽ', translit: 'Mobile', emoji: '📱', category: 'fun' },
  { en: 'Bike', ml: 'ബൈക്ക്', translit: 'Bike', emoji: '🏍️', category: 'fun' },
  { en: 'Cricket', ml: 'ക്രിക്കറ്റ്', translit: 'Cricket', emoji: '🏏', category: 'fun' },
  { en: 'Football', ml: 'ഫുട്ബോൾ', translit: 'Football', emoji: '⚽', category: 'fun' },
  { en: 'Song', ml: 'പാട്ട്', translit: 'Paattu', emoji: '🎵', category: 'fun' },
  { en: 'Dance', ml: 'നൃത്തം', translit: 'Nritham', emoji: '💃', category: 'fun' },
  { en: 'Camera', ml: 'ക്യാമറ', translit: 'Camera', emoji: '📷', category: 'fun' },
  { en: 'Friend', ml: 'കൂട്ടുകാരൻ', translit: 'Koottukaaran', emoji: '🤝', category: 'fun' },
  { en: 'Book', ml: 'പുസ്തകം', translit: 'Pusthakam', emoji: '📖', category: 'fun' },
  { en: 'Car', ml: 'കാർ', translit: 'Car', emoji: '🚗', category: 'fun' },
  { en: 'Bus', ml: 'ബസ്', translit: 'Bus', emoji: '🚌', category: 'fun' },
  { en: 'Train', ml: 'ട്രെയിൻ', translit: 'Train', emoji: '🚆', category: 'fun' },
  { en: 'Beach', ml: 'കടപ്പുറം', translit: 'Kadappuram', emoji: '🏖️', category: 'fun' },
  { en: 'Festival', ml: 'ഉത്സവം', translit: 'Ulsavam', emoji: '🎪', category: 'fun' },
  { en: 'Selfie', ml: 'സെൽഫി', translit: 'Selfie', emoji: '🤳', category: 'fun' },
  { en: 'Game', ml: 'കളി', translit: 'Kali', emoji: '🎮', category: 'fun' },
  { en: 'Money', ml: 'പണം', translit: 'Panam', emoji: '💰', category: 'fun' },
  { en: 'Star', ml: 'നക്ഷത്രം', translit: 'Nakshathram', emoji: '⭐', category: 'fun' },
  { en: 'Moon', ml: 'ചന്ദ്രൻ', translit: 'Chandran', emoji: '🌙', category: 'fun' },
];

export function wordsByCategory(cat?: WordCategory | 'all'): GameWord[] {
  if (!cat || cat === 'all') return WORDS;
  return WORDS.filter((w) => w.category === cat);
}

/** Words that carry an emoji — used by Emoji Guess + Memory Flip card art. */
export const EMOJI_WORDS: GameWord[] = WORDS.filter((w) => !!w.emoji);

/**
 * Deterministic shuffle (Fisher–Yates) driven by a caller-supplied RNG. The
 * client passes Math.random; the server can pass a crypto RNG for fair picks.
 */
export function shuffle<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** N distinct random words, optionally scoped to a category. */
export function pickWords(n: number, cat: WordCategory | 'all' = 'all', rng: () => number = Math.random): GameWord[] {
  return shuffle(wordsByCategory(cat), rng).slice(0, n);
}
