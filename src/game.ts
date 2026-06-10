import * as THREE from 'three'
import { createScene, applyThemeToScene, type SceneContext } from './scene'
import { Player } from './player'
import { Obstacles } from './obstacles'
import { Enemies } from './enemies'
import { Pickups } from './pickups'
import { Particles } from './particles'
import { Levels } from './level'
import { Audio } from './audio'
import { bindInput } from './input'
import { Hud } from './hud'
import { TouchControls } from './touch-controls'
import { Powerups, type PowerKind } from './powerups'
import { THEMES } from './theme'

type State = 'READY' | 'PLAYING' | 'GAME_OVER' | 'PAUSED'

export class Game {
  private ctx!: SceneContext
  private player!: Player
  private obstacles!: Obstacles
  private enemies!: Enemies
  private pickups!: Pickups
  private powerups!: Powerups
  private particles!: Particles
  private levels!: Levels
  private audio!: Audio
  private hud!: Hud
  private touchControls?: TouchControls
  private state: State = 'READY'
  private score = 0
  private dodgeBonus = 0
  private coins = 0
  private distance = 0
  private timeInState = 0
  private totalTime = 0
  private readonly playerBox = new THREE.Box3()
  private readonly enemyBoxes: THREE.Box3[] = []
  private rafId: number | null = null
  private lastTs = 0
  private cameraTargetX = 0
  private cameraY = 0
  private disposeInput?: () => void
  private hitCooldown = 0
  private lastLevelApplied = -1
  private magnetTimer = 0
  private boostTimer = 0
  private nextMilestone = 250
  private slowMoTimer = 0
  private timeScale = 1
  private bestScore = 0
  private musicEnabled = true
  // ---- Fixed-timestep physics ----
  // Game logic always advances in 1/60 s slices regardless of display refresh
  // rate. This makes movement, jumps, and collisions deterministic and
  // frame-rate independent. The accumulator drains any leftover time from a
  // slow frame into extra physics steps (capped at maxPhysicsSteps to avoid
  // the spiral-of-death on a hung tab).
  private physicsAccumulator = 0
  private readonly fixedDt = 1 / 60
  private readonly maxPhysicsSteps = 5
  /** Scratch Vector3 reused in onCoinCollected to avoid per-coin allocations. */
  private readonly popupVec = new THREE.Vector3()

