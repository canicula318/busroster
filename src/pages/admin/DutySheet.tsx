import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import type { Profile } from '../../App'
import type { Contact, Signup, Student } from '../../types'
import { ridesOutbound, ridesReturn } from '../../types'
import { formatDate, upcomingSaturdays } from '../../lib/dates'
import { href } from '../../lib/router'
import { IconPrint } from '../../components/Icons'

interface Row {
  key: string
  ja: string
  en: string
  grade: string
  stop: string
  out: boolean | null // null = not part of a signup (full-roster mode)
  ret: boolean | null
  phone: string
}

const MIN_ROWS = 24

/** Printable bus sheet for the parent on duty (当番), modelled on the paper roster. */
export default function DutySheet({ profile, params }: { profile: Profile; params: URLSearchParams }) {
  const date = params.get('date') ?? upcomingSaturdays(1)[0]
  const [mode, setMode] = useState<'signed' | 'all'>('signed')
  const [signups, setSignups] = useState<Signup[] | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('signups').select('*, signup_students(student_id)').eq('bus_date', date),
      supabase.from('students').select('*').order('sort').order('name'),
      supabase.from('contacts').select('*').order('sort'),
    ]).then(([su, st, co]) => {
      const err = su.error ?? st.error ?? co.error
      if (err) return setError(err.message)
      setSignups(su.data as Signup[])
      setStudents(st.data as Student[])
      setContacts(co.data as Contact[])
    })
  }, [date])

  const famById = useMemo(() => new Map(profile.families.map((f) => [f.id, f])), [profile.families])
  const stopById = useMemo(() => new Map(profile.stops.map((s) => [s.id, s])), [profile.stops])
  const stopOfFamily = (familyId: string) => stopById.get(famById.get(familyId)?.stop_id ?? '')

  const rows: Row[] = useMemo(() => {
    if (!signups) return []
    const bySignup = new Map<string, Signup>()
    signups.forEach((s) => s.signup_students.forEach((x) => bySignup.set(x.student_id, s)))
    const list = students
      .filter((s) => (mode === 'all' ? s.active : bySignup.has(s.id)))
      .map((s) => {
        const su = bySignup.get(s.id)
        const stop = stopOfFamily(s.family_id)
        return {
          s,
          sort: (stop?.sort ?? 99) * 1000 + s.sort,
          row: {
            key: s.id,
            ja: s.name_ja ?? '',
            en: s.name,
            grade: s.grade ?? '',
            stop: stop?.short_name ?? '',
            out: su ? ridesOutbound(su.trip) : null,
            ret: su ? ridesReturn(su.trip) : null,
            phone: '',
          } as Row,
        }
      })
    // Guests
    signups.filter((su) => su.guest_name).forEach((su) => {
      const stop = stopOfFamily(su.family_id)
      list.push({
        s: { family_id: su.family_id } as Student,
        sort: (stop?.sort ?? 99) * 1000 + 900,
        row: { key: 'g' + su.id, ja: su.guest_name!, en: '（ゲスト）', grade: '', stop: stop?.short_name ?? '', out: ridesOutbound(su.trip), ret: ridesReturn(su.trip), phone: '' },
      })
    })
    list.sort((a, b) => a.sort - b.sort)
    // Phone number on the first row of each family, as on the paper sheet
    const seen = new Set<string>()
    for (const item of list) {
      if (!seen.has(item.s.family_id)) {
        seen.add(item.s.family_id)
        item.row.phone = (famById.get(item.s.family_id)?.phone ?? '').replace(/ \/ /g, '  ')
      }
    }
    return list.map((x) => x.row)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signups, students, mode, famById, stopById])

  if (error) return <div className="banner error">{error}</div>
  if (!signups) return <div className="muted pad">読み込み中…</div>

  const outCount = rows.filter((r) => r.out).length
  const retCount = rows.filter((r) => r.ret).length
  const blanks = Math.max(MIN_ROWS - rows.length, 4)
  const [, m, d] = date.split('-').map(Number)
  const stops = profile.stops.filter((s) => s.kind === 'stop')
  const school = profile.stops.find((s) => s.kind === 'school')
  const headerContacts = contacts.filter((c) => !c.admins_only)
  const unlock = contacts.find((c) => c.admins_only && c.label.includes('ロック'))
  const comments = signups.filter((s) => s.comments)

  const mark = (v: boolean | null) => (v === false ? <span className="na">—</span> : null)

  return (
    <div className="sheet-wrap">
      <div className="sheet-tools no-print">
        <a className="btn small" href={href('/admin/roster')}>← 名簿へ</a>
        <div className="seg">
          <button className={mode === 'signed' ? 'on' : ''} onClick={() => setMode('signed')}>申込者のみ</button>
          <button className={mode === 'all' ? 'on' : ''} onClick={() => setMode('all')}>在籍者全員</button>
        </div>
        <button className="btn small primary" onClick={() => window.print()}><IconPrint />&nbsp;印刷</button>
      </div>
      <p className="muted small no-print">{formatDate(date)}の当番シートです。「—」はその便に乗らない予定の生徒です。空欄に○をつけてください。</p>

      <div className="sheet">
        <div className="sheet-instr">
          In the morning (drop off):<br />
          1) Check-off in column with ○ if the student gets on the bus at your stop.<br />
          2) Call parents' phone # if any students are missing at the stop and if they are not checked absent ☒.
        </div>

        <div className="sheet-head">
          <div className="sheet-contacts">
            {headerContacts.map((c) => (
              <div key={c.id}>{[c.name, c.phone, c.note && !c.phone ? c.note : null].filter(Boolean).join(' ')} <span>{c.label}</span></div>
            ))}
          </div>
          <div className="sheet-duty">
            <div><b>{m}</b> 月 <b>{d}</b> 日　当番氏名（<span className="fill" />）</div>
            <div>携帯番号（<span className="fill" />）</div>
          </div>
        </div>

        <table className="sheet-table">
          <thead>
            <tr>
              <th className="n"></th><th>氏名</th><th>Name</th><th>学年</th><th>バス停</th><th className="chk">行き</th><th className="chk">帰り</th><th>電話（携帯）</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key}>
                <td className="n">{i + 1}</td>
                <td className="ja">{r.ja}</td>
                <td className="en">{r.en}</td>
                <td className="grade">{r.grade}</td>
                <td className="stop">{r.stop}</td>
                <td className="chk">{mark(r.out)}</td>
                <td className="chk">{mark(r.ret)}</td>
                <td className="phone">{r.phone}</td>
              </tr>
            ))}
            {Array.from({ length: blanks }, (_, i) => (
              <tr key={'b' + i}>
                <td className="n">{rows.length + i + 1}</td><td /><td /><td /><td /><td className="chk" /><td className="chk" /><td />
              </tr>
            ))}
            <tr className="totals">
              <td colSpan={5} className="right">{mode === 'signed' ? `予定　行き ${outCount}人 ／ 帰り ${retCount}人` : `在籍 ${rows.length}人`}</td>
              <td className="chk">行き</td><td className="chk">帰り</td><td />
            </tr>
            <tr className="totals">
              <td colSpan={5} className="right">実際の人数</td>
              <td className="chk" /><td className="chk" /><td />
            </tr>
          </tbody>
        </table>

        {comments.length > 0 && (
          <div className="sheet-notes">
            <b>連絡事項：</b>
            {comments.map((c) => (
              <div key={c.id}>・{famById.get(c.family_id)?.name}：{c.comments}</div>
            ))}
          </div>
        )}

        <div className="sheet-schedule">
          <div className="lbl">To School</div>
          <div>
            {stops.map((s) => <div key={s.id}>{s.name} - {s.am_time}　({s.place} : {s.address})</div>)}
            {school && <div>School {school.am_time}　({school.place} : {school.address})</div>}
          </div>
          <div className="lbl">From School</div>
          <div>
            {school && <div>School - {school.pm_time}</div>}
            {[...stops].reverse().map((s) => <div key={s.id}>{s.name} - {s.pm_time}</div>)}
          </div>
        </div>
        {unlock && <div className="sheet-foot">Bus cell phone screen unlock#: {unlock.note}</div>}
      </div>
    </div>
  )
}
