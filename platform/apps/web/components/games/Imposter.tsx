'use client';

import { useMemo, useState } from 'react';
import { WORD_CATEGORIES, pickWords, shuffle, type GameWord, type WordCategory } from '@/lib/games/words';
import { QUICK_GAME_MAP } from '@/lib/games/registry';
import { useCountdown, useGameComplete } from './useGame';
import type { GameProps } from './types';

type Phase = 'setup' | 'reveal' | 'discuss' | 'vote' | 'guess' | 'result';
const DURATIONS = [60, 90, 120];

/**
 * Mini Imposter — single-device pass-and-play. One phone goes around the table:
 * everyone sees the same secret word except one random imposter. After a short
 * timed discussion the group votes; if the imposter is caught they get one last
 * guess. No realtime backend — the whole session lives on this device and ends
 * on the discussion timer, so it can't stretch table time.
 */
export function Imposter({ qs, reload, onExit, onResult, lang }: GameProps) {
  const def = QUICK_GAME_MAP.imposter;
  const { complete } = useGameComplete(qs, reload);

  const [phase, setPhase] = useState<Phase>('setup');
  const [players, setPlayers] = useState(4);
  const [category, setCategory] = useState<WordCategory | 'all'>('all');
  const [discussSec, setDiscussSec] = useState(90);

  // round state (set when the round starts)
  const [secret, setSecret] = useState<GameWord | null>(null);
  const [imposterIdx, setImposterIdx] = useState(0);
  const [decoys, setDecoys] = useState<GameWord[]>([]);

  // pass-and-play reveal cursor
  const [revealIdx, setRevealIdx] = useState(0);
  const [shown, setShown] = useState(false);

  // voting + outcome
  const [accused, setAccused] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<'team' | 'imposter' | null>(null);
  const [reward, setReward] = useState<{ coins: number; points: number; awarded: boolean } | null>(null);

  const t = (en: string, ml: string) => (lang === 'ml' ? ml : en);

  function startRound() {
    const [word] = pickWords(1, category);
    const others = pickWords(4, category).filter((w) => w.en !== word!.en).slice(0, 3);
    setSecret(word!);
    setDecoys(shuffle([word!, ...others]));
    setImposterIdx(Math.floor(Math.random() * players));
    setRevealIdx(0);
    setShown(false);
    setAccused(null);
    setOutcome(null);
    setReward(null);
    setPhase('reveal');
  }

  function nextReveal() {
    if (revealIdx + 1 >= players) { setPhase('discuss'); return; }
    setRevealIdx((i) => i + 1);
    setShown(false);
  }

  async function settle(result: 'team' | 'imposter') {
    setOutcome(result);
    setPhase('result');
    // completing a full round is the achievement; the per-visit cap stops farming
    const r = await complete('imposter', 1, def.durationSec);
    if (r) {
      setReward({ coins: r.coins, points: r.points, awarded: r.awarded });
      if (r.awarded && r.coins > 0) onResult(`+${r.coins} coins!`, '🪙');
    }
  }

  function castVote() {
    if (accused === null) return;
    if (accused === imposterIdx) setPhase('guess'); // caught → final guess
    else settle('imposter'); // wrong accusation → imposter escapes
  }

  // ---- render ----
  return (
    <div className="g-wrap">
      <div className="g-bar">
        <button className="g-back" onClick={onExit}>←</button>
        <h3>🕵️ {t('Mini Imposter', 'മിനി ഇംപോസ്റ്റർ')}</h3>
      </div>

      {phase === 'setup' && (
        <Setup
          players={players} setPlayers={setPlayers}
          category={category} setCategory={setCategory}
          discussSec={discussSec} setDiscussSec={setDiscussSec}
          lang={lang} onStart={startRound}
        />
      )}

      {phase === 'reveal' && secret && (
        <Reveal
          n={players} idx={revealIdx} shown={shown} isImposter={revealIdx === imposterIdx}
          secret={secret} lang={lang} onShow={() => setShown(true)} onNext={nextReveal}
        />
      )}

      {phase === 'discuss' && (
        <Discuss seconds={discussSec} lang={lang} onDone={() => setPhase('vote')} />
      )}

      {phase === 'vote' && (
        <div className="g-wrap">
          <p className="g-prompt">{t('Who is the imposter?', 'ആരാണ് ഇംപോസ്റ്റർ?')}<small>{t('Tap the table’s pick', 'നിങ്ങളുടെ തീരുമാനം തിരഞ്ഞെടുക്കൂ')}</small></p>
          <div className="imp-vote">
            {Array.from({ length: players }).map((_, i) => (
              <button key={i} className={accused === i ? 'on' : ''} onClick={() => setAccused(i)}>{t('Player', 'പ്ലെയർ')} {i + 1}</button>
            ))}
          </div>
          <button className="g-btn" disabled={accused === null} onClick={castVote}>{t('Lock vote', 'വോട്ട് ഉറപ്പിക്കൂ')}</button>
        </div>
      )}

      {phase === 'guess' && secret && (
        <div className="g-wrap">
          <p className="g-prompt">😼 {t('Caught! Imposter, guess the word', 'പിടിച്ചു! ഇംപോസ്റ്റർ വാക്ക് പറയൂ')}<small>{t('One chance', 'ഒരു അവസരം')}</small></p>
          <div className="g-opts">
            {decoys.map((w) => (
              <button key={w.en} className="g-opt" onClick={() => settle(w.en === secret.en ? 'imposter' : 'team')}>
                {lang === 'ml' ? `${w.ml} (${w.translit})` : w.en}
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === 'result' && (
        <Result
          outcome={outcome!} secret={secret!} imposterIdx={imposterIdx} reward={reward}
          lang={lang} onAgain={() => setPhase('setup')} onExit={onExit}
        />
      )}
    </div>
  );
}

function Setup({ players, setPlayers, category, setCategory, discussSec, setDiscussSec, lang, onStart }: {
  players: number; setPlayers: (n: number) => void;
  category: WordCategory | 'all'; setCategory: (c: WordCategory | 'all') => void;
  discussSec: number; setDiscussSec: (n: number) => void;
  lang: 'en' | 'ml'; onStart: () => void;
}) {
  const t = (en: string, ml: string) => (lang === 'ml' ? ml : en);
  return (
    <div className="imp-setup">
      <div className="imp-row">
        <span>{t('Players', 'കളിക്കാർ')}</span>
        <div className="imp-step">
          <button onClick={() => setPlayers(Math.max(3, players - 1))}>−</button>
          <b>{players}</b>
          <button onClick={() => setPlayers(Math.min(8, players + 1))}>＋</button>
        </div>
      </div>
      <div className="imp-row">
        <span>{t('Word category', 'വിഭാഗം')}</span>
        <div className="imp-chips">
          <button className={`imp-chip ${category === 'all' ? 'on' : ''}`} onClick={() => setCategory('all')}>{t('Mixed', 'മിക്സ്')}</button>
          {WORD_CATEGORIES.map((c) => (
            <button key={c.key} className={`imp-chip ${category === c.key ? 'on' : ''}`} onClick={() => setCategory(c.key)}>{c.emoji} {lang === 'ml' ? c.ml : c.en}</button>
          ))}
        </div>
      </div>
      <div className="imp-row">
        <span>{t('Discussion', 'ചർച്ച')}</span>
        <div className="imp-chips">
          {DURATIONS.map((d) => (
            <button key={d} className={`imp-chip ${discussSec === d ? 'on' : ''}`} onClick={() => setDiscussSec(d)}>{d}s</button>
          ))}
        </div>
      </div>
      <button className="g-btn" onClick={onStart}>{t('Deal secret words →', 'വാക്കുകൾ വിതരണം ചെയ്യൂ →')}</button>
      <p className="g-muted">{t('Pass this one phone around the table. Everyone gets the same word — except the imposter.', 'ഈ ഫോൺ മേശയ്ക്ക് ചുറ്റും കൈമാറൂ. ഇംപോസ്റ്റർ ഒഴികെ എല്ലാവർക്കും ഒരേ വാക്ക്.')}</p>
    </div>
  );
}

function Reveal({ n, idx, shown, isImposter, secret, lang, onShow, onNext }: {
  n: number; idx: number; shown: boolean; isImposter: boolean; secret: GameWord; lang: 'en' | 'ml'; onShow: () => void; onNext: () => void;
}) {
  const t = (en: string, ml: string) => (lang === 'ml' ? ml : en);
  if (!shown) {
    return (
      <div className="imp-pass">
        <span className="imp-who">{t('Pass to', 'കൈമാറൂ')} · {t('Player', 'പ്ലെയർ')} {idx + 1}</span>
        <p className="g-muted">{t('Make sure only you can see the screen.', 'നിങ്ങൾക്ക് മാത്രം സ്ക്രീൻ കാണാമെന്ന് ഉറപ്പാക്കൂ.')}</p>
        <button className="g-btn" onClick={onShow}>{t(`I’m Player ${idx + 1} — reveal`, `ഞാൻ പ്ലെയർ ${idx + 1} — കാണിക്കൂ`)}</button>
      </div>
    );
  }
  return (
    <div className="imp-pass">
      <div className={`imp-card ${isImposter ? 'spy' : 'word'}`}>
        {isImposter ? (
          <>
            <span className="imp-label">{t('Your role', 'നിങ്ങളുടെ റോൾ')}</span>
            <span className="imp-emoji">🤫</span>
            <span className="imp-word">{t('You are the Imposter', 'നിങ്ങളാണ് ഇംപോസ്റ്റർ')}</span>
            <span className="imp-hint">{t('Blend in. Give a vague clue and figure out the secret word.', 'ഒളിച്ചിരിക്കൂ. ഒരു സൂചന നൽകി രഹസ്യവാക്ക് കണ്ടെത്തൂ.')}</span>
          </>
        ) : (
          <>
            <span className="imp-label">{t('Secret word', 'രഹസ്യവാക്ക്')}</span>
            {secret.emoji && <span className="imp-emoji">{secret.emoji}</span>}
            <span className="imp-word">{lang === 'ml' ? secret.ml : secret.en}<small>{lang === 'ml' ? secret.translit : `${secret.ml} · ${secret.translit}`}</small></span>
            <span className="imp-hint">{t('Give a one-word clue. Don’t make it too obvious!', 'ഒറ്റ വാക്കിൽ സൂചന നൽകൂ. വളരെ വ്യക്തമാക്കരുത്!')}</span>
          </>
        )}
      </div>
      <button className="g-btn" onClick={onNext}>{idx + 1 >= n ? t('Start discussion →', 'ചർച്ച തുടങ്ങൂ →') : t('Hide & pass on →', 'മറച്ച് കൈമാറൂ →')}</button>
    </div>
  );
}

function Discuss({ seconds, lang, onDone }: { seconds: number; lang: 'en' | 'ml'; onDone: () => void }) {
  const { left } = useCountdown(seconds, true, onDone);
  const t = (en: string, ml: string) => (lang === 'ml' ? ml : en);
  const mm = String(Math.floor(left / 60)).padStart(1, '0');
  const ss = String(left % 60).padStart(2, '0');
  return (
    <div className="g-wrap">
      <div className="g-bar"><div className="g-progress" style={{ flex: 1 }}><i style={{ width: `${(left / seconds) * 100}%` }} /></div><span className={`g-timer ${left <= 10 ? 'warn' : ''}`}>{mm}:{ss}</span></div>
      <div className="g-stage">
        <span className="g-big">🗣️</span>
        <p className="g-prompt">{t('Each player, one clue', 'ഓരോരുത്തരും ഒരു സൂചന')}<small>{t('Go around the table. Watch for who’s bluffing.', 'മേശയ്ക്ക് ചുറ്റും. ആരാണ് കള്ളം പറയുന്നതെന്ന് ശ്രദ്ധിക്കൂ.')}</small></p>
      </div>
      <button className="g-btn" onClick={onDone}>{t('Everyone done — vote now', 'എല്ലാവരും കഴിഞ്ഞു — വോട്ട്')}</button>
    </div>
  );
}

function Result({ outcome, secret, imposterIdx, reward, lang, onAgain, onExit }: {
  outcome: 'team' | 'imposter'; secret: GameWord; imposterIdx: number; reward: { coins: number; points: number; awarded: boolean } | null; lang: 'en' | 'ml'; onAgain: () => void; onExit: () => void;
}) {
  const t = (en: string, ml: string) => (lang === 'ml' ? ml : en);
  const teamWon = outcome === 'team';
  return (
    <div className="g-result">
      <span className="g-medal">{teamWon ? '🎉' : '😈'}</span>
      <h4>{teamWon ? t('Detectives win!', 'ഡിറ്റക്റ്റീവ്സ് ജയിച്ചു!') : t('Imposter wins!', 'ഇംപോസ്റ്റർ ജയിച്ചു!')}</h4>
      <p className="g-muted">
        {t('The imposter was', 'ഇംപോസ്റ്റർ ആയിരുന്നു')} <b>{t('Player', 'പ്ലെയർ')} {imposterIdx + 1}</b>.<br />
        {t('Secret word', 'രഹസ്യവാക്ക്')}: <b>{lang === 'ml' ? `${secret.ml} (${secret.translit})` : secret.en}</b> {secret.emoji}
      </p>
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
