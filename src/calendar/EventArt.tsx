import { Dashes, LINE, Sparkle, Squares, Sunburst, useArtFilters } from '../components/art'
import type { CalendarEvent } from '../lib/types'

// A picture for an event, like Google Calendar's: chosen from words in the title ("coffee",
// "fika", "flight"…), or picked by hand in the event form (kept on the event in Google as a
// private property). All drawn here, so nothing is fetched.

export const ART_THEMES = ['coffee', 'meal', 'drinks', 'travel', 'party', 'sport', 'health', 'call', 'learn', 'delivery', 'show', 'nature'] as const
export type ArtTheme = (typeof ART_THEMES)[number]

export const ART_LABELS: Record<ArtTheme, string> = {
  coffee: 'Coffee',
  meal: 'Meal',
  drinks: 'Drinks',
  travel: 'Travel',
  party: 'Celebration',
  sport: 'Sport',
  health: 'Health',
  call: 'Meeting',
  learn: 'Learning',
  delivery: 'Delivery',
  show: 'Show',
  nature: 'Outdoors',
}

// Checked in order: "coffee meeting" is coffee, "lunch meeting" is a meal.
const WORDS: [ArtTheme, RegExp][] = [
  ['coffee', /\b(coffee|café|cafe|fika|espresso|latte|cappuccino|kaffe|tea|thé|te)\b/],
  ['meal', /\b(lunch|dinner|breakfast|brunch|restaurant|meal|food|bbq|barbecue|picnic|middag|frukost|lunsj|déjeuner|dejeuner|dîner|diner|repas|pizza|sushi)\b/],
  ['drinks', /\b(drinks?|beers?|wine|cocktails?|apéro|apero|afterwork|after work|bar|öl|vin|pub)\b/],
  ['travel', /\b(flight|fly|flying|airport|plane|train|trip|travel|hotel|check-?in|check-?out|holiday|vacation|journey|flyg|tåg|resa|semester|vol|voyage|vacances|gare|aéroport|aeroport|booking)\b/],
  ['party', /\b(birthday|party|anniversary|wedding|celebration|celebrate|graduation|kalas|födelsedag|fest|bröllop|anniversaire|fête|fete|mariage)\b/],
  ['sport', /\b(gym|run|running|jog|yoga|pilates|swim|swimming|football|soccer|tennis|padel|workout|training|climbing|bike|cycling|ski|skiing|match|träning|löpning|simning|sport|course à pied|natation|entraînement)\b/],
  ['health', /\b(doctor|dentist|hospital|clinic|appointment|vaccine|vaccination|therapy|physio|checkup|check-up|läkare|tandläkare|vårdcentral|sjukhus|médecin|medecin|dentiste|kiné|rdv)\b/],
  ['call', /\b(call|meeting|meet|zoom|teams|sync|standup|stand-up|interview|1:1|one-on-one|review|möte|samtal|réunion|reunion|entretien|appel)\b/],
  ['learn', /\b(class|course|lecture|crit|workshop|exam|school|seminar|lesson|study|reading|kurs|lektion|föreläsning|cours|atelier|examen|formation)\b/],
  ['delivery', /\b(delivery|deliver|package|parcel|pickup|pick-up|pick up|move|moving|van|leverans|paket|flytt|livraison|colis|déménagement|demenagement)\b/],
  ['show', /\b(concert|gig|movie|cinema|film|theatre|theater|show|opera|museum|exhibition|festival|bio|teater|konsert|cinéma|théâtre|spectacle|expo)\b/],
  ['nature', /\b(hike|hiking|walk|park|beach|garden|forest|camping|picnic|promenad|vandring|strand|randonnée|randonnee|plage|jardin)\b/],
]

/** The theme for an event: picked by hand, from its words, or none. */
export function artFor(event: Pick<CalendarEvent, 'title' | 'art'>): ArtTheme | null {
  if (event.art === 'none') return null
  if (event.art && (ART_THEMES as readonly string[]).includes(event.art)) return event.art as ArtTheme
  const text = event.title.toLowerCase()
  return WORDS.find(([, pattern]) => pattern.test(text))?.[0] ?? null
}

interface SceneProps {
  grain: string
  hand: string
}