  async start() {
    const canvas = document.getElementById('game') as HTMLCanvasElement
    this.ctx = createScene(canvas)
    this.player = new Player()
    this.obstacles = new Obstacles(this.ctx.scene)
    this.enemies = new Enemies(this.ctx.scene, () => this.obstacles.getSpeed())
    this.particles = new Particles(this.ctx.scene)
    this.pickups = new Pickups(this.ctx.scene, (x, y, z) => this.onCoinCollected(x, y, z))
    this.powerups = new Powerups(this.ctx.scene, (kind, x, y, z) =>
      this.onPowerupCollected(kind, x, y, z),
    )
    this.audio = new Audio()
    this.hud = new Hud()

    this.hud.onRestartClick(() => {
      if (this.state === 'GAME_OVER' || this.state === 'READY' || this.state === 'PAUSED') this.restart()
    })

    this.levels = new Levels({
      onLevelChange: (idx) => this.onLevelChange(idx),
      onTransitionStart: () => {
        this.audio.sfx('levelup')
        this.ctx.shake = 0.6
        this.player.hit() // visual flash; not a real hit because state is unchanged
        // Restore the player visuals (hit() sets red; undo)
        this.player.hitFlash = 0
      },
      onTransitionEnd: () => {
        // resume
      },
    })

    this.ctx.scene.add(this.player.group)
    applyThemeToScene(this.ctx, THEMES[0]!)
    this.obstacles.setPalette(THEMES[0]!.obstaclePalette)
    this.pickups.setColor(THEMES[0]!.pickupColor)
    this.lastLevelApplied = 0

    // Load best score from localStorage
    try {
      const raw = window.localStorage.getItem('cube-runner-best')
      if (raw) this.bestScore = parseInt(raw, 10) || 0
    } catch {
      // ignore (e.g. private mode)
    }

    this.hud.showStart(this.bestScore)
    this.hud.setScore(0)
    this.hud.setSpeed(this.obstacles.getSpeed())
    this.hud.setCoins(0)

    this.disposeInput = bindInput({
      onLeft: () => this.handleMove(-1),
      onRight: () => this.handleMove(1),
      onJump: () => this.handleJump(),
      onAnyKey: () => {
        this.tryStart()
        this.audio.unlock()
      },
      onRestart: () => {
        if (this.state === 'GAME_OVER') this.restart()
      },
      onPause: () => this.togglePause(),
      onDrag: (screenX) => {
        if (this.state === 'GAME_OVER' || this.state === 'PAUSED') {
          // Drop any stale drag state but don't act on it.
          this.player.clearFreeX()
          return
        }
        this.tryStart()
        if (screenX === null) {
          this.player.clearFreeX()
        } else {
          // Map screenX ∈ [0, innerWidth] → gameX ∈ [-1.5, 1.5] (the lane
          // range). We deliberately don't span the full road width: obstacles
          // in the outermost lanes have hitboxes that extend past the lane
          // center, so a drag-to-curb position would overlap with them and
          // kill the player. Clamping to the lane range keeps the drag safe.
          this.player.setFreeX((screenX / window.innerWidth) * 3 - 1.5)
        }
      },
    })

    if (document.body.classList.contains('touch')) {
      this.touchControls = new TouchControls({
        onLeft: () => this.handleMove(-1),
        onRight: () => this.handleMove(1),
        onJump: () => this.handleJump(),
        onAnyKey: () => this.tryStart(),
        onRestart: () => {
          if (this.state === 'GAME_OVER') this.restart()
        },
        onPause: () => this.togglePause(),
        onDrag: () => {
          // The on-screen arrow buttons are lane-based; the free-drag gesture
          // is only meaningful on the bare gameplay area, so the buttons
          // don't engage it. Keep the interface complete by no-oping.
        },
      })
    }

    this.lastTs = performance.now()
    this.rafId = requestAnimationFrame(this.tick)
  }

  private handleMove(dx: -1 | 1) {
    if (this.state === 'GAME_OVER' || this.state === 'PAUSED') return
    this.tryStart()
    if (dx < 0) this.player.moveLeft()
    else this.player.moveRight()
    this.audio.sfx('lane')
  }

  private handleJump() {
    if (this.state === 'GAME_OVER' || this.state === 'PAUSED') return
    this.tryStart()
    if (this.player.onGround) {
      this.player.jump()
      this.audio.sfx('jump')
    }
  }

  private tryStart() {
    if (this.state === 'READY') {
      this.state = 'PLAYING'
      this.timeInState = 0
      this.hud.hide()
      this.audio.setMusicTheme(THEMES[0]!.musicRoot, THEMES[0]!.musicScale, 110)
      this.audio.startMusic()
    }
  }

  private restart() {
    this.score = 0
    this.coins = 0
    this.dodgeBonus = 0
    this.distance = 0
    this.timeInState = 0
    this.totalTime = 0
    this.hitCooldown = 0
    this.magnetTimer = 0
    this.boostTimer = 0
    this.nextMilestone = 250
    this.slowMoTimer = 0
    this.timeScale = 1
    this.player.reset()
    this.obstacles.reset()
    this.enemies.reset()
    this.pickups.reset()
    this.powerups.reset()
    this.particles.update(0) // ensure no leftover
    this.ctx.decorations.reset()
    this.levels.reset()
    applyThemeToScene(this.ctx, THEMES[0]!)
    this.obstacles.setPalette(THEMES[0]!.obstaclePalette)
    this.pickups.setColor(THEMES[0]!.pickupColor)
    this.lastLevelApplied = 0
    this.hud.setScore(0)
    this.hud.setCoins(0)
    this.hud.setSpeed(this.obstacles.getSpeed())
    this.hud.resetCombo()
    this.hud.clearPower()
    this.state = 'PLAYING'
    this.hud.hide()
    this.audio.setMusicTheme(THEMES[0]!.musicRoot, THEMES[0]!.musicScale, 110)
    this.audio.startMusic()
    this.ctx.shake = 0
  }

