import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import type { Profile } from '../App'
import type { Signup, Student, Trip } from '../types'
import { TRIP_LABELS, TRIP_ORDER } from '../types'
import { formatDate, isSaturday, todayNY, upcomingSaturdays } from '../lib/dates'
import { href } from '../lib/router'

export default function SignupForm({ profile, params }: { profile: Profile; params: URLSearchParams }) {
  const saturdays = useMemo(() => upcomingSaturdays(16), [])
  const initialDate = params.get('date')
  const [busDate, setBusDate] = useState(
    initialDate && isSaturday(initialDate) && (initialDate >= todayNY() || profile.isAdmin) ? initialDate : saturdays[0],
  )
  const [familyId, setFamilyId] = useState(params.get('family') ?? (profile.families.length === 1 ? profile.families[0].id : ''))
  const [students, setStudents] = useState<Student[]>([])
  const [existing, setExisting] = useState<Signup | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [trip, setTrip] = useState<Trip | ''>('')
  const [guest, setGuest] = useState('')
  const [comments, setComments] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const dateOptions = useMemo(() => {
    const set = new Set(saturdays)
    if (busDate) set.add(busDate)
    return [...set].sort()
  }, [saturdays, busDate])

  // Load students + any existing signup whenever family/date changes
  useEffect(() => {
    if (!familyId) {
      setStudents([])
      setExisting(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setMessage(null)
    Promise.all([
      supabase.from('students').select('*').eq('family_id', familyId).eq('active', true).order('sort').order('name'),
      supabase.from('signups').select('*, signup_students(student_id)').eq('family_id', familyId).eq('bus_date', busDate).maybeSingle(),
    ]).then(([st, su]) => {
      if (cancelled) return
      setLoading(false)
      if (st.error || su.error) {
        setMessage({ kind: 'error', text: (st.error ?? su.error)!.message })
        return
      }
      const list = (st.data ?? []) as Student[]
      setStudents(list)
      const s = su.data as Signup | null
      setExisting(s)
      if (s) {
        setSelected(new Set(s.signup_students.map((x) => x.student_id)))
        setTrip(s.trip)
        setGuest(s.guest_name ?? '')
        setComments(s.comments ?? '')
      } else {
        setSelected(new Set(list.length === 1 ? [list[0].id] : []))
        setTrip('')
        setGuest('')
        setComments('')
      }
    })
    return () => {
      cancelled = true
    }
  }, [familyId, busDate])

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!trip) return setMessage({ kind: 'error', text: '利用方法を選んでください。 (Choose how you will ride.)' })
    if (selected.size === 0 && !guest.trim())
      return setMessage({ kind: 'error', text: '生徒を1人以上選んでください。 (Choose at least one student.)' })
    setBusy(true)
    setMessage(null)
    const { error } = await supabase.rpc('submit_signup', {
      p_family_id: familyId,
      p_bus_date: busDate,
      p_trip: trip,
      p_student_ids: [...selected],
      p_guest_name: guest,
      p_comments: comments,
    })
    setBusy(false)
    if (error) {
      setMessage({ kind: 'error', text: '保存できませんでした: ' + error.message })
      return
    }
    setMessage({ kind: 'ok', text: `${formatDate(busDate)} の申込を${existing ? '更新' : '受け付け'}ました。 Saved.` })
    const { data } = await supabase.from('signups').select('*, signup_students(student_id)').eq('family_id', familyId).eq('bus_date', busDate).maybeSingle()
    setExisting(data as Signup | null)
  }

  async function cancelSignup() {
    if (!existing) return
    setBusy(true)
    const { error } = await supabase.from('signups').delete().eq('id', existing.id)
    setBusy(false)
    if (error) return setMessage({ kind: 'error', text: '取り消しできませんでした: ' + error.message })
    setExisting(null)
    setSelected(new Set())
    setTrip('')
    setGuest('')
    setComments('')
    setMessage({ kind: 'ok', text: `${formatDate(busDate)} の申込を取り消しました。 Signup removed.` })
  }

  const locked = !profile.isAdmin && busDate < todayNY()

  return (
    <div className="card">
      <h1>Weekly Signup <span className="muted small">週ごとのバス申込</span></h1>
      <form onSubmit={submit}>
        <label className="field">
          <span>バス利用日（土曜日） / Bus date (Saturday) *</span>
          <select value={busDate} onChange={(e) => setBusDate(e.target.value)}>
            {dateOptions.map((d) => (
              <option key={d} value={d}>{formatDate(d)}</option>
            ))}
          </select>
        </label>

        {profile.families.length > 1 && (
          <label className="field">
            <span>家族 / Family *</span>
            <select value={familyId} onChange={(e) => setFamilyId(e.target.value)} required>
              <option value="">選んでください / Choose…</option>
              {profile.families.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </label>
        )}
        {profile.families.length === 1 && <p className="muted">家族 / Family: <b>{profile.families[0].name}</b></p>}

        {familyId && (
          <>
            {existing && (
              <div className="notice">
                この日はすでに申込済みです。変更して「更新」を押すか、取り消してください。
                <div className="muted small">You already signed up for this date. Change it and press Update, or remove it.</div>
              </div>
            )}

            <fieldset className="field">
              <legend>生徒 / Students *</legend>
              {loading && <div className="muted">読み込み中…</div>}
              {!loading && students.length === 0 && <div className="muted">生徒が登録されていません。バス係にご連絡ください。</div>}
              {students.map((s) => (
                <label key={s.id} className="check">
                  <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} disabled={locked} />
                  <span>{s.name}{s.grade && <span className="muted small"> {s.grade}</span>}</span>
                </label>
              ))}
            </fieldset>

            <label className="field">
              <span>一回限りのゲスト / One-time guest name</span>
              <input value={guest} onChange={(e) => setGuest(e.target.value)} disabled={locked} placeholder="例: 祖父 / e.g. grandparent" />
            </label>

            <fieldset className="field">
              <legend>利用方法 / Ride *</legend>
              {TRIP_ORDER.map((t) => (
                <label key={t} className="check">
                  <input type="radio" name="trip" checked={trip === t} onChange={() => setTrip(t)} disabled={locked} />
                  <span>{TRIP_LABELS[t].ja} <span className="muted small">{TRIP_LABELS[t].en}</span></span>
                </label>
              ))}
            </fieldset>

            <label className="field">
              <span>コメント / Comments</span>
              <textarea rows={3} value={comments} onChange={(e) => setComments(e.target.value)} disabled={locked} />
            </label>

            {locked ? (
              <p className="muted">過去の日付は変更できません。 (Past dates can't be changed.)</p>
            ) : (
              <div className="row">
                <button className="btn primary" disabled={busy || loading}>{existing ? '更新 / Update' : '送信 / Submit'}</button>
                {existing && (
                  <button type="button" className="btn danger" disabled={busy} onClick={cancelSignup}>この日の申込を取り消す / Remove</button>
                )}
              </div>
            )}
          </>
        )}
        {message && <div className={message.kind === 'ok' ? 'success' : 'error'}>{message.text}</div>}
        {message?.kind === 'ok' && <p><a href={href('/my')}>申込履歴を見る / View my signups →</a></p>}
      </form>
    </div>
  )
}
