# 06 — Retention Engine & AI Assistants

## Part A — 50+ Innovative Retention Features

Organized by psychological driver. Each is a hook that pulls the customer back.

### Habit & Streaks
1. **Daily Check-in** — open the app/scan once a day for points; streak multiplier.
2. **Visit Streaks** — visit N days/weeks in a row → escalating rewards.
3. **Streak Insurance** — spend coins to "freeze" a streak if you miss a day (loss aversion).
4. **Coffee of the Day stamp** — collect 7 stamps in a week → free coffee.
5. **Morning Ritual** — bonus points before 10am to build a daily habit.
6. **Punch Card 2.0** — digital "buy 9 get 10th free", visible progress ring.

### Surprise & Variable Reward
7. **Mystery Reward Box** — open once per visit; randomized perk (dopamine).
8. **Lucky Receipt** — random bills win an instant reward ("this one's on us").
9. **Golden Ticket** — rare hidden win across the customer base → big prize + PR.
10. **Surprise Upgrade** — randomly upsize a drink free.
11. **Mystery Menu Monday** — secret discounted item revealed only in-app.
12. **Reward Roulette at checkout** — small spin every paid order.

### Status & Progression
13. **VIP Tiers** (Bronze→VIP) with visible progress bars.
14. **Seasonal Missions** — quarterly quests with a grand prize.
15. **Weekly Missions** — "order 2 coffees + play 1 game = bonus."
16. **Personal Records** — "your longest streak," "most visits in a month."
17. **Tier-locked perks** — skip-the-queue, secret menu for Gold+.
18. **XP & Levels** — every action gives XP; leveling unlocks cosmetics/titles.

### Membership & Subscription
19. **Monthly Coffee Pass** — ₹X/month for 1 coffee/day (prepaid frequency lock-in).
20. **Cafe Club Membership** — annual fee → permanent 10% + perks.
21. **Prepaid Wallet with bonus** — load ₹1,000, get ₹1,100 (cash upfront, lock-in).
22. **Family/Group Plan** — shared points across linked accounts.

### Personalization
23. **"Your Usual"** — one-tap reorder of the most-ordered item.
24. **Smart Recommendations** — "based on your taste, try…".
25. **Personal Offers** — discounts on items you love (or to win back lapsing tastes).
26. **Name on the cup, digitally** — personalized greeting on PWA home.
27. **Taste Profile** — fun quiz that tailors menu + offers.
28. **Weather-aware offers** — cold brew on hot days, hot choco when it rains.

### Win-back & Lifecycle (mostly AI/automation-driven, see Part B)
29. **Lapse Win-back** — "We miss you, here's ₹75" after X days absent.
30. **Birthday & Anniversary rewards** (see [05](05-GAMIFICATION-AND-SOCIAL.md)).
31. **Abandoned visit nudge** — scanned QR but didn't order → gentle offer.
32. **Post-visit thank-you** with a return coupon valid 7 days.
33. **"Almost there" nudge** — "80 points to your free dessert."
34. **Tier-drop warning** — "2 visits to keep Gold this month."

### Social & Community
35. **Leaderboards & Badges** (see [05](05-GAMIFICATION-AND-SOCIAL.md)).
36. **Refer-a-friend loops.**
37. **Cafe Community Feed** — photos, reviews, shout-outs.
38. **Group challenges** — "the cafe community drinks 1000 coffees this week → everyone gets a perk."
39. **Customer of the Month** — featured on a screen + reward.
40. **User-generated content rewards** — post a photo, tag the cafe → points.

### Wait-time & Experience (the signature)
41. **Order-Tracking Entertainment** (detailed below).
42. **Live kitchen progress bar** — turns anxiety into anticipation.
43. **Wait-time mini-challenge** — "beat this before your order's ready."
44. **Fun facts & brand story** during the wait.
45. **Limited-time wait offers** — "add a cookie for ₹20, only while you wait."

### Feedback & Care
46. **In-app feedback for points** — catch problems before bad reviews.
47. **"Make it right" instant recovery** — low rating → instant apology coupon.
48. **Suggestion box with voting** — customers vote on next menu item.
49. **Allergy/preference memory** — remembered across visits.

### Eco & Values
50. **Eco rewards** — bring a reusable cup / decline cutlery → green points + badge.
51. **Round-up to donate** — round bill up to charity, earn a "kind" badge.
52. **Loyalty for sustainability** — track CO₂/cups saved, gamified.

### Convenience
53. **Skip-the-wait pre-order** — order before arriving (Gold+ perk).
54. **Pay-at-table / scan-to-pay** — split, tip, leave without flagging staff.
55. **Save favorite table / barista.**

> Pick 8–10 of these for MVP (see [09](09-ROADMAP-MVP.md)); the rest are a long retention roadmap that keeps the product fresh quarter after quarter.

