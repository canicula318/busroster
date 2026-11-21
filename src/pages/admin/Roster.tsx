import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import type { Profile } from '../../App'
import type { Signup, Student } from '../../types'
import { TRIP_LABELS, ridesOutbound, ridesReturn } from '../../types'
import { chipLabel, formatDate, formatDateTime, upcomingSaturdays } from '../../lib/dates'
import { downloadCsv } from '../../lib/csv'
import { href } from '../../lib/router'

const ALL = 'all'

export default function Roster({ profile }: { profile: Profile }) {
  const [signups, setSignups] = useState<Signup[] | null>(null)
  const [students, setStudents] = useState<Map<string, Student>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [date, setDate] = useState(upcomingSaturdays(1)[0])

  useEffect(() => {
    Promise.all([
      supabase.from('signups').select('*, signup_students(student_id)').order('bus_date', { ascending: false }),
      supabase.from('students').select('*'),
    ]).then(([su, st]) => {
      if (su.error || st.error) return setError((su.error ?? st.error)!.message)
      setSignups(su.data as Signup[])
      setStudents(new Map((st.data as Student[]).map((s) => [s.id, s])))
    })
  }, [])

  const famName = (id: string) => profile.families.find((f) => f.id === id)?.name ?? '?'

  const dates = useMemo(() => {
    const set = new Set(upcomingSaturdays(8))
    signups?.forEach((s) => set.add(s.bus_date))
    return [...set].sort().reverse()
  }, [signups])

  const rows = useMemo(
    () => (signups ?? []).filter((s) => date === ALL || s.bus_date === date).sort((a, b) => a.bus_date.localeCompare(b.bus_date) || famName(a.family_id).localeCompare(famName(b.family_id))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signups, date, profile.families],
  )

  const names = (s: Signup) => s.signup_students.map((x) => students.get(x.student_id)?.name ?? '?')
  const riders = (s: Signup) => names(s).length + (s.guest_name ? 1 : 0)
  const outbound = rows.filter((s) => ridesOutbound(s.trip)).reduce((n, s) => n + riders(s), 0)
  const ret = rows.filter((s) => ridesReturn(s.trip)).reduce((n, s) => n + riders(s), 0)

  function exportCsv() {
    downloadCsv(`busroster-${date}.csv`, [
      ['バス利用日', '家族', '生徒', 'ゲスト', '利用', '行き', '帰り', 'コメント', '送信者', '更新日時'],
      ...rows.map((s) => [
        s.bus_date, famName(s.family_id), names(s).join(' / '), s.guest_name, TRIP_LABELS[s.trip].ja,
        ridesOutbound(s.trip) ? riders(s) : 0, ridesReturn(s.trip) ? riders(s) : 0, s.comments, s.created_by, s.updated_at,
      ]),
    ])
  }

  if (error) return <div className="banner error">{error}</div>
  if (!signups) return <div className="muted pad">読み込み中…</div>

  const upcoming = upcomingSaturdays(8)
  const chipDates = [...new Set([...upcoming, ...(date !== ALL ? [date] : [])])].sort()
  const pastDates = dates.filter((d) => !chipDates.includes(d))

  return (
    <div className="page">
      <h1 className="page-title">名簿 <small>Roster</small></h1>

      <div className="chips">
        {chipDates.map((d) => {
          const { md, rel } = chipLabel(d, upcoming)
          const n = (signups ?? []).filter((s) => s.bus_date === d).length
          return (
            <button type="button" key={d} className={'chip-date' + (date === d ? ' on' : '')} onClick={() => setDate(d)}>
              <span className="chip-rel">{rel || '土'}</span>
              <span className="chip-md">{md}</span>
              {n > 0 && <span className="chip-dot">{n}家族</span>}
            </button>
          )
        })}
      </div>
      <div className="row wrap">
        <select className="grow" value={chipDates.includes(date) ? '' : date} onChange={(e) => e.target.value && setDate(e.target.value)}>
          <option value="">過去の日付・すべて…</option>
          <option value={ALL}>すべての日付</option>
          {pastDates.map((d) => <option key={d} value={d}>{formatDate(d)}</option>)}
        </select>
        <button className="btn" onClick={exportCsv} disabled={rows.length === 0}>CSV</button>
        <a className="btn" href={href('/', date !== ALL ? { date } : undefined)}>代理申込</a>
      </div>

      {date !== ALL && (
        <div className="stats">
          <div><div className="stat">{outbound}</div><div className="muted small">行き</div></div>
          <div><div className="stat">{ret}</div><div className="muted small">帰り</div></div>
          <div><div className="stat">{rows.length}</div><div className="muted small">家族</div></div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="empty">この日の申込はありません。</div>
      ) : (
        <ul className="signup-list">
          {rows.map((s) => (
            <li key={s.id} className={s.trip === 'none' ? 'dim' : ''}>
              <div>
                <div className="date">
                  {famName(s.family_id)}
                  {date === ALL && <span className="muted small"> ・ {formatDate(s.bus_date)}</span>}
                </div>
                <div>{names(s).join('、')}</div>
                {s.guest_name && <div className="muted small">ゲスト: {s.guest_name}</div>}
                <span className="trip-tag">{TRIP_LABELS[s.trip].ja}</span>
                {s.comments && <div className="comment">💬 {s.comments}</div>}
                <div className="muted small">{formatDateTime(s.updated_at)} {s.created_by}</div>
              </div>
              <a className="btn small" href={href('/', { date: s.bus_date, family: s.family_id })}>編集</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
