import { createClient } from '@supabase/supabase-js'

// Адрес вашего проекта
const supabaseUrl = 'https://theybeeteusxwxboczhe.supabase.co'

// Ваш публичный ключ (Publishable key)
const supabaseKey = 'sb_publishable_kKouck2JRHJt04F0cMHk8g_alzlnidd'

export const supabase = createClient(supabaseUrl, supabaseKey)