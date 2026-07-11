---
paths:
  - "src/stores/sessionStore*"
  - "src/lib/session/**"
  - "src/app/session/**"
  - "src/components/session/**"
---

# Session System Rules

## Session Types

| Type | Concepts shown | Solutions visible | Timer | Submittable |
|---|---|---|---|---|
| `practice` | Yes (first) | Always inline | Elapsed only | No (Finish button) |
| `mock` | No | After submit only | Countdown | Yes (Submit button) |

## currentIndex — Unified Navigation

`sessionStore.currentIndex` is a single integer covering the entire session:
- `0` to `totalConcepts - 1` → concept blocks
- `totalConcepts` to `totalConcepts + questions.length - 1` → question blocks

The right panel nav grid renders `C1..Cn` then `Q1..Qn` in this same order. Never use separate indexes for concepts and questions.

## Session Initialisation Flow

```
User clicks Practice/Mock
  → buildSession(config)         // lib/session/builder.ts
  → getCachedOrFetchChapter()    // lib/dexie/cache.ts
  → collect + filter questions   // apply range/count + shuffle if random
  → create LocalSession in Dexie
  → sessionStore.initSession()   // loads questions + concepts into store
  → router.push('/session/[id]')
```

`buildSession()` must store `question_ids` as an ordered UUID array — this is what allows exact session reconstruction on resume.

## Timer — Web Worker Only

The timer lives entirely in `lib/session/timer.worker.ts`. Never put countdown logic in Zustand or a React component.

```typescript
// Messages TO worker
{ type: 'START', limitSecs: number }   // mock only
{ type: 'PAUSE' }
{ type: 'RESUME' }

// Messages FROM worker
{ type: 'TICK', elapsedSecs: number }
{ type: 'EXPIRED' }                    // mock: auto-submit
```

`sessionStore.timeElapsedSecs` is updated by TICK messages. The timer display component subscribes only to this one field. `EXPIRED` triggers `sessionStore.submitSession()`.

## Per-Question Time Tracking

On `navigateTo(newIndex)`:
1. Compute `timeSpent = Date.now() - questionEnteredAt` for the question being left
2. Update `session_answers[prevQuestionId].time_spent_secs` in Dexie
3. Set `questionEnteredAt = Date.now()` for the new question

`questionEnteredAt` is a plain `number` in the store (not persisted to Dexie — resets on resume).

## Question State Machine (per question)

```
not_visited → visited (on navigateTo)
visited     → answered (on answerQuestion)
answered    → unanswered (on clearAnswer)
any state   → marked / unmarked (toggleMarked, independent)
any state   → saved / unsaved (toggleSaved, global)
```

Nav grid block colors:
- Not visited: default/empty
- Visited, unanswered: red
- Answered: green
- Marked (unanswered): orange
- Answered + marked: blue
- Saved: star overlay on any color

## Mock Submission

`submitSession()`:
1. Set `is_submitted = true` in store and Dexie
2. Mark session `is_active = false` in Dexie
3. Send stop message to timer worker
4. Compute aggregate stats (score, accuracy) and store in session record
5. `is_correct` per answer was already stored at answer time — do NOT recompute

After submission, the session page switches to results view. Options highlight correct/incorrect. Solution panels become visible.

## Resume Flow

`resumeSession(sessionId)`:
1. Load `LocalSession` from Dexie by id
2. Load all `LocalAnswer` records for this session
3. Restore `questions` array from `question_ids` (look up from Dexie chapterData)
4. Set `currentIndex` to saved position
5. Restore `answers`, `markedQuestions` from answer records
6. If mock and not submitted: restart timer worker from `timeElapsedSecs`
