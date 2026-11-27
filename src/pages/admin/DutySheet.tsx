import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import type { Profile } from '../../App'
import type { Contact, RosterRow } from '../../types'
import { fetchRoster } from '../../lib/roster'
import { ridesOutbound, ridesReturn } from '../../types'
import { busSaturdays, formatDate } from '../../lib/dates'
import { href } from '../../lib/router'
import { IconPrint } from '../../components/Icons'

interface Row {
  key: string
  ja: string
  en: string
  grade: string
  stop: string
  out: boolean
  ret: boolean
  phone: string
}

const MIN_ROWS = 24

/** Printable bus sheet for the parent on duty (当番), modelled on the paper roster. */
export default function DutySheet({ profile, params }: { profile: Profile; params: URLSearchParams }) {
  const date = params.get('date') ?? busSaturdays(1, new Set(profile.noBus.keys()))[0]
  const [data, setData] = useState<RosterRow[] | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([fetchRoster(date), supabase.from('contacts').select('*').order('sort')])
      .then(([r, co]) => {
        if (co.error) throw co.error
        setData(r)
        setContacts(co.data as Contact[])
      })
      .catch((e) => setError(e.message))
  }, [date])

  const famById = useMemo(() => new Map(profile.families.map((f) => [f.id, f])), [profile.families])
  const stopById = useMemo(() => new Map(profile.stops.map((s) => [s.id, s])), [profile.stops])

  const rows: Row[] = useMemo(() => {
    if (!data) return []
    const list = data
      .map((r) => {
        const stop = stopById.get(r.stop_id ?? '')
        return {
          family: r.family_id,
          sort: (stop?.sort ?? 99) * 1000 + r.sort,
          row: {
            key: r.person_id,
            ja: r.kind === 'guest' ? r.name : r.name_ja ?? '',
            en: r.kind === 'guest' ? '（ゲスト）' : r.name,
            grade: r.grade ?? '',
            stop: stop?.short_name ?? '',
            out: ridesOutbound(r.trip),
            ret: ridesReturn(r.trip),
            phone: '',
          } as Row,
        }
      })
      .sort((a, b) => a.sort - b.sort)
    const seen = new Set<string>()
    for (const item of list) {
      if (!seen.has(item.family)) {
        seen.add(item.family)
        item.row.phone = (famById.get(item.family)?.phone ?? '').replace(/ \/ /g, '  ')
      }
    }
    return list.map((x) => x.row)
  }, [data, famById, stopById])

  if (error) return <div className="banner error">{error}</div>
  if (!data) return <div className="muted pad">読み込み中…</div>

  const outCount = rows.filter((r) => r.out).length
  const retCount = rows.filter((r) => r.ret).length
  const blanks = Math.max(MIN_ROWS - rows.length, 4)
  const [, m, d] = date.split('-').map(Number)
  const stops = profile.stops.filter((s) => s.kind === 'stop')
  const school = profile.stops.find((s) => s.kind === 'school')
  const headerContacts = contacts.filter((c) => !c.admins_only)
  const unlock = contacts.find((c) => c.admins_only && c.label.includes('ロック'))

  // Not riding this leg: bold × on a shaded cell so it is obvious on paper
  const mark = (v: boolean) => (v ? null : <span className="na" aria-label="乗らない">×</span>)

  return (
    <div className="sheet-wrap">
      <div className="sheet-tools no-print">
        <a className="btn small" href={href('/roster', { date })}>← 名簿へ</a>
        <button className="btn small primary" onClick={() => window.print()}><IconPrint />&nbsp;印刷</button>
      </div>
      <p className="muted small no-print">{formatDate(date)}の当番シートです。「×」はその便に乗らない予定の生徒です。</p>

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
                <td className={'chk' + (r.out ? '' : ' off')}>{mark(r.out)}</td>
                <td className={'chk' + (r.ret ? '' : ' off')}>{mark(r.ret)}</td>
                <td className="phone">{r.phone}</td>
              </tr>
            ))}
            {Array.from({ length: blanks }, (_, i) => (
              <tr key={'b' + i}>
                <td className="n">{rows.length + i + 1}</td><td /><td /><td /><td /><td className="chk" /><td className="chk" /><td />
              </tr>
            ))}
            <tr className="totals">
              <td colSpan={5} className="right">{`予定　行き ${outCount}人 ／ 帰り ${retCount}人`}</td>
              <td className="chk">行き</td><td className="chk">帰り</td><td />
            </tr>
            <tr className="totals">
              <td colSpan={5} className="right">実際の人数</td>
              <td className="chk" /><td className="chk" /><td />
            </tr>
          </tbody>
        </table>


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
