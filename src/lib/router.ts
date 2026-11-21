import { useEffect, useState } from 'react'

export interface Route {
  path: string
  params: URLSearchParams
}

function read(): Route {
  const raw = window.location.hash.replace(/^#/, '')
  // Supabase sign-in links put tokens in the hash (#access_token=...); treat as home.
  if (!raw.startsWith('/')) return { path: '/', params: new URLSearchParams() }
  const [path, query = ''] = raw.split('?')
  return { path: path || '/', params: new URLSearchParams(query) }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const onChange = () => setRoute(read())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function navigate(path: string, params?: Record<string, string>) {
  const q = params ? '?' + new URLSearchParams(params).toString() : ''
  window.location.hash = path + q
}

export function href(path: string, params?: Record<string, string>) {
  const q = params ? '?' + new URLSearchParams(params).toString() : ''
  return '#' + path + q
}
