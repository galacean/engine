import {
  ContentRestorer,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  type Engine
} from "@galacean/engine";

interface OilPaintTextureSet {
  brush: Texture2D;
  noise: Texture2D;
}

const cache = new WeakMap<Engine, OilPaintTextureSet>();

/**
 * Generates a 512x512 seamlessly tileable (toroidal) bold impasto brushstroke texture using
 * opaque painter's-order overpainting (NOT blurry averaging!) so every brushstroke preserves
 * sharp bristle grooves, thick squeezed paint rims, and a distinct broken-color pigment ID.
 *
 * Channels:
 * - R: crisp impasto thickness / height (0..1)
 * - G: horizontal height gradient dH/dx encoded around 0.5
 * - B: vertical height gradient dH/dy encoded around 0.5
 * - A: per-stroke discrete broken-color pigment warmth (0..1)
 */
function createSeamlessImpastoTexture(engine: Engine, size = 512, seed = 42): Texture2D {
  let s = seed >>> 0;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;

  const heightBuf = new Float32Array(size * size);
  const pigmentBuf = new Float32Array(size * size);
  heightBuf.fill(0.35);
  pigmentBuf.fill(0.5);

  // Three dense passes of flat, matte, overlapping oil-brush dabs (matching next-gallery Autumn Wood):
  // clean crisp bristle strokes with ZERO raised pill rims (no plastic outlines!).
  const passes = [
    { count: 240, lenMin: 20, lenMax: 38, widMin: 7, widMax: 13, opacity: 0.96 },
    { count: 340, lenMin: 13, lenMax: 26, widMin: 5, widMax: 9, opacity: 0.98 },
    { count: 320, lenMin: 9, lenMax: 19, widMin: 3.5, widMax: 7, opacity: 1.0 }
  ];

  for (const pass of passes) {
    for (let i = 0; i < pass.count; i++) {
      const cx = rnd() * size;
      const cy = rnd() * size;
      // Organic painterly multi-directional sweep (natural overlapping autumn strokes, never grid-aligned).
      const baseAngle = rnd() < 0.55 ? -0.3 + (rnd() - 0.5) * 1.65 : rnd() * Math.PI * 2;
      const cosA = Math.cos(baseAngle);
      const sinA = Math.sin(baseAngle);
      const halfLen = pass.lenMin + rnd() * (pass.lenMax - pass.lenMin);
      const halfWid = pass.widMin + rnd() * (pass.widMax - pass.widMin);
      const curvature = (rnd() - 0.5) * 0.26;
      const bristleFreq = 2.5 + rnd() * 2.5;
      const bristlePhase = rnd() * Math.PI * 2;
      const strokeHeight = 0.45 + rnd() * 0.52;
      // Full-spectrum discrete pigment ID per dab so every single stroke has its own distinct paint color.
      const strokePigment = rnd();

      const bound = Math.ceil(Math.hypot(halfLen, halfWid) + 3);
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
          if (v < -1.0 || v > 1.0) continue;

          // Flat-brush rounded-rectangle silhouette (squircle) matching real hand-painted oil dabs.
          const u4 = u * u * u * u;
          const v4 = v * v * v * v;
          const sq = u4 * 0.9 + v4 * 1.05;
          if (sq >= 1.0) continue;

          const bristleWave = Math.sin(v * bristleFreq * Math.PI + bristlePhase + u * 0.4);
          const dryTail = u > 0.65 ? (u - 0.65) / 0.35 : 0.0;
          if (dryTail > 0.3 && bristleWave < dryTail * 0.55 - 0.35) continue;

          // Clean flat matte dab edge (no embossed border halo!).
          const edge = Math.min(1.0, (1.0 - sq) / 0.14);
          const mask = edge * edge * (3.0 - 2.0 * edge) * pass.opacity;

          // Subtle flat matte bristle variation along the stroke (ZERO raised sideBead pill rim!).
          const furrow = 0.5 + 0.14 * bristleWave + 0.06 * Math.sin(u * 2.2 + bristlePhase);
          const localHeight = Math.min(1.0, strokeHeight * (0.76 + 0.24 * furrow));

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

  const texture = new Texture2D(engine, size, size, TextureFormat.R8G8B8A8_UNorm, true, false);
  texture.isGCIgnored = true;
  texture.filterMode = TextureFilterMode.Trilinear;
  texture.wrapModeU = TextureWrapMode.Repeat;
  texture.wrapModeV = TextureWrapMode.Repeat;
  texture.anisoLevel = 4;
  const upload = (target: Texture2D) => {
    target.setPixelBuffer(data);
    target.generateMipmaps();
  };
  upload(texture);
  engine.resourceManager.addContentRestorer(
    new (class extends ContentRestorer<Texture2D> {
      override restoreContent(): void {
        upload(this.resource);
      }
    })(texture)
  );
  return texture;
}

function createNoiseTexture(engine: Engine, size = 256, seed = 7): Texture2D {
  let s = seed >>> 0;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const data = new Uint8Array(size * size * 4);
  for (let ch = 0; ch < 4; ch++) {
    const field = new Float32Array(size * size);
    for (const [cells, amp] of [
      [8, 1],
      [16, 0.5],
      [32, 0.25],
      [64, 0.125]
    ]) {
      const lat = new Float32Array(cells * cells);
      for (let i = 0; i < lat.length; i++) lat[i] = rnd();
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const fx = (x / size) * cells;
          const fy = (y / size) * cells;
          const x0 = Math.floor(fx);
          const y0 = Math.floor(fy);
          let tx = fx - x0;
          let ty = fy - y0;
          tx = tx * tx * (3 - 2 * tx);
          ty = ty * ty * (3 - 2 * ty);
          const a = lat[(x0 % cells) + (y0 % cells) * cells];
          const b = lat[((x0 + 1) % cells) + (y0 % cells) * cells];
          const c = lat[(x0 % cells) + ((y0 + 1) % cells) * cells];
          const d = lat[((x0 + 1) % cells) + ((y0 + 1) % cells) * cells];
          field[x + y * size] += amp * (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty);
        }
      }
    }
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of field) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const span = hi - lo || 1;
    for (let i = 0; i < field.length; i++) {
      data[i * 4 + ch] = Math.round(((field[i] - lo) / span) * 255);
    }
  }
  const texture = new Texture2D(engine, size, size, TextureFormat.R8G8B8A8_UNorm, true, false);
  texture.isGCIgnored = true;
  texture.filterMode = TextureFilterMode.Trilinear;
  texture.wrapModeU = TextureWrapMode.Repeat;
  texture.wrapModeV = TextureWrapMode.Repeat;
  const upload = (target: Texture2D) => {
    target.setPixelBuffer(data);
    target.generateMipmaps();
  };
  upload(texture);
  engine.resourceManager.addContentRestorer(
    new (class extends ContentRestorer<Texture2D> {
      override restoreContent(): void {
        upload(this.resource);
      }
    })(texture)
  );
  return texture;
}

/** Returns engine-cached procedural seamless oil-paint impasto and tiling noise textures. */
export function getOilPaintTextures(engine: Engine): OilPaintTextureSet {
  let set = cache.get(engine);
  if (!set || set.brush.destroyed || set.noise.destroyed) {
    set = {
      brush: createSeamlessImpastoTexture(engine),
      noise: createNoiseTexture(engine)
    };
    cache.set(engine, set);
  }
  return set;
}
