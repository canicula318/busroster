import { useState } from 'react'
import { appUrl, supabase } from '../supabase'
import { Brand } from '../components/Brand'

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

  async function signInWithGoogle() {
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: appUrl(), queryParams: { prompt: 'select_account' } },
    })
    if (error) setError('Googleでログインできませんでした: ' + error.message)
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
        <Brand large />
        <p className="muted login-lead">登録済みのアカウントでログイン<br /><span className="small">Sign in with your registered email.</span></p>
        {!sent && (
          <>
            <button type="button" className="btn google wide" onClick={signInWithGoogle}>
              <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
              </svg>
              Googleでログイン
            </button>
            <p className="muted small center-text">登録メールがGmail・Googleアカウントの方</p>
            <div className="divider"><span>または メールでログイン</span></div>
          </>
        )}
        {!sent ? (
          <form onSubmit={sendLink}>
            <label className="field">
              <span>メールアドレス <small className="muted">Email</small></span>
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </label>
            <button className="btn primary wide" disabled={busy}>{busy ? '送信中…' : 'ログインリンクを送信'}</button>
          </form>
        ) : (
          <>
            <div className="notice">
              <b>{email}</b> にメールを送信しました。メール内のリンクを開いてください。
              <div className="muted small">We sent you an email. Open the link in it to sign in. Check spam if you don't see it.</div>
            </div>
            <form onSubmit={verifyCode}>
              <label className="field">
                <span>メールに6桁のコードがある場合 <small className="muted">6-digit code</small></span>
                <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
              </label>
              <button className="btn wide" disabled={busy || code.trim().length < 6}>コードでログイン</button>
            </form>
            <button className="link" onClick={() => { setSent(false); setCode('') }}>別のメールアドレスを使う</button>
          </>
        )}
        {error && <div className="error">{error}</div>}
      </div>
    </div>
  )
}
