import { create } from 'zustand'
import type { SavedStore, LocalSavedQuestion } from '@/types'
import { getDeviceId } from '@/lib/device'
import { db } from '@/lib/dexie/db'
import { saveQuestion, removeSavedQuestion, getSavedQuestionIds } from '@/lib/dexie/cache'
import { currentUserId } from '@/lib/session/sync'
import { syncSavedQuestion, unsyncSavedQuestion } from '@/lib/supabase/queries'

// Fire-and-forget Supabase sync, only when logged in. Guests stay Dexie-only.
async function pushSavedIfLoggedIn(
  questionId: string,
  saved: boolean,
  recordId?: string,
): Promise<void> {
  try {
    const userId = await currentUserId()
    if (!userId) return
    const deviceId = getDeviceId()
    if (saved) {
      await syncSavedQuestion(questionId, userId, deviceId)
      if (recordId) {
        await db.savedQuestions.update(recordId, { userId, syncedAt: Date.now() })
      }
    } else {
      await unsyncSavedQuestion(questionId, userId, deviceId)
    }
  } catch (e) {
    console.error('[savedStore] saved push failed:', e)
  }
}

export const useSavedStore = create<SavedStore>((set, get) => ({
  savedIds: new Set<string>(),

  toggleSaved: (questionId: string) => {
    const { savedIds } = get()
    const next = new Set(savedIds)
    const deviceId = getDeviceId()

    if (next.has(questionId)) {
      next.delete(questionId)
      removeSavedQuestion(questionId)
      void pushSavedIfLoggedIn(questionId, false)
    } else {
      next.add(questionId)
      const record: LocalSavedQuestion = {
        id: crypto.randomUUID(),
        userId: null,
        deviceId,
        questionId,
        syncedAt: null,
      }
      saveQuestion(record)
      void pushSavedIfLoggedIn(questionId, true, record.id)
    }

    set({ savedIds: next })
  },

  isSaved: (questionId: string) => {
    return get().savedIds.has(questionId)
  },

  setSavedIds: (ids: string[]) => {
    set({ savedIds: new Set(ids) })
  },

  loadSavedIds: async () => {
    const ids = await getSavedQuestionIds()
    set({ savedIds: new Set(ids) })
  },
}))
