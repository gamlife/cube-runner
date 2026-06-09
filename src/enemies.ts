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
}

/**
 * Enemy cars: they drive in lanes, either toward the player (head-on, dangerous)
 * or away from the player (rear view). A car in the player's lane = collision.
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
  private readonly tmpBox = new THREE.Box3()
  private readonly worldSpeedRef: () => number

  constructor(scene: THREE.Scene, worldSpeed: () => number) {
    this.worldSpeedRef = worldSpeed
    for (let i = 0; i < POOL_SIZE; i++) {
      const g = this.makeCar(0xff3a3a)
      g.visible = false
      scene.add(g)
      this.pool.push({ group: g, active: false, lane: 1, speed: 1, scored: false })
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
    for (const e of this.pool) {
      if (!e.active) continue
      this.tmpBox.setFromObject(e.group)
      this.tmpBox.expandByScalar(-0.1)
      out[n++] = this.tmpBox.clone()
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
    slot.lane = lane
    slot.speed = speed
    slot.scored = false
    slot.group.position.set(LANE_X[lane]!, 0.3, SPAWN_Z)
    slot.group.rotation.y = speed > 0 ? 0 : Math.PI
    slot.group.visible = true
    slot.active = true
  }

  private makeCar(color: number): THREE.Object3D {
    const g = new THREE.Group()
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
    // Cabin
    const cabMat = new THREE.MeshStandardMaterial({ color: 0x1a2030, metalness: 0.6, roughness: 0.2 })
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.32, 0.8), cabMat)
    cab.position.set(0, 0.78, -0.1)
    g.add(cab)
    // Wheels (4)
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
    // Headlights
    const headlightMat = new THREE.MeshBasicMaterial({ color: 0xfff4c4 })
    for (const x of [-0.28, 0.28]) {
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), headlightMat)
      hl.position.set(x, 0.45, 0.81)
      g.add(hl)
    }
    // Tail lights
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xff3a3a })
    for (const x of [-0.28, 0.28]) {
      const tl = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), tailMat)
      tl.position.set(x, 0.45, -0.81)
      g.add(tl)
    }
    return g
  }
}
