import { db } from '@/lib/dexie/db'
import {
  fetchCatalogSignature,
  fetchAllExams,
  fetchAllBooks,
  fetchAllChapters,
  type CatalogSignature,
} from '@/lib/supabase/queries'
import type { Exam, Book, Chapter } from '@/types'

const SIGNATURE_KEY = 'catalog_signature'

export interface CatalogChanged {
  exams: boolean
  books: boolean
  chapters: boolean
}

function readStoredSignature(): CatalogSignature | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(SIGNATURE_KEY)
    return raw ? (JSON.parse(raw) as CatalogSignature) : null
  } catch {
    return null
  }
}

function writeStoredSignature(sig: CatalogSignature): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(SIGNATURE_KEY, JSON.stringify(sig))
  } catch {
    // ignore quota / serialization errors — revalidation is best-effort
  }
}

function tableChanged(
  local: CatalogSignature | null,
  remote: CatalogSignature,
  table: keyof CatalogSignature
): boolean {
  if (local == null) return true
  return (
    remote[table].maxUpdatedAt !== local[table].maxUpdatedAt ||
    remote[table].count !== local[table].count
  )
}

/**
 * Reconcile a Dexie table against a fresh full row set:
 * upsert everything present, delete rows that disappeared server-side.
 */
async function reconcile<T extends { id: string }>(
  table: { bulkPut: (rows: T[]) => Promise<unknown>; bulkDelete: (keys: string[]) => Promise<unknown>; toCollection: () => { primaryKeys: () => Promise<string[]> } },
  fresh: T[]
): Promise<void> {
  await table.bulkPut(fresh)
  const freshIds = new Set(fresh.map((r) => r.id))
  const localIds = await table.toCollection().primaryKeys()
  const staleIds = localIds.filter((id) => !freshIds.has(id))
  if (staleIds.length > 0) await table.bulkDelete(staleIds)
}

/**
 * Stale-while-revalidate for the catalog. Reads are always served from Dexie
 * elsewhere; this runs out-of-band, compares a small signature probe, and only
 * refetches + reconciles the tables that actually changed. Never blocks the UI.
 *
 * Reconciling chapters refreshes each row's `content_version`, which revives the
 * lazy chapter-content invalidation in `getCachedOrFetchChapter`.
 */
export async function revalidateCatalog(
  onChange?: (changed: CatalogChanged) => void
): Promise<void> {
  const remote = await fetchCatalogSignature()
  const local = readStoredSignature()

  const changed: CatalogChanged = {
    exams: tableChanged(local, remote, 'exams'),
    books: tableChanged(local, remote, 'books'),
    chapters: tableChanged(local, remote, 'chapters'),
  }

  if (changed.exams) {
    const fresh = await fetchAllExams()
    await reconcile<Exam>(db.exams, fresh)
  }
  if (changed.books) {
    const fresh = await fetchAllBooks()
    await reconcile<Book>(db.books, fresh)
  }
  if (changed.chapters) {
    const fresh = await fetchAllChapters()
    await reconcile<Chapter>(db.chapters, fresh)
  }

  writeStoredSignature(remote)

  if (onChange && (changed.exams || changed.books || changed.chapters)) {
    onChange(changed)
  }
}
