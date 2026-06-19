/** Refined "Alpha version" caption — sits directly under the logo.
 *  Replaces the old floating corner badge. Purely decorative dot + label. */
export function AlphaTag({ className = '' }: { className?: string }) {
  return (
    <span className={`alpha-tag ${className}`} aria-label="Alpha version" role="note">
      Alpha version
    </span>
  );
}
