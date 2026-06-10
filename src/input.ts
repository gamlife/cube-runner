export interface InputBindings {
  onLeft: () => void
  onRight: () => void
  onJump: () => void
  onAnyKey: () => void
  onRestart: () => void
  onPause: () => void
  /**
   * Hold-and-drag for precise X movement. Called continuously while a finger
   * is dragging across the gameplay area; called with `null` when the drag
   * ends. Only fires once the touch has clearly turned into a sustained
   * horizontal drag (≥ DRAG_MIN_DIST px with horizontal > vertical) — quick
   * swipes and taps do not trigger drag mode.
   */
  onDrag: (screenX: number | null) => void
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
  //
  // Hold-and-drag: once a touch has moved ≥ DRAG_MIN_DIST horizontally without
  // going vertical, we enter "drag" mode. While dragging, the player's X is
  // driven by the finger's screenX position so the user can park the cube at
  // any in-lane position (useful for tight squeezes between obstacles).
  // Drag never fires onAnyKey / swipe / tap — it's an exclusive gesture.
  const TAP_MAX_MS = 250
  const TAP_MAX_MOVE = 10
  const SWIPE_MIN_DIST = 16
  const DRAG_MIN_DIST = 16
  const HORIZONTAL_RATIO = 0.4 // left zone is 0..40% of viewport width

  interface Touch {
    id: number
    startX: number
    startY: number
    startT: number
    target: HTMLElement
    /** True once this touch has turned into a sustained horizontal drag. */
    dragging: boolean
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
        dragging: false,
      })
    }
    if (!isUIControl && e.cancelable) e.preventDefault()
  }

  const onMove = (e: TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i]
      if (t == null) continue
      const data = active.get(t.identifier)
      if (!data) continue

      const dx = t.clientX - data.startX
      const dy = t.clientY - data.startY
      const absDx = Math.abs(dx)
      const absDy = Math.abs(dy)

      if (data.dragging) {
        // Already in drag mode: feed the live X to the consumer and stop
        // the gesture from scrolling the page on iOS.
        b.onDrag(t.clientX)
        if (e.cancelable) e.preventDefault()
        continue
      }

      // Promote to drag mode on the first clearly-horizontal motion. We use
      // the same threshold as swipes so behavior is consistent: any deliberate
      // horizontal move becomes either a swipe (if quick) or a drag (if held).
      if (absDx >= DRAG_MIN_DIST && absDx > absDy) {
        data.dragging = true
        b.onAnyKey() // first finger-down also starts the game
        b.onDrag(t.clientX)
        if (e.cancelable) e.preventDefault()
      }
    }
  }

  const onEnd = (e: TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i]
      if (t == null) continue
      const data = active.get(t.identifier)
      active.delete(t.identifier)
      if (!data) continue

      // If the touch started on a UI control (Restart / Resume / audio toggle
      // / on-screen arrow buttons), let the browser fire the click event
      // without our gesture logic interfering. The onStart handler already
      // skipped preventDefault for these, so the click will dispatch normally;
      // we just bail out of swipe/tap/drag processing here so the gesture
      // can't also be read as a lane change.
      if (data.target.closest('button, [data-no-input]')) continue

      const dt = performance.now() - data.startT
      const dx = t.clientX - data.startX
      const dy = t.clientY - data.startY
      const absDx = Math.abs(dx)
      const absDy = Math.abs(dy)

      // If the touch was a drag, release it. No swipe / tap action is taken
      // because the user was busy steering — firing onLeft/onRight on top
      // would feel like a phantom jump.
      if (data.dragging) {
        b.onDrag(null)
        continue
      }

      // Start the game on first touch
      b.onAnyKey()

      // Horizontal swipe: any clear horizontal motion (≥ 16px) wins over a
      // vertical/center tap, so users can swipe from anywhere on the screen
      // (including the upper gameplay area) to change lanes.
      if (absDx >= SWIPE_MIN_DIST && absDx > absDy) {
        if (dx < 0) b.onLeft()
        else b.onRight()
        continue
      }
      // Vertical swipe (jump)
      if (absDy >= SWIPE_MIN_DIST && absDy > absDx && dy < 0) {
        b.onJump()
        continue
      }

      // Tap (no significant motion): split screen into left/center/right zones
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
      if (t == null) continue
      const data = active.get(t.identifier)
      if (data?.dragging) b.onDrag(null)
      active.delete(t.identifier)
    }
  }

  // passive: false is required to call preventDefault() on iOS Safari
  const opts: AddEventListenerOptions = { passive: false }
  window.addEventListener('touchstart', onStart, opts)
  window.addEventListener('touchmove', onMove, opts)
  window.addEventListener('touchend', onEnd, opts)
  window.addEventListener('touchcancel', onCancel, opts)

  return () => {
    window.removeEventListener('keydown', kbdHandler)
    window.removeEventListener('touchstart', onStart)
    window.removeEventListener('touchmove', onMove)
    window.removeEventListener('touchend', onEnd)
    window.removeEventListener('touchcancel', onCancel)
  }
}
