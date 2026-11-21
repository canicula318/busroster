import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import type { Profile } from '../App'
import type { Signup, Student, Trip } from '../types'
import { SIGNUP_SELECT, TRIP_LABELS } from '../types'
import { chipLabel, formatDate, isSaturday, todayNY, upcomingSaturdays } from '../lib/dates'
import { href } from '../lib/router'

interface Guest {
  key: number
  name: string
  trip: Trip
}

const STUDENT_CHOICES: Trip[] = ['both', 'outbound', 'return', 'none']
const GUEST_CHOICES: Trip[] = ['both', 'outbound', 'return']
const CHOICE_LABEL: Record<Trip, string> = { both: '通常', outbound: '行きのみ利用', return: '帰りのみ利用', none: 'お休み' }

let guestKey = 1

/**
 * Weekly change notice. Every active student rides both ways by default;
 * a family only sends something when that week is different.
 */
export default function SignupForm({ profile, params }: { profile: Profile; params: URLSearchParams }) {
  const saturdays = useMemo(() => upcomingSaturdays(10), [])
  const initialDate = params.get('date')
  const [busDate, setBusDate] = useState(
    initialDate && isSaturday(initialDate) && (initialDate >= todayNY() || profile.isAdmin) ? initialDate : saturdays[0],
  )
  // Families shown here: only the signed-in parent's own family (everyone is an admin,
  // so profile.families holds every family). Admins with no family of their own see all.
  const myFamilies = profile.ownFamilyIds.length
    ? profile.families.filter((f) => profile.ownFamilyIds.includes(f.id))
    : profile.families
  const [familyId, setFamilyId] = useState(params.get('family') ?? (myFamilies.length === 1 ? myFamilies[0].id : ''))
  // Opened from the roster's 編集 link for another family
  const editingOther = !myFamilies.some((f) => f.id === familyId) && familyId !== ''
  const [students, setStudents] = useState<Student[]>([])
  const [existing, setExisting] = useState<Signup | null>(null)
  const [changedDates, setChangedDates] = useState<Set<string>>(new Set())
  const [trips, setTrips] = useState<Record<string, Trip>>({})
  const [guests, setGuests] = useState<Guest[]>([])
  const [comments, setComments] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const dateOptions = useMemo(() => {
    const set = new Set(saturdays)
    if (busDate) set.add(busDate)
    return [...set].sort()
  }, [saturdays, busDate])

  function applySignup(s: Signup | null, list: Student[]) {
    setExisting(s)
    const t: Record<string, Trip> = {}
    list.forEach((st) => (t[st.id] = 'both'))
    s?.signup_students.forEach((x) => (t[x.student_id] = x.trip))
    setTrips(t)
    setGuests([...(s?.signup_guests ?? [])].sort((a, b) => a.sort - b.sort).map((g) => ({ key: guestKey++, name: g.name, trip: g.trip })))
    setComments(s?.comments ?? '')
  }

  // Dates with a change notice already sent (marker on the chips)
  useEffect(() => {
    if (!familyId) return
    supabase
      .from('signups')
      .select('bus_date')
      .eq('family_id', familyId)
      .gte('bus_date', dateOptions[0])
      .then(({ data }) => setChangedDates(new Set((data ?? []).map((r) => r.bus_date))))
  }, [familyId, dateOptions, existing])

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
      supabase.from('signups').select(SIGNUP_SELECT).eq('family_id', familyId).eq('bus_date', busDate).maybeSingle(),
    ]).then(([st, su]) => {
      if (cancelled) return
      setLoading(false)
      if (st.error || su.error) {
        setMessage({ kind: 'error', text: (st.error ?? su.error)!.message })
        return
      }
      const list = (st.data ?? []) as Student[]
      setStudents(list)
      applySignup(su.data as Signup | null, list)
    })
    return () => {
      cancelled = true
    }
  }, [familyId, busDate])

  function setTrip(id: string, t: Trip) {
    setTrips({ ...trips, [id]: t })
    if (message) setMessage(null)
  }

  const changes = students.filter((s) => trips[s.id] && trips[s.id] !== 'both').map((s) => ({ student_id: s.id, trip: trips[s.id] }))
  const cleanGuests = guests.filter((g) => g.name.trim())
  const hasChanges = changes.length > 0 || cleanGuests.length > 0 || comments.trim() !== ''

  async function save(e?: React.FormEvent) {
    e?.preventDefault()
    if (guests.some((g) => !g.name.trim())) return setMessage({ kind: 'error', text: 'ゲストの名前を入力してください。' })
    setBusy(true)
    setMessage(null)
    const { error } = await supabase.rpc('save_changes', {
      p_family_id: familyId,
      p_bus_date: busDate,
      p_changes: changes,
      p_guests: cleanGuests.map((g) => ({ name: g.name, trip: g.trip })),
      p_comments: comments,
    })
    setBusy(false)
    if (error) return setMessage({ kind: 'error', text: '保存できませんでした: ' + error.message })
    const { data } = await supabase.from('signups').select(SIGNUP_SELECT).eq('family_id', familyId).eq('bus_date', busDate).maybeSingle()
    applySignup(data as Signup | null, students)
    setMessage({
      kind: 'ok',
      text: hasChanges ? `${formatDate(busDate)}の変更を送信しました。` : `${formatDate(busDate)}は通常どおり（全員往復）に戻しました。`,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function resetAll() {
    setBusy(true)
    const { error } = await supabase.rpc('save_changes', { p_family_id: familyId, p_bus_date: busDate, p_changes: [], p_guests: [], p_comments: '' })
    setBusy(false)
    if (error) return setMessage({ kind: 'error', text: '取り消しできませんでした: ' + error.message })
    applySignup(null, students)
    setMessage({ kind: 'ok', text: `${formatDate(busDate)}の変更を取り消しました（通常どおり往復）。` })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const locked = !profile.isAdmin && busDate < todayNY()
  const family = profile.families.find((f) => f.id === familyId)

  return (
    <form className="signup" onSubmit={save}>
      <h1 className="page-title">変更連絡 <small>Weekly changes</small></h1>
      <p className="lead">通常は<b>全員往復</b>です。その週に<b>お休み・片道・ゲスト</b>がある場合だけ送ってください。</p>

      {message && (
        <div className={message.kind === 'ok' ? 'banner success' : 'banner error'} role="status">
          {message.text}
          {message.kind === 'ok' && <a href={href('/roster', { date: busDate })}>今週の名簿を見る →</a>}
        </div>
      )}

      <section className="section">
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
                onClick={() => { setMessage(null); setBusDate(d) }}
              >
                <span className="chip-rel">{rel || '土'}</span>
                <span className="chip-md">{md}</span>
                {changedDates.has(d) && <span className="chip-dot">変更あり</span>}
              </button>
            )
          })}
        </div>
      </section>

      {!editingOther && myFamilies.length > 1 && (
        <section className="section">
          <label className="section-label" htmlFor="family">家族</label>
          <select id="family" className="big-select" value={familyId} onChange={(e) => setFamilyId(e.target.value)} required>
            <option value="">選んでください</option>
            {myFamilies.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </section>
      )}

      {familyId && (
        <>

          {existing && !message && (
            <div className="banner info">{formatDate(busDate)}の変更連絡は送信済みです。内容を直す場合は、修正して「更新する」を押してください。</div>
          )}

          <section className="section">
            {editingOther && family && <div className="banner info">{family.name}の変更連絡を編集しています。</div>}
            {loading && <div className="muted pad">読み込み中…</div>}
            {!loading && students.length === 0 && <div className="muted pad">生徒が登録されていません。バス係にご連絡ください。</div>}
            <div className="student-list">
              {students.map((s) => {
                const t = trips[s.id] ?? 'both'
                return (
                  <div key={s.id} className={'student-card' + (t !== 'both' ? ' changed' : '')}>
                    <div className="student-head">
                      <span className="option-title">{s.name_ja || s.name}</span>
                      <span className="option-sub">{[s.name_ja ? s.name : null, s.grade].filter(Boolean).join('・')}</span>
                    </div>
                    <div className="seg4" role="radiogroup" aria-label={(s.name_ja || s.name) + 'の乗車'}>
                      {STUDENT_CHOICES.map((c) => (
                        <button
                          type="button"
                          key={c}
                          role="radio"
                          aria-checked={t === c}
                          disabled={locked}
                          className={(t === c ? 'on' : '') + (c === 'none' ? ' none' : '') + (c === 'both' ? ' normal' : '')}
                          onClick={() => setTrip(s.id, c)}
                        >
                          {CHOICE_LABEL[c]}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="section">
            <div className="section-label">1回限りのゲスト</div>
            {guests.map((g, i) => (
              <div key={g.key} className="student-card changed guest-card">
                <div className="row">
                  <input
                    value={g.name}
                    placeholder="ゲストの名前（例：祖母、〇〇くん）"
                    disabled={locked}
                    onChange={(e) => setGuests(guests.map((x) => (x.key === g.key ? { ...x, name: e.target.value } : x)))}
                    aria-label={`ゲスト${i + 1}の名前`}
                  />
                  <button type="button" className="icon-x" disabled={locked} onClick={() => setGuests(guests.filter((x) => x.key !== g.key))} aria-label="このゲストを削除">×</button>
                </div>
                <div className="seg4 three" role="radiogroup" aria-label="ゲストの乗車">
                  {GUEST_CHOICES.map((c) => (
                    <button
                      type="button"
                      key={c}
                      role="radio"
                      aria-checked={g.trip === c}
                      disabled={locked}
                      className={g.trip === c ? 'on' : ''}
                      onClick={() => setGuests(guests.map((x) => (x.key === g.key ? { ...x, trip: c } : x)))}
                    >
                      {TRIP_LABELS[c].ja}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {!locked && (
              <button type="button" className="add-btn" onClick={() => setGuests([...guests, { key: guestKey++, name: '', trip: 'both' }])}>
                ＋ ゲストを追加
              </button>
            )}
          </section>

          <section className="section">
            <label className="field">
              <span className="section-label">バス係・当番への連絡（任意）</span>
              <textarea rows={2} value={comments} onChange={(e) => setComments(e.target.value)} disabled={locked} placeholder="例：帰りは学校で直接迎えに行きます" />
            </label>
          </section>

          {locked ? (
            <p className="muted pad">過去の日付は変更できません。</p>
          ) : (
            <div className="actionbar">
              {existing && (
                <button type="button" className="btn danger" disabled={busy} onClick={resetAll}>取り消す</button>
              )}
              <button className="btn primary grow" disabled={busy || loading || (!existing && !hasChanges)}>
                {busy ? '送信中…' : existing ? '更新する' : hasChanges ? `${chipLabel(busDate, saturdays).md} の変更を送信` : '変更なし（送信不要）'}
              </button>
            </div>
          )}
        </>
      )}
    </form>
  )
}
