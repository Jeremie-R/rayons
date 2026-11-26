import { Dashes, LINE, Sitting, Sparkle, Squares, Standing, Sunburst, useArtFilters } from './art'

// Abstract scenes for empty places: flat grainy shapes, black drawn lines, outlined people.
// They stay small and to the side; the app around them is plain white.

export type IllustrationKind = 'inbox' | 'clear' | 'project' | 'sidebar'

export function Illustration({ kind, className = '' }: { kind: IllustrationKind; className?: string }) {
  const { defs, grain, hand } = useArtFilters()
  const height = kind === 'sidebar' ? 170 : 240
  return (
    <svg className={`illustration illustration--${kind} ${className}`} viewBox={`0 0 320 ${height}`} role="presentation" aria-hidden="true">
      {defs}
      {kind === 'inbox' && <Inbox grain={grain} hand={hand} />}
      {kind === 'clear' && <Clear grain={grain} hand={hand} />}
      {kind === 'project' && <Project grain={grain} hand={hand} />}
      {kind === 'sidebar' && <Sidebar grain={grain} hand={hand} />}
    </svg>
  )
}

interface SceneProps {
  grain: string
  hand: string
}

/** No conversation open: someone reading a letter on an arch, a sun coming up behind. */
function Inbox({ grain, hand }: SceneProps) {
  return (
    <>
      <g filter={grain}>
        <rect className="art-pink" x={46} y={40} width={88} height={88} transform="rotate(-12 90 84)" />
        <path className="art-periwinkle" d="M96 240 A72 72 0 0 1 240 240 Z" />
        <path className="art-coral" d="M30 240 C22 214 36 196 26 176 C42 184 56 200 54 222 C62 212 62 200 60 192 C74 206 74 226 66 240 Z" />
        <circle className="art-blue" cx={286} cy={196} r={14} />
      </g>
      <Squares x={22} y={140} cols={3} rows={3} size={12} gap={5} angle={-10} skip={[2, 6]} />
      <Sunburst cx={262} cy={70} inner={8} outer={44} count={30} />
      <Sitting x={150} y={170} scale={0.95} arms="read" hand={hand} />
      <path className="art-ink art-line" d="M196 104 C214 98 222 84 214 76 C206 68 196 80 206 88 C220 98 236 88 238 72" strokeWidth={LINE} filter={hand} />
      <Sparkle x={182} y={40} r={7} />
      <Sparkle x={300} y={150} r={8} />
      <Dashes lines={[[226, 122, 240, 128], [232, 138, 248, 138]]} />
    </>
  )
}

/** Inbox all clear: someone cheering under a big sun. */
function Clear({ grain, hand }: SceneProps) {
  return (
    <>
      <g filter={grain}>
        <path className="art-pink" d="M226 240 C214 214 236 198 228 176 C222 158 238 140 256 150 C272 160 262 180 276 192 C292 206 286 230 276 240 Z" />
        <path className="art-coral" d="M40 240 C34 220 46 206 40 190 C54 198 64 214 60 232 C68 224 70 214 68 206 C82 220 80 234 74 240 Z" />
        <circle className="art-blue" cx={82} cy={58} r={16} />
        <path className="art-periwinkle" d="M118 240 A44 44 0 0 1 206 240 Z" />
      </g>
      <Sunburst cx={160} cy={74} inner={12} outer={58} count={34} />
      <Standing x={160} y={236} scale={0.92} pose="cheer" hand={hand} />
      <Squares x={250} y={40} cols={3} rows={2} size={12} gap={5} angle={12} skip={[4]} />
      <path className="art-ink art-line" d="M44 150 C28 116 40 82 72 74" strokeWidth={LINE} filter={hand} />
      <path className="art-ink art-line" d="M62 66 L73 74 L62 84" strokeWidth={LINE} filter={hand} />
      <Sparkle x={250} y={118} r={8} />
      <Sparkle x={34} y={42} r={6} />
      <Dashes lines={[[100, 120, 112, 128], [210, 124, 222, 116]]} />
    </>
  )
}

/** No project open: a stack of shapes with a ladder, someone bringing a card. */
function Project({ grain, hand }: SceneProps) {
  return (
    <>
      <g filter={grain}>
        <path className="art-blue" d="M150 240 L250 240 L232 150 L168 150 Z" />
        <rect className="art-pink" x={176} y={92} width={54} height={54} transform="rotate(14 203 119)" />
        <path className="art-coral" d="M128 26 C150 38 160 62 146 80 C132 96 108 88 108 68 C108 52 120 44 128 26 Z" />
        <circle className="art-periwinkle" cx={286} cy={196} r={20} />
      </g>
      <g className="art-ink art-line" strokeWidth={LINE} filter={hand}>
        <path d="M262 240 L240 132 M282 240 L260 132" />
        {[0, 1, 2, 3, 4].map((i) => {
          const t = 0.14 + i * 0.18
          const y = 240 - 108 * t
          return <line key={i} x1={262 - 22 * t} y1={y} x2={282 - 22 * t} y2={y} />
        })}
      </g>
      <Standing x={86} y={236} scale={0.92} pose="hold" hand={hand} />
      <rect className="art-drawn" x={84} y={166} width={18} height={18} rx={1.5} strokeWidth={LINE} transform="rotate(-8 93 175)" filter={hand} />
      <Squares x={116} y={128} cols={2} rows={1} size={13} gap={10} angle={-20} />
      <path className="art-ink art-line" d="M40 186 C22 140 44 92 92 82" strokeWidth={LINE} filter={hand} />
      <path className="art-ink art-line" d="M82 74 L93 82 L82 92" strokeWidth={LINE} filter={hand} />
      <Sparkle x={262} y={60} r={9} />
      <Sparkle x={40} y={40} r={6} />
    </>
  )
}

/** The empty bottom of a list: a few shapes, no people. */
function Sidebar({ grain, hand }: SceneProps) {
  return (
    <>
      <g filter={grain}>
        <path className="art-periwinkle" d="M150 170 A58 58 0 0 1 266 170 Z" />
        <path className="art-pink" d="M70 130 C56 112 70 92 90 100 C104 84 128 96 120 116 C134 126 124 146 106 140 C96 154 76 148 70 130 Z" />
        <circle className="art-coral" cx={250} cy={52} r={9} />
      </g>
      <Sunburst cx={208} cy={88} inner={6} outer={30} count={24} width={2} />
      <Squares x={40} y={40} cols={3} rows={2} size={11} gap={4} angle={-8} skip={[2]} />
      <path className="art-ink art-line" d="M118 158 C140 150 142 128 128 126 C116 124 116 142 134 146 C158 152 170 132 178 118" strokeWidth={2} filter={hand} />
      <Sparkle x={150} y={56} r={6} />
    </>
  )
}
