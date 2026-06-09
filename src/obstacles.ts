import * as THREE from 'three'
import { LANE_X } from './player'

const POOL_SIZE = 12
const SPAWN_Z = -60
const DESPAWN_Z = 8
const PALETTE = [0xf72585, 0xb5179e, 0x7209b7, 0xf77f00, 0xfcbf49]

interface PoolEntry {
  mesh: THREE.Mesh
  active: boolean
  lane: number
  width: 1 | 2
  height: number
  scored: boolean
  lastSpawnAt: { [lane: number]: number } // unused per-entry, kept for clarity
}

export class Obstacles {
  private readonly pool: PoolEntry[] = []
  private spawnCooldown = 0
  private timeSinceStart = 0
  private readonly laneLastSpawn: number[] = [0, 0, 0]
  private readonly baseSpawnInterval = 0.9
  private readonly minSpawnInterval = 0.35
  private readonly baseSpeed = 12
  private readonly maxSpeed = 28
  private speed: number = this.baseSpeed
  private lastLaneSpawned = -1
  // shared geometry pool keyed by signature to avoid duplicate GPU buffers
  private readonly geomCache: Map<string, THREE.BoxGeometry> = new Map()
  private readonly box = new THREE.Box3()

  constructor(private readonly scene: THREE.Scene) {
    for (let i = 0; i < POOL_SIZE; i++) {
      // placeholder geometry; real one assigned on spawn
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0.1,
        roughness: 0.6,
      })
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat)
      mesh.visible = false
      this.scene.add(mesh)
      this.pool.push({
        mesh,
        active: false,
        lane: 1,
        width: 1,
        height: 1,
        scored: false,
        lastSpawnAt: {},
      })
    }
  }

  /** Update speed externally (game passes a value 0..1 to interpolate base→max). */
  setProgress(progress: number) {
    const t = Math.max(0, Math.min(1, progress))
    this.speed = this.baseSpeed + (this.maxSpeed - this.baseSpeed) * t
  }

  getSpeed(): number {
    return this.speed
  }

  reset() {
    for (const e of this.pool) {
      e.active = false
      e.mesh.visible = false
      e.scored = false
    }
    this.spawnCooldown = 0
    this.timeSinceStart = 0
    this.laneLastSpawn[0] = 0
    this.laneLastSpawn[1] = 0
    this.laneLastSpawn[2] = 0
    this.lastLaneSpawned = -1
    this.speed = this.baseSpeed
  }

  update(dt: number, onPassPlayer: (lane: number) => void) {
    this.timeSinceStart += dt

    // Move + recycle
    for (const e of this.pool) {
      if (!e.active) continue
      e.mesh.position.z += this.speed * dt

      // Player passed the obstacle -> award dodge
      if (!e.scored && e.mesh.position.z > 1.5) {
        e.scored = true
        onPassPlayer(e.lane)
      }

      if (e.mesh.position.z > DESPAWN_Z) {
        e.active = false
        e.mesh.visible = false
      }
    }

    // Spawn
    this.spawnCooldown -= dt
    if (this.spawnCooldown <= 0) {
      this.trySpawn()
      // interval ramps from 0.9s -> 0.35s over 60s
      const ramp = Math.min(1, this.timeSinceStart / 60)
      this.spawnCooldown =
        this.baseSpawnInterval +
        (this.minSpawnInterval - this.baseSpawnInterval) * ramp
    }
  }

  private trySpawn() {
    // Pick a lane: avoid the just-spawned lane, and prefer lanes whose cooldown > 1 spawn
    const candidates: number[] = []
    for (let i = 0; i < 3; i++) {
      if (i === this.lastLaneSpawned) continue
      candidates.push(i)
    }
    if (candidates.length === 0) {
      // All lanes are last-lane-spawned? shouldn't happen, fall back to random
      candidates.push(0, 1, 2)
    }
    // Among candidates, those with longer cool-down are preferred
    candidates.sort((a, b) => this.laneLastSpawn[a] - this.laneLastSpawn[b])
    const lane = candidates[0] as number

    // 20% chance to spawn a 2-wide obstacle (blocks adjacent lane too)
    const width: 1 | 2 = Math.random() < 0.2 ? 2 : 1

    // If width 2, occupy this lane + adjacent; we still record the "primary" lane
    // for scoring. Skip if width 2 would block ALL lanes (avoid in 3-lane layout: it
    // only blocks 2 of 3, so always safe).
    this.spawnOne(lane, width)
    this.lastLaneSpawned = lane
    this.laneLastSpawn[lane] = this.timeSinceStart
  }

  private spawnOne(lane: number, width: 1 | 2) {
    const entry = this.pool.find((e) => !e.active)
    if (!entry) return // pool exhausted, skip

    // 70% normal height (1), 30% tall (1.5) - must jump
    const height = Math.random() < 0.7 ? 1 : 1.5
    const xCenter = LANE_X[lane] as number
    const w = width === 2 ? 1.8 : 0.9
    const h = height
    const d = 0.9

    const geomKey = `${w}x${h}x${d}`
    let geom = this.geomCache.get(geomKey)
    if (!geom) {
      geom = new THREE.BoxGeometry(w, h, d)
      this.geomCache.set(geomKey, geom)
    }
    entry.mesh.geometry = geom
    entry.mesh.position.set(xCenter, h / 2, SPAWN_Z)

    const color = PALETTE[Math.floor(Math.random() * PALETTE.length)] as number
    const mat = entry.mesh.material as THREE.MeshStandardMaterial
    mat.color.setHex(color)
    mat.emissive = new THREE.Color(color).multiplyScalar(0.15)

    entry.mesh.rotation.y = Math.random() * Math.PI
    entry.active = true
    entry.lane = lane
    entry.width = width
    entry.height = height
    entry.scored = false
    entry.mesh.visible = true
  }

  /** Check collisions: returns the obstacle the player is hitting, or null. */
  checkCollision(playerBox: THREE.Box3): boolean {
    for (const e of this.pool) {
      if (!e.active) continue
      e.mesh.geometry.computeBoundingBox()
      this.box.setFromObject(e.mesh)
      // shrink a bit for forgiveness
      this.box.expandByScalar(-0.08)
      if (playerBox.intersectsBox(this.box)) {
        return true
      }
    }
    return false
  }
}
