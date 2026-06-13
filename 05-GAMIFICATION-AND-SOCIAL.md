
# 05 — Gamification, Social, Loyalty, Referral & Events

This is the **moat**. POS is the cost of entry; this is why customers come back.

---

## 1. The Economy: Points vs Coins vs Coupons

A two-currency model keeps it motivating but financially safe for the owner.

| Unit | How earned | How spent | Owner cost control |
|------|-----------|-----------|--------------------|
| **Points** | Every ₹ spent (e.g. 1 pt / ₹10), check-ins, referrals, badges | Redeem in rewards catalog | Owner sets earn rate + point liability cap |
| **Coins** | Won in games (volatile, fun) | Spin entries, scratch cards, micro-perks | Soft currency, low real value |
| **Coupons** | Issued by redemptions, game wins, campaigns | One-time at billing | Hard-capped, expiring, single-use |

**Golden rule:** real-money rewards (cashback, free items) come only from **points + coupons** (controlled), never directly from game RNG. Games pay out **coins + coupon-chances**, so the owner's liability is always bounded.

---

## 2. Mini-Games (single player, 30s–2min)

| Game | Loop | Reward type | Skill/luck |
|------|------|-------------|-----------|
| **Spin the Wheel** | One spin per order; weighted segments | Coins / coupon / "try again" | Luck (server-weighted) |
| **Scratch Card** | Reveal 3 symbols | Coins / topping / BOGO chance | Luck |
| **Lucky Number** | Pick a number, server reveals | Tiered coins | Luck |
| **Memory Match** | Flip-and-match food tiles, beat timer | Coins scaled to speed | Skill |
| **Food Trivia / Quiz** | 5 Qs about coffee/food/the cafe | Points for correct | Skill |
| **Fast Tap Challenge** | Tap targets in 20s | Coins by score band | Skill |
| **Latte Art Stack** | Stack ingredients without toppling | Coins by height | Skill |
| **Guess the Price** | Guess a menu item's price | Coupon if close | Knowledge (also teaches menu!) |
| **Catch the Bean** | Swipe to catch falling beans | Coins | Skill |
| **Daily Riddle** | One brain teaser/day | Streak points | Skill |

**More to add later:** Word Scramble (menu words), Spot-the-Difference (two cafe photos), Emoji Order (decode an order from emojis), Wordle-style "Brew" daily.

### Reward outcomes a game can grant
Points · Coins · Coupons · Cashback (coupon-form) · Free toppings · Buy-One-Get-One · Free drink/dessert · Bonus loyalty multiplier (next visit 2×).

---

## 3. Multiplayer Rooms (the unique idea)

Customers physically in the same cafe spin up a **live room** and battle on the table screens. This creates **social energy inside the cafe** — laughter, competition, sharing — which is itself marketing.

**Flow:** Table 3 taps "Create Room" → gets a 4-letter join code + QR → nearby tables join → host picks a game → live realtime match (Socket.IO `game-room:{id}`) → winners get rewards → optional auto-post to the cafe leaderboard.

| Multiplayer game | Description |
|------------------|-------------|
| **Quiz Battle** | Live buzzer trivia; fastest correct scores most |
| **Food Trivia Royale** | Last-one-standing elimination rounds |
| **Multiplayer Puzzle Race** | Same jigsaw/anagram, first to finish wins |
| **Fast Answer Challenge** | Rapid-fire, speed-weighted scoring |
| **Coffee Tower Co-op** | Two tables co-build a tower for a shared reward (cooperation, not just competition) |
| **Order Memory Duel** | Memorize & reproduce a growing order sequence |
| **Tap War** | Real-time tug-of-war by tapping; teams = tables |
| **Predict the Hit** | Everyone predicts "today's best-seller"; revealed at close — slow-burn daily multiplayer |
| **Caption Battle** | Caption a cafe photo; room votes; winner gets coupon (UGC bonus) |
| **Truth-or-Dessert** | Light social party prompts; completing a dare = group discount |

**Rewards:** loyalty points, group discount on the table's bill, free drink/dessert for the winner, "Room Champion" badge. Group rewards (discount the whole table) are powerful — they make the *bill bigger and the group happier*.

**Anti-grief:** rooms are outlet-scoped (must share an outlet QR token), max 8 players, host can kick, rate-limited room creation.

---

## 4. Anti-Cheat & Abuse Rules

Money is at stake, so this layer is mandatory.

**Rules**
- **Max 3 games per visit** (a "visit" = an active order/session window).
- **One real reward (coupon) per order**; extra wins convert to coins only.
- Rewards redeemable **only at this outlet**, expiring (e.g. 48h–7d).
- A game session must be tied to a **valid open order** at that outlet (no order → no real rewards, only practice mode).

