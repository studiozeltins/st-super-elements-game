import * as THREE from 'three';

/**
 * Shared winged-creature geometry + a GPU wing-flap shader, used by both the
 * butterfly and the ground-bird pools. A creature is a slim body along +Z with
 * one or more POINTED wing pairs fanning out along ±X; each wing is a triangle
 * (two spine roots → one outboard tip) so the silhouette reads as a wing, never a
 * square. A butterfly passes TWO pairs (broad forewing + smaller hindwing → the
 * unmistakable four-wing outline); a bird passes one swept pair. Each vertex
 * carries an `aWing` attribute (-1 left, +1 right, 0 body) and a baked vertex
 * COLOR (per-wing tint vs body tint). Per-INSTANCE `aFlapPhase` decorrelates the
 * flock and per-instance `aFlapAmp` scales the beat (0 = folded, 1 = full flap),
 * so pecking and flying birds share ONE InstancedMesh / one draw call.
 *
 * PERFORMANCE: the flap is done ENTIRELY in the vertex shader — wings rotate about
 * the local +Z (forward) spine by `aWing * sin(uFlapTime*speed + aFlapPhase) *
 * uFlapAmp * aFlapAmp`, so animating a whole flock costs ZERO CPU per-vertex work.
 */

export interface FlapMaterial {
  material: THREE.Material;
  /** Advance the shared wing-beat clock (seconds). Call once per frame. */
  setTime(seconds: number): void;
}

export interface FlapAttrs {
  phases: Float32Array;
  amps: Float32Array;
  phaseAttr: THREE.InstancedBufferAttribute;
  ampAttr: THREE.InstancedBufferAttribute;
}

/** One pointed wing pair: a triangle from two spine roots out to a single tip. */
export interface WingPair {
  /** Half-span: how far the tip reaches out along ±X. */
  span: number;
  /** Spine root chord edge — front and back Z of the two root verts. */
  rootFront: number;
  rootBack: number;
  /** Z of the outboard tip point (>0 sweeps forward, <0 sweeps back). */
  tipZ: number;
  /** Optional per-pair wing tint (defaults to opts.wingColor). */
  color?: number;
}

