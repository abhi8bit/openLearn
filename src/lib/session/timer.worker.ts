let intervalId: ReturnType<typeof setInterval> | null = null
let elapsedSecs = 0
let limitSecs: number | null = null

self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data

  switch (type) {
    case 'START': {
      elapsedSecs = 0
      limitSecs = payload?.limitSecs ?? null
      startTicking()
      break
    }
    case 'PAUSE': {
      stopTicking()
      break
    }
    case 'RESUME': {
      startTicking()
      break
    }
    case 'STOP': {
      stopTicking()
      break
    }
  }
}

function startTicking() {
  if (intervalId !== null) return
  intervalId = setInterval(() => {
    elapsedSecs++
    self.postMessage({ type: 'TICK', elapsedSecs })
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
