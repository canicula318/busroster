import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import type { Profile } from '../App'
import type { Signup, Student, Trip } from '../types'
import { TRIP_LABELS, TRIP_ORDER } from '../types'
import { chipLabel, formatDate, isSaturday, todayNY, upcomingSaturdays } from '../lib/dates'
import { href } from '../lib/router'
import { IconCheck } from '../components/Icons'

const TRIP_HINT: Record<Trip, string> = {
  both: '行きも帰りも乗ります',
  outbound: '学校へ行くときだけ',
  return: '家に帰るときだけ',
  none: '今週は乗りません',
}

export default function SignupForm({ profile, params }: { profile: Profile; params: URLSearchParams }) {
  const saturdays = useMemo(() => upcomingSaturdays(10), [])
  const initialDate = params.get('date')
  const [busDate, setBusDate] = useState(
    initialDate && isSaturday(initialDate) && (initialDate >= todayNY() || profile.isAdmin) ? initialDate : saturdays[0],
  )
  const [familyId, setFamilyId] = useState(
    params.get('family') ??
      (profile.families.length === 1 ? profile.families[0].id : profile.ownFamilyIds.length === 1 ? profile.ownFamilyIds[0] : ''),
  )
  const [students, setStudents] = useState<Student[]>([])
  const [existing, setExisting] = useState<Signup | null>(null)
  const [signedDates, setSignedDates] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [trip, setTrip] = useState<Trip | ''>('')
  const [guest, setGuest] = useState('')
  const [comments, setComments] = useState('')
  const [showExtra, setShowExtra] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const dateOptions = useMemo(() => {
    const set = new Set(saturdays)
    if (busDate) set.add(busDate)
    return [...set].sort()
  }, [saturdays, busDate])

  // Which upcoming Saturdays this family has already signed up for (dots on the chips)
  useEffect(() => {
    if (!familyId) return
    supabase
      .from('signups')
      .select('bus_date')
      .eq('family_id', familyId)
      .gte('bus_date', dateOptions[0])
      .then(({ data }) => setSignedDates(new Set((data ?? []).map((r) => r.bus_date))))
  }, [familyId, dateOptions, existing])

  // Load students + any existing signup whenever family/date changes
  useEffect(() => {
    if (!familyId) {
      setStudents([])
      setExisting(null)
      return
    }
    let cancelled = false
    setLoading(true)
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
        setShowExtra(Boolean(s.guest_name || s.comments))
      } else {
        setSelected(new Set(list.length === 1 ? [list[0].id] : []))
        setTrip('')
        setGuest('')
        setComments('')
        setShowExtra(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [familyId, busDate])

  function pickDate(d: string) {
    setMessage(null)
    setBusDate(d)
  }

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
    if (message?.kind === 'error') setMessage(null)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (selected.size === 0 && !guest.trim())
      return setMessage({ kind: 'error', text: '乗る生徒を選んでください。' })
    if (!trip) return setMessage({ kind: 'error', text: '「行き・帰り」を選んでください。' })
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
    setMessage({ kind: 'ok', text: `${formatDate(busDate)}の申込を${existing ? '更新' : '受け付け'}ました。` })
    window.scrollTo({ top: 0, behavior: 'smooth' })
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
    setMessage({ kind: 'ok', text: `${formatDate(busDate)}の申込を取り消しました。` })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const locked = !profile.isAdmin && busDate < todayNY()
  const family = profile.families.find((f) => f.id === familyId)
  const stop = profile.stops.find((st) => st.id === family?.stop_id)

  return (
    <form className="signup" onSubmit={submit}>
      <h1 className="page-title">バス申込 <small>Weekly signup</small></h1>

      {message && (
        <div className={message.kind === 'ok' ? 'banner success' : 'banner error'} role="status">
          {message.text}
          {message.kind === 'ok' && <a href={href('/my')}>申込履歴を見る →</a>}
        </div>
      )}

      <section className="section">
        <div className="section-label">バス利用日（土曜日）</div>
        <div className="chips" role="radiogroup" aria-label="バス利用日">
          {dateOptions.map((d) => {
            const { md, rel } = chipLabel(d, saturdays)
            return (
              <button
                type="button"
                key={d}
                role="radio"
                aria-checked={busDate === d}
                className={'chip-date' + (busDate === d ? ' on' : '')}
                onClick={() => pickDate(d)}
              >
                <span className="chip-rel">{rel || '土'}</span>
                <span className="chip-md">{md}</span>
                {signedDates.has(d) && <span className="chip-dot" title="申込済み">申込済</span>}
              </button>
            )
          })}
        </div>
      </section>

      {profile.families.length > 1 && (
        <section className="section">
          <label className="section-label" htmlFor="family">家族</label>
          <select id="family" className="big-select" value={familyId} onChange={(e) => setFamilyId(e.target.value)} required>
            <option value="">選んでください</option>
            {profile.families.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </section>
      )}

      {familyId && (
        <>
          {existing && !message && (
            <div className="banner info">
              <b>{formatDate(busDate)}</b>は申込済みです。変更して「更新する」を押してください。
            </div>
          )}

          {stop && (
            <a className="stop-card" href={href('/info')}>
              <div>
                <div className="stop-name">乗車場所：{stop.name}</div>
                <div className="option-sub">{stop.place}</div>
              </div>
              <div className="stop-times">
                <div><span>行き</span><b>{stop.am_time}</b></div>
                <div><span>帰り</span><b>{stop.pm_time}</b></div>
              </div>
            </a>
          )}

          <section className="section">
            <div className="section-label">
              乗る生徒{family && profile.families.length === 1 && <span className="muted"> ・ {family.name}</span>}
            </div>
            {loading && <div className="muted pad">読み込み中…</div>}
            {!loading && students.length === 0 && <div className="muted pad">生徒が登録されていません。バス係にご連絡ください。</div>}
            <div className="options">
              {students.map((s) => {
                const on = selected.has(s.id)
                return (
                  <button
                    type="button"
                    key={s.id}
                    role="checkbox"
                    aria-checked={on}
                    disabled={locked}
                    className={'option' + (on ? ' on' : '')}
                    onClick={() => toggle(s.id)}
                  >
                    <span className="tick">{on && <IconCheck />}</span>
                    <span className="option-text">
                      <span className="option-title">{s.name_ja || s.name}</span>
                      <span className="option-sub">{[s.name_ja ? s.name : null, s.grade].filter(Boolean).join('・')}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="section">
            <div className="section-label">行き・帰り</div>
            <div className="trip-grid" role="radiogroup" aria-label="行き・帰り">
              {TRIP_ORDER.map((t) => (
                <button
                  type="button"
                  key={t}
                  role="radio"
                  aria-checked={trip === t}
                  disabled={locked}
                  className={'trip' + (trip === t ? ' on' : '') + (t === 'none' ? ' none' : '')}
                  onClick={() => { setTrip(t); if (message?.kind === 'error') setMessage(null) }}
                >
                  <span className="option-title">{TRIP_LABELS[t].ja.replace('（行き・帰り）', '')}</span>
                  <span className="option-sub">{TRIP_HINT[t]}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="section">
            {!showExtra ? (
              <button type="button" className="link-btn" onClick={() => setShowExtra(true)}>
                ＋ ゲスト・コメントを追加（任意）
              </button>
            ) : (
              <>
                <label className="field">
                  <span className="section-label">一回限りのゲスト（任意）</span>
                  <input value={guest} onChange={(e) => setGuest(e.target.value)} disabled={locked} placeholder="例：祖父、お友達の名前" />
                </label>
                <label className="field">
                  <span className="section-label">コメント（任意）</span>
                  <textarea rows={3} value={comments} onChange={(e) => setComments(e.target.value)} disabled={locked} placeholder="バス係への連絡事項" />
                </label>
              </>
            )}
          </section>

          {locked ? (
            <p className="muted pad">過去の日付は変更できません。</p>
          ) : (
            <div className="actionbar">
              {existing && (
                <button type="button" className="btn danger" disabled={busy} onClick={cancelSignup}>取り消す</button>
              )}
              <button className="btn primary grow" disabled={busy || loading}>
                {busy ? '送信中…' : existing ? '更新する' : `${chipLabel(busDate, saturdays).md} を申し込む`}
              </button>
            </div>
          )}
        </>
      )}
    </form>
  )
}
