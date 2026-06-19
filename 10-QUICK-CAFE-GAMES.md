# 10 — Quick Cafe Games

> Lightweight, single-device party/solo games inside the Chaya One Customer PWA.
> Built to fill **existing** waiting periods (order → food → eat → bill) and
> **never** to extend table occupancy. Every game ends on its own timer.

---

## 0. Guiding constraint (business requirement)

The games exist to raise **customer satisfaction & repeat visits**, *not* seating
duration. Concretely, the design enforces:

| Rule | How it's enforced |
| --- | --- |
| Sessions are short (30 / 60 / 120 s) | `durationSec` ceiling per game in `lib/games/registry.ts`; `useCountdown` auto-ends the round |
| No endless loops / farming | **One coin payout per game per visit** — server-side cap in `/api/customer/games/complete`. Replays allowed but pay 0 (“practice round”) |
| No competitive ranking that rewards lingering | Leaderboard is opt-in/among-friends and **not** required to earn; coins are flat-capped per visit |
| Multiplayer without coordination overhead | **Single-device pass-and-play** — no rooms, QR, sockets, or matchmaking |

Net effect: a guest can play one or two games while waiting, bank a small
reward, and the loop runs dry for the visit — there is no incentive to stay
longer.

---

## 1. Where it lives in the product

- Surface: the **Play** tab of the Customer PWA (`app/app/PwaClient.tsx`).
- Entry point: `components/games/GamesHub.tsx` (replaces the old inline
  Spin-the-Wheel `Play`; the wheel is now `components/games/SpinWheel.tsx` and
  appears as the first hub card).
- Reuses the existing customer identity, loyalty (`points` + `coins`),
  `LoyaltyLedger`, and `GameSession` plumbing — **no new realtime backend**.

```
Customer PWA (/app)
└── Play tab → GamesHub
    ├── 🎡 Spin the Wheel        (existing, server-authoritative)
    ├── 🕵️ Mini Imposter         (pass-and-play, deep slice)
    ├── 🍔 Guess the Food Emoji  (30s solo)
    ├── 🔤 Malayalam Word Challenge (60s solo)
    ├── ⚡ Quick Quiz            (30s solo)
    ├── 🔍 Spot the Difference   (60s solo)
    └── 🃏 Memory Flip           (60s solo)
```

---

## 2. Database schema

**No migration required.** The Phase-7 gamification models already in
`packages/db/prisma/schema.prisma` cover everything:

| Model | Role for Quick Games |
| --- | --- |
| `Game` | One row per game key per tenant (find-or-create on first play). Keys: `imposter`, `emoji_guess`, `word_challenge`, `quick_quiz`, `spot_difference`, `memory_flip` (+ existing `spin_wheel`). |
| `GameSession` | One row per finished round — `result` JSON stores `{score, coins, points, awarded, durationSec}`. Backs the per-visit cap **and** the leaderboard. |
| `LoyaltyLedger` | Append-only `earn` rows with `source: "game"` for coins + points. |
| `Customer.coins / .points` | Running balances, incremented atomically with the ledger row. |
| `Coupon` / `RewardCatalog` | Existing redemption path (Rewards tab) — coins/points feed it; unchanged. |
| `GameRoom` / `GameRoomPlayer` | **Reserved** for a future multi-device mode; unused by the single-device design. |
| `Badge` / `CustomerBadge` | Available for achievement badges (e.g. “Detective”, “Word Wizard”) — see Roadmap. |
| `Leaderboard` | Period/metric rows; the leaderboard query aggregates `GameSession`. |

> If/when multi-device Imposter is built, it slots onto `GameRoom` +
> `GameRoomPlayer` + the existing SSE bus (`lib/realtime.ts`) — still no
> Supabase/Firebase needed.

---

## 3. Reward maths (single source of truth)

`lib/games/registry.ts` is imported by **both** client and server so the
estimate the guest sees and the coins they actually get come from one formula.

```ts
coinsForScore(key, score)  // base 2 + linear scale to maxCoins at maxScore
pointsForCoins(coins)      // 1 point per 5 coins
```

| Game | durationSec | maxScore | maxCoins |
| --- | --- | --- | --- |
| imposter | 120 | 1 (complete a round) | 25 |
| emoji_guess | 30 | 8 | 12 |
| word_challenge | 60 | 10 | 15 |
| quick_quiz | 30 | 5 | 10 |
| spot_difference | 60 | 5 | 12 |
| memory_flip | 60 | 6 | 15 |

The **server clamps the score** before paying, so a tampered client can never
exceed `maxCoins`, and the per-visit cap means it can claim it at most once.

---

## 4. API

### `POST /api/customer/games/complete`  — authoritative reward
Body: `{ t?, game, score, durationSec?, fingerprint? }`
Flow (mirrors `/api/customer/spin`):
1. Resolve table → tenant → customer (cookie or demo).
2. Find-or-create the `Game` row.
3. Count prior **paid** sessions for `(customer, game, visit)`:
   - active order present → scope to `orderId`
   - else → scope to “today”