---

### Order-Tracking Entertainment (signature differentiator) — detail

While the order cooks, the PWA's order screen is a **rotating engagement carousel**, not a static spinner:

```
┌──────────────────────────────────────────┐
│  Your order • Table 3        ETA ~6 min   │
│  ●───●───○───○   Received→Preparing→...    │   ← live kitchen progress bar (WS)
├──────────────────────────────────────────┤
│  [ rotating cards every ~12s ]            │
│  ☕ Fun fact: espresso has LESS caffeine   │
│     than drip, per serving.               │
│  📖 Our story: we started in a garage in  │
│     2019 with one second-hand machine...  │
│  🎮 Got 60 seconds? Beat 'Bean Catch' →   │
│  🔥 While you wait: add a brownie ₹30 →    │  ← revenue card
│  🏆 You're #4 on this week's leaderboard   │
└──────────────────────────────────────────┘
```

Cards: kitchen progress · live status · fun facts · brand story · mini-challenge · limited-time wait offer · loyalty nudge. **This converts dead time into measurable revenue + engagement** — the single clearest line between "POS" and "Growth OS."

---

## Part B — AI Assistants (Claude-powered)

All three are **server-side Claude (Anthropic API) with tool-use**: Claude reasons, calls our read-only analytics tools to pull real numbers, then returns plain-language, India-context answers. Use **Opus 4.8** for the reasoning-heavy assistants and **Haiku 4.5** for cheap, high-volume tasks (classification, short copy, intent routing). Use **prompt caching** on the schema/system context to cut cost, and run everything async via BullMQ.

### B.1 AI Sales Assistant
**Answers questions like:** "Why are sales down this week?" · "What's performing well?" · "What should I promote tomorrow?"

**How:** Claude is given tools `get_sales(range)`, `compare_periods()`, `get_top_items()`, `get_slow_items()`, `get_dayparts()`, `get_weather()`, `get_footfall()`. It investigates (e.g., notices Tue–Wed dip correlates with rain + a slow dessert), then returns:
```json
{
  "summary": "Sales down 12% WoW, driven by weekday evenings.",
  "findings": [
    "Evening footfall fell 20% on Tue/Wed (rainy).",
    "Cold beverages -30% (temperature drop).",
    "Desserts unchanged — your strength."
  ],
  "recommendations": [
    "Push a 'Rainy Evening combo' (hot drink + brownie) 5–8pm via WhatsApp.",
    "Pause cold-brew promo; promote hot beverages this week."
  ]
}
```
Also a **proactive Morning Briefing** (`/ai/insights/daily`): a daily WhatsApp/dashboard digest of what happened + 3 actions.

### B.2 AI Inventory Assistant
**Predicts:** future demand, stock requirements, waste-reduction opportunities.

**How:** combines historical `item_sales_rollup`, recipe BOM, day-of-week/seasonality/festival calendar, and weather. Produces:
- **Demand forecast** per item for the next N days (e.g., "Sat espresso demand ↑ 35%").
- **Auto reorder suggestions** → draft Purchase Orders ("order 4kg beans by Thu; lead time 2 days").
- **Waste insights** ("croissant waste = ₹2,400/mo; bake 30% fewer after 6pm or run an evening 'last batch' offer").
- **Expiry watch** ("milk expiring in 2 days, current run-rate won't clear it → push a latte offer").

Forecasting = statistical baseline (moving average + seasonality) with Claude as the **explainer & action-recommender** on top, so it's transparent and cheap, not a black box.

### B.3 AI Marketing Assistant
**Auto-generates:** WhatsApp campaigns, SMS, push notifications, loyalty campaigns.

**How:** given a goal ("win back lapsed customers") + segment + channel, Claude drafts on-brand, India-context copy (Hinglish optional), picks the audience via segment rules, suggests timing, and proposes the offer — owner approves with one tap.
- **Auto-segmentation:** "lapsed 30d", "high-value at risk", "birthday this week", "tried coffee but never dessert".
- **Campaign templates:** win-back, birthday, festival, new-item launch, slow-hour filler, weekend booster.
- **Optimization:** learns which copy/offer/time drives redemptions; A/B tests subject lines; reports ROI ("₹4,200 spend → ₹38,000 attributed revenue").
- **Auto-pilot mode (Pro+):** triggers lifecycle messages automatically (post-visit thank-you, lapse win-back, "almost there" nudge) within owner-set guardrails (max msgs/customer/week, max discount).

### Guardrails across all AI
- Read-only tools; AI never mutates data without explicit owner approval.
- All AI suggestions logged & explainable (shows the numbers behind the claim).
- Cost controls: model tiering, prompt caching, async batching, per-tenant token budgets.
- Privacy: customer PII not sent to the model — only aggregates/segment IDs.
