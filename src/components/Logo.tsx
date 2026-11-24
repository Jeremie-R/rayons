/** The Rayons mark: rays around a point. Same drawing as public/icons/favicon.svg. */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="logo">
      <rect width="64" height="64" rx="16" fill="var(--accent)" />
      <g stroke="#fbf3ff" strokeWidth="4" strokeLinecap="round">
        <path d="M32 14v8M32 42v8M14 32h8M42 32h8M19.3 19.3l5.7 5.7M39 39l5.7 5.7M19.3 44.7l5.7-5.7M39 25l5.7-5.7" />
      </g>
      <circle cx="32" cy="32" r="5" fill="#fbf3ff" />
    </svg>
  )
}
