export const OIL_PAINT_BRUSH_DEFAULT_SIZE = 512;
export const OIL_PAINT_BRUSH_DEFAULT_SEED = 42;

/** Toroidal periodic curl-like flow field so swirling strokes wrap seamlessly across tile borders. */
function sampleToroidalSwirlAngle(cx: number, cy: number, size: number): number {
  const twoPi = Math.PI * 2;
  const nx = (cx / size) * twoPi;
  const ny = (cy / size) * twoPi;
  // Divergence-free periodic streamfunction psi(x,y) -> velocity (dPsi/dy, -dPsi/dx).
  const vx = Math.cos(ny) * Math.sin(nx) + 0.55 * Math.cos(2.0 * ny - nx + 0.7) + 0.3 * Math.sin(nx + ny + 1.3);
  const vy = -Math.sin(ny) * Math.cos(nx) + 0.55 * Math.cos(2.0 * nx + ny - 0.4) - 0.3 * Math.sin(nx + ny + 1.3);
  return Math.atan2(vy, vx);
}

/** Toroidal periodic low-frequency pigment cluster field so nearby strokes form cohesive painterly color zones. */
function sampleToroidalPigmentCluster(cx: number, cy: number, size: number): number {
  const twoPi = Math.PI * 2;
  const nx = (cx / size) * twoPi;
  const ny = (cy / size) * twoPi;
  const wave =
    0.45 * Math.sin(nx + 0.4) * Math.cos(ny - 0.3) +
    0.32 * Math.sin(2.0 * nx - ny + 1.1) +
    0.23 * Math.cos(nx + 2.0 * ny - 0.8);
  return Math.max(0.0, Math.min(1.0, wave * 0.5 + 0.5));
}

/**
 * Generates a seamlessly tileable (toroidal) Van Gogh swirling-ribbon impasto brushstroke
 * RGBA8 pixel buffer using opaque painter's-order overpainting (NOT blurry averaging) so every
 * stroke preserves crisp parallel bristle tracks and cohesive clustered broken-color zones.
 *
 * Pure CPU computation with zero `@galacean/engine` imports so it runs identically inside
 * `OilPaintBrush.worker.ts`, tests, and non-Worker fallback environments.
 *
 * Channels:
 * - R: crisp impasto thickness / height (0..1)
 * - G: horizontal height gradient dH/dx encoded around 0.5
 * - B: vertical height gradient dH/dy encoded around 0.5
 * - A: per-stroke clustered broken-color pigment warmth (0..1)
 */
