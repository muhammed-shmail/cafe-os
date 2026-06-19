/**
 * Shared styles for the Quick Cafe Games. One stylesheet imported by the hub +
 * every game, in the same inline-<style> pattern the rest of the PWA uses. All
 * colours come from the design tokens so light/dark (the `roast` skin) just work.
 */
export const gamesCss = `
/* ---- hub ---- */
.gh-head { display: flex; align-items: center; gap: 10px; }
.gh-head h3 { font-size: 24px; margin: 0; }
.gh-head .gh-sub { font-size: 12px; color: var(--ink-3); font-weight: 600; }
.gh-skin { margin-left: auto; width: 38px; height: 38px; border-radius: 12px; border: 1px solid var(--line); background: var(--paper-3); font-size: 17px; cursor: pointer; }
.gh-note { font-size: 11px; color: var(--ink-3); text-align: center; line-height: 1.5; }
.gh-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.gh-card { position: relative; text-align: left; padding: 14px; border-radius: 18px; border: 1px solid var(--line); background: var(--paper-3); cursor: pointer; display: flex; flex-direction: column; gap: 6px; min-height: 132px; box-shadow: var(--sh-1); transition: transform .12s, box-shadow .12s; overflow: hidden; }
.gh-card:hover { transform: translateY(-2px); box-shadow: var(--sh-2); }
.gh-card:disabled { cursor: default; opacity: 1; }
.gh-emoji { font-size: 30px; line-height: 1; }
.gh-card b { font-size: 14px; line-height: 1.15; }
.gh-card .gh-ml { font-size: 11px; color: var(--ink-3); font-weight: 700; }
.gh-card .gh-blurb { font-size: 11px; color: var(--ink-3); margin-top: auto; line-height: 1.35; }
.gh-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.gh-chip { font-size: 9.5px; font-weight: 800; padding: 2px 7px; border-radius: 99px; background: var(--paper); border: 1px solid var(--line); color: var(--ink-2); }
.gh-chip.coin { background: color-mix(in srgb, var(--turmeric) 16%, var(--paper-3)); border-color: transparent; color: var(--turmeric-d); }
.gh-done { position: absolute; top: 8px; right: 8px; font-size: 9px; font-weight: 800; padding: 2px 7px; border-radius: 99px; background: var(--cardamom); color: #fff; }
.gh-strip { height: 4px; border-radius: 99px; margin-top: 2px; }

/* ---- shared game frame ---- */
.g-wrap { display: flex; flex-direction: column; gap: 16px; min-height: 100%; }
.g-bar { display: flex; align-items: center; gap: 10px; }
.g-back { width: 36px; height: 36px; border-radius: 11px; border: 1px solid var(--line); background: var(--paper-3); font-size: 16px; cursor: pointer; }
.g-bar h3 { margin: 0; font-size: 19px; }
.g-timer { margin-left: auto; font-variant-numeric: tabular-nums; font-weight: 800; font-size: 15px; padding: 6px 12px; border-radius: 99px; background: var(--ink); color: var(--paper-2); min-width: 58px; text-align: center; }
.g-timer.warn { background: var(--clay); animation: gpulse 1s infinite; }
@keyframes gpulse { 50% { opacity: .55; } }
.g-progress { height: 6px; border-radius: 99px; background: var(--line); overflow: hidden; }
.g-progress i { display: block; height: 100%; background: linear-gradient(90deg, var(--turmeric), var(--clay)); transition: width 1s linear; }

.g-stage { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; text-align: center; }
.g-big { font-size: 64px; line-height: 1; }
.g-prompt { font-size: 22px; font-weight: 800; font-family: var(--font-display); }
.g-prompt small { display: block; font-size: 13px; color: var(--ink-3); font-weight: 700; margin-top: 4px; font-family: var(--font-body); }
.g-score { font-weight: 800; font-size: 13px; }

.g-opts { display: grid; gap: 10px; width: 100%; }
.g-opt { padding: 15px; border-radius: 14px; border: 1.5px solid var(--line); background: var(--paper-3); font-weight: 700; font-size: 15px; cursor: pointer; transition: transform .08s; }
.g-opt:active { transform: scale(.98); }
.g-opt.right { background: color-mix(in srgb, var(--cardamom) 20%, var(--paper-3)); border-color: var(--cardamom); }
.g-opt.wrong { background: color-mix(in srgb, var(--clay) 18%, var(--paper-3)); border-color: var(--clay); }

.g-btn { width: 100%; padding: 15px; border-radius: 16px; border: none; cursor: pointer; font-weight: 800; font-size: 16px; font-family: var(--font-body); background: linear-gradient(100deg, var(--clay), var(--turmeric-d)); color: #fff; box-shadow: var(--sh-2); }
.g-btn.ghost { background: var(--paper-3); color: var(--ink); border: 1px solid var(--line); box-shadow: none; }
.g-btn:disabled { opacity: .5; cursor: default; }
.g-btn-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

/* ---- result card ---- */
.g-result { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 8px; }
.g-result .g-medal { font-size: 56px; }
.g-result h4 { font-size: 22px; margin: 0; }
.g-reward { display: flex; gap: 10px; }
.g-reward span { font-weight: 800; font-size: 14px; background: var(--paper-3); border: 1px solid var(--line); padding: 8px 14px; border-radius: 99px; }
.g-reward span.coin { background: color-mix(in srgb, var(--turmeric) 16%, var(--paper-3)); border-color: transparent; color: var(--turmeric-d); }
.g-muted { font-size: 12px; color: var(--ink-3); line-height: 1.5; }

/* ---- imposter ---- */
.imp-setup { display: flex; flex-direction: column; gap: 14px; }
.imp-row { display: flex; flex-direction: column; gap: 8px; }
.imp-row > span { font-size: 12px; font-weight: 800; color: var(--ink-2); }
.imp-chips { display: flex; flex-wrap: wrap; gap: 7px; }
.imp-chip { padding: 9px 14px; border-radius: 99px; border: 1.5px solid var(--line); background: var(--paper-3); font-weight: 800; font-size: 13px; cursor: pointer; }
.imp-chip.on { background: var(--turmeric); border-color: var(--turmeric-d); color: #2a1607; }
.imp-step { display: flex; align-items: center; justify-content: center; gap: 16px; }
.imp-step button { width: 44px; height: 44px; border-radius: 13px; border: 1px solid var(--line-2); background: var(--paper-3); font-size: 22px; font-weight: 800; cursor: pointer; }
.imp-step b { font-size: 30px; font-family: var(--font-display); min-width: 40px; text-align: center; }
.imp-pass { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; flex: 1; text-align: center; }
.imp-pass .imp-who { font-size: 20px; font-weight: 800; font-family: var(--font-display); }
.imp-card { width: 100%; min-height: 230px; border-radius: 24px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 20px; color: #fff; box-shadow: var(--sh-3); }
.imp-card.word { background: linear-gradient(150deg, #3a2418, var(--ink)); }
.imp-card.spy { background: linear-gradient(150deg, var(--clay), var(--berry)); }
.imp-card .imp-label { font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; opacity: .85; }
.imp-card .imp-word { font-size: 34px; font-weight: 900; font-family: var(--font-display); text-align: center; }
.imp-card .imp-word small { display: block; font-size: 15px; opacity: .8; font-family: var(--font-body); margin-top: 4px; }
.imp-card .imp-emoji { font-size: 46px; }
.imp-hint { font-size: 12px; opacity: .85; max-width: 240px; line-height: 1.45; }
.imp-vote { display: grid; gap: 9px; width: 100%; }
.imp-vote button { padding: 14px; border-radius: 13px; border: 1.5px solid var(--line); background: var(--paper-3); font-weight: 800; font-size: 15px; cursor: pointer; }
.imp-vote button.on { background: var(--berry); border-color: var(--berry); color: #fff; }

/* ---- memory / spot grids ---- */
.g-grid-board { display: grid; gap: 8px; width: 100%; }
.g-tile { aspect-ratio: 1; border-radius: 14px; border: 1px solid var(--line); background: var(--paper-3); font-size: 26px; display: grid; place-items: center; cursor: pointer; user-select: none; transition: transform .1s; }
.g-tile:active { transform: scale(.96); }
.g-tile.flipped { background: color-mix(in srgb, var(--turmeric) 12%, var(--paper-3)); }
.g-tile.matched { background: color-mix(in srgb, var(--cardamom) 20%, var(--paper-3)); border-color: var(--cardamom); cursor: default; }
.g-tile.hide { color: transparent; background: var(--ink); }
.g-tile.found { outline: 3px solid var(--cardamom); outline-offset: -3px; }
`;
