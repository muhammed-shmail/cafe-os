/**
 * Cafe OS — GST billing engine (single source of truth).
 *
 * Indian GST: intra-state orders split tax into CGST + SGST (half each);
 * inter-state orders use IGST. Cafes are almost always intra-state, so the
 * outlet's state vs the place-of-supply decides. Prices are tax-EXCLUSIVE.
 *
 * All amounts are integer paise. Ported & hardened from the prototype's
 * store.js so the POS UI and the server compute IDENTICAL totals.
 */
import type { Paise } from './money';
import { roundToRupee } from './money';

export interface BillLine {
  /** base unit price in paise (tax-exclusive) */
  pricePaise: Paise;
  /** total of selected modifiers per unit, in paise */
  modPaise?: Paise;
  /** GST rate percent, e.g. 5, 12, 18 */
  gstRate: number;
  qty: number;
}

export interface BillOptions {
  /** order-level discount percent (0–100) */
  discountPct?: number;
  /** service charge percent applied on the post-discount taxable base */
  serviceChargePct?: number;
  /** true = inter-state supply → IGST instead of CGST/SGST */
  interState?: boolean;
  /**
   * Whether GST is charged at all. Defaults to true (registered outlet).
   * Set false for an unregistered shop — every line's tax becomes 0.
   */
  gstEnabled?: boolean;
  /**
   * Flat GST rate (percent) applied to EVERY line, overriding each item's own
   * gstRate. Use when a shop bills a single rate instead of per-item rates.
   * Ignored when GST is disabled or when null/undefined.
   */
  gstRateOverride?: number | null;
  /**
   * Tax mode. false/undefined (default) = EXCLUSIVE: the line price is the
   * pre-tax base and GST is added on top. true = INCLUSIVE: the line price
   * already contains GST, which is extracted out so the total equals the menu
   * price. Inclusive is implemented by billing each line's net-of-tax price
   * through the exact same exclusive math, so exclusive results never change.
   */
  gstInclusive?: boolean;
}

export interface Bill {
  subtotalPaise: Paise;
  discountPaise: Paise;
  taxablePaise: Paise;
  cgstPaise: Paise;
  sgstPaise: Paise;
  igstPaise: Paise;
  serviceChargePaise: Paise;
  roundOffPaise: Paise; // can be negative
  totalPaise: Paise;
  /** tax grouped by rate, for the receipt's GST summary */
  taxByRate: Record<string, Paise>;
}

/**
 * Compute a complete bill. Discount is distributed across lines pro-rata so
 * per-line tax is correct; CGST/SGST split halves the line tax (SGST takes the
 * rounding remainder so cgst+sgst === lineTax exactly).
 */
export function computeBill(lines: BillLine[], opts: BillOptions = {}): Bill {
  const discountPct = clampPct(opts.discountPct ?? 0);
  const scPct = clampPct(opts.serviceChargePct ?? 0);
  const interState = !!opts.interState;
  // GST gating: off ⇒ no tax; a flat override replaces every line's own rate.
  const gstEnabled = opts.gstEnabled !== false;
  const rawOverride = opts.gstRateOverride;
  const rateOverride =
    gstEnabled && rawOverride != null && !Number.isNaN(rawOverride) && rawOverride > 0
      ? clampPct(rawOverride)
      : null;
  const inclusive = gstEnabled && !!opts.gstInclusive;

  // Normalize every line to (net-of-tax unit price, effective rate). For
  // EXCLUSIVE billing the unit price is untouched, so the computation below is
  // byte-identical to the original engine. For INCLUSIVE billing we strip the
  // embedded tax out of the price here, then run the same exclusive math — that
  // makes the tax-exclusive total land back on the original menu price.
  const norm = lines.map((l) => {
    const unit = l.pricePaise + (l.modPaise ?? 0);
    const effRate = !gstEnabled ? 0 : rateOverride ?? l.gstRate;
    const unitNet = inclusive && effRate > 0 ? Math.round((unit * 100) / (100 + effRate)) : unit;
    return { gross: unitNet * l.qty, effRate };
  });

  const subtotalPaise = norm.reduce((sum, l) => sum + l.gross, 0);
  const discountPaise = Math.round((subtotalPaise * discountPct) / 100);

  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;
  const taxByRate: Record<string, Paise> = {};

  for (const l of norm) {
    const gross = l.gross;
    const share = subtotalPaise > 0 ? gross / subtotalPaise : 0;
    const lineTaxable = gross - Math.round(discountPaise * share);
    // effective rate: 0 when GST is off, the flat override when set, else the line's own rate
    const effRate = l.effRate;
    const lineTax = Math.round((lineTaxable * effRate) / 100);

    if (interState) {
      igstPaise += lineTax;
    } else {
      const half = Math.round(lineTax / 2);
      cgstPaise += half;
      sgstPaise += lineTax - half; // remainder to SGST → no lost paise
    }
    const key = effRate.toFixed(2);
    taxByRate[key] = (taxByRate[key] ?? 0) + lineTax;
  }

  const taxablePaise = subtotalPaise - discountPaise;
  const serviceChargePaise = Math.round((taxablePaise * scPct) / 100);
  const taxTotal = cgstPaise + sgstPaise + igstPaise;
  const preRound = taxablePaise + taxTotal + serviceChargePaise;
  const totalPaise = roundToRupee(preRound);
  const roundOffPaise = totalPaise - preRound;

  return {
    subtotalPaise,
    discountPaise,
    taxablePaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
    serviceChargePaise,
    roundOffPaise,
    totalPaise,
    taxByRate,
  };
}

function clampPct(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(100, Math.max(0, n));
}
