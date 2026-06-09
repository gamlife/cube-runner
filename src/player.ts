import * as THREE from 'three'

export const LANE_X = [-1.5, 0, 1.5] as const
const PLAYER_GROUND_Y = 0.5
const JUMP_VELOCITY = 9
const GRAVITY = 28
const LANE_LERP = 0.25

export class Player {
  readonly mesh: THREE.Mesh
  private laneIndex = 1 // start center
  private vy = 0
  private onGround = true
  constructor() {
    const geometry = new THREE.BoxGeometry(0.9, 0.9, 0.9)
    const material = new THREE.MeshStandardMaterial({
      color: 0x4cc9f0,
      metalness: 0.2,
      roughness: 0.35,
      emissive: 0x0a3a4a,
      emissiveIntensity: 0.6,
    })
    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.position.set(LANE_X[this.laneIndex] as number, PLAYER_GROUND_Y, 0)
    this.mesh.castShadow = false
  }

  moveLeft() {
    if (this.laneIndex > 0) this.laneIndex--
  }

  moveRight() {
    if (this.laneIndex < LANE_X.length - 1) this.laneIndex++
  }

  jump() {
    if (this.onGround) {
      this.vy = JUMP_VELOCITY
      this.onGround = false
    }
  }

  reset() {
    this.laneIndex = 1
    this.vy = 0
    this.onGround = true
    this.mesh.position.set(LANE_X[this.laneIndex] as number, PLAYER_GROUND_Y, 0)
  }

  update(dt: number) {
    // Lane interpolation
    const targetX = LANE_X[this.laneIndex] as number
    this.mesh.position.x += (targetX - this.mesh.position.x) * LANE_LERP

    // Jump physics
    if (!this.onGround) {
      this.vy -= GRAVITY * dt
      this.mesh.position.y += this.vy * dt
      if (this.mesh.position.y <= PLAYER_GROUND_Y) {
        this.mesh.position.y = PLAYER_GROUND_Y
        this.vy = 0
        this.onGround = true
      }
    }

    // Subtle rotation while moving for life
    this.mesh.rotation.y += dt * 0.6
  }

  getLaneIndex(): number {
    return this.laneIndex
  }

  /** Get world-space AABB for collision checks. */
  getBox(target: THREE.Box3): THREE.Box3 {
    target.setFromObject(this.mesh)
    return target
  }

  /** Use a slightly smaller AABB for forgiving collisions. */
  getHitBox(target: THREE.Box3): THREE.Box3 {
    this.getBox(target)
    target.expandByScalar(-0.1)
    return target
  }
}
