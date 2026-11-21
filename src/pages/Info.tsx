import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import type { Profile } from '../App'
import type { Contact, Fare, Stop } from '../types'
import { mapsUrl, telUrl } from '../types'
import { IconPhone } from '../components/Icons'
import { formatDate, isSaturday, todayNY } from '../lib/dates'

const money = (cents: number | null) =>
  cents == null ? '' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100)

export default function Info({ profile }: { profile: Profile }) {
  const [fares, setFares] = useState<Fare[] | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('fares').select('*').order('sort'),
      supabase.from('contacts').select('*').order('sort'),
    ]).then(([f, c]) => {
      if (f.error || c.error) return setError((f.error ?? c.error)!.message)
      setFares(f.data as Fare[])
      setContacts(c.data as Contact[])
    })
  }, [])

  const today = todayNY()
  const upcomingNoBus = [...profile.noBus.entries()].filter(([d]) => d >= today && isSaturday(d))
  const stops = profile.stops.filter((s) => s.kind === 'stop')
  const school = profile.stops.find((s) => s.kind === 'school')
  // My family's stop (parents) so it can be highlighted
  const myFamily = profile.families.find((f) => profile.ownFamilyIds.includes(f.id)) ?? (profile.families.length === 1 ? profile.families[0] : undefined)
  const myStopId = myFamily?.stop_id

  const morning: (Stop | undefined)[] = [...stops, school]
  const afternoon: (Stop | undefined)[] = [school, ...[...stops].reverse()]

  if (error) return <div className="banner error">{error}</div>

  return (
    <div className="page">
      <h1 className="page-title">案内 <small>Schedule & info</small></h1>

      <section className="section">
        <h2 className="section-label">時刻表</h2>
        <div className="timetable">
          <div className="tt-col">
            <div className="tt-head">行き <small>To school</small></div>
            {morning.map((s) => s && (
              <div key={s.id} className={'tt-row' + (s.id === myStopId ? ' mine' : '') + (s.kind === 'school' ? ' school' : '')}>
                <span className="tt-time">{s.am_time}</span>
                <span className="tt-name">{s.kind === 'school' ? '学校 着' : s.name}</span>
              </div>
            ))}
          </div>
          <div className="tt-col">
            <div className="tt-head">帰り <small>From school</small></div>
            {afternoon.map((s) => s && (
              <div key={s.id} className={'tt-row' + (s.id === myStopId ? ' mine' : '') + (s.kind === 'school' ? ' school' : '')}>
                <span className="tt-time">{s.pm_time}</span>
                <span className="tt-name">{s.kind === 'school' ? '学校 発' : s.name}</span>
              </div>
            ))}
          </div>
        </div>
        {myStopId && <p className="muted small">緑色があなたの乗車場所です。</p>}
      </section>

      {upcomingNoBus.length > 0 && (
        <section className="section">
          <h2 className="section-label">バスのない日（休業日）</h2>
          <ul className="place-list">
            {upcomingNoBus.map(([d, reason]) => (
              <li key={d}>
                <div>
                  <div className="option-title">{formatDate(d)}</div>
                  <div className="option-sub">{reason}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section">
        <h2 className="section-label">乗車場所・学校</h2>
        <ul className="place-list">
          {[...stops, ...(school ? [school] : [])].map((s) => (
            <li key={s.id} className={s.id === myStopId ? 'mine' : ''}>
              <div>
                <div className="option-title">{s.kind === 'school' ? '学校' : s.name}{s.id === myStopId && <span className="pill">あなたの乗車場所</span>}</div>
                <div className="option-sub">{s.place}</div>
                <div className="option-sub">{s.address}</div>
              </div>
              {s.address && <a className="btn small" href={mapsUrl(s.address)} target="_blank" rel="noopener noreferrer">地図</a>}
            </li>
          ))}
        </ul>
      </section>

      <section className="section">
        <h2 className="section-label">連絡先</h2>
        <ul className="place-list">
          {contacts.map((c) => (
            <li key={c.id}>
              <div>
                <div className="option-title">{c.label}{c.admins_only && <span className="pill gray">管理者のみ</span>}</div>
                <div className="option-sub">{[c.name, c.phone, c.note].filter(Boolean).join('　')}</div>
              </div>
              {c.phone && <a className="btn small call" href={telUrl(c.phone)}><IconPhone /> 電話</a>}
            </li>
          ))}
        </ul>
      </section>

      <section className="section">
        <h2 className="section-label">料金・支払い</h2>
        {!fares ? (
          <div className="muted pad">読み込み中…</div>
        ) : (
          <ul className="fare-list">
            {fares.map((f) => (
              <li key={f.id}>
                <div className="fare-top">
                  <div className="option-title">{f.name}</div>
                  <div className="fare-price">{money(f.price_cents)}</div>
                </div>
                <div className="option-sub">{f.method}</div>
                {f.link && (
                  <a className="btn primary wide" href={f.link} target="_blank" rel="noopener noreferrer">Squareで支払う</a>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="muted small">学期料金はInvoice（ACH）でお支払いください。単発・片道はSquareのリンクからクレジットカードでお支払いいただけます。</p>
      </section>

      <section className="section">
        <div className="signed-in">
          <div>
            <div className="muted small">ログイン中のアカウント</div>
            <div className="option-title">{profile.email}</div>
            <div className="muted small">{profile.isAdmin ? '管理者' : '保護者'}</div>
          </div>
          <button className="btn small" onClick={() => supabase.auth.signOut()}>ログアウト</button>
        </div>
      </section>
    </div>
  )
}
