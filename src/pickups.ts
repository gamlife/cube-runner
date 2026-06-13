import * as THREE from 'three'
import { LANE_X } from './player'

const SPAWN_Z = -60
const DESPAWN_Z = 8
const POOL_SIZE = 24

interface CoinEntry {
  mesh: THREE.Mesh
  active: boolean
  lane: number
  scored: boolean
  spinSpeed: number
  phase: number
  /**
   * Z position at the start of the previous physics step. Used for swept
   * AABB collision detection — coins are small (0.08 thick) and move fast,
   * so end-of-step AABB alone lets them tunnel through the player.
   */
  prevZ: number
}

/**
 * Coin pickups. They spin in place, move toward the player with the world,
 * and are collected when the player's AABB overlaps one.
 */
export class Pickups {
  private readonly pool: CoinEntry[] = []
  private cooldown = 0
  private readonly geom: THREE.CylinderGeometry
  private baseColor = 0xffd24a
  private readonly hitBoxes: THREE.Box3[] = []
  // pending pickups to consume (positions for sparkle)
  private readonly onCollect: (x: number, y: number, z: number) => void

  constructor(
    scene: THREE.Scene,
    onCollect: (x: number, y: number, z: number) => void,
  ) {
    this.onCollect = onCollect
    // Coin: thin cylinder, rotated so the flat face shows forward
    this.geom = new THREE.CylinderGeometry(0.32, 0.32, 0.08, 18)
    for (let i = 0; i < POOL_SIZE; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: this.baseColor,
        metalness: 0.95,
        roughness: 0.15,
        emissive: this.baseColor,
        emissiveIntensity: 0.35,
      })
      const mesh = new THREE.Mesh(this.geom, mat)
      mesh.rotation.z = Math.PI / 2 // flat face toward camera
      mesh.visible = false
      scene.add(mesh)
      this.pool.push({
        mesh,
        active: false,
        lane: 1,
        scored: false,
        spinSpeed: 2 + Math.random() * 2,
        phase: Math.random() * Math.PI * 2,
        prevZ: 0,
      })
    }
    this.cooldown = 0.5
  }

  setColor(color: number) {
    this.baseColor = color
    for (const e of this.pool) {
      const m = e.mesh.material as THREE.MeshStandardMaterial
      m.color.setHex(color)
      m.emissive.setHex(color)
    }
  }

  reset() {
    for (const e of this.pool) {
      e.active = false
      e.mesh.visible = false
      e.scored = false
    }
    this.cooldown = 0.5
  }

  update(dt: number, speed: number) {
    for (const e of this.pool) {
      if (!e.active) continue
      // Snapshot current Z before moving for swept AABB (same fix as
      // obstacles tunneling). Coins are thin (0.08) and move at world speed,
      // so at max speed they can tunnel through the player's hitbox in one
      // physics step.
      e.prevZ = e.mesh.position.z
      e.mesh.position.z += speed * dt
      e.mesh.rotation.y += e.spinSpeed * dt
      // bob
      e.phase += dt * 3
      e.mesh.position.y = 1.0 + Math.sin(e.phase) * 0.1
      if (e.mesh.position.z > DESPAWN_Z) {
        e.active = false
        e.mesh.visible = false
      }
    }
    this.cooldown -= dt
    if (this.cooldown <= 0) {
      this.spawnGroup()
      this.cooldown = 0.9 + Math.random() * 1.4
    }
  }

  /** Pull active coins toward a target point (magnet effect). */
  applyMagnet(tx: number, ty: number, tz: number, range: number, dt: number) {
    for (const e of this.pool) {
      if (!e.active || e.scored) continue
      const p = e.mesh.position
      const dx = tx - p.x
      const dy = ty - p.y
      const dz = tz - p.z
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (d < range && d > 0.1) {
        const f = 12 * dt * (1 - d / range) // stronger the closer
        p.x += (dx / d) * f
        p.y += (dy / d) * f
        p.z += (dz / d) * f
      }
    }
  }

  /** Returns the number of coins collected this call. */
  checkCollection(playerBox: THREE.Box3): number {
    let collected = 0
    // Reuse a single scratch Box3 across all coins in this call. The
    // intersection test reads the box's min/max values synchronously, so
    // it's safe to overwrite the same Box3 for every coin in the loop.
    // The previous code did `new THREE.Box3()` per active coin — with
    // magnet + a full pool that was 24 allocations per frame.
    const scratch = this.hitBoxes[0] ?? (this.hitBoxes[0] = new THREE.Box3())
    for (const e of this.pool) {
      if (!e.active || e.scored) continue
      const m = e.mesh
      scratch.setFromObject(m)
      // Swept AABB: coins are thin (0.08 thickness) and move at world speed.
      // At max speed (28 units/s) with fixedDt (1/60), a coin moves 0.467 per
      // step — larger than its own thickness. Expanding the box in Z to cover
      // [prevZ, currentZ] prevents tunneling. We also reduced the expandByScalar
      // from -0.1 to -0.05 to make the hitbox slightly more forgiving (coins
      // are small and players expect to collect them when "close enough").
      const halfThick = (scratch.max.z - scratch.min.z) / 2
      const curZ = m.position.z
      scratch.min.z = Math.min(scratch.min.z, e.prevZ - halfThick)
      scratch.max.z = Math.max(scratch.max.z, curZ + halfThick)
      scratch.expandByScalar(-0.05)
      if (playerBox.intersectsBox(scratch)) {
        e.scored = true
        e.active = false
        e.mesh.visible = false
        this.onCollect(m.position.x, m.position.y, m.position.z)
        collected++
      }
    }
    return collected
  }

  /** Spawn a small line of 3-5 coins in one lane. */
  private spawnGroup() {
    const lane = Math.floor(Math.random() * 3)
    const count = 3 + Math.floor(Math.random() * 3)
    for (let i = 0; i < count; i++) this.spawnOne(lane, i)
  }

  private spawnOne(lane: number, idx: number) {
    const slot = this.pool.find((e) => !e.active)
    if (!slot) return
    slot.lane = lane
    slot.scored = false
    slot.mesh.position.set(LANE_X[lane]!, 1.0, SPAWN_Z - idx * 1.4)
    slot.mesh.visible = true
    slot.active = true
  }
}