**Technical anti-cheat**
- **Server-authoritative RNG & scoring** — client never decides the reward. Client sends inputs/score; server validates plausibility (e.g., trivia answer time can't be < network RTT; tap count can't exceed humanly possible).
- **Signed game sessions** — start issues a server token + seed; result must carry it; tokens are single-use and short-lived.
- **Device fingerprinting + IP + phone** stored per session; velocity checks (N sessions/device/hour).
- **Phone-verified accounts** for redemption (OTP) — kills throwaway abuse.
- **Geofence / table-token binding** — earning real rewards requires the outlet QR token (you must be in the cafe).
- **Rate limiting (Redis)** on start/result endpoints; anomaly flags route to a review queue, not auto-payout.
- **Reward ledger reconciliation** — daily job flags outlets with abnormal redemption ratios.

---

## 5. Loyalty Tiers (status that compounds)

| Tier | Unlock | Perks |
|------|--------|-------|
| Bronze | Join | 1× points, basic games |
| Silver | 5 visits or ₹2,000 | 1.25× points, extra daily spin |
| Gold | 15 visits or ₹6,000 | 1.5× points, priority queue tag, exclusive games |
| VIP / Black | 40 visits or ₹15,000 | 2× points, free birthday combo, secret menu, skip-the-wait perk |

Tiers create a **status ladder** people climb. Show progress bars ("2 visits to Gold").

---

## 6. Achievement Badges — 100+ ideas

Grouped by theme. Each badge = points + a collectible icon + leaderboard flair.

### Visit / Loyalty (frequency)
1. First Sip (1st visit) · 2. Regular (5) · 3. Loyal Customer (10) · 4. Devotee (25) · 5. Centurion (100 visits) · 6. Weekend Warrior (4 weekend visits) · 7. Early Bird (visit before 9am ×5) · 8. Night Owl (after 8pm ×5) · 9. Monday Motivator (5 Mondays) · 10. Rain or Shine (visit on a rainy day) · 11. Lunch Regular (10 lunch visits) · 12. Streak Starter (3-day streak) · 13. Streak Master (30-day streak) · 14. Comeback Kid (return after 30 days away) · 15. Anniversary (1 year as member).

### Spend / Order (monetary)
16. Big Spender (₹1,000 single bill) · 17. Whale (₹5,000 lifetime) · 18. Tycoon (₹25,000 lifetime) · 19. Treat Yourself (₹2,000 lifetime) · 20. Round on Me (paid for a group bill) · 21. Tipper (tipped ×5) · 22. Generous (tipped ₹500 total) · 23. Combo Lover (10 combos) · 24. Upsizer (accepted 10 upsells) · 25. Add-on Addict (added 20 extras).

### Product / Taste (exploration)
26. Coffee King · 27. Tea Connoisseur · 28. Burger Champion · 29. Sweet Tooth (10 desserts) · 30. Cold Brew Crew · 31. Espresso Expert · 32. Smoothie Star · 33. Bakery Buff · 34. Spice Lord (5 spicy items) · 35. Vegan Voyager · 36. Sandwich Specialist · 37. Mocktail Mixer · 38. Pizza Pro · 39. Pasta Person · 40. Breakfast Boss · 41. Menu Explorer (tried 15 distinct items) · 42. Completionist (tried 50 items) · 43. Seasonal Sipper (tried a seasonal special) · 44. Secret Menu (ordered a hidden item) · 45. Decaf Diplomat.

### Games (engagement)
46. First Game · 47. Gamer (played 20 games) · 48. Game Addict (100 games) · 49. Lucky (won a spin jackpot) · 50. Trivia Whiz (10 trivia wins) · 51. Speed Demon (Fast-Tap high score) · 52. Memory Master · 53. Room Host (created 5 rooms) · 54. Room Champion (won a multiplayer match) · 55. Undefeated (3 multiplayer wins in a row) · 56. Co-op Hero (won a co-op game) · 57. Daily Player (played daily ×7) · 58. Quiz Genius (perfect quiz) · 59. Wheel Spinner (50 spins) · 60. Scratch Master (50 cards).

### Social / Community
61. Friend Bringer (referred 1) · 62. Connector (referred 3) · 63. Influencer (referred 10) · 64. Squad Goals (visited with 4+ friends) · 65. Top Reviewer (10 reviews) · 66. Critic (50 reviews) · 67. Photographer (uploaded 5 food pics) · 68. Storyteller (shared to social ×5) · 69. Leaderboard Top 10 · 70. Leaderboard #1 · 71. Cheerleader (cheered others) · 72. Caption King (won caption battle).

