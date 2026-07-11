import * as THREE from 'three';

// Frost telegraph geometry constants (D4-14), shared by the shape builders here
// and the system that anchors/scales them. Carved out of createTelegraphSystem
// with the lane branch so that file stays under the ≤300 functional-LOC ceiling
// (CLAUDE.md; RESEARCH Pitfall 8) — pure geometry factories, one job.

// Static outer rim thickness in world units: the constant danger edge. Must stay
// >= 0.2u so it survives the 440px internal pixel buffer at max pixelation
// (ANIM-02).
export const RIM_WIDTH = 0.3;
// Expanding progress rim is slightly thinner so the danger edge stays dominant.
export const PROGRESS_RIM_WIDTH = 0.22;
const RING_SEGMENTS = 48;
// Radial subdivisions of the filled cone sector so draping can follow terrace
// steps between the apex and the danger edge (thin rims don't need this).
export const CONE_FILL_RINGS = 8;

// Rings are authored in the XZ plane (rotateX baked into the geometry) so a
// vertex's local (x, z) maps straight to a ground sample point.
export function flatRing(
  innerRadius: number,
  outerRadius: number,
  phiSegments = 1,
  thetaStart?: number,
  thetaLength?: number
): THREE.RingGeometry {
  const geometry = new THREE.RingGeometry(
    innerRadius,
    outerRadius,
    RING_SEGMENTS,
    phiSegments,
    thetaStart,
    thetaLength
  );
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

// A subdivided plane laid flat in the XZ plane (local +X = `width` axis, +Z =
// `height` axis after the baked -PI/2 X-rotation), translated so its center sits
// at local (centerX, 0, centerZ). Width subdivisions let the shared drape follow
// terrace steps along a long lane rail (a thin strip needs none across).
function flatStrip(
  width: number,
  height: number,
  widthSegments: number,
  centerX: number,
  centerZ: number
): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(width, height, widthSegments, 1);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(centerX, 0, centerZ);
  return geometry;
}

// Concatenates the position buffers of several plane strips into ONE non-indexed
// BufferGeometry — kept local (no BufferGeometryUtils dependency; zero new deps).
// Position is the only attribute the drape + additive MeshBasicMaterial need;
// normals/uvs are dropped.
function mergeStripPositions(strips: THREE.PlaneGeometry[]): THREE.BufferGeometry {
  const expanded = strips.map(strip => strip.toNonIndexed());
  let total = 0;
  for (const strip of expanded) {
    total += (strip.getAttribute('position').array as Float32Array).length;
  }
  const positions = new Float32Array(total);
  let offset = 0;
  for (const strip of expanded) {
    const array = strip.getAttribute('position').array as Float32Array;
    positions.set(array, offset);
    offset += array.length;
    strip.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return merged;
}

// Lane rectangle OUTLINE as a single draped mesh: two full-length rails (RIM_WIDTH
// thick, subdivided so the drape follows the ground) plus two end caps spanning
// only the gap BETWEEN the rails — so the additive material never double-brightens
// the corners. One BufferGeometry so the shared drape + flash treat it exactly
// like the circle/cone rim mesh.
export function buildLaneOutline(length: number, halfWidth: number): THREE.BufferGeometry {
  const innerHeight = Math.max(0.001, halfWidth * 2 - 2 * RIM_WIDTH);
  const lengthSegments = Math.max(1, Math.round(length));
  const railCenterZ = halfWidth - RIM_WIDTH / 2;
  const strips = [
    flatStrip(length, RIM_WIDTH, lengthSegments, length / 2, railCenterZ),
    flatStrip(length, RIM_WIDTH, lengthSegments, length / 2, -railCenterZ),
    flatStrip(RIM_WIDTH, innerHeight, 1, RIM_WIDTH / 2, 0),
    flatStrip(RIM_WIDTH, innerHeight, 1, length - RIM_WIDTH / 2, 0),
  ];
  const merged = mergeStripPositions(strips);
  for (const strip of strips) strip.dispose();
  return merged;
}
