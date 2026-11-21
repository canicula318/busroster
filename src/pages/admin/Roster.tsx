import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import type { Profile } from '../../App'
import type { Signup, Student } from '../../types'
import { TRIP_LABELS, ridesOutbound, ridesReturn } from '../../types'
import { formatDate, formatDateTime, upcomingSaturdays } from '../../lib/dates'
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

  if (error) return <div className="card error">{error}</div>
  if (!signups) return <div className="card muted">読み込み中…</div>

  return (
    <div className="card">
      <h1>名簿 <span className="muted small">Roster</span></h1>
      <div className="row wrap">
        <label className="field inline">
          <span>日付</span>
          <select value={date} onChange={(e) => setDate(e.target.value)}>
            <option value={ALL}>すべて / All dates</option>
            {dates.map((d) => <option key={d} value={d}>{formatDate(d)}</option>)}
          </select>
        </label>
        <button className="btn" onClick={exportCsv} disabled={rows.length === 0}>CSVダウンロード</button>
        <a className="btn" href={href('/', date !== ALL ? { date } : undefined)}>代理で申込 / Add signup</a>
      </div>

      {date !== ALL && (
        <div className="stats">
          <div><div className="stat">{outbound}</div><div className="muted small">行き / To school</div></div>
          <div><div className="stat">{ret}</div><div className="muted small">帰り / Home</div></div>
          <div><div className="stat">{rows.length}</div><div className="muted small">家族 / Families</div></div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="muted">申込はありません。</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>日付</th><th>家族</th><th>生徒</th><th>利用</th><th>コメント</th><th>更新</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className={s.trip === 'none' ? 'dim' : ''}>
                  <td>{formatDate(s.bus_date)}</td>
                  <td><b>{famName(s.family_id)}</b></td>
                  <td>{names(s).join('、')}{s.guest_name && <div className="muted small">ゲスト: {s.guest_name}</div>}</td>
                  <td>{TRIP_LABELS[s.trip].ja}</td>
                  <td className="small">{s.comments}</td>
                  <td className="muted small">{formatDateTime(s.updated_at)}<div>{s.created_by}</div></td>
                  <td><a href={href('/', { date: s.bus_date, family: s.family_id })}>編集</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
