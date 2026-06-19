/**
 * Cafe OS — unit conversion for recipe-based inventory.
 *
 * Stock is tracked in one unit (e.g. "l" of milk) while a recipe line may be
 * authored in another (e.g. "100 ml"). We normalise both to a canonical base
 * within their family and scale, so deduction is unit-safe.
 *
 *   mass   → base gram (g)
 *   volume → base millilitre (ml)
 *   count  → base piece (pcs)
 *
 * Unknown / mismatched-family units fall back to a 1:1 assumption (recipe was
 * authored in the stock unit) so a typo never silently zeroes a deduction.
 */
export type UnitFamily = 'mass' | 'volume' | 'count';

type UnitDef = { family: UnitFamily; toBase: number };

const UNITS: Record<string, UnitDef> = {
  // mass (base: g)
  mg: { family: 'mass', toBase: 0.001 },
  g: { family: 'mass', toBase: 1 },
  gram: { family: 'mass', toBase: 1 },
  grams: { family: 'mass', toBase: 1 },
  kg: { family: 'mass', toBase: 1000 },
  // volume (base: ml)
  ml: { family: 'volume', toBase: 1 },
  millilitre: { family: 'volume', toBase: 1 },
  l: { family: 'volume', toBase: 1000 },
  ltr: { family: 'volume', toBase: 1000 },
  litre: { family: 'volume', toBase: 1000 },
  liter: { family: 'volume', toBase: 1000 },
  // count (base: pcs)
  pcs: { family: 'count', toBase: 1 },
  pc: { family: 'count', toBase: 1 },
  piece: { family: 'count', toBase: 1 },
  pieces: { family: 'count', toBase: 1 },
  unit: { family: 'count', toBase: 1 },
  ea: { family: 'count', toBase: 1 },
};

const norm = (u: string | null | undefined) => (u ?? '').trim().toLowerCase();

/** Look up the family of a unit string, or null if unknown. */
export function unitFamily(unit: string | null | undefined): UnitFamily | null {
  return UNITS[norm(unit)]?.family ?? null;
}

/** True when two units can be converted between each other. */
export function unitsCompatible(from: string | null | undefined, to: string | null | undefined): boolean {
  const f = UNITS[norm(from)];
  const t = UNITS[norm(to)];
  return !!f && !!t && f.family === t.family;
}

/**
 * Convert `qty` from one unit to another. Returns the converted quantity, or
 * `null` when the units are unknown or live in different families — letting the
 * caller decide on a safe fallback.
 */
export function convertQty(qty: number, from: string | null | undefined, to: string | null | undefined): number | null {
  const fromU = norm(from);
  const toU = norm(to);
  if (fromU === toU) return qty;
  const f = UNITS[fromU];
  const t = UNITS[toU];
  if (!f || !t || f.family !== t.family) return null;
  return (qty * f.toBase) / t.toBase;
}

/**
 * Deduction-safe conversion: convert `qty` from `from`→`to`, falling back to the
 * raw quantity (1:1) when units are incompatible. Never returns null.
 */
export function convertForDeduction(qty: number, from: string | null | undefined, to: string | null | undefined): number {
  const converted = convertQty(qty, from, to);
  return converted == null ? qty : converted;
}
