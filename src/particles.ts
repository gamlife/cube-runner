import * as THREE from 'three'

interface Particle {
  active: boolean
  mesh: THREE.Mesh
  vx: number
  vy: number
  vz: number
  life: number
  maxLife: number
  spin: number
}

/**
 * Lightweight particle system. One shared sphere geometry, per-particle Mesh
 * with a tinted material. Particles are pooled and recycled.
 */
export class Particles {
  private readonly pool: Particle[] = []
  private readonly sharedGeom: THREE.SphereGeometry

  constructor(scene: THREE.Scene) {
    this.sharedGeom = new THREE.SphereGeometry(0.1, 6, 4)
    for (let i = 0; i < 80; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 })
      const mesh = new THREE.Mesh(this.sharedGeom, mat)
      mesh.visible = false
      scene.add(mesh)
      this.pool.push({
        active: false,
        mesh,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0,
        spin: 0,
      })
    }
  }

  /** Dust kicked up at a position (e.g. landing). color in 0xRRGGBB. */
  burst(x: number, y: number, z: number, color: number, count: number, opts?: { speed?: number; life?: number; size?: number; gravity?: number }) {
    const speed = opts?.speed ?? 2.4
    const life = opts?.life ?? 0.6
    const size = opts?.size ?? 0.1
    const gravity = opts?.gravity ?? -6
    let spawned = 0
    for (const p of this.pool) {
      if (spawned >= count) break
      if (p.active) continue
      p.active = true
      p.mesh.visible = true
      p.mesh.position.set(x, y, z)
      const ang = Math.random() * Math.PI * 2
      const radial = Math.random() * speed
      p.vx = Math.cos(ang) * radial
      p.vy = Math.random() * speed * 0.6 + speed * 0.2
      p.vz = Math.sin(ang) * radial
      p.life = 0
      p.maxLife = life * (0.7 + Math.random() * 0.5)
      p.spin = 0
      p.mesh.scale.setScalar(size)
      const mat = p.mesh.material as THREE.MeshBasicMaterial
      mat.color.setHex(color)
      mat.opacity = 1
      spawned++
      // Suppress unused-var warning by referencing gravity (kept for API completeness)
      void gravity
    }
  }

  /** Sparkle: small upward fountain of bright particles. */
  sparkle(x: number, y: number, z: number, color: number, count = 12) {
    let spawned = 0
    for (const p of this.pool) {
      if (spawned >= count) break
      if (p.active) continue
      p.active = true
      p.mesh.visible = true
      p.mesh.position.set(x, y, z)
      const ang = Math.random() * Math.PI * 2
      const r = 1.2 + Math.random() * 1.6
      p.vx = Math.cos(ang) * r
      p.vy = 1.8 + Math.random() * 2.4
      p.vz = Math.sin(ang) * r
      p.life = 0
      p.maxLife = 0.5 + Math.random() * 0.3
      p.mesh.scale.setScalar(0.08 + Math.random() * 0.06)
      const mat = p.mesh.material as THREE.MeshBasicMaterial
      mat.color.setHex(color)
      mat.opacity = 1
      spawned++
    }
  }

  /** Hit explosion: red chunks that fly out. */
  explode(x: number, y: number, z: number) {
    this.burst(x, y, z, 0xff4a3a, 24, { speed: 5, life: 0.8, size: 0.14 })
    this.burst(x, y, z, 0xffaa3a, 16, { speed: 3, life: 0.5, size: 0.1 })
  }

  update(dt: number) {
    for (const p of this.pool) {
      if (!p.active) continue
      p.life += dt
      if (p.life >= p.maxLife) {
        p.active = false
        p.mesh.visible = false
        continue
      }
      // physics
      p.vy -= 6 * dt
      p.mesh.position.x += p.vx * dt
      p.mesh.position.y += p.vy * dt
      p.mesh.position.z += p.vz * dt
      // fade
      const t = p.life / p.maxLife
      const mat = p.mesh.material as THREE.MeshBasicMaterial
      mat.opacity = 1 - t
      p.mesh.scale.multiplyScalar(0.985)
    }
  }
}
