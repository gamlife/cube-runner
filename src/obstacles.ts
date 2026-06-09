import * as THREE from 'three'
import { LANE_X } from './player'

const POOL_SIZE = 18
const SPAWN_Z = -60
const DESPAWN_Z = 8

export type ObstacleKind = 'cone' | 'barrier' | 'crate' | 'hedge' | 'sign' | 'pillar'

interface PoolEntry {
  group: THREE.Object3D
  active: boolean
  lane: number
  width: 1 | 2
  height: number
  kind: ObstacleKind
  scored: boolean
  /** Tilt wobble for crates / cones */
  wobblePhase?: number
  /** Sign pole rotation speed */
  poleSpin?: number
}

/**
 * Obstacles: 6 distinct kinds. Each has a different visual + collision profile.
 *  - cone:      tall narrow, must jump
 *  - barrier:   wide+low, must change lane
 *  - crate:     medium, must jump
 *  - hedge:     wide+medium, must change lane
 *  - sign:      tall, must jump
 *  - pillar:    very tall, must jump
 */
export class Obstacles {
  private readonly pool: PoolEntry[] = []
  private spawnCooldown = 0
  private timeSinceStart = 0
  private readonly laneLastSpawn: number[] = [0, 0, 0]
  private readonly baseSpawnInterval = 0.95
  private readonly minSpawnInterval = 0.4
  private baseSpeed = 12
  private maxSpeed = 28
  private speed = this.baseSpeed
  private lastLaneSpawned = -1
  private palette: number[] = [0xff6a3d, 0x8b5a2b, 0xc84a4a, 0xd9a73d, 0x4a4a8b]
  private readonly box = new THREE.Box3()

  // Shared geometries (re-used across obstacles of the same kind)
  private readonly coneGeom: THREE.ConeGeometry
  private readonly coneStripeGeom: THREE.CylinderGeometry
  private readonly barrierGeom: THREE.BoxGeometry
  private readonly crateGeom: THREE.BoxGeometry
  private readonly crateStripGeom: THREE.BoxGeometry
  private readonly hedgeGeom: THREE.BoxGeometry
  private readonly signPanelGeom: THREE.BoxGeometry
  private readonly signPoleGeom: THREE.CylinderGeometry
  private readonly pillarGeom: THREE.BoxGeometry

  // Material factory: each obstacle gets its own material instance so colors
  // can vary per-spawn. We avoid creating new materials per frame.
  private readonly matCache: Map<string, THREE.MeshStandardMaterial> = new Map()

  constructor(scene: THREE.Scene) {
    this.coneGeom = new THREE.ConeGeometry(0.35, 1.2, 14)
    this.coneStripeGeom = new THREE.CylinderGeometry(0.36, 0.36, 0.1, 14)
    this.barrierGeom = new THREE.BoxGeometry(1.8, 0.7, 0.4)
    this.crateGeom = new THREE.BoxGeometry(0.95, 0.95, 0.95)
    this.crateStripGeom = new THREE.BoxGeometry(0.05, 0.95, 0.05)
    this.hedgeGeom = new THREE.BoxGeometry(1.6, 0.9, 0.5)
    this.signPanelGeom = new THREE.BoxGeometry(0.85, 0.85, 0.1)
    this.signPoleGeom = new THREE.CylinderGeometry(0.06, 0.06, 1.8, 6)
    this.pillarGeom = new THREE.BoxGeometry(0.7, 1.6, 0.7)

    // Initialize the pool with empty placeholders
    for (let i = 0; i < POOL_SIZE; i++) {
      const g = new THREE.Group()
      g.visible = false
      scene.add(g)
      this.pool.push({
        group: g,
        active: false,
        lane: 1,
        width: 1,
        height: 1,
        kind: 'cone',
        scored: false,
      })
    }
  }

  setProgress(progress: number) {
    const t = Math.max(0, Math.min(1, progress))
    this.speed = this.baseSpeed + (this.maxSpeed - this.baseSpeed) * t
  }

  getSpeed(): number {
    return this.speed
  }

  setPalette(palette: number[]) {
    this.palette = palette
  }

