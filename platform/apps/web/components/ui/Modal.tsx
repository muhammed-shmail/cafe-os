'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** "sheet" slides up from the bottom on mobile; "dialog" is a centred card. */
  variant?: 'dialog' | 'sheet';
  size?: 'sm' | 'md' | 'lg';
  /** Hide the default header close button (e.g. for required flows). */
  hideClose?: boolean;
}

const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' };

/** Accessible modal: scrim dismiss, Escape to close, focus trap-ish (autofocus
 *  the panel), body scroll lock, and reduced-motion-safe entrance. */
export function Modal({ open, onClose, title, children, footer, variant = 'dialog', size = 'md', hideClose }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; };
  }, [open, onClose]);

  if (!open) return null;

  const isSheet = variant === 'sheet';
  return (
    <div
      className={`scrim anim-fade z-[1000] flex justify-center sm:p-4 ${isSheet ? 'items-end sm:items-center p-0' : 'items-center p-2'}`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="presentation"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Dialog'}
        className={`card ${SIZES[size]} w-full outline-none ${isSheet ? 'rounded-b-none sm:rounded-[22px] anim-sheet sm:anim-pop' : 'anim-pop'} max-h-[92dvh] flex flex-col`}
      >
        {(title || !hideClose) && (
          <div className="flex items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: 'var(--line)' }}>
            <h2 className="font-display text-lg font-bold">{title}</h2>
            {!hideClose && (
              <button type="button" onClick={onClose} className="btn btn-icon btn-sm btn-ghost" aria-label="Close dialog">
                <X size={18} aria-hidden />
              </button>
            )}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t px-5 py-4" style={{ borderColor: 'var(--line)' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
