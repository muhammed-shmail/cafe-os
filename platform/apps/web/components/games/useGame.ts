'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { QuickGameKey } from '@/lib/games/registry';

/**
 * Countdown that auto-fires `onExpire` once. The whole point of these games is
 * that they END on their own — the timer is the contract that keeps a session
 * inside the 30/60/120s ceiling and never becomes an endless loop.
 */
export function useCountdown(seconds: number, running: boolean, onExpire?: () => void, resetKey?: unknown) {
  const [left, setLeft] = useState(seconds);
  const firedRef = useRef(false);
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;

  // reset whenever the length changes OR the caller bumps resetKey (new round)
  useEffect(() => { setLeft(seconds); firedRef.current = false; }, [seconds, resetKey]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setLeft((t) => {
        if (t <= 1) {
          if (!firedRef.current) { firedRef.current = true; expireRef.current?.(); }
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  const reset = useCallback(() => { setLeft(seconds); firedRef.current = false; }, [seconds]);
  return { left, reset };
}

export type GameReward = { awarded: boolean; coins: number; points: number; balance: { points: number; coins: number } | null };

/**
 * Reports a finished round to the SERVER (which decides the real coins) and
 * returns the authoritative reward. Idempotency / one-paid-play caps live on the
 * server; the client just submits and shows what came back.
 */
export function useGameComplete(qs: string, reload: () => void) {
  const [submitting, setSubmitting] = useState(false);

  const complete = useCallback(
    async (game: QuickGameKey, score: number, durationSec?: number): Promise<GameReward | null> => {
      setSubmitting(true);
      try {
        const fingerprint = typeof navigator !== 'undefined' ? `${navigator.userAgent.slice(0, 40)}|${screen.width}x${screen.height}` : undefined;
        const res = await fetch('/api/customer/games/complete', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ t: qs.replace('?t=', '') || undefined, game, score, durationSec, fingerprint }),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as GameReward;
        reload(); // refresh the loyalty snapshot in the shell
        return data;
      } catch {
        return null;
      } finally {
        setSubmitting(false);
      }
    },
    [qs, reload],
  );

  return { complete, submitting };
}
