import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// eslint-disable-next-line no-console
console.log('[supabase] env check:', {
  hasUrl: Boolean(supabaseUrl),
  hasAnonKey: Boolean(supabaseAnonKey),
  urlPrefix: supabaseUrl ? supabaseUrl.slice(0, 30) : '(missing)',
})

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
      'Auth and data loading will not work until you set these in .env.local.'
  )
}

export const supabase = createClient(
  supabaseUrl || 'http://placeholder.invalid',
  supabaseAnonKey || 'placeholder'
)

