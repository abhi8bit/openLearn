'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { SessionLayout } from '@/components/session/SessionLayout'
import { useSessionStore } from '@/stores/sessionStore'
import { getSession, getAnswersForSession, getCachedOrFetchChapter } from '@/lib/dexie/cache'
import { db } from '@/lib/dexie/db'
import { fetchQuestionsByIds } from '@/lib/supabase/queries'
import { Skeleton } from '@/components/ui/skeleton'
import type { SectionConfig } from '@/types'

export default function SessionPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const sessionId = params.sessionId as string
  const store = useSessionStore()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const targetQ = searchParams.get('q')

    // If session is already loaded in store (normal flow), skip reload
    if (store.sessionId === sessionId && store.questions.length > 0) {
      // Handle ?q=N param for direct question navigation
      if (targetQ) {
        const idx = parseInt(targetQ, 10)
        if (!isNaN(idx) && idx !== store.currentIndex) {
          store.navigateTo(idx)
        }
      }
      setLoading(false)
      return
    }

    // Reload from Dexie (page refresh / direct navigation / resume)
    async function reload() {
      try {
        const session = await getSession(sessionId)
        if (!session) {
          setError('Session not found')
          setLoading(false)
          return
        }

        // Load chapter data — for non-chapter scopes, reload questions from cached data
        let chapterData
        if (session.scope === 'chapter' && session.scopeId) {
          chapterData = await getCachedOrFetchChapter(session.scopeId)
        } else {
          // For exam/book scope: rebuild from cached chapter data, fetch missing from Supabase
          const allChapterData = await db.chapterData.toArray()
          const questionMap = new Map<string, typeof allChapterData[0]['questions'][0]>(
            allChapterData.flatMap((cd) => cd.questions.map((q) => [q.id, q]))
          )
          const missingIds = session.questionIds.filter((id) => !questionMap.has(id))
          if (missingIds.length > 0) {
            const fetched = await fetchQuestionsByIds(missingIds)
            for (const q of fetched) {
              questionMap.set(q.id, q)
            }
          }
          const orderedQuestions = session.questionIds
            .map((id) => questionMap.get(id))
            .filter(Boolean)
          chapterData = {
            chapterId: '',
            concepts: [],
            questions: orderedQuestions as NonNullable<typeof orderedQuestions[0]>[],
            contentVersion: null,
            cachedAt: Date.now(),
          }
        }

        // Filter questions to match session questionIds
        const questionMap = new Map(chapterData.questions.map((q) => [q.id, q]))
        const orderedQuestions = session.questionIds
          .map((id) => questionMap.get(id))
          .filter(Boolean) as typeof chapterData.questions

        // Restore answers from Dexie — deduplicate in case previous resumes
        // created duplicate rows (old bug: setAnswer generated new UUIDs on restore).
        const storedAnswers = await getAnswersForSession(sessionId)
        const dedupedMap = new Map<string, typeof storedAnswers[0]>()
        const duplicateIds: string[] = []
        for (const a of storedAnswers) {
          const existing = dedupedMap.get(a.questionId)
          if (existing) {
            // Keep the answer with more time spent (more recent data)
            if (a.timeSpentSecs >= existing.timeSpentSecs) {
              duplicateIds.push(existing.id)
              dedupedMap.set(a.questionId, a)
            } else {
              duplicateIds.push(a.id)
            }
          } else {
            dedupedMap.set(a.questionId, a)
          }
        }
        if (duplicateIds.length > 0) {
          await db.answers.bulkDelete(duplicateIds)
        }

        const answersMap: Record<string, typeof storedAnswers[0]> = {}
        for (const [qId, a] of dedupedMap) {
          answersMap[qId] = a
        }

        // Initialize store with restored data
        // Practice: timer starts from zero; Mock: preserves elapsed time
        const totalLimitSecs = session.timeLimitSecs
        const alreadyElapsed = session.timeElapsedSecs ?? 0
        const remaining = totalLimitSecs !== null
          ? Math.max(0, totalLimitSecs - alreadyElapsed)
          : null
        const isPractice = session.sessionType === 'practice'

        // Restore section data from stored settings
        const storedSettings = session.settings
        const sections = (storedSettings?.sections as SectionConfig[] | undefined) ?? undefined
        const sectionQuestionRanges = storedSettings?.sectionQuestionRanges as Array<{ start: number; end: number }> | undefined

        await store.initSession(
          sessionId,
          {
            scope: session.scope,
            sessionType: session.sessionType,
            examId: '',
            bookId: null,
            chapterId: session.scopeId,
            questionIds: session.questionIds,
            timeLimitMinutes: totalLimitSecs ? totalLimitSecs / 60 : undefined,
            initialTimeElapsedSecs: isPractice ? 0 : alreadyElapsed,
            initialTimeRemainingSecs: isPractice ? null : remaining,
            isSubmitted: session.isSubmitted,
            sections,
            sectionQuestionRanges,
          },
          {
            ...chapterData,
            questions: orderedQuestions,
          }
        )

        // Restore answers directly — use setState to preserve original
        // answer IDs (avoids setAnswer generating new UUIDs = duplicate Dexie rows)
        useSessionStore.setState({ answers: answersMap })

        // Restore current index
        const targetIndex = searchParams.get('q')
        if (targetIndex) {
          const idx = parseInt(targetIndex, 10)
          if (!isNaN(idx)) {
            store.navigateTo(idx)
          }
        } else if (session.currentIndex > 0) {
          store.navigateTo(session.currentIndex)
        }

        setLoading(false)
      } catch (e) {
        setError((e as Error).message)
        setLoading(false)
      }
    }

    reload()
  }, [sessionId])

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-96" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <p className="text-red-600">{error}</p>
      </div>
    )
  }

  return <SessionLayout />
}
