import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = 'https://kubeztxbqssxiyicoofw.supabase.co'
const SUPABASE_KEY = 'sb_publishable_mZONfXxahZiG7cWtz-MDXQ_5snK7q4E'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
