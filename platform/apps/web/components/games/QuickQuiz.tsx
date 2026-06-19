'use client';

import { useMemo, useState } from 'react';
import { pickQuiz } from '@/lib/games/trivia';
import { QUICK_GAME_MAP } from '@/lib/games/registry';
import { useCountdown, useGameComplete } from './useGame';
import { GameResult } from './GameResult';
import type { GameProps } from './types';

/** Quick Quiz — 5 Kerala/cafe questions in 30 seconds. */
export function QuickQuiz({ qs, reload, onExit, onResult, lang }: GameProps) {
  const def = QUICK_GAME_MAP.quick_quiz;
  const { complete } = useGameComplete(qs, reload);
  const t = (en: string, ml: string) => (lang === 'ml' ? ml : en);

  const [round, setRound] = useState(0);
  const quiz = useMemo(() => pickQuiz(def.maxScore), [round]); // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [reward, setReward] = useState<{ coins: number; points: number; awarded: boolean } | null>(null);

  function restart() { setRound((r) => r + 1); setI(0); setScore(0); setPick(null); setReward(null); setDone(false); }

  const q = quiz[i];

  async function finish(finalScore: number) {
    setDone(true);
    const r = await complete('quick_quiz', finalScore, def.durationSec);
    if (r) { setReward(r); if (r.awarded && r.coins > 0) onResult(`+${r.coins} coins!`, '🪙'); }
  }

  const { left } = useCountdown(def.durationSec, !done, () => finish(score), round);

  function answer(idx: number) {
    if (pick !== null || !q) return;
    setPick(idx);
    const correct = idx === q.answer;
    const next = correct ? score + 1 : score;
    if (correct) setScore(next);
    setTimeout(() => {
      setPick(null);
      if (i + 1 >= quiz.length) finish(next);
      else setI((n) => n + 1);
    }, 550);
  }

  if (done || !q) {
    return <GameResult emoji="⚡" title={t('Done!', 'കഴിഞ്ഞു!')} score={score} max={def.maxScore} reward={reward} lang={lang} onAgain={restart} onExit={onExit} />;
  }

  return (
    <div className="g-wrap">
      <div className="g-bar"><button className="g-back" onClick={onExit}>←</button><h3>⚡ {t('Quick Quiz', 'ക്വിക്ക് ക്വിസ്')}</h3><span className={`g-timer ${left <= 8 ? 'warn' : ''}`}>{left}s</span></div>
      <div className="g-stage">
        <span className="g-score">{i + 1}/{quiz.length} · {t('Score', 'സ്കോർ')} {score}</span>
        <p className="g-prompt">{lang === 'ml' ? q.qMl : q.q}{lang !== 'ml' && <small>{q.qMl}</small>}</p>
        <div className="g-opts">
          {q.options.map((o, idx) => (
            <button key={idx} className={`g-opt ${pick !== null && idx === q.answer ? 'right' : ''} ${pick === idx && idx !== q.answer ? 'wrong' : ''}`} onClick={() => answer(idx)}>{o}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
