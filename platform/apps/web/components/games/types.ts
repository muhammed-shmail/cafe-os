import type { GameReward } from './useGame';

export type Lang = 'en' | 'ml';

/** Common props every Quick Cafe Game receives from the hub. */
export type GameProps = {
  qs: string;
  reload: () => void;
  onExit: () => void;
  onResult: (msg: string, emoji: string) => void;
  lang: Lang;
};

export type { GameReward };
