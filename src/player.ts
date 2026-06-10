import * as THREE from 'three'

export const LANE_X = [-1.5, 0, 1.5] as const
const PLAYER_GROUND_Y = 0.5
const JUMP_VELOCITY = 10
const GRAVITY = 30
const LANE_LERP = 0.22
const TILT_LERP = 0.18

/**
 * The player: a glowing rounded cube with eyes, a small antenna, and a trail
 * of light. Animations:
 *  - tilt on lane change
 *  - squash on jump (anticipation), stretch at apex, squash on land
 *  - subtle bob in idle
 *  - hit recoil: red flash + spin-out
 */
export class Player {
  readonly group: THREE.Group
  readonly body: THREE.Mesh
  private readonly leftEye: THREE.Mesh
  private readonly rightEye: THREE.Mesh
  private readonly leftPupil: THREE.Mesh
  private readonly rightPupil: THREE.Mesh
  private readonly antenna: THREE.Mesh
  private readonly antennaTip: THREE.Mesh
  private readonly bodyMat: THREE.MeshStandardMaterial
  private readonly trailGroup: THREE.Group
  private trailIndex = 0
  private readonly trailDots: THREE.Mesh[] = []
  /** Shield ring around the player (visible when active). */
  private readonly shieldRing: THREE.Mesh
  private shieldActive = false
  private shieldTimer = 0

  private laneIndex = 1
  private vy = 0
  private tiltTarget = 0
  private tilt = 0
  private jumpSquashT = 0
  private landSquashT = 0
  private spinOut = 0 // 0..1 when hit, decays
  /**
   * When set, the player's X is driven by this value directly (free movement
   * along the road width). Used by the hold-and-drag gesture. `null` falls
   * back to the normal lane-based interpolation.
   */
  private freeX: number | null = null
  /** Public so the game can read whether the player is in the air. */
  onGround = true
  /** Public so the game can clear the hit flash when level transitions. */
  hitFlash = 0
  private timeInState = 0

