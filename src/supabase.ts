import { createClient } from '@supabase/supabase-js'

// Both values are public by design: access to data is controlled by the
// row-level security rules in supabase/migrations, not by keeping these secret.
export const SUPABASE_URL = 'https://gktonohflltwwbjcanxl.supabase.co'
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_t84cuaGIbOlCvs6F6-OY7g_kC0ziRsz'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    // Implicit flow lets a parent request the link on one device and open it on another.
    flowType: 'implicit',
    persistSession: true,
    detectSessionInUrl: true,
  },
})

export function appUrl(): string {
  return window.location.origin + import.meta.env.BASE_URL
}
