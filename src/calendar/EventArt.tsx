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

const BACKGROUND: Record<ArtTheme, string> = {
  coffee: 'art-cream',
  meal: 'art-blush',
  drinks: 'art-lilac',
  travel: 'art-sky',
  party: 'art-sun-soft',
  sport: 'art-sage',
  health: 'art-mint',
  call: 'art-lilac',
  learn: 'art-cream',
  delivery: 'art-sun-soft',
  show: 'art-blush',
  nature: 'art-sage',
}

function Scene({ theme }: { theme: ArtTheme }) {
  switch (theme) {
    case 'coffee':
      return (
        <>
          <ellipse className="art-paper" cx={170} cy={104} rx={58} ry={10} />
          <path className="art-coral" d="M130 52 H206 V80 a30 30 0 0 1 -30 30 H160 a30 30 0 0 1 -30 -30 Z" />
          <path className="art-coral art-stroke" d="M206 62 a14 14 0 0 1 0 28" strokeWidth={8} />
          <path className="art-cocoa art-stroke" d="M154 40 c-6 -8 6 -12 0 -22 M172 40 c-6 -8 6 -12 0 -22 M190 40 c-6 -8 6 -12 0 -22" strokeWidth={4} strokeLinecap="round" />
          <circle className="art-sun" cx={62} cy={40} r={14} />
          <circle className="art-lilac" cx={272} cy={86} r={18} />
        </>
      )
    case 'meal':
      return (
        <>
          <circle className="art-paper" cx={170} cy={66} r={46} />
          <circle className="art-sun-soft" cx={170} cy={66} r={32} />
          <circle className="art-coral" cx={160} cy={60} r={10} />
          <circle className="art-sage-strong" cx={182} cy={74} r={8} />
          <path className="art-cocoa art-stroke" d="M100 30 V102 M92 30 V54 a8 8 0 0 0 16 0 V30 M240 30 c12 10 12 34 0 40 V102" strokeWidth={5} strokeLinecap="round" />
          <circle className="art-periwinkle" cx={286} cy={30} r={10} />
        </>
      )
    case 'drinks':
      return (
        <>
          <path className="art-paper" d="M130 30 H170 L162 80 H138 Z" transform="rotate(-10 150 60)" />
          <path className="art-sun" d="M134 44 H166 L160 78 H140 Z" transform="rotate(-10 150 60)" />
          <path className="art-paper" d="M178 30 H218 L210 80 H186 Z" transform="rotate(10 198 60)" />
          <path className="art-coral" d="M182 50 H214 L208 78 H188 Z" transform="rotate(10 198 60)" />
          <path className="art-cocoa art-stroke" d="M146 86 V108 M200 86 V108" strokeWidth={5} strokeLinecap="round" />
          <circle className="art-paper" cx={174} cy={22} r={4} />
          <circle className="art-paper" cx={184} cy={12} r={3} />
          <circle className="art-periwinkle" cx={60} cy={84} r={16} />
        </>
      )
    case 'travel':
      return (
        <>
          <path className="art-paper" d="M40 96 a22 22 0 0 1 40 -12 a16 16 0 0 1 28 12 Z" />
          <path className="art-paper" d="M236 50 a16 16 0 0 1 30 -8 a12 12 0 0 1 22 8 Z" />
          <path className="art-periwinkle-strong art-stroke" d="M70 70 Q150 -10 236 40" strokeWidth={3} strokeDasharray="2 10" strokeLinecap="round" />
          <g transform="translate(176 62) rotate(-18)">
            <path className="art-coral" d="M-40 0 C-40 -6 -30 -8 0 -8 H30 C40 -8 46 -4 46 0 C46 4 40 8 30 8 H0 C-30 8 -40 6 -40 0 Z" />
            <path className="art-coral" d="M2 -6 L-14 -34 H-4 L22 -6 Z M2 6 L-14 34 H-4 L22 6 Z M-34 -4 L-44 -18 H-38 L-24 -4 Z" />
          </g>
          <circle className="art-sun" cx={290} cy={96} r={12} />
        </>
      )
    case 'party':
      return (
        <>
          <path className="art-cocoa art-stroke" d="M140 70 C136 90 150 96 144 120 M184 60 C190 84 176 94 184 120 M222 74 C218 92 230 100 224 120" strokeWidth={2} />
          <ellipse className="art-coral" cx={140} cy={46} rx={20} ry={25} />
          <ellipse className="art-periwinkle" cx={184} cy={36} rx={20} ry={25} />
          <ellipse className="art-sun" cx={222} cy={50} rx={18} ry={23} />
          {[
            [60, 30, 'art-coral'],
            [86, 80, 'art-sage-strong'],
            [270, 26, 'art-periwinkle'],
            [290, 84, 'art-coral'],
            [102, 40, 'art-sun'],
          ].map(([x, y, c]) => (
            <rect key={`${x}-${y}`} className={String(c)} x={Number(x)} y={Number(y)} width={8} height={14} rx={2} transform={`rotate(${Number(x) % 60} ${x} ${y})`} />
          ))}
        </>
      )
    case 'sport':
      return (
        <>
          <rect className="art-cocoa" x={120} y={58} width={100} height={8} rx={4} />
          <rect className="art-olive" x={104} y={36} width={18} height={52} rx={6} />
          <rect className="art-olive" x={218} y={36} width={18} height={52} rx={6} />
          <rect className="art-sage-strong" x={90} y={44} width={14} height={36} rx={5} />
          <rect className="art-sage-strong" x={236} y={44} width={14} height={36} rx={5} />
          <path className="art-paper art-stroke" d="M40 40 H70 M30 62 H66 M44 84 H72" strokeWidth={5} strokeLinecap="round" />
          <circle className="art-sun" cx={290} cy={30} r={12} />
        </>
      )
    case 'health':
      return (
        <>
          <circle className="art-paper" cx={170} cy={62} r={44} />
          <path className="art-coral" d="M160 34 H180 V52 H198 V72 H180 V90 H160 V72 H142 V52 H160 Z" />
          <path className="art-blush" d="M64 70 c-14 -14 -14 -30 0 -30 c8 0 12 6 12 6 c0 0 4 -6 12 -6 c14 0 14 16 0 30 l-12 12 Z" />
          <circle className="art-sage-strong" cx={276} cy={40} r={10} />
        </>
      )
    case 'call':
      return (
        <>
          <path className="art-paper" d="M96 24 H196 a14 14 0 0 1 14 14 V70 a14 14 0 0 1 -14 14 H128 L108 102 V84 H96 a14 14 0 0 1 -14 -14 V38 a14 14 0 0 1 14 -14 Z" />
          <path className="art-periwinkle" d="M176 46 H252 a12 12 0 0 1 12 12 V84 a12 12 0 0 1 -12 12 H244 V110 L228 96 H176 a12 12 0 0 1 -12 -12 V58 a12 12 0 0 1 12 -12 Z" />
          <circle className="art-cocoa" cx={118} cy={54} r={5} />
          <circle className="art-cocoa" cx={138} cy={54} r={5} />
          <circle className="art-cocoa" cx={158} cy={54} r={5} />
          <circle className="art-sun" cx={50} cy={92} r={12} />
        </>
      )
    case 'learn':
      return (
        <>
          <path className="art-paper" d="M170 40 C150 28 120 28 100 34 V104 C120 98 150 98 170 110 Z" />
          <path className="art-periwinkle" d="M170 40 C190 28 220 28 240 34 V104 C220 98 190 98 170 110 Z" />
          <path className="art-line-soft art-stroke" d="M114 50 C130 46 146 46 158 52 M114 66 C130 62 146 62 158 68 M114 82 C130 78 146 78 158 84" strokeWidth={3} strokeLinecap="round" />
          <g transform="translate(262 44) rotate(30)">
            <rect className="art-sun" x={-5} y={-30} width={10} height={52} rx={2} />
            <path className="art-cocoa" d="M-5 22 L0 34 L5 22 Z" />
          </g>
          <circle className="art-coral" cx={56} cy={40} r={10} />
        </>
      )
    case 'delivery':
      return (
        <>
          <path className="art-cocoa-soft" d="M140 40 L190 26 L240 40 L190 54 Z" />
          <path className="art-coral" d="M140 40 L190 54 V112 L140 98 Z" />
          <path className="art-coral-strong" d="M240 40 L190 54 V112 L240 98 Z" />
          <path className="art-paper" d="M158 35 L208 49 V64 L198 61 V47 L148 33 Z" opacity={0.8} />
          <path className="art-paper art-stroke" d="M50 60 H110 M70 80 H118 M40 100 H100" strokeWidth={5} strokeLinecap="round" />
          <circle className="art-sun" cx={286} cy={34} r={12} />
        </>
      )
    case 'show':
      return (
        <>
          <path className="art-paper" d="M104 34 H236 V52 a10 10 0 0 0 0 20 V90 H104 V72 a10 10 0 0 0 0 -20 Z" />
          <path className="art-line-soft art-stroke" d="M200 38 V86" strokeWidth={2} strokeDasharray="4 5" />
          <path className="art-coral" d="M150 44 l6 12 13 2 -9 9 2 13 -12 -6 -12 6 2 -13 -9 -9 13 -2 Z" />
          <path className="art-cocoa art-stroke" d="M266 30 V74 M266 30 L290 24 V66" strokeWidth={4} strokeLinecap="round" />
          <circle className="art-cocoa" cx={260} cy={76} r={7} />
          <circle className="art-cocoa" cx={284} cy={68} r={7} />
          <circle className="art-sun" cx={52} cy={84} r={14} />
        </>
      )
    case 'nature':
      return (
        <>
          <circle className="art-sun" cx={250} cy={40} r={18} />
          <path className="art-sage-strong" d="M0 120 L80 46 L140 98 L190 60 L260 120 Z" />
          <path className="art-olive" d="M80 46 L98 62 L86 66 L74 58 Z" opacity={0.6} />
          <path className="art-paper" d="M40 30 a12 12 0 0 1 22 -6 a10 10 0 0 1 18 6 Z" />
          <path className="art-olive" d="M262 120 L282 70 L302 120 Z" />
        </>
      )
  }
}

/** The banner at the top of an event, or a small square version for lists. */
export function EventArt({ event, size = 'banner' }: { event: Pick<CalendarEvent, 'title' | 'art'>; size?: 'banner' | 'thumb' }) {
  const theme = artFor(event)
  if (!theme) return null
  return <ArtFor theme={theme} size={size} />
}

export function ArtFor({ theme, size = 'banner' }: { theme: ArtTheme; size?: 'banner' | 'thumb' }) {
  return (
    <svg className={`event-art event-art--${size} ${BACKGROUND[theme]}-bg`} viewBox={size === 'thumb' ? '110 0 120 120' : '0 0 340 120'} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <Scene theme={theme} />
    </svg>
  )
}
