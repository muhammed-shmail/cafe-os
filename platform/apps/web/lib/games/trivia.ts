/**
 * Quick Quiz question bank — Kerala + cafe trivia, bilingual. Client + server
 * safe. Each question has a bilingual prompt, 3 options (kept short so they fit
 * a 30-second round on mobile), and the index of the correct option.
 *
 * Like the word DB, this is append-only data: grow the bank without touching
 * any game code. `pickQuiz(n)` returns a fresh random subset per play.
 */
import { shuffle } from './words';

export type TriviaQuestion = {
  q: string;
  qMl: string;
  options: string[];
  answer: number; // index into options
};

export const TRIVIA: TriviaQuestion[] = [
  { q: 'Onam falls in which Malayalam month?', qMl: 'ഓണം ഏത് മാസത്തിൽ?', options: ['Chingam', 'Medam', 'Karkidakam'], answer: 0 },
  { q: 'Which is Kerala’s state animal?', qMl: 'കേരളത്തിന്റെ സംസ്ഥാന മൃഗം?', options: ['Tiger', 'Elephant', 'Lion'], answer: 1 },
  { q: 'Kappa is made from?', qMl: 'കപ്പ എന്തിൽ നിന്ന്?', options: ['Tapioca', 'Rice', 'Wheat'], answer: 0 },
  { q: 'Sadya is served on a?', qMl: 'സദ്യ വിളമ്പുന്നത് എന്തിൽ?', options: ['Plate', 'Banana leaf', 'Bowl'], answer: 1 },
  { q: 'Snake boat race is held on?', qMl: 'വള്ളംകളി നടക്കുന്നത്?', options: ['Backwaters', 'Sea', 'Hills'], answer: 0 },
  { q: 'Which spice is Kerala famous for?', qMl: 'കേരളം പ്രശസ്തമായ സുഗന്ധവ്യഞ്ജനം?', options: ['Saffron', 'Pepper', 'Cumin'], answer: 1 },
  { q: 'Payasam is a?', qMl: 'പായസം ഒരു?', options: ['Dessert', 'Curry', 'Snack'], answer: 0 },
  { q: 'Kerala’s capital city?', qMl: 'കേരളത്തിന്റെ തലസ്ഥാനം?', options: ['Kochi', 'Kozhikode', 'Thiruvananthapuram'], answer: 2 },
  { q: 'Theyyam is a form of?', qMl: 'തെയ്യം ഒരു?', options: ['Dance ritual', 'Food', 'Boat'], answer: 0 },
  { q: 'Porotta is usually made of?', qMl: 'പൊറോട്ട ഉണ്ടാക്കുന്നത്?', options: ['Maida', 'Rice', 'Ragi'], answer: 0 },
  { q: 'Which festival uses Pookalam?', qMl: 'പൂക്കളം ഏത് ആഘോഷത്തിൽ?', options: ['Vishu', 'Onam', 'Christmas'], answer: 1 },
  { q: 'Kerala is nicknamed God’s own?', qMl: 'കേരളം ദൈവത്തിന്റെ സ്വന്തം?', options: ['Country', 'City', 'Land'], answer: 0 },
  { q: 'A traditional Kerala lamp is?', qMl: 'പരമ്പരാഗത വിളക്ക്?', options: ['Nilavilakku', 'Lantern', 'Candle'], answer: 0 },
  { q: 'Appam is best paired with?', qMl: 'അപ്പത്തിന് നല്ല കൂട്ട്?', options: ['Stew', 'Jam', 'Honey'], answer: 0 },
  { q: 'Vishu is celebrated in which month?', qMl: 'വിഷു ഏത് മാസത്തിൽ?', options: ['Medam', 'Chingam', 'Thulam'], answer: 0 },
];

export function pickQuiz(n: number, rng: () => number = Math.random): TriviaQuestion[] {
  return shuffle(TRIVIA, rng).slice(0, n);
}
