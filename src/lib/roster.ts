import { supabase } from '../supabase'
import type { RosterRow, Stop } from '../types'
import { TRIP_LABELS, ridesOutbound, ridesReturn } from '../types'
import { formatDate } from './dates'

export async function fetchRoster(date: string): Promise<RosterRow[]> {
  const { data, error } = await supabase.rpc('weekly_roster', { p_date: date })
  if (error) throw error
  return (data ?? []) as RosterRow[]
}

export const personLabel = (r: Pick<RosterRow, 'name' | 'name_ja'>) => r.name_ja || r.name

export interface StopSummary {
  stop: Stop | null
  rows: RosterRow[]
  out: number
  ret: number
}

/** Rows grouped by stop (in route order), with ride counts per stop. */
export function byStop(rows: RosterRow[], stops: Stop[]): StopSummary[] {
  const pickup = stops.filter((s) => s.kind === 'stop')
  const groups: StopSummary[] = pickup.map((stop) => ({ stop, rows: [], out: 0, ret: 0 }))
  const other: StopSummary = { stop: null, rows: [], out: 0, ret: 0 }
  for (const r of [...rows].sort((a, b) => a.sort - b.sort)) {
    const g = groups.find((x) => x.stop?.id === r.stop_id) ?? other
    g.rows.push(r)
    if (ridesOutbound(r.trip)) g.out++
    if (ridesReturn(r.trip)) g.ret++
  }
  return other.rows.length ? [...groups, other] : groups
}

/** Text the 当番 pastes into the LINE group. */
export function lineMessage(date: string, rows: RosterRow[], stops: Stop[]): string {
  const groups = byStop(rows, stops)
  const lines: string[] = [`【サミットライン】${formatDate(date)} バス`, '']
  const changed = rows.filter((r) => r.changed)

  if (changed.length === 0) {
    lines.push('今週の変更はありません（全員往復）。')
  } else {
    lines.push('▼今週の変更')
    for (const g of groups) {
      const ch = g.rows.filter((r) => r.changed)
      if (!ch.length) continue
      lines.push(`■${g.stop?.name ?? 'その他'}`)
      for (const r of ch) {
        const who = r.kind === 'guest' ? `ゲスト ${r.name}（${r.family_name.split(' ')[0]}）` : personLabel(r)
        lines.push(`・${who}：${TRIP_LABELS[r.trip].ja}`)
      }
    }
  }

  const notes = new Map<string, string>()
  rows.forEach((r) => r.comments && notes.set(r.family_id, `・${r.family_name.split(' ')[0]}：${r.comments}`))
  if (notes.size) lines.push('', '▼連絡事項', ...notes.values())

  lines.push('', '▼人数')
  for (const g of groups) {
    if (!g.stop) continue
    lines.push(`${g.stop.name}：行き ${g.out}人／帰り ${g.ret}人`)
  }
  const totalOut = groups.reduce((n, g) => n + g.out, 0)
  const totalRet = groups.reduce((n, g) => n + g.ret, 0)
  lines.push(`合計：行き ${totalOut}人／帰り ${totalRet}人`)
  lines.push('', '間違いがあれば、このLINEで訂正をお願いします。')
  return lines.join('\n')
}