4. `awarded = priorPaid === 0`; `coins = awarded ? coinsForScore(...) : 0`.
5. In one transaction: write `GameSession`, and if awarded, increment
   `Customer.coins/points` + append a `LoyaltyLedger` row.
6. Return `{ awarded, coins, points, balance }`.

### `GET /api/customer/games/complete?t=` — hub state
Returns `{ played: { [gameKey]: boolean } }` so the hub shows a “✓ Played”
badge on games whose coin payout is already spent this visit.

### Spin-cap fix
`/api/customer/spin` and `/api/customer/context` now scope their 1-spin-per-visit
count to `game.key = "spin_wheel"`, so Quick-Game sessions no longer silently
consume the wheel spin.

---

## 5. UI flow

**Hub** — grid of cards (emoji, bilingual name, `⏱ 30s`, `🪙 ≤N`, `👥 3–8` for
Imposter). Local **language** (EN/ML) and **light/dark** toggles; dark applies
the existing `data-skin="roast"` token set, so theming is free.

**Mini Imposter (deep slice)** — `Setup` (players 3–8, word category, discussion
60/90/120s) → `Reveal` (pass-and-play: each player taps to privately see the
secret word; one random player sees “നിങ്ങളാണ് ഇംപോസ്റ്റർ / You are the
Imposter”) → `Discuss` (timed, one clue each) → `Vote` (tap the table’s pick) →
if caught, the imposter gets one `Guess` from 4 words → `Result` (+coins).

**Solo games** — shared shape: a `g-bar` timer, a stage, tap-to-answer, then the
shared `GameResult` card (`score/max` + server reward, with a “practice round”
note once the visit payout is used).

All screens are mobile-first inside the existing phone shell and use only design
tokens, so they adapt to light/dark automatically.

---

## 6. Words & content (`lib/games/words.ts`, `trivia.ts`)

Bilingual, categorised, append-only data — **the shape is the product**:

```ts
type GameWord = { en; ml; translit; emoji?; category: 'food'|'cafe'|'kerala'|'fun' }
```

- Seeded with ~110 curated, play-tested words across the four categories plus a
  15-question bilingual trivia bank.
- The spec’s **500+ Malayalam / 500+ English** target is pure data entry on this
  exact shape — append rows, no code changes. Recommended next step: bulk-import
  a CSV (`en,ml,translit,emoji,category`) into `WORDS`.
- `pickWords`, `pickQuiz`, `shuffle` accept an injectable RNG so the server can
  use a crypto RNG for fair picks if a game ever becomes wager-like.

---

## 7. Architecture for future games

Adding a game is **two edits**:
1. One entry in `QUICK_GAMES` (`registry.ts`) — name, emoji, duration, score/coin
   caps, accent.
2. One component in `components/games/` + one line in the `GamesHub` switch.

The reward API, per-visit cap, ledger, hub card, timer hook, and result card are
all shared. Planned next: **Truth or Dare**, **Word Chain (Malayalam)**,
**Guess the Movie**, **Emoji Story**, **Cafe Trivia** (Quiz bank reuse).

---

## 8. Implementation status

| Area | Status |
| --- | --- |
| Shared engine (registry, words, trivia, hooks, CSS) | ✅ Done |
| Reward API + spin-cap scoping | ✅ Done |
| Games hub (EN/ML, light/dark, played badges) | ✅ Done |
| Mini Imposter (full pass-and-play) | ✅ Done |
| 5 solo games (emoji / word / quiz / spot / memory) | ✅ Playable |
| 500+/500+ word import | ⏳ Data entry on existing shape |
| Badges (Detective / Word Wizard …) | ⏳ Models exist; award logic TBD |
| Leaderboard screen (friends, per-visit-safe) | ⏳ `GameSession` aggregate query + UI |
| Multi-device Imposter (optional) | ⏳ `GameRoom` + SSE if ever wanted |

---

## 9. Files

```
lib/games/registry.ts            game catalogue + coin/point maths (client+server)
lib/games/words.ts               bilingual categorised word DB
lib/games/trivia.ts              quiz bank
app/api/customer/games/complete  authoritative reward (POST) + hub state (GET)
components/games/GamesHub.tsx     hub (lang + theme + routing)
components/games/SpinWheel.tsx    wheel, ported out of PwaClient
components/games/Imposter.tsx     deep vertical slice
components/games/EmojiGuess.tsx   30s solo
components/games/WordChallenge.tsx 60s solo
components/games/QuickQuiz.tsx    30s solo
components/games/SpotDifference.tsx 60s solo
components/games/MemoryFlip.tsx   60s solo
components/games/GameResult.tsx   shared end-of-round card
components/games/useGame.ts       useCountdown + useGameComplete
components/games/gamesCss.ts      shared styles (token-driven)
```
