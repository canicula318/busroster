import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import type { Profile } from '../App'
import type { Signup, Student } from '../types'
import { SIGNUP_SELECT, TRIP_LABELS, studentLabel } from '../types'
import { formatDate, todayNY } from '../lib/dates'
import { href } from '../lib/router'

/** The change notices this family has sent. */
export default function MySignups({ profile }: { profile: Profile }) {
  const [signups, setSignups] = useState<Signup[] | null>(null)
  const [students, setStudents] = useState<Map<string, Student>>(new Map())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ids = profile.isAdmin ? profile.ownFamilyIds : profile.families.map((f) => f.id)
    async function load() {
      if (ids.length === 0) return setSignups([])
      const [su, st] = await Promise.all([
        supabase.from('signups').select(SIGNUP_SELECT).in('family_id', ids).order('bus_date', { ascending: false }),
        supabase.from('students').select('*').in('family_id', ids),
      ])
      if (su.error || st.error) return setError((su.error ?? st.error)!.message)
      setSignups(su.data as Signup[])
      setStudents(new Map((st.data as Student[]).map((s) => [s.id, s])))
    }
    load()
  }, [profile])

  if (error) return <div className="banner error">{error}</div>
  if (!signups) return <div className="muted pad">読み込み中…</div>

  const today = todayNY()
  const upcoming = signups.filter((s) => s.bus_date >= today).reverse()
  const past = signups.filter((s) => s.bus_date < today)

  const renderItem = (s: Signup, editable: boolean) => (
    <li key={s.id}>
      <div>
        <div className="date">{formatDate(s.bus_date)}</div>
        {s.signup_students.map((x) => {
          const st = students.get(x.student_id)
          return (
            <div key={x.student_id} className="change-line">
              {st ? studentLabel(st) : '?'} <span className="trip-tag">{TRIP_LABELS[x.trip].ja}</span>
            </div>
          )
        })}
        {s.signup_guests.map((g) => (
          <div key={g.id} className="change-line">
            ゲスト {g.name} <span className="trip-tag">{TRIP_LABELS[g.trip].ja}</span>
          </div>
        ))}
        {s.comments && <div className="comment">💬 {s.comments}</div>}
      </div>
      {editable && <a className="btn small" href={href('/', { date: s.bus_date, family: s.family_id })}>修正する</a>}
    </li>
  )

  return (
    <div className="page">
      <h1 className="page-title">連絡履歴 <small>My notices</small></h1>
      <p className="lead">これまでに送った変更連絡の一覧です。<br />ここに載っていない土曜日は、いつもどおり<b>全員往復</b>で乗車します。</p>
      <h2 className="section-label">今後の連絡</h2>
      {upcoming.length === 0 ? (
        <div className="empty">今後の変更連絡はありません。<br />すべての土曜日、いつもどおり全員往復です。<a className="btn primary" href={href('/')}>変更を連絡する</a></div>
      ) : (
        <ul className="signup-list">{upcoming.map((s) => renderItem(s, true))}</ul>
      )}
      {past.length > 0 && (
        <>
          <h2 className="section-label">過去の連絡</h2>
          <ul className="signup-list past">{past.map((s) => renderItem(s, false))}</ul>
        </>
      )}
    </div>
  )
}
