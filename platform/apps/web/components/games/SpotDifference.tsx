'use client';

import { useMemo, useState } from 'react';
import { EMOJI_WORDS, shuffle } from '@/lib/games/words';
import { QUICK_GAME_MAP } from '@/lib/games/registry';
import { useCountdown, useGameComplete } from './useGame';
import { GameResult } from './GameResult';
import type { GameProps } from './types';

const EMOJIS = Array.from(new Set(EMOJI_WORDS.map((w) => w.emoji!)));

type Board = { tiles: string[]; odd: number; cols: number };

function makeBoard(level: number): Board {
  const [base, diff] = shuffle(EMOJIS);
  const count = Math.min(20, 8 + level * 2); // grows with level
  const cols = count <= 9 ? 3 : 4;
  const odd = Math.floor(Math.random() * count);
  const tiles = Array.from({ length: count }, (_, i) => (i === odd ? diff! : base!));
  return { tiles, odd, cols };
}

/** Spot the Difference — find the one odd emoji in the grid. 60s, 5 rounds. */
export function SpotDifference({ qs, reload, onExit, onResult, lang }: GameProps) {
  const def = QUICK_GAME_MAP.spot_difference;
  const { complete } = useGameComplete(qs, reload);
  const t = (en: string, ml: string) => (lang === 'ml' ? ml : en);

  const [round, setRound] = useState(0);
  const [level, setLevel] = useState(0);
  const [score, setScore] = useState(0);
  const [wrong, setWrong] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [reward, setReward] = useState<{ coins: number; points: number; awarded: boolean } | null>(null);

  const board = useMemo(() => makeBoard(level), [level, round]);

  function restart() { setRound((r) => r + 1); setLevel(0); setScore(0); setWrong(null); setReward(null); setDone(false); }

  async function finish(finalScore: number) {
    setDone(true);
    const r = await complete('spot_difference', finalScore, def.durationSec);
    if (r) { setReward(r); if (r.awarded && r.coins > 0) onResult(`+${r.coins} coins!`, '🪙'); }
  }

  const { left } = useCountdown(def.durationSec, !done, () => finish(score), round);

  function tap(idx: number) {
    if (done) return;
    if (idx === board.odd) {
      const next = score + 1;
      setScore(next);
      setWrong(null);
      if (next >= def.maxScore) finish(next);
      else setLevel((l) => l + 1);
    } else {
      setWrong(idx);
      setTimeout(() => setWrong(null), 300);
    }
  }

  if (done) {
    return <GameResult emoji="🔍" title={t('Time!', 'സമയം കഴിഞ്ഞു!')} score={score} max={def.maxScore} reward={reward} lang={lang} onAgain={restart} onExit={onExit} />;
  }

  return (
    <div className="g-wrap">
      <div className="g-bar"><button className="g-back" onClick={onExit}>←</button><h3>🔍 {t('Spot it', 'കണ്ടെത്തൂ')}</h3><span className={`g-timer ${left <= 10 ? 'warn' : ''}`}>{left}s</span></div>
      <p className="g-prompt" style={{ fontSize: 16 }}>{t('Tap the odd one', 'വ്യത്യസ്തമായത് തൊടൂ')}<small>{t('Found', 'കണ്ടെത്തി')} {score}/{def.maxScore}</small></p>
      <div className="g-grid-board" style={{ gridTemplateColumns: `repeat(${board.cols}, 1fr)` }}>
        {board.tiles.map((e, idx) => (
          <button key={idx} className={`g-tile ${wrong === idx ? 'wrong' : ''}`} onClick={() => tap(idx)}>{e}</button>
        ))}
      </div>
    </div>
  );
}
