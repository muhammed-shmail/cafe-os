'use client';

import { useMemo, useState } from 'react';
import { WORDS, shuffle, type GameWord } from '@/lib/games/words';
import { QUICK_GAME_MAP } from '@/lib/games/registry';
import { useCountdown, useGameComplete } from './useGame';
import { GameResult } from './GameResult';
import type { GameProps } from './types';

/**
 * Malayalam Word Challenge — 60s. Show an English word, pick the matching
 * Malayalam word (or the reverse when the UI is in Malayalam). Builds the
 * Malayalam word DB into a quick recall sprint.
 */
export function WordChallenge({ qs, reload, onExit, onResult, lang }: GameProps) {
  const def = QUICK_GAME_MAP.word_challenge;
  const { complete } = useGameComplete(qs, reload);
  const t = (en: string, ml: string) => (lang === 'ml' ? ml : en);

  const [round, setRound] = useState(0);
  const deck = useMemo(() => shuffle(WORDS), [round]);
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [reward, setReward] = useState<{ coins: number; points: number; awarded: boolean } | null>(null);

  function restart() { setRound((r) => r + 1); setI(0); setScore(0); setPick(null); setReward(null); setDone(false); }

  const word = deck[i % deck.length]!;
  const options = useMemo<GameWord[]>(() => shuffle([word, ...shuffle(WORDS.filter((w) => w.en !== word.en)).slice(0, 3)]), [i, round]); // eslint-disable-line react-hooks/exhaustive-deps

  // prompt is in one script, options in the other
  const promptText = lang === 'ml' ? `${word.ml}` : word.en;
  const optText = (o: GameWord) => (lang === 'ml' ? o.en : `${o.ml} · ${o.translit}`);

  async function finish(finalScore: number) {
    setDone(true);
    const r = await complete('word_challenge', finalScore, def.durationSec);
    if (r) { setReward(r); if (r.awarded && r.coins > 0) onResult(`+${r.coins} coins!`, '🪙'); }
  }

  const { left } = useCountdown(def.durationSec, !done, () => finish(score), round);

  function answer(idx: number) {
    if (pick !== null) return;
    setPick(idx);
    const correct = options[idx]!.en === word.en;
    const next = correct ? score + 1 : score;
    if (correct) setScore(next);
    setTimeout(() => {
      setPick(null);
      if (next >= def.maxScore) finish(next);
      else setI((n) => n + 1);
    }, 450);
  }

  if (done) {
    return <GameResult emoji="🔤" title={t('Time!', 'സമയം കഴിഞ്ഞു!')} score={score} max={def.maxScore} reward={reward} lang={lang} onAgain={restart} onExit={onExit} />;
  }

  return (
    <div className="g-wrap">
      <div className="g-bar"><button className="g-back" onClick={onExit}>←</button><h3>🔤 {t('Word Challenge', 'വാക്ക് ചലഞ്ച്')}</h3><span className={`g-timer ${left <= 10 ? 'warn' : ''}`}>{left}s</span></div>
      <div className="g-stage">
        <span className="g-score">{t('Score', 'സ്കോർ')}: {score}</span>
        <p className="g-prompt">{promptText}<small>{lang === 'ml' ? t('English?', 'ഇംഗ്ലീഷ്?') : 'in Malayalam?'}</small></p>
        <div className="g-opts">
          {options.map((o, idx) => (
            <button key={o.en} className={`g-opt ${pick !== null && o.en === word.en ? 'right' : ''} ${pick === idx && o.en !== word.en ? 'wrong' : ''}`} onClick={() => answer(idx)}>{optText(o)}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
