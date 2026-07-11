import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// Load .env.local without printing its contents
const env = {}
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

// New exams grouped by category (matching existing lowercase category_name convention).
// SSC GD Constable is intentionally omitted — it already exists as "SSC GD".
const NEW_EXAMS = [
  { name: 'SSC MTS', slug: 'ssc-mts', category_name: 'ssc' },
  { name: 'SSC CPO', slug: 'ssc-cpo', category_name: 'ssc' },
  { name: 'SSC Stenographer', slug: 'ssc-stenographer', category_name: 'ssc' },
  { name: 'SSC JE', slug: 'ssc-je', category_name: 'ssc' },
  { name: 'IBPS PO', slug: 'ibps-po', category_name: 'banking' },
  { name: 'IBPS Clerk', slug: 'ibps-clerk', category_name: 'banking' },
  { name: 'IBPS RRB PO', slug: 'ibps-rrb-po', category_name: 'banking' },
  { name: 'IBPS RRB Clerk', slug: 'ibps-rrb-clerk', category_name: 'banking' },
  { name: 'SBI PO', slug: 'sbi-po', category_name: 'banking' },
  { name: 'SBI Clerk', slug: 'sbi-clerk', category_name: 'banking' },
  { name: 'RRB NTPC', slug: 'rrb-ntpc', category_name: 'railways' },
  { name: 'RRB Group D', slug: 'rrb-group-d', category_name: 'railways' },
  { name: 'RRB ALP', slug: 'rrb-alp', category_name: 'railways' },
]

// Fetch current state to avoid duplicates and continue display_order.
const { data: existing, error: fetchErr } = await supabase
  .from('exams')
  .select('slug, display_order')
if (fetchErr) { console.error('FETCH ERROR:', fetchErr.message); process.exit(1) }

const existingSlugs = new Set(existing.map((e) => e.slug))
let nextOrder = existing.reduce((max, e) => Math.max(max, e.display_order ?? 0), 0) + 1

const toInsert = []
const skipped = []
for (const exam of NEW_EXAMS) {
  if (existingSlugs.has(exam.slug)) {
    skipped.push(exam.slug)
    continue
  }
  toInsert.push({
    ...exam,
    display_order: nextOrder++,
    is_active: false, // no books/content yet
  })
}

if (skipped.length) console.log('Skipped (already exist):', skipped.join(', '))

if (toInsert.length === 0) {
  console.log('Nothing to insert — all exams already present.')
} else {
  const { data, error } = await supabase.from('exams').insert(toInsert).select('name, slug, category_name, display_order')
  if (error) { console.error('INSERT ERROR:', error.message); process.exit(1) }
  console.log(`Inserted ${data.length} exams:`)
  console.table(data)
}

// Final verification — full table grouped.
const { data: all, error: allErr } = await supabase
  .from('exams')
  .select('name, slug, category_name, display_order, is_active')
  .order('display_order')
if (allErr) { console.error('VERIFY ERROR:', allErr.message); process.exit(1) }
console.log('\nFull exams table:')
console.table(all)
