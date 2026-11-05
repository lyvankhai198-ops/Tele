/** Decorative membership insignia; the adjoining heading identifies the plan. */
export function TierEmblem({ tier }: { tier: string }) {
  if (tier === "plus") {
    return <span className="tier-emblem" aria-hidden="true">
      <svg viewBox="0 0 64 64" fill="none">
        <path d="M32 6 51 17v24L32 58 13 41V17L32 6Z" stroke="currentColor" strokeWidth="1.5"/>
        <path d="m20 23 12 7 12-7-3 18H23l-3-18Z" fill="currentColor" fillOpacity=".18" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
        <path d="M21 23h22M25 46h14M32 11v7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="20" cy="21" r="2" fill="currentColor"/><circle cx="44" cy="21" r="2" fill="currentColor"/><circle cx="32" cy="18" r="2" fill="currentColor"/>
      </svg>
    </span>;
  }
  if (tier === "pro") {
    return <span className="tier-emblem" aria-hidden="true">
      <svg viewBox="0 0 64 64" fill="none">
        <circle cx="32" cy="32" r="26" stroke="currentColor" strokeWidth="1.4"/>
        <circle cx="32" cy="32" r="21" stroke="currentColor" strokeOpacity=".45"/>
        <path d="m32 14 5.5 11.2L50 27l-9 8.8 2.1 12.4L32 42.4l-11.1 5.8L23 35.8 14 27l12.5-1.8L32 14Z" fill="currentColor" fillOpacity=".16" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
        <path d="m27 32 3.4 3.4 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </span>;
  }
  if (tier === "unlimited") {
    return <span className="tier-emblem" aria-hidden="true">
      <svg viewBox="0 0 64 64" fill="none">
        <path d="M32 5 52 13v16c0 13-8.5 23.5-20 30C20.5 52.5 12 42 12 29V13L32 5Z" stroke="currentColor" strokeWidth="1.7"/>
        <path d="M32 11 46 17v12c0 9.6-5.5 17.8-14 23-8.5-5.2-14-13.4-14-23V17l14-6Z" fill="currentColor" fillOpacity=".1" stroke="currentColor" strokeOpacity=".64"/>
        <path d="M22 32c3.2-5.2 6.5-5.2 10 0s6.8 5.2 10 0M22 32c3.2 5.2 6.5 5.2 10 0s6.8-5.2 10 0" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round"/>
        <circle cx="32" cy="32" r="2.2" fill="currentColor"/>
      </svg>
    </span>;
  }
  throw new Error("UNSUPPORTED_SUBSCRIPTION_PLAN");
}
