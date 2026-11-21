import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { href, useRoute } from './lib/router'
import type { Family } from './types'
import Login from './pages/Login'
import SignupForm from './pages/SignupForm'
import MySignups from './pages/MySignups'
import Payment from './pages/Payment'
import Roster from './pages/admin/Roster'
import Families from './pages/admin/Families'

export interface Profile {
  email: string
  isAdmin: boolean
  families: Family[]
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const route = useRoute()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'SIGNED_IN' && !window.location.hash.startsWith('#/')) {
        // Clean the sign-in tokens out of the address bar.
        history.replaceState(null, '', window.location.pathname + '#/')
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const loadProfile = useCallback(async (s: Session) => {
    setProfileError(null)
    const email = (s.user.email ?? '').toLowerCase()
    const [admins, families] = await Promise.all([
      supabase.from('admins').select('email').eq('email', email),
      supabase.from('families').select('*').order('name'),
    ])
    if (admins.error || families.error) {
      setProfileError((admins.error ?? families.error)!.message)
      return
    }
    setProfile({ email, isAdmin: (admins.data ?? []).length > 0, families: families.data ?? [] })
  }, [])

  useEffect(() => {
    if (session) loadProfile(session)
    else setProfile(null)
  }, [session, loadProfile])

  if (session === undefined) return <div className="center muted">読み込み中…</div>
  if (!session) return <Login />

  if (profileError) {
    return (
      <Shell profile={null} path={route.path}>
        <div className="card error">データを読み込めませんでした: {profileError}</div>
      </Shell>
    )
  }
  if (!profile) return <div className="center muted">読み込み中…</div>

  if (!profile.isAdmin && profile.families.length === 0) {
    return (
      <Shell profile={profile} path={route.path}>
        <div className="card">
          <h2>登録されていないメールアドレスです</h2>
          <p>
            <b>{profile.email}</b> はまだ名簿に登録されていません。登録済みのアドレスでログインし直すか、バス係にご連絡ください。
          </p>
          <p className="muted">This email isn't on the bus roster yet. Please sign in with the email you registered, or contact the bus coordinator.</p>
          <button className="btn" onClick={() => supabase.auth.signOut()}>ログアウト / Sign out</button>
        </div>
      </Shell>
    )
  }

  let page
  switch (route.path) {
    case '/my':
      page = <MySignups profile={profile} />
      break
    case '/payment':
      page = <Payment />
      break
    case '/admin/roster':
      page = profile.isAdmin ? <Roster profile={profile} /> : null
      break
    case '/admin/families':
      page = profile.isAdmin ? <Families onChanged={() => loadProfile(session)} /> : null
      break
    default:
      page = <SignupForm profile={profile} params={route.params} />
  }

  return (
    <Shell profile={profile} path={route.path}>
      {page ?? <div className="card">ページが見つかりません</div>}
    </Shell>
  )
}

function Shell({ profile, path, children }: { profile: Profile | null; path: string; children: React.ReactNode }) {
  const tabs: [string, string][] = [
    ['/', '申込'],
    ['/my', '履歴'],
    ['/payment', '支払い'],
  ]
  if (profile?.isAdmin) {
    tabs.push(['/admin/roster', '名簿'], ['/admin/families', '家族'])
  }
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href={href('/')}>🚌 BusRoster</a>
          <nav>
            {tabs.map(([p, label]) => (
              <a key={p} href={href(p)} className={path === p ? 'active' : ''}>{label}</a>
            ))}
          </nav>
          {profile && (
            <div className="who">
              <span className="muted small">{profile.email}</span>
              <button className="link" onClick={() => supabase.auth.signOut()}>ログアウト</button>
            </div>
          )}
        </div>
      </header>
      <main className="container">{children}</main>
    </>
  )
}
