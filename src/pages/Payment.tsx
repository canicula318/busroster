import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import type { Fare } from '../types'

const money = (cents: number | null) =>
  cents == null ? '' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100)

export default function Payment() {
  const [fares, setFares] = useState<Fare[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('fares').select('*').order('sort').then(({ data, error }) => {
      if (error) setError(error.message)
      else setFares(data as Fare[])
    })
  }, [])

  if (error) return <div className="banner error">{error}</div>
  if (!fares) return <div className="muted pad">読み込み中…</div>

  return (
    <div className="page">
      <h1 className="page-title">支払い <small>Payment</small></h1>
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
      <p className="muted small pad">学期料金はInvoice（ACH）でお支払いください。単発・片道はSquareのリンクからクレジットカードでお支払いいただけます。</p>
    </div>
  )
}
