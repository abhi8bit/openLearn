import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// Load .env.local without printing its contents
const env = {}
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const { data, error } = await supabase.from('exams').select('*').order('display_order')
if (error) {
  console.error('ERROR:', error.message)
  process.exit(1)
}
console.log('Column names:', data.length ? Object.keys(data[0]) : '(no rows)')
console.log('Row count:', data.length)
console.table(data.map((e) => ({ name: e.name, slug: e.slug, display_order: e.display_order, is_active: e.is_active })))
