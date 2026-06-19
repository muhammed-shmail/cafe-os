'use client';

import { useMemo, useState } from 'react';
import { EMOJI_WORDS, shuffle } from '@/lib/games/words';
import { QUICK_GAME_MAP } from '@/lib/games/registry';
import { useCountdown, useGameComplete } from './useGame';
import { GameResult } from './GameResult';
import type { GameProps } from './types';

const EMOJIS = Array.from(new Set(EMOJI_WORDS.map((w) => w.emoji!)));

type Card = { id: number; emoji: string };

function makeDeck(pairs: number): Card[] {
  const chosen = shuffle(EMOJIS).slice(0, pairs);
  return shuffle(chosen.flatMap((e, i) => [{ id: i * 2, emoji: e }, { id: i * 2 + 1, emoji: e }]));
}

/** Memory Flip — match the cafe emoji pairs before the 60s timer. */
export function MemoryFlip({ qs, reload, onExit, onResult, lang }: GameProps) {
  const def = QUICK_GAME_MAP.memory_flip;
  const pairs = def.maxScore;
  const { complete } = useGameComplete(qs, reload);
  const t = (en: string, ml: string) => (lang === 'ml' ? ml : en);

  const [round, setRound] = useState(0);
  const deck = useMemo(() => makeDeck(pairs), [round, pairs]);
  const [flipped, setFlipped] = useState<number[]>([]); // indices currently face-up (unmatched)
  const [matched, setMatched] = useState<Set<string>>(new Set()); // matched emojis
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [reward, setReward] = useState<{ coins: number; points: number; awarded: boolean } | null>(null);

  const score = matched.size;

  function restart() { setRound((r) => r + 1); setFlipped([]); setMatched(new Set()); setBusy(false); setReward(null); setDone(false); }

  async function finish(finalScore: number) {
    setDone(true);
    const r = await complete('memory_flip', finalScore, def.durationSec);
    if (r) { setReward(r); if (r.awarded && r.coins > 0) onResult(`+${r.coins} coins!`, '🪙'); }
  }

  const { left } = useCountdown(def.durationSec, !done, () => finish(score), round);

  function flip(idx: number) {
    if (busy || done) return;
    const card = deck[idx]!;
    if (matched.has(card.emoji) || flipped.includes(idx)) return;
    const next = [...flipped, idx];
    setFlipped(next);
    if (next.length === 2) {
      setBusy(true);
      const [a, b] = next;
      const match = deck[a!]!.emoji === deck[b!]!.emoji;
      setTimeout(() => {
        if (match) {
          const m = new Set(matched).add(deck[a!]!.emoji);
          setMatched(m);
          if (m.size >= pairs) finish(m.size);
        }
        setFlipped([]);
        setBusy(false);
      }, match ? 350 : 700);
    }
  }

  if (done) {
    return <GameResult emoji="🃏" title={score >= pairs ? t('Cleared!', 'പൂർത്തിയായി!') : t('Time!', 'സമയം കഴിഞ്ഞു!')} score={score} max={pairs} reward={reward} lang={lang} onAgain={restart} onExit={onExit} />;
  }

  return (
    <div className="g-wrap">
      <div className="g-bar"><button className="g-back" onClick={onExit}>←</button><h3>🃏 {t('Memory Flip', 'മെമ്മറി ഫ്ലിപ്പ്')}</h3><span className={`g-timer ${left <= 10 ? 'warn' : ''}`}>{left}s</span></div>
      <p className="g-prompt" style={{ fontSize: 16 }}>{t('Match the pairs', 'ജോഡികൾ ചേർക്കൂ')}<small>{score}/{pairs} {t('pairs', 'ജോഡികൾ')}</small></p>
      <div className="g-grid-board" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {deck.map((c, idx) => {
          const isUp = flipped.includes(idx) || matched.has(c.emoji);
          return (
            <button key={c.id} className={`g-tile ${matched.has(c.emoji) ? 'matched' : isUp ? 'flipped' : 'hide'}`} onClick={() => flip(idx)}>{isUp ? c.emoji : '?'}</button>
          );
        })}
      </div>
    </div>
  );
}
