import * as THREE from 'three'

/**
 * A Theme describes the visual + audio palette for one level of the runner.
 * All colors are passed around as THREE.Color values; numbers are 0xRRGGBB.
 */
export interface Theme {
  name: string
  /** Display accent color (HUD highlights, glow, etc.) */
  accent: number
  /** Vertical sky gradient (top -> bottom) */
  skyTop: number
  skyBottom: number
  /** Sun / moon disc + halo color */
  sunColor: number
  sunIntensity: number
  /** Cloud color and opacity */
  cloudColor: number
  cloudOpacity: number
  /** Distant mountain silhouette (near + far layers) */
  mountainNear: number
  mountainFar: number
  /** Ground (off-road area) */
  groundColor: number
  groundAccent: number
  /** Road / track surface */
  roadColor: number
  roadLineColor: number
  /** Lane-edge sidewalks */
  curbColor: number
  /** Lighting */
  ambientColor: number
  ambientIntensity: number
  dirColor: number
  dirIntensity: number
  /** Distance fog */
  fogColor: number
  fogNear: number
  fogFar: number
  /** Lane-side decoration type */
  decorationType: 'trees' | 'lamps' | 'neon'
  /** Obstacle color palette (cycled for variety) */
  obstaclePalette: number[]
  /** Coin color */
  pickupColor: number
  /** Music root note (Hz) and scale intervals (semitones from root) */
  musicRoot: number
  musicScale: number[]
}

const PINE = 0x2c5f3a
const SUN = 0xfff4c4
const PINK = 0xffb1c1

export const THEMES: Theme[] = [
  // ---------- Level 1: Sunny Forest ----------
  {
    name: 'Sunny Forest',
    accent: 0x6dd58c,
    skyTop: 0x6cc6ff,
    skyBottom: 0xc8efff,
    sunColor: SUN,
    sunIntensity: 1.4,
    cloudColor: 0xffffff,
    cloudOpacity: 0.85,
    mountainNear: PINE,
    mountainFar: 0x6b9bb5,
    groundColor: 0x4a7a3d,
    groundAccent: 0x5e8a4c,
    roadColor: 0x3a3a3a,
    roadLineColor: 0xffeb70,
    curbColor: 0xcfd2d6,
    ambientColor: 0xffffff,
    ambientIntensity: 0.55,
    dirColor: 0xfff2c4,
    dirIntensity: 1.0,
    fogColor: 0xc8efff,
    fogNear: 22,
    fogFar: 80,
    decorationType: 'trees',
    obstaclePalette: [0xff6a3d, 0x8b5a2b, 0xc84a4a, 0xd9a73d, 0x4a4a8b],
    pickupColor: 0xffd24a,
    musicRoot: 261.63, // C4
    musicScale: [0, 2, 4, 7, 9], // major pentatonic
  },
  // ---------- Level 2: Sunset City ----------
  {
    name: 'Sunset City',
    accent: 0xff8a3d,
    skyTop: 0x4a2a6a,
    skyBottom: 0xff8a3d,
    sunColor: 0xffd07a,
    sunIntensity: 1.6,
    cloudColor: 0xffd6a0,
    cloudOpacity: 0.55,
    mountainNear: 0x2a1e3a,
    mountainFar: 0x6a4a8a,
    groundColor: 0x4a3a3a,
    groundAccent: 0x6a4a4a,
    roadColor: 0x2a1f1f,
    roadLineColor: 0xfff0a0,
    curbColor: 0x8a6a5a,
    ambientColor: 0xffb070,
    ambientIntensity: 0.5,
    dirColor: 0xff9050,
    dirIntensity: 1.1,
    fogColor: 0xff7a3a,
    fogNear: 26,
    fogFar: 90,
    decorationType: 'lamps',
    obstaclePalette: [0xff4a3a, 0xffb13a, 0x8a2a8a, 0xff7a3a, 0xffffff],
    pickupColor: 0xfff0a0,
    musicRoot: 220.0, // A3
    musicScale: [0, 2, 3, 5, 7, 10], // minor
  },
  // ---------- Level 3: Neon Night ----------
  {
    name: 'Neon Night',
    accent: 0x4cf0c8,
    skyTop: 0x0a0a1f,
    skyBottom: 0x2a1a5a,
    sunColor: 0xa0e8ff,
    sunIntensity: 0.6,
    cloudColor: PINK,
    cloudOpacity: 0.35,
    mountainNear: 0x1a0a3a,
    mountainFar: 0x2a1a4a,
    groundColor: 0x0a0a18,
    groundAccent: 0x1a0a3a,
    roadColor: 0x05050f,
    roadLineColor: 0x4cf0c8,
    curbColor: 0x1a1a3a,
    ambientColor: 0x4a3a8a,
    ambientIntensity: 0.35,
    dirColor: 0x8a4aff,
    dirIntensity: 0.7,
    fogColor: 0x1a0a3a,
    fogNear: 24,
    fogFar: 75,
    decorationType: 'neon',
    obstaclePalette: [0x4cf0c8, 0xff4ad8, 0x4a6aff, 0xffd24a, 0xff4a4a],
    pickupColor: 0xfff0a0,
    musicRoot: 293.66, // D4
    musicScale: [0, 2, 3, 5, 7, 9, 10], // dorian
  },
]

