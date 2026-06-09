import * as THREE from 'three'

/**
 * Lane-side decorations. Three themes:
 *   - 'trees': pine trees on both sides
 *   - 'lamps': street lamps with point lights (warm)
 *   - 'neon':  glowing posts with point lights (cyan/magenta)
 *
 * Items are spawned far ahead and recycled as the world scrolls.
 */
export class Decorations {
  readonly group: THREE.Group
  private type: 'trees' | 'lamps' | 'neon' = 'trees'
  private readonly pool: THREE.Object3D[] = []
  private readonly sideXs: number[] = []
  private readonly spacing = 4
  private readonly maxCount = 60
  private nextZ = -10

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group()
    scene.add(this.group)
    this.sideXs = [-3, 3]
  }

  setType(type: 'trees' | 'lamps' | 'neon') {
    if (this.type === type) return
    this.type = type
    // Wipe existing pool
    while (this.group.children.length) {
      const c = this.group.children[0] as THREE.Object3D
      this.group.remove(c)
      c.traverse((o) => {
        if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose()
        const m = (o as THREE.Mesh).material
        if (Array.isArray(m)) m.forEach((mm) => mm.dispose())
        else if (m) (m as THREE.Material).dispose()
      })
    }
    this.pool.length = 0
    this.nextZ = -10
  }

  update(speed: number, dt: number) {
    // Move everything toward the player
    for (const obj of this.pool) {
      obj.position.z += speed * dt
    }
    // Recycle
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const obj = this.pool[i]!
      if (obj.position.z > 8) {
        this.group.remove(obj)
        this.pool.splice(i, 1)
      }
    }
    // Spawn ahead
    while (this.pool.length < this.maxCount) {
      const obj = this.make(this.type)
      obj.position.z = this.nextZ
      this.nextZ -= this.spacing
      this.group.add(obj)
      this.pool.push(obj)
    }
  }

  private make(type: 'trees' | 'lamps' | 'neon'): THREE.Object3D {
    const side = Math.random() < 0.5 ? -1 : 1
    const x = side * (this.sideXs[Math.floor(Math.random() * this.sideXs.length)] ?? 3)
    if (type === 'trees') return this.makeTree(x)
    if (type === 'lamps') return this.makeLamp(x, 0xffd07a, 1.6)
    return this.makeNeon(x)
  }

  private makeTree(x: number): THREE.Object3D {
    const g = new THREE.Group()
    // Trunk
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b3f1d, roughness: 0.9 })
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.9, 6), trunkMat)
    trunk.position.y = 0.45
    g.add(trunk)
    // Foliage (3 stacked cones)
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x2c5f3a, roughness: 0.8 })
    for (let i = 0; i < 3; i++) {
      const r = 0.95 - i * 0.18
      const h = 0.9
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), foliageMat)
      cone.position.y = 0.9 + i * 0.55
      g.add(cone)
    }
    g.position.x = x + (Math.random() - 0.5) * 0.4
    g.position.z = -50 // will be overridden by caller
    g.rotation.y = Math.random() * Math.PI * 2
    return g
  }

  private makeLamp(x: number, color: number, intensity: number): THREE.Object3D {
    const g = new THREE.Group()
    const postMat = new THREE.MeshStandardMaterial({ color: 0x222226, metalness: 0.6, roughness: 0.3 })
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.6, 8), postMat)
    post.position.y = 1.8
    g.add(post)
    // Arm
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), postMat)
    arm.position.set(-Math.sign(x) * 0.25, 3.4, 0)
    g.add(arm)
    // Bulb
    const bulbMat = new THREE.MeshBasicMaterial({ color })
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), bulbMat)
    bulb.position.set(-Math.sign(x) * 0.5, 3.3, 0)
    g.add(bulb)
    // Point light
    const pl = new THREE.PointLight(color, intensity, 6, 2)
    pl.position.copy(bulb.position)
    g.add(pl)
    g.position.x = x
    return g
  }

  private makeNeon(x: number): THREE.Object3D {
    const g = new THREE.Group()
    const colors = [0x4cf0c8, 0xff4ad8, 0x4a6aff, 0xffd24a]
    const c = colors[Math.floor(Math.random() * colors.length)]!
    const postMat = new THREE.MeshStandardMaterial({
      color: 0x111122,
      metalness: 0.4,
      roughness: 0.3,
      emissive: c,
      emissiveIntensity: 0.4,
    })
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.2, 8), postMat)
    post.position.y = 1.6
    g.add(post)
    // Top sign (glowing plane)
    const signMat = new THREE.MeshBasicMaterial({ color: c })
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), signMat)
    sign.position.y = 3.0
    g.add(sign)
    // Halo
    const haloMat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.4 })
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.55), haloMat)
    halo.position.y = 3.0
    halo.position.z = -0.01
    g.add(halo)
    const pl = new THREE.PointLight(c, 1.2, 5, 2)
    pl.position.y = 3.0
    g.add(pl)
    g.position.x = x
    return g
  }
}
