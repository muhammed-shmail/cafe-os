/**
 * Quick Cafe Games — single source of truth for the game catalogue + the
 * authoritative coin/point reward maths. Imported by BOTH the client (to render
 * the hub and show a coin estimate) and the server (to award the real, capped
 * reward). It MUST stay free of Node built-ins so the client can import it.
 *
 * Design rule (business requirement): every game is SHORT. `durationSec` is the
 * hard ceiling a game self-ends at — 30s, 60s or 120s. Nothing here encourages
 * a guest to linger; rewards are capped to one paid play per visit per game
 * (enforced server-side), so the loop can't be farmed to inflate table time.
 */

export type QuickGameKey =
  | 'imposter'
  | 'emoji_guess'
  | 'word_challenge'
  | 'quick_quiz'
  | 'spot_difference'
  | 'memory_flip';

export type QuickGame = {
  key: QuickGameKey;
  name: string;
  nameMl: string;
  emoji: string;
  /** hard self-end ceiling, seconds (30 | 60 | 120) */
  durationSec: number;
  /** one-line pitch shown on the hub card */
  blurb: string;
  /** players needed; 1 = solo, >1 = pass-and-play around the table */
  minPlayers: number;
  maxPlayers: number;
  /** score that earns the full coin payout (server clamps to this) */
  maxScore: number;
  /** coins paid for a flawless play (the visit-capped maximum) */
  maxCoins: number;
  /** accent colour token for the card */
  accent: string;
};

export const QUICK_GAMES: QuickGame[] = [
  {
    key: 'imposter',
    name: 'Mini Imposter',
    nameMl: 'മിനി ഇംപോസ്റ്റർ',
    emoji: '🕵️',
    durationSec: 120,
    blurb: 'One phone, one secret word, one sneaky imposter.',
    minPlayers: 3,
    maxPlayers: 8,
    maxScore: 1,
    maxCoins: 25,
    accent: 'var(--berry)',
  },
  {
    key: 'emoji_guess',
    name: 'Guess the Food Emoji',
    nameMl: 'ഫുഡ് ഇമോജി',
    emoji: '🍔',
    durationSec: 30,
    blurb: '☕🥥🍌 — name the dish before the timer.',
    minPlayers: 1,
    maxPlayers: 1,
    maxScore: 8,
    maxCoins: 12,
    accent: 'var(--turmeric)',
  },
  {
    key: 'word_challenge',
    name: 'Malayalam Word Challenge',
    nameMl: 'വാക്ക് ചലഞ്ച്',
    emoji: '🔤',
    durationSec: 60,
    blurb: 'Match the Malayalam word. Build a streak.',
    minPlayers: 1,
    maxPlayers: 1,
    maxScore: 10,
    maxCoins: 15,
    accent: 'var(--cardamom)',
  },
  {
    key: 'quick_quiz',
    name: 'Quick Quiz',
    nameMl: 'ക്വിക്ക് ക്വിസ്',
    emoji: '⚡',
    durationSec: 30,
    blurb: '5 Kerala-cafe questions in 30 seconds.',
    minPlayers: 1,
    maxPlayers: 1,
    maxScore: 5,
    maxCoins: 10,
    accent: 'var(--clay)',
  },
  {
    key: 'spot_difference',
    name: 'Spot the Difference',
    nameMl: 'വ്യത്യാസം കണ്ടെത്തൂ',
    emoji: '🔍',
    durationSec: 60,
    blurb: 'Find the odd emoji in the grid.',
    minPlayers: 1,
    maxPlayers: 1,
    maxScore: 5,
    maxCoins: 12,
    accent: 'var(--gold)',
  },
  {
    key: 'memory_flip',
    name: 'Memory Flip',
    nameMl: 'മെമ്മറി ഫ്ലിപ്പ്',
    emoji: '🃏',
    durationSec: 60,
    blurb: 'Flip and match the cafe pairs.',
    minPlayers: 1,
    maxPlayers: 1,
    maxScore: 6,
    maxCoins: 15,
    accent: 'var(--turmeric-d)',
  },
];

export const QUICK_GAME_MAP: Record<QuickGameKey, QuickGame> = Object.fromEntries(
  QUICK_GAMES.map((g) => [g.key, g]),
) as Record<QuickGameKey, QuickGame>;

export function isQuickGameKey(k: string): k is QuickGameKey {
  return k in QUICK_GAME_MAP;
}

/**
 * Authoritative payout. Pure + deterministic so the server is the single source
 * of truth and the client can show an honest estimate. Coins scale linearly
 * with the clamped score; a small base keeps "you played" from feeling empty.
 */
export function coinsForScore(key: QuickGameKey, score: number): number {
  const g = QUICK_GAME_MAP[key];
  if (!g) return 0;
  const clamped = Math.max(0, Math.min(g.maxScore, Math.round(score)));
  const base = 2; // showing up is worth a little
  const earned = base + Math.round((clamped / g.maxScore) * (g.maxCoins - base));
  return Math.max(0, Math.min(g.maxCoins, earned));
}

/** Loyalty points are 1 per 5 coins, rounded — keeps the two currencies linked. */
export function pointsForCoins(coins: number): number {
  return Math.floor(coins / 5);
}
