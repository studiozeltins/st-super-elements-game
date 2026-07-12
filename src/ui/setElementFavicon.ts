import { ELEMENTS } from '../game/data/elements';

/**
 * Draws the tab icon at runtime: the game's octahedron gem tinted with a
 * RANDOM element color, re-rolled on every page load. Canvas → data URL, so
 * there is no favicon asset to ship and no extra request.
 */
export function setElementFavicon() {
  const palette = Object.values(ELEMENTS);
  const element = palette[Math.floor(Math.random() * palette.length)];

  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const mid = size / 2;
  // Diamond silhouette (the ground-gem octahedron seen straight on).
  ctx.beginPath();
  ctx.moveTo(mid, 3);
  ctx.lineTo(size - 5, mid);
  ctx.lineTo(mid, size - 3);
  ctx.lineTo(5, mid);
  ctx.closePath();
  ctx.fillStyle = element.cssColor;
  ctx.fill();

  // Faceting: a lighter upper-left face and a darker lower-right face give the
  // flat diamond its gem read even at 16×16.
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.moveTo(mid, 3);
  ctx.lineTo(size - 5, mid);
  ctx.lineTo(mid, mid);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(mid, size - 3);
  ctx.lineTo(5, mid);
  ctx.lineTo(mid, mid);
  ctx.closePath();
  ctx.fillStyle = '#000000';
  ctx.globalAlpha = 0.25;
  ctx.fill();
  ctx.globalAlpha = 1;

  // Frost hairline edge keeps the icon crisp against dark tab bars.
  ctx.beginPath();
  ctx.moveTo(mid, 3);
  ctx.lineTo(size - 5, mid);
  ctx.lineTo(mid, size - 3);
  ctx.lineTo(5, mid);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 2;
  ctx.stroke();

  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.type = 'image/png';
  link.href = canvas.toDataURL('image/png');
}
