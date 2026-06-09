import * as THREE from 'three'

export interface SceneContext {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
}

export function createScene(canvas: HTMLCanvasElement): SceneContext {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0b0b1a)
  scene.fog = new THREE.Fog(0x0b0b1a, 20, 70)

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  )
  camera.position.set(0, 4, 7)
  camera.lookAt(0, 0.5, -10)

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight, false)

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.5)
  scene.add(ambient)
  const directional = new THREE.DirectionalLight(0xffffff, 0.9)
  directional.position.set(4, 8, 6)
  scene.add(directional)
  // a soft fill light from below for nicer color rendering
  const fill = new THREE.HemisphereLight(0x4cc9f0, 0x0b0b1a, 0.25)
  scene.add(fill)

  // Grid floor
  const grid = new THREE.GridHelper(120, 60, 0x444466, 0x222233)
  grid.position.y = 0
  scene.add(grid)

  // Lane markers (subtle)
  const laneMaterial = new THREE.MeshBasicMaterial({
    color: 0x4cc9f0,
    transparent: true,
    opacity: 0.18,
  })
  for (const x of [-1.5, 1.5]) {
    const lane = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.01, 60),
      laneMaterial
    )
    lane.position.set(x, 0.005, -20)
    scene.add(lane)
  }

  // Resize handler
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight, false)
  })

  return { scene, camera, renderer }
}