  private endGame() {
    if (this.state === 'GAME_OVER') return
    this.state = 'GAME_OVER'
    this.timeInState = 0
    this.audio.sfx('hit')
    this.audio.stopMusic()
    this.ctx.shake = 1
    this.slowMoTimer = 0.5
    this.particles.explode(this.player.group.position.x, 0.6, this.player.group.position.z)
    this.player.hit()
    this.hud.flashHit()
    // Persist best score
    const isNewBest = this.score > this.bestScore
    if (isNewBest) {
      this.bestScore = this.score
      try {
        window.localStorage.setItem('cube-runner-best', String(this.bestScore))
      } catch {
        // ignore
      }
    }
    this.hud.showGameOver(this.score, this.coins, this.bestScore, isNewBest)
  }

  private togglePause() {
    if (this.state === 'PLAYING') {
      this.state = 'PAUSED'
      this.audio.stopMusic()
      this.hud.showPause(() => this.togglePause())
    } else if (this.state === 'PAUSED') {
      this.state = 'PLAYING'
      this.audio.startMusic()
      this.hud.hide()
    }
  }

  private onLevelChange(newIdx: number) {
    const theme = THEMES[newIdx]!
    this.audio.setMusicTheme(theme.musicRoot, theme.musicScale, 110 + newIdx * 8)
    this.hud.showLevelBanner(theme.name)
    this.obstacles.setPalette(theme.obstaclePalette)
    this.pickups.setColor(theme.pickupColor)
  }

  private onCoinCollected(x: number, y: number, z: number) {
    const combo = this.hud.getCombo()
    const boost = this.boostTimer > 0 ? 2 : 1
    const bonus = (10 + Math.max(0, combo) * 2) * boost
    this.coins++
    this.dodgeBonus += bonus
    this.hud.setCoins(this.coins)
    this.hud.bumpCombo()
    this.audio.sfx('coin')
    this.particles.sparkle(x, y, z, THEMES[this.levels.getLevelIndex()]!.pickupColor, 8)
    // Project 3D position to screen for the "+N" popup. Reuse the scratch
    // Vector3 instead of `new`-ing one every coin — on a long run with a
    // magnet active you can collect a coin every frame, and the per-coin
    // allocation shows up as GC pressure.
    this.popupVec.set(x, y, z)
    this.popupVec.project(this.ctx.camera)
    const sx = (this.popupVec.x + 1) / 2
    const sy = (1 - this.popupVec.y) / 2
    this.hud.showPopup(sx, sy, `+${bonus}`, '#ffd24a')
  }

  private onPowerupCollected(kind: PowerKind, x: number, y: number, z: number) {
    if (kind === 'shield') {
      this.player.activateShield(8)
      this.hud.setPower('shield', 8)
    } else if (kind === 'magnet') {
      this.magnetTimer = 7
      this.hud.setPower('magnet', 7)
    } else if (kind === 'boost') {
      this.boostTimer = 5
      this.hud.setPower('boost', 5)
    }
    this.particles.sparkle(x, y, z, 0xffffff, 18)
    this.audio.sfx('levelup')
  }

  private celebrateMilestone() {
    // Burst of confetti particles around the player
    const px = this.player.group.position.x
    const pz = this.player.group.position.z
    const colors = [0xff6a3d, 0x4cc9f0, 0xffd24a, 0xff4ad8, 0x6dd58c]
    for (let i = 0; i < 5; i++) {
      const c = colors[i % colors.length]!
      this.particles.sparkle(px + (Math.random() - 0.5) * 2, 1.2, pz, c, 10)
    }
    this.hud.showMilestone(this.score)
    this.ctx.shake = Math.max(this.ctx.shake, 0.4)
  }

