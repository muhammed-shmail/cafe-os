/**
 * Money is ALWAYS integer paise across Cafe OS. Never use floats for money.
 * 100 paise = ₹1.
 */
export type Paise = number;

export const rupees = (paise: Paise): number => paise / 100;

/** Format paise as an Indian-locale ₹ string. */
export function formatINR(paise: Paise): string {
  const r = paise / 100;
  const hasDecimals = paise % 100 !== 0;
  return (
    '₹' +
    r.toLocaleString('en-IN', {
      minimumFractionDigits: hasDecimals ? 2 : 0,
      maximumFractionDigits: 2,
    })
  );
}

/** Round paise to the nearest whole rupee (returns paise). */
export const roundToRupee = (paise: Paise): Paise => Math.round(paise / 100) * 100;
