// Inline timer worker as a Blob to avoid import.meta.url issues with Next.js + Webpack.
// The source of truth for this logic is lib/session/timer.worker.ts — keep them in sync.

function workerCode(): string {
  return `
let intervalId = null
let elapsedSecs = 0
let limitSecs = null

self.onmessage = function(e) {
  var type = e.data.type
  var payload = e.data.payload

  switch (type) {
    case 'START':
      elapsedSecs = 0
      limitSecs = (payload && payload.limitSecs != null) ? payload.limitSecs : null
      startTicking()
      break
    case 'PAUSE':
      stopTicking()
      break
    case 'RESUME':
      startTicking()
      break
    case 'STOP':
      stopTicking()
      break
  }
}

function startTicking() {
  if (intervalId !== null) return
  intervalId = setInterval(function() {
    elapsedSecs++
    self.postMessage({ type: 'TICK', elapsedSecs: elapsedSecs })
    if (limitSecs !== null && elapsedSecs >= limitSecs) {
      stopTicking()
      self.postMessage({ type: 'EXPIRED' })
    }
  }, 1000)
}

function stopTicking() {
  if (intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
}
`
}

export function createTimerWorker(): Worker {
  const blob = new Blob([workerCode()], { type: 'application/javascript' })
  const url = URL.createObjectURL(blob)
  const worker = new Worker(url)
  // Revoke the object URL once the worker is initialized — the blob is already loaded by then
  URL.revokeObjectURL(url)
  return worker
}
