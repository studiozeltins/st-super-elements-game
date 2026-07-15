import * as THREE from 'three';

/**
 * Animated fountain water. A ShaderMaterial that fakes a water surface: moving
 * ripples perturb a normal, a fresnel term reflects the SKY (grazing angles = more
 * sky, looking straight down = deeper water), and wave crests sparkle. The sky
 * colors are uniforms the day/night cycle drives, so the pool brightens by day and
 * goes dark blue by night — it reflects the same sky the dome shows. Ripples share
 * the wind clock's time uniform (advanced by the game loop), so it costs nothing
 * extra to animate. No render-to-texture, so no real character reflection.
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
  uniform float uTime;
  uniform vec3 uSkyTop;
  uniform vec3 uHorizon;
  uniform vec3 uDeep;
  varying vec3 vWorldPos;
  float wave(vec2 p, float t) {
    return sin(p.x * 1.5 + t * 1.3) + sin(p.y * 1.7 - t * 1.05) + sin((p.x + p.y) * 1.1 + t * 0.7);
  }
  // Coarse swell + a finer faster ripple layer, both animated → visible flow.
  float surface(vec2 p, float t) {
    return wave(p, t) + 0.5 * wave(p * 2.3 + vec2(t * 0.4, -t * 0.3), t * 1.8);
  }
  void main() {
    vec2 p = vWorldPos.xz * 2.5;
    float t = uTime;
    float e = 0.18;
    float h = surface(p, t);
    // Stronger normal perturbation so the moving ripples clearly shimmer the sky.
    vec3 nrm = normalize(vec3(-(surface(p + vec2(e, 0.0), t) - h) * 0.32, 1.0,
                             -(surface(p + vec2(0.0, e), t) - h) * 0.32));
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fres = pow(1.0 - max(dot(nrm, viewDir), 0.0), 3.0);
    vec3 sky = mix(uHorizon, uSkyTop, clamp(fres, 0.0, 1.0));
    vec3 col = mix(uDeep, sky, clamp(fres + 0.35, 0.0, 1.0));
    // Drifting sparkle crests — the flow you can see moving across the surface.
    float spark = smoothstep(2.3, 2.85, surface(p * 1.6 + vec2(t * 0.5, 0.0), t * 1.5));
    col += spark * 0.3;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createFountainWater(
  radius: number,
  timeUniform: { value: number }
): FountainWater {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: timeUniform,
      uSkyTop: { value: new THREE.Color(0x3f86d6) },
      uHorizon: { value: new THREE.Color(0x9fd3ee) },
      uDeep: { value: new THREE.Color(0x123a4a) },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), material);
  mesh.rotation.x = -Math.PI / 2;
  return { mesh, material };
}
