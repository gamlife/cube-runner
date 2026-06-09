export interface InputBindings {
  onLeft: () => void
  onRight: () => void
  onJump: () => void
  onAnyKey: () => void
  onRestart: () => void
  onPause: () => void
}

export function bindInput(b: InputBindings): () => void {
  // ---- Keyboard ----
  const kbdHandler = (e: KeyboardEvent) => {
    if (e.repeat) return
    b.onAnyKey()
    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        b.onLeft()
        e.preventDefault()
        break
      case 'ArrowRight':
      case 'd':
      case 'D':
        b.onRight()
        e.preventDefault()
        break
      case ' ':
      case 'ArrowUp':
      case 'w':
      case 'W':
        b.onJump()
        e.preventDefault()
        break
      case 'r':
      case 'R':
        b.onRestart()
        break
      case 'p':
      case 'P':
      case 'Escape':
        b.onPause()
        break
    }
  }
  window.addEventListener('keydown', kbdHandler)

  // ---- Touch: 3 vertical zones (left / center / right) ----
  // Tap left third -> move left, center third -> jump, right third -> move right.
  // Thresholds: a "tap" must end within TAP_MAX_MS and not move > TAP_MAX_MOVE px.
  // Swipes (longer press or > threshold) are also accepted: swipe up = jump, swipe
  // left/right = change lane. This makes the game feel responsive on iOS Safari.
  const TAP_MAX_MS = 250
  const TAP_MAX_MOVE = 12
  const SWIPE_MIN_DIST = 36
  const HORIZONTAL_RATIO = 0.33 // left zone is 0..33% of viewport width

  interface Touch {
    id: number
    startX: number
    startY: number
    startT: number
    target: HTMLElement
  }
  const active = new Map<number, Touch>()

  const getZone = (x: number, w: number): 'left' | 'right' | 'center' => {
    if (x < w * HORIZONTAL_RATIO) return 'left'
    if (x > w * (1 - HORIZONTAL_RATIO)) return 'right'
    return 'center'
  }

  const onStart = (e: TouchEvent) => {
    // If the touch is on a UI control (button, [data-no-input]), let the browser
    // handle it normally so click events fire. Otherwise call preventDefault to
    // suppress iOS Safari's double-tap zoom and pull-to-refresh while playing.
    const target = e.target as HTMLElement | null
    const isUIControl = !!(target && target.closest('button, [data-no-input]'))

    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i]
      if (t == null) continue
      active.set(t.identifier, {
        id: t.identifier,
        startX: t.clientX,
        startY: t.clientY,
        startT: performance.now(),
        target: t.target as HTMLElement,
      })
    }
    if (!isUIControl && e.cancelable) e.preventDefault()
  }

  const onEnd = (e: TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i]
      if (t == null) continue
      const data = active.get(t.identifier)
      active.delete(t.identifier)
      if (!data) continue

      const dt = performance.now() - data.startT
      const dx = t.clientX - data.startX
      const dy = t.clientY - data.startY
      const absDx = Math.abs(dx)
      const absDy = Math.abs(dy)

      // Ignore if the touch ended on a UI button (e.g. restart) - the button handles it.
      if (
        data.target instanceof HTMLElement &&
        data.target.closest('button, [data-no-input]')
      ) {
        continue
      }

      // Start the game on first touch
      b.onAnyKey()

      // Swipe (longer / bigger move)
      if (absDx > SWIPE_MIN_DIST || absDy > SWIPE_MIN_DIST) {
        if (absDx > absDy) {
          if (dx < 0) b.onLeft()
          else b.onRight()
        } else {
          if (dy < 0) b.onJump() // swipe up
        }
        continue
      }

      // Tap
      if (dt <= TAP_MAX_MS && absDx <= TAP_MAX_MOVE && absDy <= TAP_MAX_MOVE) {
        const zone = getZone(t.clientX, window.innerWidth)
        if (zone === 'left') b.onLeft()
        else if (zone === 'right') b.onRight()
        else b.onJump()
      }
    }
  }

  const onCancel = (e: TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i]
      if (t != null) active.delete(t.identifier)
    }
  }

  // passive: false is required to call preventDefault() on iOS Safari
  const opts: AddEventListenerOptions = { passive: false }
  window.addEventListener('touchstart', onStart, opts)
  window.addEventListener('touchend', onEnd, opts)
  window.addEventListener('touchcancel', onCancel, opts)

  return () => {
    window.removeEventListener('keydown', kbdHandler)
    window.removeEventListener('touchstart', onStart)
    window.removeEventListener('touchend', onEnd)
    window.removeEventListener('touchcancel', onCancel)
  }
}