  constructor() {
    this.group = new THREE.Group()

    // Body (rounded feel via slightly inset box + emissive)
    const bodyGeom = new THREE.BoxGeometry(0.9, 0.9, 0.9, 2, 2, 2)
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: 0x4cc9f0,
      metalness: 0.35,
      roughness: 0.28,
      emissive: 0x0a3a4a,
      emissiveIntensity: 0.65,
    })
    this.body = new THREE.Mesh(bodyGeom, this.bodyMat)
    this.body.castShadow = false
    this.group.add(this.body)

    // Edge wireframe for "glowing cube" look
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(bodyGeom),
      new THREE.LineBasicMaterial({ color: 0x9af0ff, transparent: true, opacity: 0.8 }),
    )
    this.group.add(edges)

    // Eyes
    const eyeGeom = new THREE.SphereGeometry(0.11, 10, 8)
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
    const pupilGeom = new THREE.SphereGeometry(0.055, 8, 6)
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x101018 })
    this.leftEye = new THREE.Mesh(eyeGeom, eyeMat)
    this.rightEye = new THREE.Mesh(eyeGeom, eyeMat)
    this.leftPupil = new THREE.Mesh(pupilGeom, pupilMat)
    this.rightPupil = new THREE.Mesh(pupilGeom, pupilMat)
    this.leftEye.position.set(-0.2, 0.1, 0.46)
    this.rightEye.position.set(0.2, 0.1, 0.46)
    this.leftPupil.position.set(-0.2, 0.1, 0.55)
    this.rightPupil.position.set(0.2, 0.1, 0.55)
    this.group.add(this.leftEye, this.rightEye, this.leftPupil, this.rightPupil)

    // Antenna
    const antennaMat = new THREE.MeshStandardMaterial({ color: 0x1a2030, metalness: 0.7, roughness: 0.3 })
    this.antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 6), antennaMat)
    this.antenna.position.set(0, 0.65, 0)
    this.group.add(this.antenna)
    this.antennaTip = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xfff4c4 }),
    )
    this.antennaTip.position.set(0, 0.88, 0)
    this.group.add(this.antennaTip)

    // Trail: a few fading dots that follow the player
    this.trailGroup = new THREE.Group()
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 6, 4),
        new THREE.MeshBasicMaterial({
          color: 0x9af0ff,
          transparent: true,
          opacity: 0.4 - i * 0.05,
        }),
      )
      m.visible = false
      this.trailGroup.add(m)
      this.trailDots.push(m)
    }
    this.group.add(this.trailGroup)

    // Shield ring (hidden until active)
    const shieldGeom = new THREE.RingGeometry(0.6, 0.7, 24)
    const shieldMat = new THREE.MeshBasicMaterial({
      color: 0x4cc9f0,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    })
    this.shieldRing = new THREE.Mesh(shieldGeom, shieldMat)
    this.shieldRing.visible = false
    this.group.add(this.shieldRing)

    this.group.position.set(LANE_X[this.laneIndex] as number, PLAYER_GROUND_Y, 0)
  }

  moveLeft() {
    if (this.laneIndex > 0) {
      this.laneIndex--
      this.tiltTarget = 0.5
    }
  }

  moveRight() {
    if (this.laneIndex < LANE_X.length - 1) {
      this.laneIndex++
      this.tiltTarget = -0.5
    }
  }

  /**
   * Engage hold-and-drag mode: from now on, the player's X is set directly
   * from `x` (clamped to the lane range) on every update(). The lane index is
   * left in place so that when the drag ends, the player smoothly snaps back
   * to the nearest lane instead of teleporting.
   *
   * Why clamp to the lane range [-LANE_X_max, +LANE_X_max] and not the full
   * road width? Obstacles in the outermost lanes have hitboxes that extend
   * past the lane center (a crate in lane +1.5 reaches out to ~x=1.97 with
   * the collision inset). A player parked at x=±2.0 — the curb — would
   * overlap with those hitboxes and die instantly. Clamping to ±1.5 keeps
   * the drag safe across every obstacle kind.
   */
  setFreeX(x: number) {
    const max = LANE_X[LANE_X.length - 1] as number // 1.5
    const min = LANE_X[0] as number // -1.5
    this.freeX = Math.max(min, Math.min(max, x))
  }

  /** Release hold-and-drag mode and resume lane-based movement. */
  clearFreeX() {
    this.freeX = null
    // Snap the lane index to whichever lane the player is closest to, so the
    // resume animation heads to a meaningful target rather than the old one.
    let bestIdx = 0
    let bestDist = Infinity
    for (let i = 0; i < LANE_X.length; i++) {
      const d = Math.abs((LANE_X[i] as number) - this.group.position.x)
      if (d < bestDist) {
        bestDist = d
        bestIdx = i
      }
    }
    this.laneIndex = bestIdx
  }

  jump() {
    if (this.onGround) {
      this.vy = JUMP_VELOCITY
      this.onGround = false
      this.jumpSquashT = 1
    }
  }

  hit() {
    this.hitFlash = 1
    this.spinOut = 1
  }

  /** Activate shield. While active, hits are absorbed and the player is not killed. */
  activateShield(duration: number) {
    this.shieldActive = true
    this.shieldTimer = duration
    this.shieldRing.visible = true
  }

  /** Consume the shield (return whether it was active). */
  consumeShield(): boolean {
    if (!this.shieldActive) return false
    this.shieldActive = false
    this.shieldTimer = 0
    this.shieldRing.visible = false
    return true
  }

  hasShield(): boolean {
    return this.shieldActive
  }

  getShieldTime(): number {
    return this.shieldTimer
  }

  reset() {
    this.laneIndex = 1
    this.vy = 0
    this.onGround = true
    this.hitFlash = 0
    this.tiltTarget = 0
    this.tilt = 0
    this.jumpSquashT = 0
    this.landSquashT = 0
    this.spinOut = 0
    this.freeX = null
    this.group.position.set(LANE_X[this.laneIndex] as number, PLAYER_GROUND_Y, 0)
    this.group.rotation.set(0, 0, 0)
    this.group.scale.set(1, 1, 1)
    this.bodyMat.color.setHex(0x4cc9f0)
    this.bodyMat.emissive.setHex(0x0a3a4a)
    for (const d of this.trailDots) d.visible = false
  }

  update(dt: number) {
    this.timeInState += dt

    // X position: free-drag (driven by finger) overrides the lane lerp.
    // Otherwise we ease toward the current lane's center.
    const targetX = LANE_X[this.laneIndex] as number
    if (this.freeX !== null) {
      this.group.position.x = this.freeX
    } else {
      this.group.position.x += (targetX - this.group.position.x) * LANE_LERP
    }

    // Tilt decay
    this.tilt += (this.tiltTarget - this.tilt) * TILT_LERP
    this.tiltTarget *= 0.85
    this.group.rotation.z = this.tilt

    // Jump physics
    if (!this.onGround) {
      this.vy -= GRAVITY * dt
      this.group.position.y += this.vy * dt
      if (this.group.position.y <= PLAYER_GROUND_Y) {
        this.group.position.y = PLAYER_GROUND_Y
        this.vy = 0
        this.onGround = true
        this.landSquashT = 1
      }
    } else {
      // idle bob
      this.group.position.y =
        PLAYER_GROUND_Y + Math.sin(this.timeInState * 4) * 0.02
    }

    // Squash/stretch
    this.jumpSquashT = Math.max(0, this.jumpSquashT - dt * 3)
    this.landSquashT = Math.max(0, this.landSquashT - dt * 4)
    const jumpS = this.jumpSquashT
    const landS = this.landSquashT
    const sx = 1 + 0.25 * landS - 0.15 * jumpS
    const sy = 1 - 0.3 * landS + 0.25 * jumpS
    const sz = 1 + 0.25 * landS - 0.15 * jumpS
    this.group.scale.set(sx, sy, sz)

    // Hit flash
    this.hitFlash = Math.max(0, this.hitFlash - dt * 2)
    if (this.hitFlash > 0) {
      this.bodyMat.emissive.setHex(0xff2030)
      this.bodyMat.emissiveIntensity = 1.2
    } else {
      this.bodyMat.emissive.setHex(0x0a3a4a)
      this.bodyMat.emissiveIntensity = 0.65
    }

    // Spin-out on hit
    if (this.spinOut > 0) {
      this.spinOut = Math.max(0, this.spinOut - dt * 0.7)
      this.group.rotation.y -= dt * 8 * this.spinOut
    }

    // Trail: drop a dot every frame while moving
    if (this.onGround && Math.abs(this.group.position.x - targetX) < 0.05) {
      const dot = this.trailDots[this.trailIndex % this.trailDots.length]!
      this.trailIndex++
      dot.visible = true
      dot.position.set(
        this.group.position.x,
        this.group.position.y - 0.4,
        this.group.position.z + 0.5,
      )
      // fade
      const mat = dot.material as THREE.MeshBasicMaterial
      mat.opacity = 0.45
    }
    // fade out old dots
    for (const d of this.trailDots) {
      if (!d.visible) continue
      const m = d.material as THREE.MeshBasicMaterial
      m.opacity = Math.max(0, m.opacity - dt * 0.8)
      if (m.opacity <= 0.01) d.visible = false
    }

    // Antenna bob
    this.antennaTip.position.y = 0.88 + Math.sin(this.timeInState * 6) * 0.04

    // Shield ring (counter-rotate, pulse)
    if (this.shieldActive) {
      this.shieldTimer -= dt
      if (this.shieldTimer <= 0) {
        this.shieldActive = false
        this.shieldRing.visible = false
      } else {
        this.shieldRing.rotation.z -= dt * 2
        const pulse = 0.4 + 0.3 * Math.sin(this.timeInState * 8)
        ;(this.shieldRing.material as THREE.MeshBasicMaterial).opacity = pulse
        // warn when about to expire
        if (this.shieldTimer < 1.5) {
          ;(this.shieldRing.material as THREE.MeshBasicMaterial).color.setHex(
            0xff5a3a,
          )
        }
      }
    }
  }

  getLaneIndex(): number {
    return this.laneIndex
  }

  /** Get world-space AABB for collision checks. */
  getBox(target: THREE.Box3): THREE.Box3 {
    target.setFromObject(this.body)
    return target
  }

  /** Slightly smaller AABB for forgiving collisions. */
  getHitBox(target: THREE.Box3): THREE.Box3 {
    this.getBox(target)
    target.expandByScalar(-0.12)
    return target
  }
}
