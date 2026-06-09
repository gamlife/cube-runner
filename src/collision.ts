import * as THREE from 'three'

/** AABB intersection helper - mutates target boxes. */
export function boxesIntersect(a: THREE.Box3, b: THREE.Box3): boolean {
  return a.intersectsBox(b)
}