### Time / Event / Seasonal
73. Birthday Bash (visited on birthday) · 74. Festive Spirit (Diwali visit) · 75. New Year Newbie (Jan 1 visit) · 76. Valentine (Feb 14 visit) · 77. Holi Hues · 78. Independence Day · 79. Monsoon Member · 80. Summer Cooler (5 cold drinks in summer) · 81. Winter Warmer (5 hot drinks in winter) · 82. Happy Hour Hunter (5 happy-hour visits) · 83. Launch Day (visited on opening week) · 84. Cricket Fan (visited during a match-day offer).

### Behavior / Missions / Meta
85. Profile Pro (completed profile) · 86. Notification Nerd (opted into WhatsApp) · 87. Check-in Champ (30 check-ins) · 88. Mystery Hunter (opened 10 mystery boxes) · 89. Coupon Collector (redeemed 10 coupons) · 90. Saver (saved ₹500 via rewards) · 91. Mission Complete (finished a weekly mission) · 92. Mission Master (finished 10 missions) · 93. Tier Climber (reached Gold) · 94. VIP (reached VIP) · 95. Feedback Friend (answered 5 surveys) · 96. Punctual (used skip-the-wait) · 97. Eco Hero (declined cutlery/used reusable cup ×10) · 98. Zero Waste Warrior · 99. Brand Ambassador (referred + reviewed + shared) · 100. Founder's Circle (one of first 100 members of the cafe) · 101. Legend (earned 50 badges) · 102. Completionist Supreme (all badges).

> Badges are configurable per tenant: criteria stored as JSON in `badges.criteria`, evaluated by an event-driven badge engine (on order settled / game won / check-in, etc.).

---

## 7. Leaderboards & Rankings
- **Periods:** daily, weekly, monthly, all-time (Redis sorted sets per outlet).
- **Metrics:** points earned, visits, games won, ₹ spent (optional/private).
- **Display:** Top 10 with avatars + badges; "your rank"; movement arrows.
- **Resets:** weekly/monthly with a podium reward (top 3 get coupons) → recurring re-engagement hook.
- **Privacy:** opt-in display names/avatars; spend never shown publicly.

---

## 8. Referral System (viral loops)
- Every customer gets a unique `referral_code` + shareable WhatsApp link/QR.
- **Friend (new):** instant welcome coupon (e.g. ₹50 off first order).
- **Referrer:** points + bonus **only after the friend's first qualified order** (anti-abuse).
- **Milestone multipliers:** refer 3 → free drink; refer 10 → VIP fast-track.
- **Viral loop design:**
  1. Win a game → "Share your win to give a friend ₹50 & earn 50 pts."
  2. Group bill → "Split & invite tablemates" auto-creates referrals.
  3. Leaderboard → "Invite a rival to beat you."
  4. Birthday → "Invite friends to your birthday treat, everyone gets a perk."
- Fraud guards: referred user must be a new phone, first order ≥ threshold, device/IP de-dup.

---

## 9. Birthday & Special Events
| Trigger | Reward / Mechanic |
|---------|-------------------|
| **Birthday** | Free combo/dessert coupon (valid birthday week) + "Birthday Bash" badge + WhatsApp wish |
| **Anniversary** (join date) | Bonus points + nostalgia card "you've visited N times this year" |
| **Festivals** (Diwali, Holi, Eid, Christmas, Pongal, regional) | Themed games, themed scratch cards, festival combos, double points day |
| **Local events** (cricket match, city marathon, college fest) | Geo/time-boxed offers & themed missions |
| **Cafe milestones** (anniversary, 1000th customer) | Community-wide rewards, founder badges |
| **Seasonal missions** | Summer Cooler mission, Monsoon mission — multi-step quests with a grand reward |

Automation: a scheduler scans `customers.birthday/anniversary` daily and enqueues WhatsApp + coupon issuance via the campaigns module.

---

## 10. How each mechanic maps to a growth lever
| Mechanic | Retention | Frequency | AOV | Community |
|----------|:--:|:--:|:--:|:--:|
| Points/tiers | ✅ | ✅ | ✅ | |
| Mini-games | ✅ | ✅ | | |
| Multiplayer rooms | ✅ | | ✅ (group bills) | ✅ |
| Badges/leaderboard | ✅ | ✅ | | ✅ |
| Referral | ✅ | | | ✅ |
| Birthday/events | ✅ | ✅ | ✅ | |
| Streaks/missions | ✅ | ✅ | | |
