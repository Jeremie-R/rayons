import { Dashes, LINE, Sitting, Sparkle, Squares, Standing, Sunburst, useArtFilters } from './art'

// The sign-in page background: the illustration style spread along the edges, the middle left
// clear for the card. Drawn on a 1440 × 900 canvas that covers the screen.

export function WelcomeArt({ compact = false }: { compact?: boolean }) {
  const { defs, grain, hand } = useArtFilters()
  return (
    <svg className="welcome__art illustration" viewBox="0 0 1440 900" preserveAspectRatio={compact ? 'xMidYMin slice' : 'xMidYMid slice'} aria-hidden="true">
      {defs}
      <g filter={grain}>
        {/* Left */}
        <rect className="art-pink" x={96} y={92} width={190} height={190} transform="rotate(-14 191 187)" />
        <path className="art-blue" d="M150 900 A178 178 0 0 1 506 900 Z" />
        <path className="art-coral" d="M34 900 C20 852 46 820 30 780 C62 796 86 830 82 872 C98 852 98 828 94 812 C122 840 122 880 108 900 Z" />
        <circle className="art-periwinkle" cx={512} cy={92} r={26} />
        {/* Right */}
        <path className="art-coral" d="M1306 40 C1338 58 1352 92 1332 118 C1312 140 1278 130 1278 102 C1278 80 1294 70 1306 40 Z" />
        <path className="art-pink" d="M1230 560 C1206 520 1232 476 1272 486 C1294 452 1350 466 1344 510 C1376 528 1366 580 1328 580 C1310 610 1252 604 1230 560 Z" />
        <path className="art-blue" d="M1090 900 L1330 900 L1296 712 L1124 712 Z" />
        <circle className="art-periwinkle" cx={1392} cy={316} r={38} />
      </g>

      <Sunburst cx={330} cy={212} inner={14} outer={78} count={36} width={3} />
      <Squares x={70} y={420} cols={4} rows={3} size={22} gap={8} angle={-10} skip={[3, 9]} />
      <Sitting x={300} y={724} scale={1.7} arms="read" hand={hand} />
      <path className="art-ink art-line" d="M372 624 C404 600 404 566 386 560 C366 554 362 590 392 594 C430 600 452 540 442 506" strokeWidth={3} filter={hand} />
      <Sparkle x={448} y={488} r={12} />
      <Sparkle x={210} y={360} r={9} />
      <Dashes lines={[[438, 228, 462, 222], [432, 252, 458, 256]]} />

      <Sunburst cx={1150} cy={210} inner={10} outer={54} count={30} width={2.6} />
      <Squares x={960} y={96} cols={3} rows={2} size={18} gap={7} angle={12} skip={[2]} />
      <Standing x={1000} y={892} scale={1.7} pose="cheer" hand={hand} />
      <g className="art-ink art-line" strokeWidth={LINE * 1.2} filter={hand}>
        <path d="M1352 900 L1318 700 M1384 900 L1350 700" />
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const t = 0.1 + i * 0.16
          const y = 900 - 200 * t
          return <line key={i} x1={1352 - 34 * t} y1={y} x2={1384 - 34 * t} y2={y} />
        })}
      </g>
      <path className="art-ink art-line" d="M1180 420 C1120 380 1080 410 1062 470" strokeWidth={3} filter={hand} />
      <path className="art-ink art-line" d="M1056 452 L1062 472 L1080 462" strokeWidth={3} filter={hand} />
      <Sparkle x={1240} y={360} r={12} />
      <Sparkle x={1380} y={760} r={9} />
      <Dashes lines={[[1206, 300, 1226, 314], [1100, 300, 1086, 316]]} />
    </svg>
  )
}
