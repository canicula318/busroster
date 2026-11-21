// All bus dates are plain 'YYYY-MM-DD' strings in New York time.

const TZ = 'America/New_York'

export function todayNY(): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function parse(d: string): Date {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day))
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function isSaturday(d: string): boolean {
  return parse(d).getUTCDay() === 6
}

/** The next `count` Saturdays, starting today if today is a Saturday. */
export function upcomingSaturdays(count: number, from = todayNY()): string[] {
  const d = parse(from)
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7))
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    out.push(toIso(d))
    d.setUTCDate(d.getUTCDate() + 7)
  }
  return out
}

export function formatDate(d: string): string {
  const dt = parse(d)
  const ja = new Intl.DateTimeFormat('ja-JP', { timeZone: 'UTC', month: 'long', day: 'numeric', weekday: 'short' }).format(dt)
  const year = dt.getUTCFullYear()
  return year === Number(todayNY().slice(0, 4)) ? ja : `${year}年${ja}`
}

export function formatDateTime(ts: string): string {
  return new Intl.DateTimeFormat('ja-JP', { timeZone: TZ, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(ts))
}

/** The next `count` Saturdays with a bus (school holidays skipped). */
export function busSaturdays(count: number, noBus: Set<string>, from = todayNY()): string[] {
  return upcomingSaturdays(count + noBus.size + 2, from).filter((d) => !noBus.has(d)).slice(0, count)
}

/** Short label for date chips: "11/21" plus 今週 / 来週 based on the actual date. */
export function chipLabel(d: string, _upcoming?: string[]): { md: string; rel: string } {
  const [, m, day] = d.split('-').map(Number)
  const thisSat = upcomingSaturdays(1)[0]
  const diff = Math.round((parse(d).getTime() - parse(thisSat).getTime()) / 86400000)
  const rel = diff === 0 ? (d === todayNY() ? '今日' : '今週') : diff === 7 ? '来週' : ''
  return { md: `${m}/${day}`, rel }
}
