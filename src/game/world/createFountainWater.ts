import * as THREE from 'three';

/**
 * Static pond water for the fountain. A translucent ShaderMaterial: a fresnel term
 * reflects the SKY (grazing angles = more sky, straight down = deeper water) over a
 * still, faintly textured blue surface. NO animation — it's a calm pond, not a
 * stream. The sky colors are uniforms the day/night cycle drives, so the pool is
 * bright by day and dark blue by night, matching the sky dome.
 */
export interface FountainWater {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
}

const VERT = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uSkyTop;
  uniform vec3 uHorizon;
  uniform vec3 uDeep;
  varying vec3 vWorldPos;
  float phash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float a = phash(i), b = phash(i + vec2(1.0, 0.0));
    float c = phash(i + vec2(0.0, 1.0)), d = phash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  void main() {
    // Still surface: a fixed, faint normal wobble from static noise (no time).
    vec2 q = vWorldPos.xz * 3.0;
    float h = vnoise(q);
    vec3 nrm = normalize(vec3((vnoise(q + vec2(0.15, 0.0)) - h) * 0.5, 1.0,
                             (vnoise(q + vec2(0.0, 0.15)) - h) * 0.5));
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fres = pow(1.0 - max(dot(nrm, viewDir), 0.0), 3.0);
    vec3 sky = mix(uHorizon, uSkyTop, clamp(fres, 0.0, 1.0));
    vec3 col = mix(uDeep, sky, clamp(fres + 0.3, 0.0, 1.0));
    col = mix(col, vec3(0.11, 0.35, 0.58), 0.5); // keep it clearly blue, never muddy
    gl_FragColor = vec4(col, 0.85);              // translucent
  }
`;

export function createFountainWater(radius: number): FountainWater {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSkyTop: { value: new THREE.Color(0x3f86d6) },
      uHorizon: { value: new THREE.Color(0x9fd3ee) },
      uDeep: { value: new THREE.Color(0x123a5a) },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
  });
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), material);
  mesh.rotation.x = -Math.PI / 2;
  return { mesh, material };
}
