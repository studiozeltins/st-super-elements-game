import * as THREE from 'three';

/**
 * Procedural blue-morpho butterfly texture painted to a canvas — a top-down view
 * (two forewings + two hindwings + body + antennae) with a transparent background
 * so the wing SHAPE comes from alpha (the material cuts out with alphaTest). Drawn
 * once at construction, cached as a CanvasTexture; no per-frame cost. License-clean
 * (our own art), matches the requested morpho: iridescent blue graded to a dark rim
 * with pale edge flecks and a couple of hindwing eyespots.
 */
export function createButterflyTexture(): THREE.CanvasTexture {
  const SIZE = 256;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const g = canvas.getContext('2d');
  // Headless (jsdom test env) has no 2D context — return a blank texture so the
  // factory still constructs; the drawing only matters in a real browser.
  if (!g) {
    const blank = new THREE.CanvasTexture(canvas);
    blank.colorSpace = THREE.SRGBColorSpace;
    return blank;
  }
  g.clearRect(0, 0, SIZE, SIZE);

  const cx = SIZE / 2;
  const cy = SIZE / 2;

  // Iridescent blue fill, bright near the body, deepening to a near-black rim.
  const grad = g.createRadialGradient(cx, cy, 4, cx, cy, SIZE * 0.5);
  grad.addColorStop(0.0, '#cfefff');
  grad.addColorStop(0.25, '#5bb8ff');
  grad.addColorStop(0.55, '#1f6fe6');
  grad.addColorStop(0.82, '#123a9c');
  grad.addColorStop(1.0, '#0a1c52');

  /** Draw one wing lobe as a rounded quad-curve blob, mirrored by `sx` (±1). */
  const lobe = (sx: number, pts: [number, number][]): void => {
    g.beginPath();
    g.moveTo(cx + sx * pts[0][0], cy + pts[0][1]);
    for (let i = 1; i < pts.length; i += 1) {
      const [x, y] = pts[i];
      const [px, py] = pts[i - 1];
      const mx = (px + x) / 2;
      const my = (py + y) / 2;
      g.quadraticCurveTo(cx + sx * px, cy + py, cx + sx * mx, cy + my);
    }
    g.closePath();
    g.fillStyle = grad;
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(6,10,40,0.85)';
    g.stroke();
  };

  // Forewing (upper) + hindwing (lower) outlines, both sides.
  for (const sx of [-1, 1]) {
    lobe(sx, [
      [4, -14], [46, -96], [104, -74], [96, -20], [40, -6], [4, -14],
    ]);
    lobe(sx, [
      [4, 8], [40, 30], [92, 58], [70, 104], [26, 92], [6, 40], [4, 8],
    ]);
  }

  // Pale edge flecks along the forewing rim + a hindwing eyespot per side.
  for (const sx of [-1, 1]) {
    g.fillStyle = 'rgba(220,240,255,0.9)';
    for (const [ox, oy, r] of [[92, -70, 4], [78, -44, 3], [100, -46, 3]] as const) {
      g.beginPath();
      g.ellipse(cx + sx * ox, cy + oy, r, r, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.ellipse(cx + sx * 56, cy + 78, 7, 9, 0, 0, Math.PI * 2);
    g.fillStyle = '#0a1740';
    g.fill();
    g.beginPath();
    g.ellipse(cx + sx * 56, cy + 78, 3, 4, 0, 0, Math.PI * 2);
    g.fillStyle = '#7fd0ff';
    g.fill();
  }

  // Body: a slim dark spindle down the spine, with a rounded head.
  g.fillStyle = '#0e1016';
  g.beginPath();
  g.ellipse(cx, cy + 6, 7, 60, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(cx, cy - 58, 9, 11, 0, 0, Math.PI * 2);
  g.fill();

  // Antennae: two thin curves with clubbed tips.
  g.strokeStyle = '#0e1016';
  g.lineWidth = 2.5;
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx, cy - 66);
    g.quadraticCurveTo(cx + sx * 16, cy - 96, cx + sx * 26, cy - 108);
    g.stroke();
    g.beginPath();
    g.ellipse(cx + sx * 26, cy - 108, 3, 3, 0, 0, Math.PI * 2);
    g.fillStyle = '#0e1016';
    g.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 1;
  return tex;
}
