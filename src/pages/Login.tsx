import { useState } from 'react'
import { appUrl, supabase } from '../supabase'

function hashError(): string | null {
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const code = h.get('error_code')
  if (!code) return null
  if (code === 'otp_expired') return 'ログインリンクの有効期限が切れています。もう一度メールを送信してください。 (The sign-in link expired. Please request a new one.)'
  return h.get('error_description') ?? code
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(hashError)

  async function sendLink(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: appUrl() },
    })
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setError('コードが正しくないか、期限切れです。 (Invalid or expired code.)')
  }

  return (
    <div className="login">
      <div className="card">
        <h1>🚌 BusRoster</h1>
        <p className="muted">NJ Japanese Weekend School バス申込</p>
        {!sent ? (
          <form onSubmit={sendLink}>
            <label className="field">
              <span>登録メールアドレス / Registered email</span>
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </label>
            <button className="btn primary wide" disabled={busy}>{busy ? '送信中…' : 'ログインリンクを送信 / Email me a sign-in link'}</button>
          </form>
        ) : (
          <>
            <div className="notice">
              <b>{email}</b> にメールを送信しました。メール内のリンクを開いてください。
              <div className="muted small">We sent you an email. Open the link in it to sign in. Check spam if you don't see it.</div>
            </div>
            <form onSubmit={verifyCode}>
              <label className="field">
                <span>メールに6桁のコードがある場合はこちらに入力 / Or enter the 6-digit code</span>
                <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
              </label>
              <button className="btn wide" disabled={busy || code.trim().length < 6}>コードでログイン / Sign in with code</button>
            </form>
            <button className="link" onClick={() => { setSent(false); setCode('') }}>別のメールアドレスを使う / Use a different email</button>
          </>
        )}
        {error && <div className="error">{error}</div>}
      </div>
    </div>
  )
}