export function generateSeamlessImpastoPixels(
  size = OIL_PAINT_BRUSH_DEFAULT_SIZE,
  seed = OIL_PAINT_BRUSH_DEFAULT_SEED
): Uint8Array {
  let s = seed >>> 0;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;

  const heightBuf = new Float32Array(size * size);
  const pigmentBuf = new Float32Array(size * size);
  heightBuf.fill(0.35);
  pigmentBuf.fill(0.5);

  // Three dense passes of flowing, curved swirling-ribbon oil brushstrokes (coarse -> medium -> fine).
  const passes = [
    { count: 220, lenMin: 30, lenMax: 52, widMin: 5.5, widMax: 9.5, opacity: 0.96 },
    { count: 320, lenMin: 21, lenMax: 38, widMin: 4.0, widMax: 7.2, opacity: 0.98 },
    { count: 330, lenMin: 14, lenMax: 26, widMin: 2.8, widMax: 5.4, opacity: 1.0 }
  ];

  for (const pass of passes) {
    for (let i = 0; i < pass.count; i++) {
      const cx = rnd() * size;
      const cy = rnd() * size;
      const baseAngle = sampleToroidalSwirlAngle(cx, cy, size) + (rnd() - 0.5) * 0.32;
      const cosA = Math.cos(baseAngle);
      const sinA = Math.sin(baseAngle);
      const halfLen = pass.lenMin + rnd() * (pass.lenMax - pass.lenMin);
      const halfWid = pass.widMin + rnd() * (pass.widMax - pass.widMin);
      const curvature = (rnd() < 0.5 ? -1 : 1) * (0.28 + rnd() * 0.34);
      const bristleFreq = 3.2 + rnd() * 3.0;
      const bristlePhase = rnd() * Math.PI * 2;
      const strokeHeight = 0.45 + rnd() * 0.52;
      // Spatially clustered pigment ID (68% low-frequency painterly zone + 32% per-dab variation) to avoid confetti noise.
      const strokePigment = Math.max(
        0.0,
        Math.min(1.0, sampleToroidalPigmentCluster(cx, cy, size) * 0.68 + rnd() * 0.32)
      );

      const bound = Math.ceil(Math.hypot(halfLen, halfWid) + 4);
      const minX = Math.floor(cx - bound);
      const maxX = Math.ceil(cx + bound);
      const minY = Math.floor(cy - bound);
      const maxY = Math.ceil(cy + bound);

      for (let py = minY; py <= maxY; py++) {
        const dy = py - cy;
        const wy = ((py % size) + size) % size;
        const rowOffset = wy * size;
        for (let px = minX; px <= maxX; px++) {
          const dx = px - cx;
          const u = (dx * cosA + dy * sinA) / halfLen;
          if (u < -1.0 || u > 1.0) continue;
          const rawV = (-dx * sinA + dy * cosA) / halfWid;
          const v = rawV - curvature * (u * u - 0.35);
          if (v < -1.05 || v > 1.05) continue;

          // Flowing Van Gogh curved ribbon stroke with tapered tips and crisp parallel bristle grooves.
          const ribbonWidth = Math.max(0.28, 1.0 - 0.55 * u * u);
          const nv = v / ribbonWidth;
          const shape = u * u * 0.96 + nv * nv * nv * nv * 1.04;
          if (shape >= 1.0) continue;

          const bristleWave = Math.sin(nv * bristleFreq * Math.PI + bristlePhase + u * 0.85);
          const dryTail = u > 0.6 ? (u - 0.6) / 0.4 : 0.0;
          if (dryTail > 0.25 && bristleWave < dryTail * 0.65 - 0.3) continue;

          const edge = Math.min(1.0, (1.0 - shape) / 0.14);
          const mask = edge * edge * (3.0 - 2.0 * edge) * pass.opacity;

          // Pronounced parallel impasto tracks following the swirling ribbon curve.
          const track = 0.5 + 0.24 * bristleWave + 0.08 * Math.sin(u * 3.1 + bristlePhase);
          const localHeight = Math.min(1.0, strokeHeight * (0.68 + 0.32 * track));

          const wx = ((px % size) + size) % size;
          const idx = rowOffset + wx;
          heightBuf[idx] = heightBuf[idx] * (1.0 - mask) + localHeight * mask;
          if (mask > 0.3) {
            pigmentBuf[idx] = strokePigment;
          }
        }
      }
    }
  }

  // Normalize height to full [0.02, 0.98] range.
  let minH = Infinity;
  let maxH = -Infinity;
  for (let i = 0; i < heightBuf.length; i++) {
    const h = heightBuf[i];
    if (h < minH) minH = h;
    if (h > maxH) maxH = h;
  }
  const invSpan = 1.0 / (maxH - minH || 1.0);
  for (let i = 0; i < heightBuf.length; i++) {
    heightBuf[i] = 0.02 + (heightBuf[i] - minH) * invSpan * 0.96;
  }

  // Pack R=height, G=dH/dx, B=dH/dy, A=pigmentIndex with gentle matte brushstroke relief.
  const data = new Uint8Array(size * size * 4);
  const gradScale = 0.85;
  for (let y = 0; y < size; y++) {
    const ym = ((y - 1 + size) % size) * size;
    const y0 = y * size;
    const yp = ((y + 1) % size) * size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const h = heightBuf[y0 + x];
      const gx = (heightBuf[y0 + xp] - heightBuf[y0 + xm]) * gradScale;
      const gy = (heightBuf[yp + x] - heightBuf[ym + x]) * gradScale;
      const out = (y0 + x) * 4;
      data[out] = Math.round(Math.max(0, Math.min(1, h)) * 255);
      data[out + 1] = Math.round(Math.max(0, Math.min(1, gx * 0.5 + 0.5)) * 255);
      data[out + 2] = Math.round(Math.max(0, Math.min(1, gy * 0.5 + 0.5)) * 255);
      data[out + 3] = Math.round(Math.max(0, Math.min(1, pigmentBuf[y0 + x])) * 255);
    }
  }

  return data;
}