/** Build the merged wings+body geometry (non-indexed; carries aWing + vertex color). */
export function createWingedGeometry(opts: {
  wings: WingPair[];
  bodyLength: number;
  bodyWidth: number;
  wingColor: number;
  bodyColor: number;
}): THREE.BufferGeometry {
  const { bodyLength: bl, bodyWidth: bw } = opts;
  const positions: number[] = [];
  const wings: number[] = [];
  const colors: number[] = [];
  const defaultWingCol = new THREE.Color(opts.wingColor);
  const bodyCol = new THREE.Color(opts.bodyColor);

  const pushVert = (x: number, y: number, z: number, side: number, col: THREE.Color) => {
    positions.push(x, y, z);
    wings.push(side);
    colors.push(col.r, col.g, col.b);
  };

  // A wing is a single triangle: two roots on the body spine (x=0) fanning out to
  // one pointed tip at x=side*span. Material is DoubleSide so winding is moot.
  const pushWing = (side: number, w: WingPair, col: THREE.Color) => {
    pushVert(0, 0, w.rootFront, side, col);
    pushVert(0, 0, w.rootBack, side, col);
    pushVert(side * w.span, 0, w.tipZ, side, col);
  };
  for (const w of opts.wings) {
    const col = w.color !== undefined ? new THREE.Color(w.color) : defaultWingCol;
    pushWing(-1, w, col);
    pushWing(1, w, col);
  }

  // Body: a slim box along Z, aWing=0 (never flaps), body color. 12 tris.
  const hx = bw * 0.5;
  const hy = bw * 0.5;
  const zf = bl * 0.5;
  const zb = -bl * 0.5;
  const corners: [number, number, number][] = [
    [-hx, -hy, zb], [hx, -hy, zb], [hx, hy, zb], [-hx, hy, zb],
    [-hx, -hy, zf], [hx, -hy, zf], [hx, hy, zf], [-hx, hy, zf],
  ];
  const quads = [
    [0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0],
  ];
  for (const [a, b, d, e] of quads) {
    for (const idx of [a, b, d, a, d, e]) {
      pushVert(corners[idx][0], corners[idx][1], corners[idx][2], 0, bodyCol);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('aWing', new THREE.Float32BufferAttribute(wings, 1));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Patch a material's vertex shader to flap wings on the GPU: wings (aWing = ±1)
 * rotate about the forward (+Z) spine by `aWing·sin(uFlapTime·speed + aFlapPhase)
 * ·uFlapAmp·aFlapAmp`. Shared by the vertex-colored (bird) and textured (butterfly)
 * flap materials so the beat math lives in exactly one place.
 */
function patchFlapShader(material: THREE.Material, flapSpeed: number, flapAmp: number): { value: number } {
  const uFlapTime = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFlapTime = uFlapTime;
    shader.uniforms.uFlapSpeed = { value: flapSpeed };
    shader.uniforms.uFlapAmp = { value: flapAmp };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         attribute float aWing;
         attribute float aFlapPhase;
         attribute float aFlapAmp;
         uniform float uFlapTime;
         uniform float uFlapSpeed;
         uniform float uFlapAmp;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         float flapAngle = aWing * sin(uFlapTime * uFlapSpeed + aFlapPhase) * uFlapAmp * aFlapAmp;
         float cf = cos(flapAngle);
         float sf = sin(flapAngle);
         transformed = vec3(transformed.x * cf - transformed.y * sf,
                            transformed.x * sf + transformed.y * cf,
                            transformed.z);`
      );
  };
  return uFlapTime;
}

/**
 * A MeshLambertMaterial (vertex-colored) patched to flap wings in the vertex
 * shader. `flapSpeed` = radians/sec of the beat, `flapAmp` = peak wing rotation
 * (radians) scaled per-instance by aFlapAmp.
 */
export function createFlapMaterial(opts: { flapSpeed: number; flapAmp: number }): FlapMaterial {
  const material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, vertexColors: true });
  const uFlapTime = patchFlapShader(material, opts.flapSpeed, opts.flapAmp);
  return { material, setTime: (s) => { uFlapTime.value = s; } };
}

/**
 * An UNLIT (MeshBasicMaterial) textured flap material — a wing texture with an
 * alpha cutout, so a painted butterfly reads vividly regardless of the dusk light,
 * and the same GPU wing-flap folds it. `map` carries the wing art (alpha = shape).
 */
export function createTexturedFlapMaterial(opts: {
  flapSpeed: number;
  flapAmp: number;
  map: THREE.Texture;
}): FlapMaterial {
  const material = new THREE.MeshBasicMaterial({
    map: opts.map,
    side: THREE.DoubleSide,
    transparent: false,
    alphaTest: 0.5,
  });
  const uFlapTime = patchFlapShader(material, opts.flapSpeed, opts.flapAmp);
  return { material, setTime: (s) => { uFlapTime.value = s; } };
}

/** Attach the per-instance flap buffers (phase + amplitude) to an InstancedMesh. */
export function attachFlapAttrs(mesh: THREE.InstancedMesh, poolSize: number): FlapAttrs {
  const phases = new Float32Array(poolSize);
  const amps = new Float32Array(poolSize); // default 0 = folded until a bird flies
  const phaseAttr = new THREE.InstancedBufferAttribute(phases, 1);
  const ampAttr = new THREE.InstancedBufferAttribute(amps, 1);
  phaseAttr.setUsage(THREE.DynamicDrawUsage);
  ampAttr.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.setAttribute('aFlapPhase', phaseAttr);
  mesh.geometry.setAttribute('aFlapAmp', ampAttr);
  return { phases, amps, phaseAttr, ampAttr };
}
