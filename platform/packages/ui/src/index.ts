/**
 * Cafe OS shared UI helpers. Components live in the app for now (Phase 1);
 * promote shared ones here as they stabilise.
 */
export { clsx as cx } from 'clsx';

export const STATION_LABEL: Record<string, string> = {
  kitchen: 'Kitchen',
  bar: 'Bar',
  dessert: 'Dessert',
};
