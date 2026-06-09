import type { InputBindings } from './input'

const ICONS: Record<string, string> = {
  left:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  jump:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l-6 8h4v10h4V11h4z" fill="currentColor"/></svg>',
  right:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
}

export class TouchControls {
  private readonly root: HTMLDivElement
  private cleanups: Array<() => void> = []

  constructor(b: InputBindings) {
    this.root = document.createElement('div')
    this.root.id = 'touch-controls'
    this.root.setAttribute('aria-label', 'Game controls')
    this.root.innerHTML = `
      <button class="ctrl" data-action="left" data-no-input type="button" aria-label="Move left">
        ${ICONS.left}
      </button>
      <button class="ctrl ctrl-jump" data-action="jump" data-no-input type="button" aria-label="Jump">
        ${ICONS.jump}
        <span class="ctrl-label">JUMP</span>
      </button>
      <button class="ctrl" data-action="right" data-no-input type="button" aria-label="Move right">
        ${ICONS.right}
      </button>
    `
    document.body.appendChild(this.root)

    const dispatch = (action: string) => {
      b.onAnyKey()
      if (action === 'left') b.onLeft()
      else if (action === 'right') b.onRight()
      else if (action === 'jump') b.onJump()
      // Tactile feedback on iOS / Android (no-op on unsupported devices)
      if (typeof navigator.vibrate === 'function') navigator.vibrate(12)
    }

    const buttons = this.root.querySelectorAll<HTMLButtonElement>('button.ctrl')
    buttons.forEach((btn) => {
      const action = btn.dataset.action ?? ''

      // pointerdown gives the fastest response and works for touch + mouse + pen.
      const down = (e: PointerEvent) => {
        e.preventDefault()
        e.stopPropagation()
        dispatch(action)
        btn.setPointerCapture(e.pointerId)
      }
      const up = (e: PointerEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (btn.hasPointerCapture(e.pointerId)) btn.releasePointerCapture(e.pointerId)
      }
      const cancel = (e: PointerEvent) => {
        if (btn.hasPointerCapture(e.pointerId)) btn.releasePointerCapture(e.pointerId)
      }
      btn.addEventListener('pointerdown', down)
      btn.addEventListener('pointerup', up)
      btn.addEventListener('pointercancel', cancel)
      btn.addEventListener('pointerleave', cancel)
      this.cleanups.push(() => {
        btn.removeEventListener('pointerdown', down)
        btn.removeEventListener('pointerup', up)
        btn.removeEventListener('pointercancel', cancel)
        btn.removeEventListener('pointerleave', cancel)
      })
    })
  }

  destroy() {
    this.cleanups.forEach((fn) => fn())
    this.cleanups = []
    this.root.remove()
  }
}