// Each picture: one or two grainy shapes, the thing itself drawn in line, a small accent.
// Drawn in a 340 × 120 box, mostly in the middle so it crops well on narrow cards.
function Scene({ theme, grain, hand }: { theme: ArtTheme } & SceneProps) {
  const drawn = { className: 'art-drawn', strokeWidth: LINE, filter: hand }
  const line = { className: 'art-ink art-line', strokeWidth: LINE, filter: hand }
  switch (theme) {
    case 'coffee':
      return (
        <>
          <path className="art-pink" filter={grain} d="M128 92 C110 70 124 34 156 36 C172 14 214 22 212 50 C236 60 230 100 200 100 C186 116 146 114 128 92 Z" />
          <path {...drawn} d="M146 50 H194 V72 a22 22 0 0 1 -22 22 H168 a22 22 0 0 1 -22 -22 Z" />
          <path {...line} d="M194 58 a11 11 0 0 1 0 22 M136 104 H204" />
          <path {...line} d="M160 40 C154 32 166 26 160 16 M178 40 C172 32 184 26 178 16" />
          <Sparkle x={240} y={30} r={7} />
          <Squares x={86} y={28} cols={2} rows={2} size={9} gap={4} angle={-10} skip={[1]} />
        </>
      )
    case 'meal':
      return (
        <>
          <circle className="art-coral" filter={grain} cx={170} cy={64} r={44} />
          <circle {...drawn} cx={170} cy={64} r={28} />
          <path {...line} d="M116 22 V104 M108 22 V40 a8 8 0 0 0 16 0 V22 M226 22 C238 32 238 56 226 62 V104" />
          <Sparkle x={258} y={34} r={7} />
          <Dashes lines={[[82, 52, 94, 58], [80, 72, 94, 72]]} />
        </>
      )
    case 'drinks':
      return (
        <>
          <path className="art-periwinkle" filter={grain} d="M110 120 A60 60 0 0 1 230 120 Z" />
          <path {...drawn} d="M136 34 H170 C170 58 162 70 153 70 C144 70 136 58 136 34 Z M153 70 V100 M142 100 H164" transform="rotate(-12 153 67)" />
          <path {...drawn} d="M176 34 H210 C210 58 202 70 193 70 C184 70 176 58 176 34 Z M193 70 V100 M182 100 H204" transform="rotate(12 193 67)" />
          <Sunburst cx={172} cy={18} inner={3} outer={14} count={12} width={2} />
          <Dashes lines={[[246, 40, 260, 34], [248, 58, 262, 60]]} />
        </>
      )
    case 'travel':
      return (
        <>
          <path className="art-blue" filter={grain} d="M220 10 C256 20 276 56 266 92 C252 64 230 44 204 36 Z" />
          <path {...line} d="M70 96 C110 110 130 70 170 64" strokeDasharray="2 9" />
          <g transform="translate(196 58) rotate(-16)" filter={hand}>
            <path className="art-drawn" strokeWidth={LINE} d="M-6 -6 L-20 -34 H-10 L14 -6 Z M-6 6 L-20 34 H-10 L14 6 Z M-36 -4 L-44 -16 H-38 L-26 -4 Z" />
            <path className="art-drawn" strokeWidth={LINE} d="M-40 0 C-40 -6 -30 -8 0 -8 H28 C38 -8 44 -4 44 0 C44 4 38 8 28 8 H0 C-30 8 -40 6 -40 0 Z" />
          </g>
          <Sparkle x={96} y={30} r={7} />
        </>
      )
    case 'party':
      return (
        <>
          <g filter={grain}>
            <ellipse className="art-pink" cx={150} cy={44} rx={20} ry={25} />
            <ellipse className="art-coral" cx={192} cy={36} rx={19} ry={24} />
          </g>
          <path {...line} d="M150 70 C144 84 156 92 150 112 M192 61 C198 78 186 90 194 112" />
          <Sunburst cx={246} cy={52} inner={5} outer={24} count={18} width={2} />
          <Dashes lines={[[96, 30, 106, 40], [100, 70, 112, 66], [276, 92, 288, 86]]} />
          <Sparkle x={112} y={96} r={6} />
        </>
      )
    case 'sport':
      return (
        <>
          <path className="art-periwinkle" filter={grain} d="M118 120 A54 54 0 0 1 226 120 Z" />
          <circle {...drawn} cx={172} cy={58} r={26} />
          <path {...line} d="M150 44 C164 52 180 52 194 44 M150 72 C164 64 180 64 194 72 M172 32 V84" />
          <Dashes lines={[[106, 46, 132, 46], [100, 60, 128, 60], [108, 74, 132, 74]]} className="art-ink" />
          <Sparkle x={236} y={24} r={7} />
        </>
      )
    case 'health':
      return (
        <>
          <rect className="art-pink" filter={grain} x={138} y={26} width={68} height={68} rx={6} transform="rotate(-8 172 60)" />
          <path {...drawn} d="M164 36 H180 V52 H196 V68 H180 V84 H164 V68 H148 V52 H164 Z" />
          <path {...line} d="M92 66 c-12 -12 -12 -26 0 -26 c7 0 10 5 10 5 c0 0 3 -5 10 -5 c12 0 12 14 0 26 l-10 10 Z" />
          <Sparkle x={248} y={36} r={7} />
        </>
      )
    case 'call':
      return (
        <>
          <rect className="art-periwinkle" filter={grain} x={170} y={40} width={88} height={56} rx={10} />
          <path {...drawn} d="M106 24 H186 a10 10 0 0 1 10 10 V66 a10 10 0 0 1 -10 10 H136 L118 92 V76 H106 a10 10 0 0 1 -10 -10 V34 a10 10 0 0 1 10 -10 Z" />
          <g className="art-ink">
            <circle cx={126} cy={50} r={4} />
            <circle cx={146} cy={50} r={4} />
            <circle cx={166} cy={50} r={4} />
          </g>
          <Sparkle x={274} y={28} r={7} />
        </>
      )
    case 'learn':
      return (
        <>
          <path className="art-blue" filter={grain} d="M122 120 L222 120 L206 64 L138 64 Z" />
          <path {...drawn} d="M172 36 C154 26 128 26 110 32 V90 C128 84 154 84 172 94 Z M172 36 C190 26 216 26 234 32 V90 C216 84 190 84 172 94 Z" />
          <path {...line} d="M122 46 C136 42 150 42 160 46 M122 60 C136 56 150 56 160 60" />
          <g transform="rotate(-24 266 52)">
            <path {...drawn} d="M260 20 H272 V70 L266 82 L260 70 Z" />
            <path {...line} d="M260 30 H272 M260 70 H272" />
          </g>
          <Sparkle x={82} y={34} r={6} />
        </>
      )
    case 'delivery':
      return (
        <>
          <rect className="art-coral" filter={grain} x={140} y={30} width={70} height={70} transform="rotate(10 175 65)" />
          <path {...drawn} d="M140 46 L176 34 L212 46 L176 58 Z M140 46 L176 58 V98 L140 86 Z M212 46 L176 58 V98 L212 86 Z" />
          <path {...line} d="M156 40 L192 52 V64" />
          <path {...line} d="M82 92 C80 60 102 40 128 38 M120 30 L129 38 L121 47" />
          <Sparkle x={248} y={32} r={7} />
        </>
      )
    case 'show':
      return (
        <>
          <path className="art-pink" filter={grain} d="M118 76 C104 52 124 26 150 34 C166 14 206 18 206 46 C228 52 226 86 200 88 C188 106 140 104 118 76 Z" />
          <path {...drawn} d="M120 40 H220 V54 a8 8 0 0 0 0 16 V84 H120 V70 a8 8 0 0 0 0 -16 Z" />
          <path {...line} d="M190 44 V80" strokeDasharray="3 5" />
          <Sparkle x={154} y={62} r={10} />
          <path {...line} d="M252 26 V66 M252 26 L274 20 V58" />
          <circle className="art-ink" cx={247} cy={68} r={6} />
          <circle className="art-ink" cx={269} cy={60} r={6} />
        </>
      )
    case 'nature':
      return (
        <>
          <g filter={grain}>
            <path className="art-blue" d="M96 120 L156 40 L206 120 Z" />
            <path className="art-periwinkle" d="M168 120 L218 62 L262 120 Z" />
          </g>
          <Sunburst cx={252} cy={30} inner={6} outer={24} count={20} width={2} />
          <path {...line} d="M60 112 C90 96 116 104 136 112 M220 112 C246 100 270 104 296 112" />
          <Sparkle x={86} y={36} r={6} />
        </>
      )
  }
}

/** The picture for an event (nothing when it has none). */
export function EventArt({ event, compact }: { event: Pick<CalendarEvent, 'title' | 'art'>; compact?: boolean }) {
  const theme = artFor(event)
  if (!theme) return null
  return <ArtFor theme={theme} compact={compact} />
}

/** `compact`: only the middle of the picture, for small cards. */
export function ArtFor({ theme, compact }: { theme: ArtTheme; compact?: boolean }) {
  const { defs, grain, hand } = useArtFilters()
  return (
    <svg className={`event-art ${compact ? 'event-art--compact' : ''}`} viewBox={compact ? '76 4 200 112' : '0 0 340 120'} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {defs}
      <Scene theme={theme} grain={grain} hand={hand} />
    </svg>
  )
}
