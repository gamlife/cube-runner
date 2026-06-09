export interface InputBindings {
  onLeft: () => void
  onRight: () => void
  onJump: () => void
  onAnyKey: () => void
  onRestart: () => void
}

export function bindInput(b: InputBindings): () => void {
  const handler = (e: KeyboardEvent) => {
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
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}
