import * as THREE from 'three'
import { LANE_X } from './player'

const SPAWN_Z = -60
const DESPAWN_Z = 8
const POOL_SIZE = 8

interface CarEntry {
  group: THREE.Object3D
  active: boolean
  lane: number
  speed: number // -1 = drives toward player, +1 = away
  scored: boolean
  kind: 'car' | 'truck' | 'motorcycle'
}

/**
 * Enemy cars: they drive in lanes, either toward the player (head-on, dangerous)
 * or away from the player (rear view). A car in the player's lane = collision.
 * Three kinds for visual variety: car (default), truck (long, slow), motorcycle (slim, fast).
 */
export class Enemies {
  private readonly pool: CarEntry[] = []
  private cooldown = 0
  private timeSinceStart = 0
  private readonly baseInterval = 4.5
  private readonly minInterval = 2.0
  private readonly baseSpeed = 8
  private readonly maxSpeed = 18
  private speed: number = this.baseSpeed
  /**
   * Pre-allocated Box3 pool (one per pool slot). The previous code did
   * `out[n++] = this.tmpBox.clone()` per active enemy per physics step,
   * which allocated up to 8 Box3 objects every frame on top of all the
   * other per-frame work. With these we write into a fixed array slot
   * and the consumer reads from the same slot on the same frame — no
   * allocations, no GC pressure.
   */
  private readonly tmpBoxes: THREE.Box3[] = []
  private readonly worldSpeedRef: () => number

  constructor(scene: THREE.Scene, worldSpeed: () => number) {
    this.worldSpeedRef = worldSpeed
    for (let i = 0; i < POOL_SIZE; i++) {
      this.tmpBoxes.push(new THREE.Box3())
      const g = this.makeCar('car', 0xff3a3a)
      g.visible = false
      scene.add(g)
      this.pool.push({ group: g, active: false, lane: 1, speed: 1, scored: false, kind: 'car' })
    }
  }

  setProgress(p: number) {
    this.speed = this.baseSpeed + (this.maxSpeed - this.baseSpeed) * p
  }

  reset() {
    for (const e of this.pool) {
      e.active = false
      e.group.visible = false
      e.scored = false
    }
    this.cooldown = 1.0
    this.timeSinceStart = 0
    this.speed = this.baseSpeed
  }

  update(dt: number) {
    this.timeSinceStart += dt
    const worldSpeed = this.worldSpeedRef()
    for (const e of this.pool) {
      if (!e.active) continue
      // Move car: worldSpeed is the speed of the world moving toward the player
      // (positive). Cars driving toward the player (speed = -1) close faster.
      e.group.position.z += (worldSpeed - e.speed * this.speed) * dt
      if (e.group.position.z > DESPAWN_Z) {
        e.active = false
        e.group.visible = false
      }
    }
    this.cooldown -= dt
    if (this.cooldown <= 0) {
      this.spawn()
      const ramp = Math.min(1, this.timeSinceStart / 60)
      this.cooldown =
        this.baseInterval + (this.minInterval - this.baseInterval) * ramp
    }
  }

  /** Returns the bounding box for a car in world space, or null. */
  getActiveBoxes(out: THREE.Box3[]): number {
    let n = 0
    for (let i = 0; i < this.pool.length; i++) {
      const e = this.pool[i]!
      if (!e.active) continue
      // Use a pre-allocated Box3 (one per pool slot). The consumer reads
      // these within the same frame, so writing into a shared slot is
      // safe — the .intersectsBox() check consumes the values before
      // the next write happens.
      this.tmpBoxes[i]!.setFromObject(e.group)
      this.tmpBoxes[i]!.expandByScalar(-0.1)
      out[n++] = this.tmpBoxes[i]!
    }
    return n
  }

  /** Mark a car as passed (for score). */
  checkPassed(playerZ: number) {
    for (const e of this.pool) {
      if (!e.active || e.scored) continue
      if (e.group.position.z > playerZ + 0.5) {
        e.scored = true
      }
    }
  }

  private spawn() {
    const slot = this.pool.find((e) => !e.active)
    if (!slot) return
    const lane = Math.floor(Math.random() * 3)
    // 60% toward the player (dangerous), 40% away
    const speed = Math.random() < 0.6 ? -1 : 1
    // Kind: 60% car, 25% truck, 15% motorcycle
    const r = Math.random()
    const kind: CarEntry['kind'] = r < 0.6 ? 'car' : r < 0.85 ? 'truck' : 'motorcycle'
    const palette = [0xff3a3a, 0xff8a3d, 0x4cc9f0, 0xffd24a, 0x6dd58c, 0xffffff]
    const color = palette[Math.floor(Math.random() * palette.length)]!
    // Rebuild
    while (slot.group.children.length) {
      const c = slot.group.children[0] as THREE.Object3D
      slot.group.remove(c)
      c.traverse((o) => {
        const m = (o as THREE.Mesh).material
        if (Array.isArray(m)) m.forEach((mm) => mm.dispose())
        else if (m) (m as THREE.Material).dispose()
      })
    }
    const built = this.makeCar(kind, color)
    built.children.forEach((c) => slot.group.add(c))
    slot.kind = kind
    slot.lane = lane
    slot.speed = speed
    slot.scored = false
    slot.group.position.set(LANE_X[lane]!, kind === 'motorcycle' ? 0.35 : 0.3, SPAWN_Z)
    slot.group.rotation.y = speed > 0 ? 0 : Math.PI
    slot.group.visible = true
    slot.active = true
  }