/** Score thresholds at which the level transitions. */
export const LEVEL_THRESHOLDS = [0, 350, 900]

/** Get the level index for a given score. */
export function levelForScore(score: number): number {
  let idx = 0
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (score >= LEVEL_THRESHOLDS[i]!) idx = i
  }
  return Math.min(idx, THEMES.length - 1)
}

/** Lerp two 0xRRGGBB hex colors by interpolating R/G/B channels separately. */
function lerpColorHex(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff
  const ag = (a >> 8) & 0xff
  const ab = a & 0xff
  const br = (b >> 16) & 0xff
  const bg = (b >> 8) & 0xff
  const bb = b & 0xff
  const r = Math.round(ar + (br - ar) * t)
  const g = Math.round(ag + (bg - ag) * t)
  const bl = Math.round(ab + (bb - ab) * t)
  return (r << 16) | (g << 8) | bl
}

/** Lerp between two themes. t in [0,1] */
export function lerpTheme(a: Theme, b: Theme, t: number, out: Theme): Theme {
  out.skyTop = lerpColorHex(a.skyTop, b.skyTop, t)
  out.skyBottom = lerpColorHex(a.skyBottom, b.skyBottom, t)
  out.sunColor = lerpColorHex(a.sunColor, b.sunColor, t)
  out.sunIntensity = THREE.MathUtils.lerp(a.sunIntensity, b.sunIntensity, t)
  out.cloudColor = lerpColorHex(a.cloudColor, b.cloudColor, t)
  out.cloudOpacity = THREE.MathUtils.lerp(a.cloudOpacity, b.cloudOpacity, t)
  out.mountainNear = lerpColorHex(a.mountainNear, b.mountainNear, t)
  out.mountainFar = lerpColorHex(a.mountainFar, b.mountainFar, t)
  out.groundColor = lerpColorHex(a.groundColor, b.groundColor, t)
  out.groundAccent = lerpColorHex(a.groundAccent, b.groundAccent, t)
  out.roadColor = lerpColorHex(a.roadColor, b.roadColor, t)
  out.roadLineColor = lerpColorHex(a.roadLineColor, b.roadLineColor, t)
  out.curbColor = lerpColorHex(a.curbColor, b.curbColor, t)
  out.ambientColor = lerpColorHex(a.ambientColor, b.ambientColor, t)
  out.ambientIntensity = THREE.MathUtils.lerp(a.ambientIntensity, b.ambientIntensity, t)
  out.dirColor = lerpColorHex(a.dirColor, b.dirColor, t)
  out.dirIntensity = THREE.MathUtils.lerp(a.dirIntensity, b.dirIntensity, t)
  out.fogColor = lerpColorHex(a.fogColor, b.fogColor, t)
  out.fogNear = THREE.MathUtils.lerp(a.fogNear, b.fogNear, t)
  out.fogFar = THREE.MathUtils.lerp(a.fogFar, b.fogFar, t)
  out.pickupColor = lerpColorHex(a.pickupColor, b.pickupColor, t)
  return out
}
