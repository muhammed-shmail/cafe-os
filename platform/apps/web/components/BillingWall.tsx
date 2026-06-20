/**
 * Read-only "renew to continue" screen shown on tenant surfaces when a cafe is
 * suspended / expired (Phase G7). Data is preserved — this only gates access.
 */
export function BillingWall({ brand, reason }: { brand?: string; reason: string | null }) {
  const heading =
    reason === 'expired'
      ? 'Your subscription has expired'
      : reason === 'past_due'
        ? 'Payment is past due'
        : 'Your workspace is paused';

  return (
    <main
      className="min-h-screen grid place-items-center p-6"
      style={{ background: 'radial-gradient(80% 60% at 50% 0%, rgba(232,144,42,.12), transparent 60%), var(--paper)' }}
    >
      <div className="w-full max-w-[460px] text-center lux-card p-8">
        <div className="text-5xl mb-3">🔒</div>
        <p className="font-display text-[12px] tracking-[0.3em] uppercase" style={{ color: 'var(--gold-d)' }}>ChayaOne</p>
        <h1 className="font-display text-[30px] leading-tight mt-1">{heading}</h1>
        <p className="text-sm mt-3" style={{ color: 'var(--ink-2)' }}>
          {brand ? `${brand}’s ` : 'Your '}workspace is read-only until billing is renewed.
          <br />Your data is safe and untouched.
        </p>
        <div className="mt-5 p-4 rounded-xl text-sm" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)', color: 'var(--ink-2)' }}>
          Contact your ChayaOne account manager to reactivate this cafe.
        </div>
        <a href="/api/auth/logout" className="inline-block mt-5 text-sm font-bold rounded-xl px-5 py-2.5"
          style={{ background: 'var(--paper-2)', border: '1px solid var(--line)', color: 'var(--ink-2)' }}>
          Sign out
        </a>
      </div>
    </main>
  );
}