  private makeCar(kind: CarEntry['kind'], color: number): THREE.Object3D {
    const g = new THREE.Group()
    if (kind === 'truck') {
      // Truck: cab + trailer
      const cabMat = new THREE.MeshStandardMaterial({
        color,
        metalness: 0.7,
        roughness: 0.25,
        emissive: color,
        emissiveIntensity: 0.05,
      })
      const cab = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.7, 0.9), cabMat)
      cab.position.set(0, 0.55, 0.7)
      g.add(cab)
      const trailerMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.4, roughness: 0.5 })
      const trailer = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.0, 1.6), trailerMat)
      trailer.position.set(0, 0.7, -0.3)
      g.add(trailer)
      // stripe
      const stripeMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3, roughness: 0.5 })
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.1, 1.6), stripeMat)
      stripe.position.set(0, 0.95, -0.3)
      g.add(stripe)
      // Wheels (6)
      const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 })
      const wheelGeom = new THREE.CylinderGeometry(0.18, 0.18, 0.12, 10)
      for (const x of [-0.5, 0.5]) {
        for (const z of [1.05, 0.4, -0.95]) {
          const w = new THREE.Mesh(wheelGeom, wheelMat)
          w.position.set(x, 0.18, z)
          w.rotation.z = Math.PI / 2
          g.add(w)
        }
      }
      // Headlights
      const headlightMat = new THREE.MeshBasicMaterial({ color: 0xfff4c4 })
      for (const x of [-0.28, 0.28]) {
        const hl = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), headlightMat)
        hl.position.set(x, 0.6, 1.16)
        g.add(hl)
      }
    } else if (kind === 'motorcycle') {
      // Motorcycle: slim body, small wheels
      const bodyMat = new THREE.MeshStandardMaterial({
        color,
        metalness: 0.9,
        roughness: 0.2,
        emissive: color,
        emissiveIntensity: 0.1,
      })
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.35, 1.0), bodyMat)
      body.position.y = 0.45
      g.add(body)
      const tankMat = new THREE.MeshStandardMaterial({ color, metalness: 0.9, roughness: 0.2, emissive: color, emissiveIntensity: 0.2 })
      const tank = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), tankMat)
      tank.position.set(0, 0.65, 0.2)
      tank.scale.set(0.8, 0.6, 1.1)
      g.add(tank)
      const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 })
      const wheelGeom = new THREE.CylinderGeometry(0.2, 0.2, 0.15, 12)
      for (const z of [0.5, -0.5]) {
        const w = new THREE.Mesh(wheelGeom, wheelMat)
        w.position.set(0, 0.2, z)
        w.rotation.z = Math.PI / 2
        g.add(w)
      }
      // Headlight
      const headlightMat = new THREE.MeshBasicMaterial({ color: 0xfff4c4 })
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), headlightMat)
      hl.position.set(0, 0.55, 0.55)
      g.add(hl)
    } else {
      // Car (default): body + cabin + 4 wheels + lights
      const bodyMat = new THREE.MeshStandardMaterial({
        color,
        metalness: 0.7,
        roughness: 0.25,
        emissive: color,
        emissiveIntensity: 0.05,
      })
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.5, 1.6), bodyMat)
      body.position.y = 0.4
      g.add(body)
      const cabMat = new THREE.MeshStandardMaterial({ color: 0x1a2030, metalness: 0.6, roughness: 0.2 })
      const cab = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.32, 0.8), cabMat)
      cab.position.set(0, 0.78, -0.1)
      g.add(cab)
      const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 })
      const wheelGeom = new THREE.CylinderGeometry(0.16, 0.16, 0.12, 10)
      const wOff = 0.45
      for (const [x, z] of [
        [wOff, 0.55],
        [-wOff, 0.55],
        [wOff, -0.55],
        [-wOff, -0.55],
      ]) {
        const w = new THREE.Mesh(wheelGeom, wheelMat)
        w.position.set(x, 0.16, z)
        w.rotation.z = Math.PI / 2
        g.add(w)
      }
      const headlightMat = new THREE.MeshBasicMaterial({ color: 0xfff4c4 })
      for (const x of [-0.28, 0.28]) {
        const hl = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), headlightMat)
        hl.position.set(x, 0.45, 0.81)
        g.add(hl)
      }
      const tailMat = new THREE.MeshBasicMaterial({ color: 0xff3a3a })
      for (const x of [-0.28, 0.28]) {
        const tl = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), tailMat)
        tl.position.set(x, 0.45, -0.81)
        g.add(tl)
      }
    }
    return g
  }
}
