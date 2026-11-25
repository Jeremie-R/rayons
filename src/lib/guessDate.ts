// Finds the first date (and time, if any) written in a mail, to start a new event there.
// Knows English, Swedish, Danish/Norwegian, French and German month names, and ISO dates.
// Returns null when nothing plausible is found (in the past, or more than two years ahead).

const MONTHS: [RegExp, number][] = [
  [/^jan/, 0],
  [/^feb|^fév/, 1],
  [/^mar|^mär/, 2],
  [/^apr|^avr/, 3],
  [/^ma[jiy]$|^mai|^may/, 4],
  [/^jun|^juin/, 5],
  [/^jul|^juil/, 6],
  [/^aug|^aoû|^aou/, 7],
  [/^sep/, 8],
  [/^o[ck]t/, 9],
  [/^nov/, 10],
  [/^de[cz]|^déc/, 11],
]
const MONTH_WORD = '(jan\\w*|feb\\w*|fév\\w*|mar\\w*|mär\\w*|apr\\w*|avr\\w*|maj|mai|may|jun\\w*|juin|jul\\w*|juil\\w*|aug\\w*|août|aou\\w*|sep\\w*|o[ck]t\\w*|nov\\w*|de[cz]\\w*|déc\\w*)'

function month(word: string) {
  const lower = word.toLowerCase().replace(/\.$/, '')
  return MONTHS.find(([pattern]) => pattern.test(lower))?.[1] ?? -1
}

const TIME = '(?:\\D{0,24}?(?:kl\\.?|at|à|um|om)?\\s*(\\d{1,2})[:.h](\\d{2}))?'
const PATTERNS: { regex: RegExp; read: (m: RegExpMatchArray) => [number, number, number | null, number | null, number | null] }[] = [
  // 2026-11-25 10:30
  { regex: new RegExp(`\\b(\\d{4})-(\\d{2})-(\\d{2})(?:[ T](\\d{1,2}):(\\d{2}))?`), read: (m) => [Number(m[3]), Number(m[2]) - 1, Number(m[1]), num(m[4]), num(m[5])] },
  // 25 november 2026 10:30 · 25. november · le 25 novembre à 10h30
  { regex: new RegExp(`\\b(\\d{1,2})\\.?\\s+${MONTH_WORD}\\.?(?:\\s+(\\d{4}))?${TIME}`, 'i'), read: (m) => [Number(m[1]), month(m[2]), num(m[3]), num(m[4]), num(m[5])] },
  // November 25, 2026 at 10:30
  { regex: new RegExp(`\\b${MONTH_WORD}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?(?:\\s+(\\d{4}))?${TIME}`, 'i'), read: (m) => [Number(m[2]), month(m[1]), num(m[3]), num(m[4]), num(m[5])] },
]

const num = (value: string | undefined) => (value === undefined ? null : Number(value))

export function guessDate(text: string, now = new Date()): { start: Date; hasTime: boolean } | null {
  let best: { start: Date; hasTime: boolean; index: number } | null = null
  for (const { regex, read } of PATTERNS) {
    const match = text.match(regex)
    if (!match || match.index === undefined) continue
    const [day, monthIndex, yearOrNull, hour, minute] = read(match)
    if (monthIndex < 0 || day < 1 || day > 31) continue
    let year = yearOrNull ?? now.getFullYear()
    const hasTime = hour !== null && minute !== null && hour < 24 && minute < 60
    let start = new Date(year, monthIndex, day, hasTime ? hour! : 9, hasTime ? minute! : 0)
    // "25 november" with no year, already past: next year.
    if (yearOrNull === null && start.getTime() < now.getTime() - 86_400_000) {
      year += 1
      start = new Date(year, monthIndex, day, start.getHours(), start.getMinutes())
    }
    if (start.getMonth() !== monthIndex) continue // 31 November and the like
    const ahead = start.getTime() - now.getTime()
    if (ahead < -86_400_000 || ahead > 2 * 365 * 86_400_000) continue
    if (!best || match.index < best.index) best = { start, hasTime, index: match.index }
  }
  return best && { start: best.start, hasTime: best.hasTime }
}
