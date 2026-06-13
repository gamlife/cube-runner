import * as THREE from 'three'
import { LANE_X } from './player'

const SPAWN_Z = -60
const DESPAWN_Z = 8
const POOL_SIZE = 6

export type PowerKind = 'shield' | 'magnet' | 'boost'

interface PowerEntry {
  group: THREE.Group
  active: boolean
  lane: number
  kind: PowerKind
  phase: number
  scored: boolean
  /**
   * Z position at the start of the previous physics step. Used for swept
   * AABB collision detection — powerups are small (orb ~0.45 radius) and
   * move fast, so end-of-step AABB alone lets them tunnel through the player.
   */
  prevZ: number
}

/**
 * Power-ups floating in lanes. Pickup grants a temporary effect via the
 * `onPickup` callback. Visual: a glowing orb with a symbol on top, slowly
 * bobbing and rotating.
 */
export class Powerups {
  private readonly pool: PowerEntry[] = []
  private cooldown = 6
  private readonly onPickup: (kind: PowerKind, x: number, y: number, z: number) => void
  private readonly tmpBox = new THREE.Box3()

  constructor(
    scene: THREE.Scene,
    onPickup: (kind: PowerKind, x: number, y: number, z: number) => void,
  ) {
    this.onPickup = onPickup
    for (let i = 0; i < POOL_SIZE; i++) {
      const g = this.makeOrb('shield')
      g.visible = false
      scene.add(g)
      this.pool.push({ group: g, active: false, lane: 1, kind: 'shield', phase: 0, scored: false, prevZ: 0 })
    }
  }

  reset() {
    for (const e of this.pool) {
      e.active = false
      e.group.visible = false
      e.scored = false
    }
    this.cooldown = 6
  }

  update(dt: number, speed: number) {
    for (const e of this.pool) {
      if (!e.active) continue
      // Snapshot current Z before moving for swept AABB (same fix as
      // obstacles/pickups tunneling). Powerups are small (~0.45 orb radius)
      // and move at world speed, so at max speed they can tunnel through the
      // player's hitbox in one physics step.
      e.prevZ = e.group.position.z
      e.group.position.z += speed * dt
      e.phase += dt
      e.group.position.y = 1.1 + Math.sin(e.phase * 3) * 0.15
      e.group.rotation.y += dt * 1.5
      if (e.group.position.z > DESPAWN_Z) {
        e.active = false
        e.group.visible = false
      }
    }
    this.cooldown -= dt
    if (this.cooldown <= 0) {
      this.spawn()
      this.cooldown = 8 + Math.random() * 6
    }
  }

  checkCollection(playerBox: THREE.Box3) {
    for (const e of this.pool) {
      if (!e.active || e.scored) continue
      this.tmpBox.setFromObject(e.group)
      // Swept AABB: powerups are small orbs (~0.45 radius) and move at world
      // speed. At max speed (28 units/s) with fixedDt (1/60), they move
      // 0.467 per step — comparable to their size. Expanding the box in Z
      // to cover [prevZ, currentZ] prevents tunneling.
      const halfThick = (this.tmpBox.max.z - this.tmpBox.min.z) / 2
      const curZ = e.group.position.z
      this.tmpBox.min.z = Math.min(this.tmpBox.min.z, e.prevZ - halfThick)
      this.tmpBox.max.z = Math.max(this.tmpBox.max.z, curZ + halfThick)
      this.tmpBox.expandByScalar(-0.15)
      if (playerBox.intersectsBox(this.tmpBox)) {
        e.scored = true
        e.active = false
        e.group.visible = false
        this.onPickup(e.kind, e.group.position.x, e.group.position.y, e.group.position.z)
      }
    }
  }

  private spawn() {
    const slot = this.pool.find((e) => !e.active)
    if (!slot) return
    const r = Math.random()
    slot.kind = r < 0.45 ? 'shield' : r < 0.8 ? 'magnet' : 'boost'
    // Rebuild the orb with the right kind
    while (slot.group.children.length) {
      const c = slot.group.children[0] as THREE.Object3D
      slot.group.remove(c)
      c.traverse((o) => {
        const m = (o as THREE.Mesh).material
        if (Array.isArray(m)) m.forEach((mm) => mm.dispose())
        else if (m) (m as THREE.Material).dispose()
      })
    }
    this.populateOrb(slot.group, slot.kind)
    const lane = Math.floor(Math.random() * 3)
    slot.lane = lane
    slot.scored = false
    slot.group.position.set(LANE_X[lane]!, 1.1, SPAWN_Z)
    slot.group.visible = true
    slot.active = true
  }

  private makeOrb(kind: PowerKind): THREE.Group {
    const g = new THREE.Group()
    this.populateOrb(g, kind)
    return g
  }

  private populateOrb(g: THREE.Group, kind: PowerKind) {
    const colors: Record<PowerKind, number> = {
      shield: 0x4cc9f0,
      magnet: 0xff4ad8,
      boost: 0xffd24a,
    }
    const color = colors[kind]
    // Outer shell
    const shellMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.4,
      roughness: 0.15,
      emissive: color,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.6,
    })
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), shellMat)
    g.add(shell)
    // Inner core
    const coreMat = new THREE.MeshBasicMaterial({ color })
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), coreMat)
    g.add(core)
    // Symbol on top
    if (kind === 'shield') {
      // Shield: 2 triangles
      const symMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
      const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.06), symMat)
      t1.position.set(-0.1, 0, 0.32)
      t1.rotation.z = Math.PI / 6
      g.add(t1)
      const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.06), symMat)
      t2.position.set(0.1, 0, 0.32)
      t2.rotation.z = -Math.PI / 6
      g.add(t2)
    } else if (kind === 'magnet') {
      // Magnet: U-shape with red+blue legs
      const mat1 = new THREE.MeshBasicMaterial({ color: 0xff3a3a })
      const mat2 = new THREE.MeshBasicMaterial({ color: 0x3a6aff })
      const left = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), mat1)
      left.position.set(-0.13, -0.05, 0.3)
      g.add(left)
      const right = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), mat2)
      right.position.set(0.13, -0.05, 0.3)
      g.add(right)
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: 0xffffff }))
      top.position.set(0, 0.05, 0.3)
      g.add(top)
    } else {
      // Boost: lightning bolt
      const symMat = new THREE.MeshBasicMaterial({ color: 0xfff4c4 })
      const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.05), symMat)
      bolt.position.set(0, 0, 0.32)
      bolt.rotation.z = Math.PI / 8
      g.add(bolt)
      const bolt2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.05), symMat)
      bolt2.position.set(0.04, -0.18, 0.32)
      bolt2.rotation.z = -Math.PI / 4
      g.add(bolt2)
    }
  }
}
