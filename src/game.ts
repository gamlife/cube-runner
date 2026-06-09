import * as THREE from 'three'
import { createScene, type SceneContext } from './scene'
import { Player } from './player'
import { Obstacles } from './obstacles'
import { bindInput } from './input'
import { Hud } from './hud'

type State = 'READY' | 'PLAYING' | 'GAME_OVER'

export class Game {
  private ctx!: SceneContext
  private player!: Player
  private obstacles!: Obstacles
  private hud!: Hud
  private state: State = 'READY'
  private score = 0
  private distance = 0
  private timeInState = 0
  private totalTime = 0
  private readonly playerBox = new THREE.Box3()
  private rafId: number | null = null
  private lastTs = 0
  private cameraTargetX = 0
  private disposeInput?: () => void

  async start() {
    const canvas = document.getElementById('game') as HTMLCanvasElement
    this.ctx = createScene(canvas)
    this.player = new Player()
    this.obstacles = new Obstacles(this.ctx.scene)
    this.hud = new Hud()
    this.hud.onRestartClick(() => {
      if (this.state === 'GAME_OVER' || this.state === 'READY') this.restart()
    })

    this.ctx.scene.add(this.player.mesh)

    this.disposeInput = bindInput({
      onLeft: () => {
        if (this.state === 'GAME_OVER') return
        this.startIfReady()
        this.player.moveLeft()
      },
      onRight: () => {
        if (this.state === 'GAME_OVER') return
        this.startIfReady()
        this.player.moveRight()
      },
      onJump: () => {
        if (this.state === 'GAME_OVER') return
        this.startIfReady()
        this.player.jump()
      },
      onAnyKey: () => {
        if (this.state === 'READY') this.startIfReady()
      },
      onRestart: () => {
        if (this.state === 'GAME_OVER') this.restart()
      },
    })

    this.hud.showStart()
    this.hud.setScore(0)
    this.hud.setSpeed(this.obstacles.getSpeed())

    this.lastTs = performance.now()
    this.rafId = requestAnimationFrame(this.tick)
  }

  private startIfReady() {
    if (this.state === 'READY') {
      this.state = 'PLAYING'
      this.timeInState = 0
      this.hud.hide()
    }
  }

  private restart() {
    this.score = 0
    this.distance = 0
    this.timeInState = 0
    this.totalTime = 0
    this.player.reset()
    this.obstacles.reset()
    this.hud.setScore(0)
    this.hud.setSpeed(this.obstacles.getSpeed())
    this.state = 'PLAYING'
    this.hud.hide()
  }

  private endGame() {
    this.state = 'GAME_OVER'
    this.timeInState = 0
    this.hud.showGameOver(this.score)
  }

  private tick = (ts: number) => {
    const dt = Math.min((ts - this.lastTs) / 1000, 0.05) // cap at 50ms
    this.lastTs = ts

    if (this.state === 'PLAYING') {
      this.totalTime += dt
      this.timeInState += dt

      // Difficulty ramp 0..1 over 60s
      const progress = Math.min(1, this.totalTime / 60)
      this.obstacles.setProgress(progress)
      this.hud.setSpeed(this.obstacles.getSpeed())

      // Distance score
      this.distance += this.obstacles.getSpeed() * dt
      const newScore = Math.floor(this.distance) + this.dodgeBonus
      if (newScore !== this.score) {
        this.score = newScore
        this.hud.setScore(this.score)
      }

      // Update entities
      this.player.update(dt)
      this.obstacles.update(dt, (_lane) => {
        // +5 per obstacle passed (in any lane the player could have been in)
        this.dodgeBonus += 5
      })

      // Collision
      this.player.getHitBox(this.playerBox)
      if (this.obstacles.checkCollision(this.playerBox)) {
        this.endGame()
      }
    } else if (this.state === 'GAME_OVER' || this.state === 'READY') {
      // Player idles with subtle rotation; obstacles stay frozen
      this.player.update(dt)
    }

    // Camera follow with slight X lag (parallax)
    this.cameraTargetX += (this.player.mesh.position.x * 0.35 - this.cameraTargetX) * 0.08
    this.ctx.camera.position.x = this.cameraTargetX
    this.ctx.camera.lookAt(this.cameraTargetX * 0.4, 0.5, -10)

    this.ctx.renderer.render(this.ctx.scene, this.ctx.camera)
    this.rafId = requestAnimationFrame(this.tick)
  }

  private dodgeBonus = 0

  destroy() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    this.disposeInput?.()
  }
}
