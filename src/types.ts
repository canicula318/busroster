export type Trip = 'both' | 'outbound' | 'return' | 'none'

export interface Family {
  id: string
  name: string
  phone: string | null
  notes: string | null
}

export interface FamilyEmail {
  email: string
  family_id: string
}

export interface Student {
  id: string
  family_id: string
  name: string
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