  private tick = (ts: number) => {
    const realDt = Math.min((ts - this.lastTs) / 1000, 0.1)
    this.lastTs = ts

    // Slow-mo: when active, scale time down for dramatic effect.
    // Uses realDt (not sdt) so the slow-mo countdown tracks wall clock,
    // not the (potentially sped-up) physics accumulator.
    if (this.slowMoTimer > 0) {
      this.slowMoTimer = Math.max(0, this.slowMoTimer - realDt)
      this.timeScale = 0.35
    } else {
      this.timeScale = 1
    }
    const sdt = this.fixedDt * this.timeScale

    // Fixed-timestep physics accumulator. Game logic always steps at exactly
    // 1/60 s, regardless of display refresh rate, so movement is frame-rate
    // independent and collisions are deterministic. The accumulator drains
    // any leftover time from a slow frame into extra steps (capped to
    // maxPhysicsSteps to prevent the spiral-of-death on a hung tab).
    this.physicsAccumulator += realDt
    let steps = 0
    while (this.physicsAccumulator >= this.fixedDt && steps < this.maxPhysicsSteps) {
      this.physicsStep(sdt)
      this.physicsAccumulator -= this.fixedDt
      steps++
    }

    // Visual layer: camera shake (uses Math.random → not deterministic, so
    // it stays out of the physics step) + render.
    this.renderFrame()
    this.rafId = requestAnimationFrame(this.tick)
  }

  /**
   * One fixed-timestep physics step. All gameplay-side updates live here so
   * they advance at a consistent rate regardless of the display's refresh
   * rate. `sdt` is fixedDt * timeScale (already 1/60 * scale at construction),
   * never the raw realDt, so the same code path runs at 60Hz physics on a
   * 60Hz, 120Hz, or 30Hz display.
   */
  private physicsStep(sdt: number) {
    if (this.state === 'PLAYING') {
      this.totalTime += sdt
      this.timeInState += sdt
      this.hitCooldown = Math.max(0, this.hitCooldown - sdt)
      this.magnetTimer = Math.max(0, this.magnetTimer - sdt)
      this.boostTimer = Math.max(0, this.boostTimer - sdt)

      // Update HUD power-up indicator countdown
      if (this.magnetTimer > 0) this.hud.setPower('magnet', this.magnetTimer, true)
      else if (this.boostTimer > 0) this.hud.setPower('boost', this.boostTimer, true)
      else if (this.player.hasShield()) this.hud.setPower('shield', this.player.getShieldTime(), true)
      else this.hud.clearPower()

      // Progress drives speed and difficulty
      const progress = Math.min(1, this.totalTime / 75)
      this.obstacles.setProgress(progress)
      this.enemies.setProgress(progress)
      this.hud.setSpeed(this.obstacles.getSpeed())

      // Level progression + crossfade
      this.levels.check(this.score, sdt)
      const theme = this.levels.getTheme()
      // Apply the (possibly lerped) theme every physics step during a
      // transition, not just when the level index flips. The old code only
      // ran at the very end of the 1.6s transition, which burst ~20 GPU
      // uniform updates into a single frame — a noticeable hitch on mobile.
      // Spreading the updates across the transition window keeps each
      // frame's GPU work trivial and turns the hard color switch into a
      // smooth crossfade.
      if (this.levels.isPaused() || this.levels.getLevelIndex() !== this.lastLevelApplied) {
        applyThemeToScene(this.ctx, theme)
        this.lastLevelApplied = this.levels.getLevelIndex()
      }

      // Distance score (paused during transition)
      if (!this.levels.isPaused()) {
        this.distance += this.obstacles.getSpeed() * sdt
      }
      const newScore = Math.floor(this.distance) + this.dodgeBonus
      if (newScore !== this.score) {
        this.score = newScore
        this.hud.setScore(this.score)
        if (this.score >= this.nextMilestone) {
          this.celebrateMilestone()
          this.nextMilestone += 250
        }
      }

      // Player keeps responding to taps/swipes/drags during the level
      // transition so the user isn't locked out for 1.6s.
      this.player.update(sdt)

      // World freeze during a level transition: nothing in the world moves
      // while the theme crossfades. Obstacles, pickups, decorations,
      // parallax, sky and track all hold position. This is the change that
      // makes the level change feel like a clean cut instead of "obstacles
      // gliding past the banner".
      const transitioning = this.levels.isPaused()
      if (!transitioning) {
        this.obstacles.update(sdt, () => {
          this.dodgeBonus += 5
        })
        this.enemies.update(sdt)
        this.pickups.update(sdt, this.obstacles.getSpeed())
        this.powerups.update(sdt, this.obstacles.getSpeed())
        if (this.magnetTimer > 0) {
          this.pickups.applyMagnet(
            this.player.group.position.x,
            this.player.group.position.y,
            this.player.group.position.z,
            5,
            sdt,
          )
        }
        this.ctx.decorations.update(this.obstacles.getSpeed(), sdt)
        this.ctx.parallax.update(sdt)
        this.ctx.sky.update(sdt)
        this.ctx.track.update(this.obstacles.getSpeed(), sdt)
      }
      this.particles.update(sdt)

      // Camera shake decay + camera position smoothing. These tick at the
      // physics rate (not the display rate) so the smoothing speed doesn't
      // double on a 120Hz screen.
      this.ctx.shake = Math.max(0, this.ctx.shake - sdt * 1.5)
      this.cameraTargetX += (this.player.group.position.x * 0.35 - this.cameraTargetX) * 0.08
      const baseY = 4.2 + (this.player.group.position.y - 0.5) * 0.3
      this.cameraY += (baseY - this.cameraY) * 0.08
      const speedNorm = (this.obstacles.getSpeed() - 12) / 16
      const targetFov = 60 + Math.max(0, Math.min(1, speedNorm)) * 6
      this.ctx.camera.fov += (targetFov - this.ctx.camera.fov) * 0.05
      this.ctx.camera.updateProjectionMatrix()

      // Collisions
      this.player.getHitBox(this.playerBox)
      if (this.hitCooldown === 0) {
        if (this.obstacles.checkCollision(this.playerBox)) {
          if (this.player.consumeShield()) this.handleShieldHit()
          else this.endGame()
        } else {
          // Enemy car collisions
          this.enemies.getActiveBoxes(this.enemyBoxes)
          let hit = false
          for (let i = 0; i < this.enemyBoxes.length; i++) {
            if (this.playerBox.intersectsBox(this.enemyBoxes[i]!)) {
              hit = true
              break
            }
          }
          if (hit) {
            if (this.player.consumeShield()) this.handleShieldHit()
            else this.endGame()
          }
        }
      }

      // Pickups
      if (this.state === 'PLAYING') {
        this.pickups.checkCollection(this.playerBox)
        this.powerups.checkCollection(this.playerBox)
      }
    } else if (this.state === 'GAME_OVER') {
      this.player.update(sdt)
      this.particles.update(sdt)
      this.ctx.shake = Math.max(0, this.ctx.shake - sdt * 1.5)
    } else {
      this.player.update(sdt)
    }
  }

