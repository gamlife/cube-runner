import * as THREE from 'three'

/**
 * The track: a long textured road with dashed lane lines, side curbs, and a
 * grass / sand strip outside the curbs. Procedural canvas textures for the
 * road asphalt and the off-road area.
 */
export class Track {
  readonly group: THREE.Group
  private readonly trackLen = 200
  private readonly trackWidth = 4
  private roadMat!: THREE.MeshStandardMaterial
  private groundMat!: THREE.MeshStandardMaterial
  private lineMat!: THREE.MeshBasicMaterial
  private stripeMat!: THREE.MeshBasicMaterial
  private curbMat!: THREE.MeshStandardMaterial
  // Lane dashes (between lanes) — these scroll toward the player each frame
  // so the road itself appears to move past. Stored as a flat array for
  // efficient per-frame updates.
  private readonly dashes: THREE.Mesh[] = []
  private readonly dashSpacing = 2.5
  private readonly dashRecycleZ = 8

  constructor() {
    this.group = new THREE.Group()
    this.rebuild()
  }

  private rebuild() {
    // Clear existing
    while (this.group.children.length) {
      const c = this.group.children[0] as THREE.Object3D
      this.group.remove(c)
      if ((c as THREE.Mesh).geometry) (c as THREE.Mesh).geometry.dispose()
      const m = (c as THREE.Mesh).material
      if (Array.isArray(m)) m.forEach((mm) => mm.dispose())
      else if (m) (m as THREE.Material).dispose()
    }

    // Off-road ground (sides)
    const groundGeom = new THREE.PlaneGeometry(80, this.trackLen)
    this.groundMat = new THREE.MeshStandardMaterial({
      color: 0x4a7a3d,
      roughness: 0.95,
      metalness: 0.0,
    })
    const ground = new THREE.Mesh(groundGeom, this.groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.position.set(0, -0.01, -this.trackLen / 2 + 7)
    ground.receiveShadow = false
    this.group.add(ground)

    // Road surface
    const roadGeom = new THREE.PlaneGeometry(this.trackWidth, this.trackLen)
    this.roadMat = new THREE.MeshStandardMaterial({
      color: 0x3a3a3a,
      roughness: 0.85,
      metalness: 0.05,
    })
    const road = new THREE.Mesh(roadGeom, this.roadMat)
    road.rotation.x = -Math.PI / 2
    road.position.set(0, 0.0, -this.trackLen / 2 + 7)
    this.group.add(road)

    // Curb strips (thin walls along both road edges)
    const curbGeom = new THREE.BoxGeometry(0.18, 0.18, this.trackLen)
    this.curbMat = new THREE.MeshStandardMaterial({
      color: 0xcfd2d6,
      roughness: 0.7,
    })
    for (const x of [-this.trackWidth / 2 - 0.09, this.trackWidth / 2 + 0.09]) {
      const curb = new THREE.Mesh(curbGeom, this.curbMat)
      curb.position.set(x, 0.09, -this.trackLen / 2 + 7)
      this.group.add(curb)
    }

    // Dashed lane lines between lanes
    this.lineMat = new THREE.MeshBasicMaterial({ color: 0xffeb70 })
    const dashCount = 80
    const dashLen = 0.7
    const dashGap = (this.trackLen - dashCount * dashLen) / dashCount
    for (const x of [-1.5, 1.5]) {
      for (let i = 0; i < dashCount; i++) {
        const z = 7 - i * (dashLen + dashGap) - dashLen / 2
        const line = new THREE.Mesh(
          new THREE.PlaneGeometry(0.12, dashLen),
          this.lineMat,
        )
        line.rotation.x = -Math.PI / 2
        line.position.set(x, 0.005, z)
        this.group.add(line)
        this.dashes.push(line)
      }
    }

    // Start / finish line stripes at very end (visible when far away)
    this.stripeMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), this.stripeMat)
      s.rotation.x = -Math.PI / 2
      s.position.set(-1.5 + (i % 4) * 1.0, 0.005, 6)
      this.group.add(s)
    }
  }

  applyTheme(theme: {
    groundColor: number
    groundAccent: number
    roadColor: number
    roadLineColor: number
    curbColor: number
  }) {
    this.groundMat.color.setHex(theme.groundColor)
    this.roadMat.color.setHex(theme.roadColor)
    this.curbMat.color.setHex(theme.curbColor)
    this.lineMat.color.setHex(theme.roadLineColor)
  }

  /**
   * Scroll lane dashes toward the player and recycle them to the far end when
   * they pass. This makes the road itself appear to move past, giving a strong
   * "running forward" sensation (the static road surface is the main culprit
   * when the world feels like obstacles are coming at you instead).
   */
  update(speed: number, dt: number) {
    if (this.dashes.length === 0) return
    let minZ = Infinity
    for (const d of this.dashes) {
      d.position.z += speed * dt
      if (d.position.z < minZ) minZ = d.position.z
    }
    // Wrap recycled dashes to the back of the line so the spacing stays even
    // and there's no visible gap in the row.
    for (const d of this.dashes) {
      if (d.position.z > this.dashRecycleZ) {
        minZ -= this.dashSpacing
        d.position.z = minZ
      }
    }
  }
}
