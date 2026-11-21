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

  if (error) return <div className="card error">{error}</div>
  if (!fares) return <div className="card muted">読み込み中…</div>

  return (
    <div className="card">
      <h1>支払い <span className="muted small">Payment</span></h1>
      <div className="table-wrap">
        <table>
          <thead><tr><th>料金プラン / Plan</th><th>支払い方法 / Method</th><th className="num">料金</th><th></th></tr></thead>
          <tbody>
            {fares.map((f) => (
              <tr key={f.id}>
                <td><b>{f.name}</b></td>
                <td>{f.method}</td>
                <td className="num">{money(f.price_cents)}</td>
                <td>{f.link && <a className="btn small" href={f.link} target="_blank" rel="noopener noreferrer">支払う / Pay</a>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">学期料金はInvoice（ACH）でお支払いください。単発・片道はSquareのリンクからクレジットカードでお支払いいただけます。</p>
    </div>
  )
}