  /**
   * Visual-only update that runs once per render frame (not per physics
   * step). It applies the non-deterministic camera shake offset, points the
   * camera, and renders the scene.
   */
  private renderFrame() {
    // Subtle vertical "running" bob — sells the forward-motion feel
    // (without it, the world feels like a conveyor belt).
    const bob = Math.sin(this.totalTime * 14) * 0.04
    const camX = this.cameraTargetX
    const camY = this.cameraY + bob
    // Apply shake (decaying random offset) — Math.random, so this stays
    // in the render path (not deterministic).
    if (this.ctx.shake > 0.01) {
      const s = this.ctx.shake
      this.ctx.camera.position.set(
        camX + (Math.random() - 0.5) * s * 0.5,
        camY + (Math.random() - 0.5) * s * 0.5,
        7 + (Math.random() - 0.5) * s * 0.2,
      )
    } else {
      this.ctx.camera.position.set(camX, camY, 7)
    }
    this.ctx.camera.lookAt(camX * 0.4, 0.5, -10)

    this.ctx.renderer.render(this.ctx.scene, this.ctx.camera)
  }

  /** Shared shield-absorption path used by both obstacle and enemy hits. */
  private handleShieldHit() {
    this.hitCooldown = 0.5
    this.ctx.shake = 0.5
    this.audio.sfx('coin')
    this.particles.sparkle(
      this.player.group.position.x,
      1,
      this.player.group.position.z,
      0x4cc9f0,
      16,
    )
    this.player.hitFlash = 0.4
    this.hud.clearPower()
  }

  destroy() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    this.disposeInput?.()
    this.touchControls?.destroy()
    this.audio.stopMusic()
  }

  setMuted(m: boolean) {
    this.musicEnabled = !m
    this.audio.setMusicEnabled(this.musicEnabled)
  }
}
