export type Trip = 'both' | 'outbound' | 'return' | 'none'

export interface Family {
  id: string
  name: string
  phone: string | null
  notes: string | null
  stop_id: string | null
}

export interface Stop {
  id: string
  name: string
  short_name: string | null
  place: string | null
  address: string | null
  kind: 'stop' | 'school'
  am_time: string | null
  pm_time: string | null
  sort: number
}

export interface Contact {
  id: string
  label: string
  name: string | null
  phone: string | null
  note: string | null
  admins_only: boolean
  sort: number
}

export interface FamilyEmail {
  email: string
  family_id: string
}

export interface Student {
  id: string
  family_id: string
  name: string
  name_ja: string | null
  grade: string | null
  active: boolean
  sort: number
}

export interface Signup {
  id: string
  family_id: string
  bus_date: string
  trip: Trip
  guest_name: string | null
  comments: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  signup_students: { student_id: string }[]
}

export interface Fare {
  id: string
  name: string
  method: string | null
  price_cents: number | null
  link: string | null
  sort: number
}

export const TRIP_LABELS: Record<Trip, { ja: string; en: string }> = {
  both: { ja: '往復（行き・帰り）', en: 'Both ways' },
  outbound: { ja: '行きのみ', en: 'To school only' },
  return: { ja: '帰りのみ', en: 'Home only' },
  none: { ja: '利用しません', en: 'Not riding' },
}

export const TRIP_ORDER: Trip[] = ['both', 'outbound', 'return', 'none']

export function ridesOutbound(t: Trip) {
  return t === 'both' || t === 'outbound'
}
export function ridesReturn(t: Trip) {
  return t === 'both' || t === 'return'
}

export const studentLabel = (s: Pick<Student, 'name' | 'name_ja'>) => s.name_ja || s.name

export function mapsUrl(address: string) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address)
}

export function telUrl(phone: string) {
  return 'tel:' + phone.replace(/[^\d+]/g, '')
}
