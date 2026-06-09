import * as THREE from 'three'

/**
 * Sky system: gradient backdrop + sun + parallax clouds.
 * The clouds are drawn on a canvas and applied to a few quads at different
 * depths so they scroll at different rates when the player moves.
 */
export class Sky {
  readonly group: THREE.Group
  private readonly skyGeom: THREE.SphereGeometry
  private readonly skyMat: THREE.ShaderMaterial
  private readonly sun: THREE.Mesh
  private readonly sunHalo: THREE.Mesh
  private readonly cloudLayers: Array<{
    mesh: THREE.Mesh
    mat: THREE.MeshBasicMaterial
    speed: number
    baseX: number
  }> = []

  constructor() {
    this.group = new THREE.Group()

    // Gradient sky via a custom shader on the inside of a large sphere.
    this.skyGeom = new THREE.SphereGeometry(150, 32, 16)
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x6cc6ff) },
        bottomColor: { value: new THREE.Color(0xc8efff) },
        offset: { value: 12 },
        exponent: { value: 0.7 },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPos;
        void main() {
          float h = normalize(vWorldPos + vec3(0.0, offset, 0.0)).y;
          float t = max(pow(max(h, 0.0), exponent), 0.0);
          gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
    })
    const sky = new THREE.Mesh(this.skyGeom, this.skyMat)
    this.group.add(sky)

    // Sun: bright disc with a soft halo.
    const sunGeom = new THREE.CircleGeometry(8, 32)
    this.sunMat = new THREE.MeshBasicMaterial({
      color: 0xfff4c4,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      fog: false,
    })
    this.sun = new THREE.Mesh(sunGeom, this.sunMat)
    this.sun.position.set(0, 28, -90)
    this.group.add(this.sun)

    const haloGeom = new THREE.CircleGeometry(14, 32)
    this.haloMat = new THREE.MeshBasicMaterial({
      color: 0xfff4c4,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
      fog: false,
    })
    this.sunHalo = new THREE.Mesh(haloGeom, this.haloMat)
    this.sunHalo.position.set(0, 28, -91)
    this.group.add(this.sunHalo)

    // 3 layers of procedural clouds at different depths.
    for (let i = 0; i < 3; i++) {
      const size = 60 + i * 25
      const tex = this.makeCloudTexture(512, 256, 60 + i * 18)
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        fog: false,
      })
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size * 0.5), mat)
      mesh.position.set(0, 12 + i * 3, -70 - i * 12)
      this.group.add(mesh)
      this.cloudLayers.push({
        mesh,
        mat,
        speed: 0.04 + i * 0.03,
        baseX: -size / 2,
      })
    }
  }

  // Cache to expose to the applyTheme method without TS complaints about field shadowing.
  private sunMat = new THREE.MeshBasicMaterial()
  private haloMat = new THREE.MeshBasicMaterial()
  // Scratch Color objects reused in applyTheme to avoid per-call allocations.
  private readonly _topColor = new THREE.Color()
  private readonly _bottomColor = new THREE.Color()
  private readonly _sunColor = new THREE.Color()
  private readonly _cloudColor = new THREE.Color()

  applyTheme(theme: {
    skyTop: number
    skyBottom: number
    sunColor: number
    sunIntensity: number
    cloudColor: number
    cloudOpacity: number
  }) {
    this._topColor.setHex(theme.skyTop)
    this._bottomColor.setHex(theme.skyBottom)
    ;(this.skyMat.uniforms.topColor.value as THREE.Color).copy(this._topColor)
    ;(this.skyMat.uniforms.bottomColor.value as THREE.Color).copy(this._bottomColor)
    this._sunColor.setHex(theme.sunColor)
    this.sunMat.color.copy(this._sunColor)
    this.haloMat.color.copy(this._sunColor)
    this.sunMat.opacity = 0.6 + theme.sunIntensity * 0.3
    this.haloMat.opacity = 0.15 + theme.sunIntensity * 0.15
    this._cloudColor.setHex(theme.cloudColor)
    for (const c of this.cloudLayers) {
      c.mat.color.copy(this._cloudColor)
      c.mat.opacity = theme.cloudOpacity
    }
  }

  /** Animate clouds by sliding them sideways. dt is in seconds. */
  update(dt: number) {
    for (const c of this.cloudLayers) {
      c.mesh.position.x += c.speed * dt
      // wrap so the layer continuously scrolls left to right
      const half = (c.mesh.geometry as THREE.PlaneGeometry).parameters.width / 2
      if (c.mesh.position.x > half + 10) c.mesh.position.x = -half - 10
    }
  }

  private makeCloudTexture(w: number, h: number, seed: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, w, h)
    // seeded rng for determinism
    let s = seed
    const rng = () => {
      s = (s * 9301 + 49297) % 233280
      return s / 233280
    }
    const count = 22
    for (let i = 0; i < count; i++) {
      const cx = rng() * w
      const cy = h * 0.5 + (rng() - 0.5) * h * 0.5
      const r = 30 + rng() * 50
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
      g.addColorStop(0, 'rgba(255,255,255,0.95)')
      g.addColorStop(0.6, 'rgba(255,255,255,0.4)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
    }
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = THREE.RepeatWrapping
    return tex
  }
}
