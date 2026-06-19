'use client';

import { useEffect, useState } from 'react';
import { QUICK_GAMES, type QuickGameKey } from '@/lib/games/registry';
import { gamesCss } from './gamesCss';
import type { Lang } from './types';
import { SpinWheel } from './SpinWheel';
import { Imposter } from './Imposter';
import { EmojiGuess } from './EmojiGuess';
import { WordChallenge } from './WordChallenge';
import { QuickQuiz } from './QuickQuiz';
import { SpotDifference } from './SpotDifference';
import { MemoryFlip } from './MemoryFlip';

type HubCtx = { spinsLeft: number; customer: { coins: number; points: number } | null };

type View = 'hub' | 'spin' | QuickGameKey;

/**
 * Quick Cafe Games hub — the Play tab. A grid of short, self-ending games plus
 * the existing Spin the Wheel. Languge + light/dark are local to the hub so the
 * games can be played in Malayalam on a dark "roast" skin without touching the
 * rest of the PWA. Architecture is registry-driven: adding the 7th game is one
 * entry in QUICK_GAMES + one line in the switch below.
 */
export function GamesHub({ ctx, qs, onResult, reload }: {
  ctx: HubCtx;
  qs: string;
  onResult: (m: string, e: string) => void;
  reload: () => void;
}) {
  const [view, setView] = useState<View>('hub');
  const [lang, setLang] = useState<Lang>('en');
  const [dark, setDark] = useState(false);
  const [played, setPlayed] = useState<Record<string, boolean>>({});

  // which games still have a paid play left this visit (for the ✓ badge)
  useEffect(() => {
    let alive = true;
    fetch(`/api/customer/games/complete${qs}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive && d?.played) setPlayed(d.played); }).catch(() => {});
  }, [qs, view]);

  const common = { qs, reload, onExit: () => setView('hub'), onResult, lang };

  return (
    <div data-skin={dark ? 'roast' : undefined} className="g-wrap">
      {view === 'hub' && (
        <>
          <div className="gh-head">
            <div>
              <h3>{lang === 'ml' ? 'കളികൾ' : 'Quick Games'}</h3>
              <span className="gh-sub">{lang === 'ml' ? 'കാത്തിരിപ്പിന് ഒരു രസം · കോയിൻ നേടൂ' : 'A bite-sized game while you wait · earn coins'}</span>
            </div>
            <button className="gh-skin" onClick={() => setLang((l) => (l === 'en' ? 'ml' : 'en'))} title="Language">{lang === 'en' ? 'അ' : 'A'}</button>
            <button className="gh-skin" onClick={() => setDark((d) => !d)} title="Theme">{dark ? '☀️' : '🌙'}</button>
          </div>

          <button className="gh-card" style={{ minHeight: 96 }} onClick={() => setView('spin')}>
            <div className="gh-meta"><span className="gh-emoji">🎡</span></div>
            <b>Spin the Wheel</b>
            <span className="gh-blurb">{ctx.spinsLeft > 0 ? '1 free spin waiting →' : 'Come back next visit'}</span>
            <div className="gh-strip" style={{ background: 'var(--turmeric)' }} />
          </button>

          <div className="gh-grid">
            {QUICK_GAMES.map((g) => (
              <button key={g.key} className="gh-card" onClick={() => setView(g.key)}>
                {played[g.key] && <span className="gh-done">✓ Played</span>}
                <span className="gh-emoji">{g.emoji}</span>
                <b>{lang === 'ml' ? g.nameMl : g.name}</b>
                <span className="gh-blurb">{g.blurb}</span>
                <div className="gh-meta">
                  <span className="gh-chip">⏱ {g.durationSec}s</span>
                  <span className="gh-chip coin">🪙 ≤{g.maxCoins}</span>
                  {g.maxPlayers > 1 && <span className="gh-chip">👥 {g.minPlayers}–{g.maxPlayers}</span>}
                </div>
                <div className="gh-strip" style={{ background: g.accent }} />
              </button>
            ))}
          </div>

          <p className="gh-note">{lang === 'ml' ? '🪙 ഒരു സന്ദർശനത്തിൽ ഓരോ കളിക്കും ഒരിക്കൽ കോയിൻ · കളി സ്വയം അവസാനിക്കും' : '🪙 One coin payout per game per visit · every game ends on its own timer'}</p>
        </>
      )}

      {view === 'spin' && (
        <SpinWheel qs={qs} spinsLeft={ctx.spinsLeft} coins={ctx.customer?.coins ?? 0} points={ctx.customer?.points ?? 0} onResult={onResult} reload={reload} onExit={() => setView('hub')} />
      )}

      {view === 'imposter' && <Imposter {...common} />}
      {view === 'emoji_guess' && <EmojiGuess {...common} />}
      {view === 'word_challenge' && <WordChallenge {...common} />}
      {view === 'quick_quiz' && <QuickQuiz {...common} />}
      {view === 'spot_difference' && <SpotDifference {...common} />}
      {view === 'memory_flip' && <MemoryFlip {...common} />}

      <style>{gamesCss}</style>
    </div>
  );
}
