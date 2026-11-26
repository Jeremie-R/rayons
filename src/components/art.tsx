import { useId } from 'react'

// Pieces for the illustrations: flat shapes with a printed grain, black hand-drawn lines,
// sunbursts, sparkles, grids of little squares, and people drawn as an outline. Colours are
// classes (art-pink, art-blue…) defined in styles/illustrations.css, so dark mode works.

/** Filter ids unique to one drawing, and the <defs> that define them. */
export function useArtFilters() {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const defs = (
    <defs>
      {/* Grain: punches tiny holes in a flat colour, like a risograph print. */}
      <filter id={`${id}-grain`} x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="2" seed="4" stitchTiles="stitch" result="noise" />
        <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3.8 3.05" result="speckles" />
        <feComposite in="SourceGraphic" in2="speckles" operator="in" />
      </filter>
      {/* Hand: a slight wobble so lines look drawn, not plotted. */}
      <filter id={`${id}-hand`} x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="11" result="wobble" />
        <feDisplacementMap in="SourceGraphic" in2="wobble" scale="2.6" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </defs>
  )
  return { defs, grain: `url(#${id}-grain)`, hand: `url(#${id}-hand)` }
}

export const LINE = 2.4

export function Sunburst({ cx, cy, inner, outer, count = 28, width = LINE }: { cx: number; cy: number; inner: number; outer: number; count?: number; width?: number }) {
  return (
    <g className="art-ink art-line" strokeWidth={width}>
      {Array.from({ length: count }, (_, i) => {
        const a = (Math.PI * 2 * i) / count
        // Every other ray a little shorter, as if drawn by hand.
        const end = i % 2 ? outer * 0.86 : outer
        return <line key={i} x1={cx + Math.cos(a) * inner} y1={cy + Math.sin(a) * inner} x2={cx + Math.cos(a) * end} y2={cy + Math.sin(a) * end} />
      })}
      <circle cx={cx} cy={cy} r={Math.max(2.5, inner * 0.45)} className="art-drawn" strokeWidth={width} />
    </g>
  )
}

/** A four-pointed star. */
export function Sparkle({ x, y, r, className = 'art-ink' }: { x: number; y: number; r: number; className?: string }) {
  const k = r * 0.18
  return <path className={className} d={`M${x} ${y - r} Q${x + k} ${y - k} ${x + r} ${y} Q${x + k} ${y + k} ${x} ${y + r} Q${x - k} ${y + k} ${x - r} ${y} Q${x - k} ${y - k} ${x} ${y - r} Z`} />
}

/** A loose grid of outlined squares. */
export function Squares({ x, y, cols, rows, size = 14, gap = 5, angle = 0, skip = [] }: { x: number; y: number; cols: number; rows: number; size?: number; gap?: number; angle?: number; skip?: number[] }) {
  const step = size + gap
  return (
    <g className="art-periwinkle art-line" strokeWidth={LINE} transform={`rotate(${angle} ${x} ${y})`}>
      {Array.from({ length: cols * rows }, (_, i) =>
        skip.includes(i) ? null : <rect key={i} x={x + (i % cols) * step} y={y + Math.floor(i / cols) * step} width={size} height={size} rx={1.5} />,
      )}
    </g>
  )
}

/** Short strokes, like motion or sparks. */
export function Dashes({ lines, className = 'art-coral' }: { lines: [number, number, number, number][]; className?: string }) {
  return (
    <g className={`${className} art-line`} strokeWidth={3.2}>
      {lines.map(([x1, y1, x2, y2]) => (
        <line key={`${x1}-${y1}`} x1={x1} y1={y1} x2={x2} y2={y2} />
      ))}
    </g>
  )
}

/** An arm or a leg: an outlined tube. */
function Tube({ d }: { d: string }) {
  return (
    <>
      <path d={d} className="art-tube-out" strokeWidth={11} />
      <path d={d} className="art-tube-in" strokeWidth={6.2} />
    </>
  )
}

type Pose = 'stand' | 'cheer' | 'reach' | 'hold'

const STAND_BODY = 'M-13 -82 C-18 -68 -17 -54 -14 -44 C-13 -30 -13 -14 -12 0 L-3 0 C-2 -12 -1 -24 0 -32 C1 -24 2 -12 3 0 L12 0 C13 -14 13 -30 14 -44 C17 -54 18 -68 13 -82 C6 -90 -6 -90 -13 -82 Z'
const ARMS: Record<Pose, [string, string]> = {
  stand: ['M-12 -80 C-19 -66 -20 -54 -19 -42', 'M12 -80 C19 -66 20 -54 19 -42'],
  cheer: ['M-11 -82 C-19 -96 -23 -110 -24 -124', 'M11 -82 C19 -96 23 -110 24 -124'],
  reach: ['M-12 -80 C-19 -66 -20 -54 -19 -42', 'M11 -82 C21 -96 28 -110 32 -126'],
  hold: ['M-11 -80 C-15 -66 -8 -58 2 -60', 'M11 -80 C16 -68 14 -60 8 -60'],
}

/** Someone standing, drawn as an outline. Feet at (x, y); about 112 tall at scale 1. */
export function Standing({ x, y, scale = 1, pose = 'stand', flip = false, hand }: { x: number; y: number; scale?: number; pose?: Pose; flip?: boolean; hand: string }) {
  const [left, right] = ARMS[pose]
  const inFront = pose === 'hold'
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale})`} filter={hand}>
      {!inFront && (
        <>
          <Tube d={left} />
          <Tube d={right} />
        </>
      )}
      <path className="art-drawn" d={STAND_BODY} strokeWidth={LINE} />
      {inFront && (
        <>
          <Tube d={left} />
          <Tube d={right} />
        </>
      )}
      <circle className="art-drawn" cx={0} cy={-101} r={10} strokeWidth={LINE} />
    </g>
  )
}

const SIT_BODY = 'M-8 2 C-16 -20 -16 -46 -8 -60 C-2 -68 10 -66 14 -58 C16 -42 12 -24 10 -12 C22 -14 34 -14 42 -10 C48 -8 48 0 44 4 C44 16 46 28 48 36 C54 38 54 42 48 42 L36 42 C36 30 34 16 34 6 C20 6 4 6 -8 2 Z'

/** Someone sitting on a ledge at (x, y), facing right. `with` decides the arms. */
export function Sitting({ x, y, scale = 1, arms = 'read', flip = false, hand }: { x: number; y: number; scale?: number; arms?: 'read' | 'reach' | 'rest'; flip?: boolean; hand: string }) {
  const tubes =
    arms === 'reach'
      ? ['M-2 -58 C2 -40 18 -28 32 -18', 'M8 -60 C16 -76 24 -90 28 -106']
      : arms === 'rest'
        ? ['M-2 -58 C1 -40 14 -28 30 -16', 'M8 -58 C14 -42 26 -28 38 -16']
        : ['M-2 -58 C2 -44 14 -38 26 -40', 'M8 -58 C16 -50 24 -46 32 -44']
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale})`} filter={hand}>
      {arms === 'reach' && <Tube d={tubes[1]} />}
      <path className="art-drawn" d={SIT_BODY} strokeWidth={LINE} />
      <Tube d={tubes[0]} />
      {arms !== 'reach' && <Tube d={tubes[1]} />}
      {arms === 'read' && <rect className="art-drawn" x={24} y={-62} width={24} height={18} rx={2} strokeWidth={LINE} transform="rotate(-16 36 -53)" />}
      <circle className="art-drawn" cx={4} cy={-77} r={9.5} strokeWidth={LINE} />
    </g>
  )
}
