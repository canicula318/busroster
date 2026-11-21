import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import type { Profile } from '../App'
import type { Signup, Student } from '../types'
import { studentLabel, TRIP_LABELS } from '../types'
import { formatDate, todayNY } from '../lib/dates'
import { href } from '../lib/router'

export default function MySignups({ profile }: { profile: Profile }) {
  const [signups, setSignups] = useState<Signup[] | null>(null)
  const [students, setStudents] = useState<Map<string, Student>>(new Map())
  const [error, setError] = useState<string | null>(null)
  // Admins see everyone's in the Roster tab; here they see only their own family's.
  const [familyIds, setFamilyIds] = useState<string[] | null>(null)

  useEffect(() => {
    async function load() {
      const ids = profile.isAdmin ? profile.ownFamilyIds : profile.families.map((f) => f.id)
      setFamilyIds(ids)
      if (ids.length === 0) {
        setSignups([])
        return
      }
      const [su, st] = await Promise.all([
        supabase.from('signups').select('*, signup_students(student_id)').in('family_id', ids).order('bus_date', { ascending: false }),
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
  const famName = (id: string) => profile.families.find((f) => f.id === id)?.name ?? ''

  const renderItem = (s: Signup, editable: boolean) => (
    <li key={s.id}>
      <div>
        <div className="date">{formatDate(s.bus_date)}{familyIds && familyIds.length > 1 && <span className="muted small"> {famName(s.family_id)}</span>}</div>
        <div>{s.signup_students.map((x) => (students.get(x.student_id) ? studentLabel(students.get(x.student_id)!) : undefined)).filter(Boolean).join('、')}</div>
        {s.guest_name && <div className="muted small">ゲスト: {s.guest_name}</div>}
        <span className="trip-tag">{TRIP_LABELS[s.trip].ja}</span>
        {s.comments && <div className="comment">💬 {s.comments}</div>}
      </div>
      {editable && <a className="btn small" href={href('/', { date: s.bus_date, family: s.family_id })}>変更</a>}
    </li>
  )

  return (
    <div className="page">
      <h1 className="page-title">申込履歴 <small>My signups</small></h1>
      {familyIds?.length === 0 && <p className="muted">このアカウントには家族が登録されていません。</p>}
      <h2 className="section-label">これから</h2>
      {upcoming.length === 0 ? (
        <div className="empty">まだ申込はありません。<a className="btn primary" href={href('/')}>バスを申し込む</a></div>
      ) : (
        <ul className="signup-list">{upcoming.map((s) => renderItem(s, true))}</ul>
      )}
      {past.length > 0 && (
        <>
          <h2 className="section-label">過去</h2>
          <ul className="signup-list past">{past.map((s) => renderItem(s, false))}</ul>
        </>
      )}
    </div>
  )
}
