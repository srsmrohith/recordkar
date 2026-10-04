/** Circular teal mark with white ledger lines and an amber checkmark badge (requirements §1). */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className="shrink-0">
      <circle cx="18" cy="20" r="17" className="fill-[#0F6E56] dark:fill-[#1D9E75]" />
      <g stroke="#fff" strokeWidth="2.4" strokeLinecap="round">
        <line x1="10" y1="14" x2="26" y2="14" />
        <line x1="10" y1="20" x2="26" y2="20" />
        <line x1="10" y1="26" x2="20" y2="26" />
      </g>
      <circle cx="30" cy="29" r="8" className="fill-[#BA7517] stroke-surface dark:fill-[#EF9F27]" strokeWidth="2" />
      <path d="M26.5 29.2l2.4 2.4 4.6-4.8" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <LogoMark />
      <span className="text-sm font-semibold tracking-[0.2em] text-ink">
        RECORD<span className="text-brand">KAR</span>
      </span>
    </span>
  );
}
