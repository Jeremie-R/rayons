// Small abstract scenes for empty places: soft shapes, a sun with rays (the "rayons"), and
// people drawn as a head and a body, no faces. Colours come from --art-* tokens (warm.css),
// so they follow light and dark.

export type IllustrationKind = 'inbox' | 'clear' | 'project' | 'sidebar'

const Rays = ({ cx, cy, r, length, count = 10, className = 'art-sun' }: { cx: number; cy: number; r: number; length: number; count?: number; className?: string }) => (
  <g className={`${className} art-stroke`} strokeLinecap="round" strokeWidth={4}>
    {Array.from({ length: count }, (_, i) => {
      const angle = (Math.PI * 2 * i) / count
      return (
        <line
          key={i}
          x1={cx + Math.cos(angle) * (r + 8)}
          y1={cy + Math.sin(angle) * (r + 8)}
          x2={cx + Math.cos(angle) * (r + 8 + length)}
          y2={cy + Math.sin(angle) * (r + 8 + length)}
        />
      )
    })}
  </g>
)

/** A person: a head and a rounded body. */
const Person = ({ x, y, scale = 1, body = 'art-coral', head = 'art-cocoa', lean = 0 }: { x: number; y: number; scale?: number; body?: string; head?: string; lean?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${scale}) rotate(${lean})`}>
    <path className={body} d="M-22 0 C-22 -34 -14 -52 0 -52 C14 -52 22 -34 22 0 Z" />
    <circle className={head} cx={0} cy={-66} r={11} />
  </g>
)

const Leaf = ({ x, y, angle, size = 1, className = 'art-sage-strong' }: { x: number; y: number; angle: number; size?: number; className?: string }) => (
  <path className={className} transform={`translate(${x} ${y}) rotate(${angle}) scale(${size})`} d="M0 0 C8 -14 8 -30 0 -40 C-8 -30 -8 -14 0 0 Z" />
)

export function Illustration({ kind, className = '' }: { kind: IllustrationKind; className?: string }) {
  return (
    <svg className={`illustration illustration--${kind} ${className}`} viewBox="0 0 320 220" role="presentation" aria-hidden="true">
      {kind === 'inbox' && (
        <>
          {/* An arched window with the sun coming up, someone reading a letter. */}
          <path className="art-lilac" d="M70 210 V100 a70 70 0 0 1 140 0 V210 Z" />
          <circle className="art-sun" cx={140} cy={118} r={30} />
          <Rays cx={140} cy={118} r={30} length={12} count={12} />
          <path className="art-sage" d="M70 210 C110 170 170 172 210 196 V210 Z" />
          <Person x={232} y={210} scale={1.1} body="art-coral" lean={-4} />
          <rect className="art-paper" x={180} y={150} width={34} height={26} rx={4} transform="rotate(-14 197 163)" />
          <path className="art-line art-stroke" d="M187 158 l14 -3 M189 165 l12 -2.6" strokeWidth={2.5} strokeLinecap="round" transform="rotate(-14 197 163)" />
          <Leaf x={52} y={210} angle={-18} />
          <Leaf x={58} y={210} angle={14} size={0.8} />
          <circle className="art-periwinkle" cx={268} cy={70} r={6} />
          <circle className="art-blush" cx={36} cy={96} r={10} />
        </>
      )}
      {kind === 'clear' && (
        <>
          {/* All done: a big sun, hills, someone stretching. */}
          <circle className="art-sun" cx={160} cy={96} r={40} />
          <Rays cx={160} cy={96} r={40} length={18} count={14} />
          <path className="art-sage" d="M0 220 C60 150 120 150 170 190 C210 160 270 150 320 190 V220 Z" />
          <path className="art-olive" d="M0 220 C80 186 160 196 230 220 Z" opacity={0.6} />
          <g transform="translate(236 196)">
            <path className="art-periwinkle" d="M-18 0 C-18 -30 -12 -46 0 -46 C12 -46 18 -30 18 0 Z" />
            <path className="art-periwinkle art-stroke" d="M-10 -40 L-26 -72 M10 -40 L26 -72" strokeWidth={8} strokeLinecap="round" fill="none" />
            <circle className="art-cocoa" cx={0} cy={-58} r={10} />
          </g>
          <circle className="art-coral" cx={58} cy={64} r={7} />
          <circle className="art-lilac" cx={280} cy={52} r={12} />
        </>
      )}
      {kind === 'project' && (
        <>
          {/* Cards stacking up, someone adding one. */}
          <rect className="art-blush" x={64} y={84} width={128} height={96} rx={16} transform="rotate(-8 128 132)" />
          <rect className="art-periwinkle" x={84} y={76} width={128} height={96} rx={16} transform="rotate(4 148 124)" />
          <rect className="art-paper" x={100} y={70} width={128} height={96} rx={16} />
          <rect className="art-sun-soft" x={114} y={86} width={52} height={10} rx={5} />
          <rect className="art-line-soft" x={114} y={106} width={96} height={6} rx={3} />
          <rect className="art-line-soft" x={114} y={120} width={78} height={6} rx={3} />
          <circle className="art-coral" cx={206} cy={148} r={8} />
          <Person x={262} y={212} scale={1.05} body="art-sage-strong" />
          <circle className="art-sun" cx={40} cy={42} r={18} />
          <Rays cx={40} cy={42} r={18} length={8} count={9} />
          <circle className="art-lilac" cx={286} cy={70} r={9} />
        </>
      )}
      {kind === 'sidebar' && (
        <>
          {/* A plant on the floor and the sun on the wall. */}
          <circle className="art-sun-soft" cx={214} cy={70} r={30} />
          <Rays cx={214} cy={70} r={30} length={10} count={12} className="art-sun-soft" />
          <Leaf x={110} y={176} angle={-34} size={1.4} />
          <Leaf x={112} y={176} angle={2} size={1.7} className="art-olive" />
          <Leaf x={114} y={176} angle={36} size={1.3} />
          <path className="art-coral" d="M90 172 H134 L128 214 H96 Z" />
          <path className="art-line-soft art-stroke" d="M40 214 H280" strokeWidth={2} strokeLinecap="round" />
          <circle className="art-lilac" cx={62} cy={120} r={8} />
        </>
      )}
    </svg>
  )
}