  reset() {
    for (const e of this.pool) {
      e.active = false
      e.group.visible = false
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
    for (const e of this.pool) {
      if (!e.active) continue
      e.group.position.z += this.speed * dt
      // wobble / spin
      if (e.kind === 'cone' || e.kind === 'crate') {
        const ph = e.wobblePhase ?? 0
        e.wobblePhase = ph + dt * 1.2
        e.group.rotation.z = Math.sin(ph) * 0.06
      } else if (e.kind === 'sign') {
        const sp = e.poleSpin ?? 0
        e.poleSpin = sp + dt * 0.4
        e.group.rotation.y = sp
      }
      if (!e.scored && e.group.position.z > 1.5) {
        e.scored = true
        onPassPlayer(e.lane)
      }
      if (e.group.position.z > DESPAWN_Z) {
        e.active = false
        e.group.visible = false
      }
    }
    this.spawnCooldown -= dt
    if (this.spawnCooldown <= 0) {
      this.trySpawn()
      const ramp = Math.min(1, this.timeSinceStart / 60)
      this.spawnCooldown =
        this.baseSpawnInterval +
        (this.minSpawnInterval - this.baseSpawnInterval) * ramp
    }
  }

  checkCollision(playerBox: THREE.Box3): boolean {
    for (const e of this.pool) {
      if (!e.active) continue
      this.box.setFromObject(e.group)
      this.box.expandByScalar(-0.1)
      if (playerBox.intersectsBox(this.box)) return true
    }
    return false
  }

  /** Trigger a hit effect: turn obstacle red briefly (visual feedback). */
  flashHit(kind: ObstacleKind, x: number, _y: number, z: number) {
    // Reuse first active pool entry near the position for a flash.
    let best: PoolEntry | null = null
    let bestD = Infinity
    for (const e of this.pool) {
      if (!e.active || e.kind !== kind) continue
      const d = (e.group.position.x - x) ** 2 + (e.group.position.z - z) ** 2
      if (d < bestD) {
        bestD = d
        best = e
      }
    }
    if (!best) return
    best.group.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
      if (m && m.emissive) {
        m.emissive = new THREE.Color(0xff2030)
        m.emissiveIntensity = 1
      }
    })
  }

  private trySpawn() {
    // Pick a lane
    const candidates: number[] = []
    for (let i = 0; i < 3; i++) if (i !== this.lastLaneSpawned) candidates.push(i)
    if (candidates.length === 0) candidates.push(0, 1, 2)
    candidates.sort((a, b) => this.laneLastSpawn[a]! - this.laneLastSpawn[b]!)
    const lane = candidates[0]!

    // Pick a kind (weighted)
    const r = Math.random()
    let kind: ObstacleKind
    if (r < 0.22) kind = 'cone'
    else if (r < 0.42) kind = 'crate'
    else if (r < 0.55) kind = 'barrier'
    else if (r < 0.72) kind = 'hedge'
    else if (r < 0.88) kind = 'sign'
    else kind = 'pillar'

    // Width: barrier & hedge are always wide; others 1 lane mostly
    const width: 1 | 2 = kind === 'barrier' || kind === 'hedge' ? 2 : Math.random() < 0.18 ? 2 : 1

    this.spawnOne(lane, kind, width)
    this.lastLaneSpawned = lane
    this.laneLastSpawn[lane] = this.timeSinceStart
  }

  private spawnOne(lane: number, kind: ObstacleKind, width: 1 | 2) {
    const slot = this.pool.find((e) => !e.active)
    if (!slot) return
    slot.kind = kind
    slot.lane = lane
    slot.width = width
    slot.scored = false
    slot.active = true
    slot.wobblePhase = Math.random() * Math.PI * 2
    slot.poleSpin = 0
    slot.group.rotation.set(0, 0, 0)
    // Clear children
    while (slot.group.children.length) {
      const c = slot.group.children[0] as THREE.Object3D
      slot.group.remove(c)
    }
    const color = this.palette[Math.floor(Math.random() * this.palette.length)]!
    const xCenter = LANE_X[lane]! + (width === 2 ? (Math.random() < 0.5 ? -0.75 : 0.75) : 0)
    slot.group.position.set(xCenter, 0, SPAWN_Z)

    if (kind === 'cone') {
      this.buildCone(slot.group, color)
      slot.height = 1
    } else if (kind === 'barrier') {
      this.buildBarrier(slot.group, color)
      slot.height = 0.7
    } else if (kind === 'crate') {
      this.buildCrate(slot.group, color)
      slot.height = 0.95
    } else if (kind === 'hedge') {
      this.buildHedge(slot.group, color)
      slot.height = 0.9
    } else if (kind === 'sign') {
      this.buildSign(slot.group, color)
      slot.height = 1.6
    } else {
      this.buildPillar(slot.group, color)
      slot.height = 1.6
    }
    slot.group.visible = true
  }

  // ----- Builders -----
  private mat(key: string, color: number, opts: { metalness?: number; roughness?: number; emissive?: number; emissiveIntensity?: number } = {}): THREE.MeshStandardMaterial {
    const cacheKey = `${key}-${color}-${opts.metalness ?? 0.1}-${opts.roughness ?? 0.6}-${opts.emissive ?? 0}-${opts.emissiveIntensity ?? 0}`
    const cached = this.matCache.get(cacheKey)
    if (cached) return cached
    const m = new THREE.MeshStandardMaterial({
      color,
      metalness: opts.metalness ?? 0.1,
      roughness: opts.roughness ?? 0.6,
      emissive: opts.emissive ? new THREE.Color(opts.emissive) : new THREE.Color(0x000000),
      emissiveIntensity: opts.emissiveIntensity ?? 0,
    })
    this.matCache.set(cacheKey, m)
    return m
  }

  private buildCone(g: THREE.Object3D, color: number) {
    const mat = this.mat('cone', color, { roughness: 0.45 })
    const cone = new THREE.Mesh(this.coneGeom, mat)
    cone.position.y = 0.6
    g.add(cone)
    // White reflective stripes
    const stripeMat = this.mat('cone-stripe', 0xffffff, { roughness: 0.3 })
    for (const y of [0.3, 0.7, 1.1]) {
      const stripe = new THREE.Mesh(this.coneStripeGeom, stripeMat)
      stripe.position.y = y
      stripe.scale.set(1, 1, 1)
      g.add(stripe)
    }
    // Base
    const baseMat = this.mat('cone-base', 0x222222, { roughness: 0.8 })
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.7), baseMat)
    base.position.y = 0.025
    g.add(base)
  }

  private buildBarrier(g: THREE.Object3D, color: number) {
    // Red/white striped barrier with feet
    const mat = this.mat('barrier', color, { roughness: 0.5 })
    const stripeMat = this.mat('barrier-stripe', 0xffffff, { roughness: 0.4 })
    const m = new THREE.Mesh(this.barrierGeom, mat)
    m.position.y = 0.4
    g.add(m)
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.72, 0.42),
        i % 2 === 0 ? mat : stripeMat,
      )
      s.position.set(-0.7 + i * 0.35, 0.4, 0.001)
      g.add(s)
    }
    // Feet
    const footMat = this.mat('barrier-foot', 0x222222, { roughness: 0.8 })
    for (const x of [-0.7, 0.7]) {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.5), footMat)
      foot.position.set(x, 0.05, 0)
      g.add(foot)
    }
  }

  private buildCrate(g: THREE.Object3D, color: number) {
    const mat = this.mat('crate', color, { roughness: 0.85 })
    const crate = new THREE.Mesh(this.crateGeom, mat)
    crate.position.y = 0.5
    g.add(crate)
    // X braces on each face
    const braceMat = this.mat('crate-brace', 0x4a2a10, { roughness: 0.9 })
    const s1 = new THREE.Mesh(this.crateStripGeom, braceMat)
    s1.position.set(0, 0.5, 0.48)
    s1.rotation.z = Math.PI / 4
    g.add(s1)
    const s2 = new THREE.Mesh(this.crateStripGeom, braceMat)
    s2.position.set(0, 0.5, 0.48)
    s2.rotation.z = -Math.PI / 4
    g.add(s2)
    // edges
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(this.crateGeom),
      new THREE.LineBasicMaterial({ color: 0x000000 }),
    )
    edges.position.y = 0.5
    g.add(edges)
  }

  private buildHedge(g: THREE.Object3D, color: number) {
    const mat = this.mat('hedge', color, { roughness: 0.85 })
    const hedge = new THREE.Mesh(this.hedgeGeom, mat)
    hedge.position.y = 0.45
    g.add(hedge)
    // Bumpy leaves (small spheres)
    const leafMat = this.mat('hedge-leaf', new THREE.Color(color).multiplyScalar(1.15).getHex(), { roughness: 0.8 })
    for (let i = 0; i < 16; i++) {
      const r = 0.12 + Math.random() * 0.08
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 4), leafMat)
      const lx = (Math.random() - 0.5) * 1.5
      const ly = 0.4 + (Math.random() - 0.3) * 0.4
      const lz = (Math.random() - 0.5) * 0.4
      m.position.set(lx, ly, lz)
      g.add(m)
    }
    // Top trim
    const trimMat = this.mat('hedge-top', 0x6a4a2a, { roughness: 0.9 })
    const trim = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.5), trimMat)
    trim.position.set(0, 0.05, 0)
    g.add(trim)
  }

  private buildSign(g: THREE.Object3D, color: number) {
    // Pole
    const poleMat = this.mat('sign-pole', 0x555555, { metalness: 0.6, roughness: 0.4 })
    const pole = new THREE.Mesh(this.signPoleGeom, poleMat)
    pole.position.y = 0.9
    g.add(pole)
    // Panel
    const panelMat = this.mat('sign-panel', color, { roughness: 0.4, emissive: color, emissiveIntensity: 0.2 })
    const panel = new THREE.Mesh(this.signPanelGeom, panelMat)
    panel.position.set(0, 1.7, 0)
    g.add(panel)
    // X symbol on panel (procedural: 2 thin boxes)
    const xMat = this.mat('sign-x', 0x111111, { roughness: 0.7 })
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.07, 0.02), xMat)
    a.position.set(0, 1.7, 0.06)
    a.rotation.z = Math.PI / 4
    g.add(a)
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.07, 0.02), xMat)
    b.position.set(0, 1.7, 0.06)
    b.rotation.z = -Math.PI / 4
    g.add(b)
  }

  private buildPillar(g: THREE.Object3D, color: number) {
    const mat = this.mat('pillar', color, { roughness: 0.3, metalness: 0.3, emissive: color, emissiveIntensity: 0.4 })
    const pillar = new THREE.Mesh(this.pillarGeom, mat)
    pillar.position.y = 0.8
    g.add(pillar)
    // Top cap
    const capMat = this.mat('pillar-cap', 0x111111, { metalness: 0.5, roughness: 0.4 })
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.1, 0.85), capMat)
    cap.position.y = 1.65
    g.add(cap)
  }
}
