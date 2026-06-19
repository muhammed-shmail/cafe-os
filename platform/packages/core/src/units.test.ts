/* Minimal assertion-based tests (run: npm run -w @cafeos/core test:units). */
import { convertQty, convertForDeduction, unitFamily, unitsCompatible } from './units';

let failed = 0;
function eq(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : `  got=${got} want=${want}`}`);
  if (!ok) failed++;
}

// within-family conversions
eq('100 ml → l', convertQty(100, 'ml', 'l'), 0.1);
eq('0.1 l → ml', convertQty(0.1, 'l', 'ml'), 100);
eq('250 g → kg', convertQty(250, 'g', 'kg'), 0.25);
eq('2 kg → g', convertQty(2, 'kg', 'g'), 2000);
eq('same unit is identity', convertQty(7, 'pcs', 'pcs'), 7);
eq('case/space insensitive', convertQty(1, ' L ', 'ML'), 1000);

// cross-family / unknown → null
eq('ml → g is null (different family)', convertQty(100, 'ml', 'g'), null);
eq('unknown unit → null', convertQty(5, 'cups', 'ml'), null);

// deduction-safe fallback never returns null
eq('deduction falls back 1:1 on mismatch', convertForDeduction(5, 'cups', 'ml'), 5);
eq('deduction converts when possible', convertForDeduction(100, 'ml', 'l'), 0.1);
eq('deduction null unit ⇒ identity', convertForDeduction(12, null, 'g'), 12);

// metadata helpers
eq('family of kg', unitFamily('kg'), 'mass');
eq('family of unknown', unitFamily('blah'), null);
eq('ml compatible with litre', unitsCompatible('ml', 'litre'), true);
eq('g not compatible with ml', unitsCompatible('g', 'ml'), false);

// realistic recipe case: 1 Tea uses 100ml milk, stock tracked in litres
eq('tea milk deduction', convertForDeduction(100, 'ml', 'l'), 0.1);

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
if (failed) process.exit(1);
