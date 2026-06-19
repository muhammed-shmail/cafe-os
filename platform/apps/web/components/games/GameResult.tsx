'use client';

import type { GameReward } from './useGame';
import type { Lang } from './types';

/** Shared end-of-round card for the solo games (score + server reward). */
export function GameResult({ emoji, title, score, max, reward, lang, onAgain, onExit }: {
  emoji: string;
  title: string;
  score: number;
  max: number;
  reward: { coins: number; points: number; awarded: boolean } | null;
  lang: Lang;
  onAgain: () => void;
  onExit: () => void;
}) {
  const t = (en: string, ml: string) => (lang === 'ml' ? ml : en);
  return (
    <div className="g-result">
      <span className="g-medal">{emoji}</span>
      <h4>{title}</h4>
      <p className="g-muted">{t('You scored', 'നിങ്ങളുടെ സ്കോർ')} <b>{score}/{max}</b></p>
      {reward && (
        <div className="g-reward">
          {reward.awarded ? <span className="coin">🪙 +{reward.coins}</span> : <span>🔁 {t('Practice round', 'പ്രാക്ടീസ്')}</span>}
          {reward.awarded && reward.points > 0 && <span>★ +{reward.points}</span>}
        </div>
      )}
      {reward && !reward.awarded && <p className="g-muted">{t('Coins already earned this visit — play for fun!', 'ഈ സന്ദർശനത്തിൽ കോയിൻ നേടിക്കഴിഞ്ഞു — രസത്തിന് കളിക്കൂ!')}</p>}
      <div className="g-btn-row">
        <button className="g-btn ghost" onClick={onExit}>{t('Back to games', 'കളികളിലേക്ക്')}</button>
        <button className="g-btn" onClick={onAgain}>{t('Play again', 'വീണ്ടും')}</button>
      </div>
    </div>
  );
}
