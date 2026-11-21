import { useEffect, useMemo, useState } from 'react'
import type { Profile } from '../App'
import type { RosterRow } from '../types'
import { TRIP_LABELS } from '../types'
import { chipLabel, formatDate, isSaturday, upcomingSaturdays } from '../lib/dates'
import { byStop, fetchRoster, lineMessage, personLabel } from '../lib/roster'
import { downloadCsv } from '../lib/csv'
import { href } from '../lib/router'
import { IconCopy, IconPrint, IconShare } from '../components/Icons'

/**
 * Weekly roster. Every parent can open it: the 当番 uses it to post this week's
 * changes to the LINE group. Admins get extra tools (CSV, duty sheet, edit).
 */
export default function Roster({ profile, params }: { profile: Profile; params: URLSearchParams }) {
  const upcoming = useMemo(() => upcomingSaturdays(8), [])
  const p = params.get('date')
  const [date, setDate] = useState(p && isSaturday(p) ? p : upcoming[0])
  const [rows, setRows] = useState<RosterRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let cancelled = false
    setRows(null)
    fetchRoster(date)
      .then((r) => !cancelled && setRows(r))
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [date])

  const chipDates = useMemo(() => [...new Set([...upcoming, date])].sort(), [upcoming, date])
  const groups = useMemo(() => (rows ? byStop(rows, profile.stops) : []), [rows, profile.stops])
  const message = useMemo(() => (rows ? lineMessage(date, rows, profile.stops) : ''), [rows, date, profile.stops])
  const changed = rows?.filter((r) => r.changed) ?? []
  // Changes grouped by family (in route order), including families that only left a comment
  const changeFamilies = useMemo(() => {
    const out: { familyId: string; familyName: string; stopName: string; rows: RosterRow[]; comments: string | null }[] = []
    for (const g of groups) {
      for (const r of g.rows) {
        if (!r.changed && !r.comments) continue
        let f = out.find((x) => x.familyId === r.family_id)
        if (!f) {
          f = { familyId: r.family_id, familyName: r.family_name, stopName: g.stop?.name ?? '', rows: [], comments: r.comments }
          out.push(f)
        }
        if (r.changed) f.rows.push(r)
      }
    }
    return out
  }, [groups])
  const totalOut = groups.reduce((n, g) => n + g.out, 0)
  const totalRet = groups.reduce((n, g) => n + g.ret, 0)

  async function copy() {
    try {
      await navigator.clipboard.writeText(message)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = message
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  function sendToLine() {
    const url = 'https://line.me/R/' + 'share?text=' + encodeURIComponent(message)
    const w = window.open(url, '_blank', 'noopener')
    if (!w) window.location.href = url
  }

  async function share() {
    try {
      await navigator.share({ text: message })
    } catch {
      /* cancelled */
    }
  }

  function exportCsv() {
    downloadCsv(`summit-line-${date}.csv`, [
      ['バス利用日', '乗車場所', '家族', '氏名', 'Name', '学年', '区分', '乗車', '行き', '帰り', '変更', '連絡'],
      ...groups.flatMap((g) =>
        g.rows.map((r) => [
          date, g.stop?.name ?? '', r.family_name, r.name_ja ?? '', r.name, r.grade ?? '', r.kind === 'guest' ? 'ゲスト' : '生徒',
          TRIP_LABELS[r.trip].ja, r.trip === 'both' || r.trip === 'outbound' ? 1 : 0, r.trip === 'both' || r.trip === 'return' ? 1 : 0,
          r.changed ? '変更' : '', r.comments ?? '',
        ]),
      ),
    ])
  }

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator

  return (
    <div className="page">
      <h1 className="page-title">名簿 <small>Weekly roster</small></h1>

      <div className="chips">
        {chipDates.map((d) => {
          const { md, rel } = chipLabel(d, upcoming)
          return (
            <button type="button" key={d} className={'chip-date' + (date === d ? ' on' : '')} onClick={() => setDate(d)}>
              <span className="chip-rel">{rel || '土'}</span>
              <span className="chip-md">{md}</span>
            </button>
          )
        })}
      </div>

      {error && <div className="banner error">{error}</div>}
      {!rows && !error && <div className="muted pad">読み込み中…</div>}

      {rows && (
        <>
          <div className="stats">
            <div><div className="stat">{totalOut}</div><div className="muted small">行き</div></div>
            <div><div className="stat">{totalRet}</div><div className="muted small">帰り</div></div>
            <div><div className="stat">{changed.length}</div><div className="muted small">変更</div></div>
          </div>
          <div className="stop-stats">
            {groups.filter((g) => g.stop).map((g) => (
              <div key={g.stop!.id}>
                <b>{g.stop!.name}</b>
                <span>行き {g.out}人</span>
                <span>帰り {g.ret}人</span>
              </div>
            ))}
          </div>

          <section className="section">
            <h2 className="section-label">今週の変更</h2>
            {changeFamilies.length === 0 ? (
              <div className="empty">変更はありません。全員往復です。</div>
            ) : (
              <ul className="family-changes">
                {changeFamilies.map((f) => (
                  <li key={f.familyId}>
                    <div className="fc-head">
                      <span className="option-title">{f.familyName}</span>
                      <span className="muted small">{f.stopName}</span>
                      {profile.isAdmin && <a className="edit-link" href={href('/', { date, family: f.familyId })}>編集</a>}
                    </div>
                    {f.rows.map((r) => (
                      <div key={r.person_id} className={'fc-row trip-' + r.trip}>
                        <span>
                          {r.kind === 'guest' && <span className="pill pink">ゲスト</span>}
                          {personLabel(r)}
                        </span>
                        <span className="trip-badge">{TRIP_LABELS[r.trip].ja}</span>
                      </div>
                    ))}
                    {f.comments && <div className="fc-comment">💬 {f.comments}</div>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="section line-card">
            <h2 className="section-label">LINEに送る文面</h2>
            <pre className="line-preview">{message}</pre>
            <div className="line-actions">
              {/* A plain button (not a line.me link) so ad blockers that hide "share" links don't remove it */}
              <button type="button" className="btn send-chat" onClick={sendToLine}>
                LINEで送る
              </button>
              <button type="button" className="btn" onClick={copy}><IconCopy />&nbsp;{copied ? 'コピーしました' : 'コピー'}</button>
              {canShare && <button type="button" className="btn" onClick={share}><IconShare />&nbsp;共有</button>}
            </div>
            <p className="muted small">「LINEで送る」でLINEが開きます。送り先のグループを選んで送信してください。</p>
          </section>

          <section className="section">
            <button type="button" className="add-btn" onClick={() => setShowAll(!showAll)}>
              {showAll ? '− 全員の名簿を閉じる' : `＋ 全員の名簿を見る（${rows.length}人）`}
            </button>
            {showAll && groups.map((g) => (
              <div key={g.stop?.id ?? 'other'} className="full-group">
                <div className="full-group-head">{g.stop?.name ?? 'その他'} <span className="muted small">行き {g.out}・帰り {g.ret}</span></div>
                {g.rows.map((r) => (
                  <div key={r.person_id} className={'full-row' + (r.trip === 'none' ? ' dim' : '')}>
                    <span>{r.kind === 'guest' ? 'ゲスト ' : ''}{personLabel(r)}<span className="muted small"> {r.grade}</span></span>
                    <span className={r.changed ? 'trip-badge' : 'muted small'}>{TRIP_LABELS[r.trip].ja}</span>
                  </div>
                ))}
              </div>
            ))}
          </section>

          {profile.isAdmin && (
            <section className="section">
              <h2 className="section-label">管理者メニュー</h2>
              <div className="row wrap">
                <a className="btn primary" href={href('/admin/sheet', { date })}><IconPrint />&nbsp;当番シートを印刷</a>
                <button className="btn" onClick={exportCsv}>CSV</button>
                <a className="btn" href={href('/', { date })}>代理で変更連絡</a>
              </div>
              <p className="muted small">{formatDate(date)}の名簿です。</p>
            </section>
          )}
        </>
      )}
    </div>
  )
}
