import * as THREE from 'three'
import { Sky } from './sky'
import { Parallax } from './parallax'
import { Track } from './track'
import { Decorations } from './decorations'
import type { Theme } from './theme'

export interface SceneContext {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  sky: Sky
  parallax: Parallax
  track: Track
  decorations: Decorations
  /** Camera shake intensity (0..1). Decays each frame. */
  shake: number
  /** Original camera position (before shake offset) */
  baseCamPos: THREE.Vector3
  baseCamLook: THREE.Vector3
}

export function createScene(canvas: HTMLCanvasElement): SceneContext {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x6cc6ff)
  scene.fog = new THREE.Fog(0xc8efff, 22, 80)

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    300,
  )
  camera.position.set(0, 4.2, 7)
  camera.lookAt(0, 0.5, -10)

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight, false)

  // Lights (will be re-tinted by the current theme)
  const ambient = new THREE.AmbientLight(0xffffff, 0.55)
  scene.add(ambient)
  const dir = new THREE.DirectionalLight(0xfff2c4, 1.0)
  dir.position.set(4, 8, 6)
  scene.add(dir)
  const hemi = new THREE.HemisphereLight(0x9adfff, 0x4a7a3d, 0.25)
  scene.add(hemi)

  // Sub-systems
  const sky = new Sky()
  scene.add(sky.group)

  const parallax = new Parallax()
  parallax.build()
  scene.add(parallax.group)

  const track = new Track()
  scene.add(track.group)

  const decorations = new Decorations(scene)

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight, false)
  })

  const baseCamPos = new THREE.Vector3()
  const baseCamLook = new THREE.Vector3()

  // Stash light references for theme application
  ;(scene as unknown as { __ambient: THREE.AmbientLight }).__ambient = ambient
  ;(scene as unknown as { __dir: THREE.DirectionalLight }).__dir = dir
  ;(scene as unknown as { __hemi: THREE.HemisphereLight }).__hemi = hemi

  return {
    scene,
    camera,
    renderer,
    sky,
    parallax,
    track,
    decorations,
    shake: 0,
    baseCamPos,
    baseCamLook,
  }
}

/** Apply a theme's palette to all scene sub-systems. */
export function applyThemeToScene(ctx: SceneContext, theme: Theme) {
  ctx.scene.background = new THREE.Color(theme.skyBottom)
  ctx.scene.fog = new THREE.Fog(theme.fogColor, theme.fogNear, theme.fogFar)
  const amb = (ctx.scene as unknown as { __ambient: THREE.AmbientLight }).__ambient
  const dir = (ctx.scene as unknown as { __dir: THREE.DirectionalLight }).__dir
  const hemi = (ctx.scene as unknown as { __hemi: THREE.HemisphereLight }).__hemi
  if (amb) {
    amb.color = new THREE.Color(theme.ambientColor)
    amb.intensity = theme.ambientIntensity
  }
  if (dir) {
    dir.color = new THREE.Color(theme.dirColor)
    dir.intensity = theme.dirIntensity
  }
  if (hemi) {
    hemi.color = new THREE.Color(theme.ambientColor)
    hemi.groundColor = new THREE.Color(theme.groundColor)
  }
  ctx.sky.applyTheme(theme)
  ctx.parallax.applyTheme(theme)
  ctx.track.applyTheme(theme)
  if (theme.decorationType !== ctx.decorations['type']) {
    ctx.decorations.setType(theme.decorationType)
  }
}
