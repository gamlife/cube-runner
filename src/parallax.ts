import * as THREE from 'three'

/**
 * Distant scenery: triangulated mountain silhouettes + tree-line silhouettes.
 * Drawn as canvases on a few quads at different distances so they parallax
 * (closer layers scroll faster than far ones).
 */
export class Parallax {
  readonly group: THREE.Group
  private layers: Array<{
    mesh: THREE.Mesh
    mat: THREE.MeshBasicMaterial
    tex: THREE.CanvasTexture
    speed: number
    tileWidth: number
  }> = []
  // Scratch Color objects reused in applyTheme to avoid per-call allocations.
  private readonly _farColor = new THREE.Color()
  private readonly _nearColor = new THREE.Color()
  private readonly _treeColor = new THREE.Color()

  constructor() {
    this.group = new THREE.Group()
  }

  /** Build the scenery layers. Call once at startup. */
  build() {
    this.dispose()
    this.layers = []

    // Far mountain layer
    this.addSilhouetteLayer({
      w: 1600,
      h: 256,
      baseY: 6,
      z: -80,
      peaks: 14,
      minH: 60,
      maxH: 180,
      speed: 0.04,
      seed: 7,
    })
    // Near mountain layer
    this.addSilhouetteLayer({
      w: 1600,
      h: 256,
      baseY: 4,
      z: -65,
      peaks: 22,
      minH: 40,
      maxH: 140,
      speed: 0.07,
      seed: 13,
    })
    // Distant tree line (sparse)
    this.addSilhouetteLayer({
      w: 1600,
      h: 96,
      baseY: 0.2,
      z: -55,
      peaks: 80,
      minH: 6,
      maxH: 22,
      speed: 0.18,
      seed: 23,
      treeLine: true,
    })
  }

  applyTheme(theme: { mountainNear: number; mountainFar: number }) {
    this._farColor.setHex(theme.mountainFar)
    this._nearColor.setHex(theme.mountainNear)
    if (this.layers[0]) this.layers[0].mat.color.copy(this._farColor)
    if (this.layers[1]) this.layers[1].mat.color.copy(this._nearColor)
    if (this.layers[2]) {
      // tree line is a darker version of mountainNear
      this._treeColor.copy(this._nearColor).multiplyScalar(0.65)
      this.layers[2].mat.color.copy(this._treeColor)
    }
  }

  update(dt: number) {
    for (const l of this.layers) {
      // Slide the texture offset rather than the mesh to avoid seams.
      l.tex.offset.x += (l.speed * dt) / l.tileWidth
    }
  }

  private addSilhouetteLayer(opts: {
    w: number
    h: number
    baseY: number
    z: number
    peaks: number
    minH: number
    maxH: number
    speed: number
    seed: number
    treeLine?: boolean
  }) {
    const { w, h, baseY, z, peaks, minH, maxH, speed, seed, treeLine } = opts

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#000'
    let s = seed
    const rng = () => {
      s = (s * 9301 + 49297) % 233280
      return s / 233280
    }

    if (treeLine) {
      // Vertical tree silhouettes (triangles / blobs)
      const step = w / peaks
      for (let i = 0; i < peaks; i++) {
        const x = i * step + rng() * step * 0.4
        const th = minH + rng() * (maxH - minH)
        const tw = 4 + rng() * 6
        ctx.beginPath()
        ctx.moveTo(x, h)
        ctx.lineTo(x + tw / 2, h - th)
        ctx.lineTo(x + tw, h)
        ctx.closePath()
        ctx.fill()
      }
    } else {
      // Mountain silhouette as one filled polygon
      ctx.beginPath()
      ctx.moveTo(0, h)
      const step = w / peaks
      for (let i = 0; i <= peaks; i++) {
        const x = i * step
        const ph = minH + rng() * (maxH - minH)
        ctx.lineTo(x, h - ph)
        // Slight valley in between for jagged feel
        if (i < peaks) {
          const midX = x + step / 2
          const midY = h - ph * (0.4 + rng() * 0.2)
          ctx.lineTo(midX, midY)
        }
      }
      ctx.lineTo(w, h)
      ctx.closePath()
      ctx.fill()
    }

    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = THREE.RepeatWrapping
    tex.repeat.set(1, 1)

    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      fog: false,
    })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
    mesh.position.set(0, baseY, z)
    this.group.add(mesh)
    this.layers.push({ mesh, mat, tex, speed, tileWidth: w })
  }

  dispose() {
    for (const l of this.layers) {
      this.group.remove(l.mesh)
      l.tex.dispose()
      ;(l.mesh.geometry as THREE.BufferGeometry).dispose()
      l.mat.dispose()
    }
    this.layers = []
  }
}
