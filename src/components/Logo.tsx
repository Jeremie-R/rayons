import { useArtFilters } from './art'

// The Rayons mark: a hand-drawn R over a pink sun and a cobalt arch, with two rays ("rayons").
// Same drawing as public/icons/favicon.svg and app-icon.svg; here the shapes get the printed
// grain and the line its wobble when the mark is big enough to show them.

export const LOGO_SHAPES = {
  arch: 'M4 62 A22 22 0 0 1 48 62 Z',
  sun: { cx: 38, cy: 27, r: 20 },
  r: 'M21.5 53 C21 41 21.2 27 22 13.5 M22 14 C31 11 42.5 13.5 42 22 C41.5 30 32 32 22.5 31.5 M29.5 31.5 C34 38.5 38.5 45.5 45.5 53',
  rays: 'M53 9.5 L58 4.5 M56.5 18 L62 16.5 M45 6.5 L46.5 1.5',
}

export function Logo({ size = 40, textured = size >= 48 }: { size?: number; textured?: boolean }) {
  const { defs, grain, hand } = useArtFilters()
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="logo illustration">
      {textured && defs}
      <g filter={textured ? grain : undefined}>
        <path className="art-blue" d={LOGO_SHAPES.arch} />
        <circle className="art-pink" {...LOGO_SHAPES.sun} />
      </g>
      <g filter={textured ? hand : undefined}>
        <path className="art-coral art-line" d={LOGO_SHAPES.rays} strokeWidth={3} />
        {/* Always dark: it sits on the pink in both themes. */}
        <path className="art-line" d={LOGO_SHAPES.r} strokeWidth={4.6} style={{ color: '#17161a' }} />
      </g>
    </svg>
  )
}
