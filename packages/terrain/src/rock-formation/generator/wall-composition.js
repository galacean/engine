import { makeConstrainedRockOutline } from "./outline.js";

const TAU = Math.PI * 2;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const mix = (a, b, t) => a + (b - a) * t;
function random(seed, index) {
  let x = (seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
}

/** Compose the accepted 2D contours as overlapping, inclined rock faces.
 * The outside continuation is a supporting cut plane; all faces share one body.
 * Strength multiplies the resulting depth, rather than moving masses into a clip.
 */
export function createWallComposition(p, width, height) {
  const length = clamp(p.wallLength ?? 1.6, 0.5, 3),
    lengthFraction = (length - 0.5) / 2.5;
  const inclination = (clamp(p.wallTilt ?? 8, -35, 35) * Math.PI) / 180;
  const protrusion = clamp(p.wallProtrusion ?? 0);
  const shapes = [],
    rows = Math.max(1, Math.round(Math.sqrt((p.wallCount * height) / (width * 1.6))));
  let id = 0;
  for (let row = 0; row < rows; row++) {
    const count = Math.floor(p.wallCount / rows) + (row < p.wallCount % rows ? 1 : 0);
    const cellWidth = width / count,
      cellHeight = height / rows;
    for (let column = 0; column < count; column++, id++) {
      const seed = p.seed + id * 919,
        rnd = (index) => random(seed, index + 700);
      // Original accepted rules: aspect in [1,3], coverage=1, corner round=.06,
      // at least one nonzero notch, and the original .06 angle window.
      const widthMin = cellWidth * 0.62,
        widthMax = cellWidth * 1.48;
      const lengthMin = Math.max(cellHeight * 0.25, widthMax / 3),
        lengthMax = Math.min(cellHeight * 0.95, widthMin * 3);
      const targetWidth = mix(widthMin, widthMax, p.wallOverlap),
        targetLength = mix(lengthMin, lengthMax, lengthFraction);
      const horizontal = targetWidth > targetLength;
      const targetAspect = horizontal ? targetWidth / targetLength : targetLength / targetWidth;
      const parameters = {
        seed,
        aspect: clamp(targetAspect, 1, 3),
        taper: (rnd(2) - 0.5) * 0.6,
        cut: 0.12 + 0.17 * rnd(3),
        coverage: 1,
        wave: 0.035 + 0.055 * rnd(4),
        scale: 0.17 + 0.16 * rnd(5),
        chip: 0.004 + 0.009 * rnd(6),
        fineScale: 0.04 + 0.05 * rnd(7),
        notches: 1 + Math.floor(rnd(8) * 3),
        notchWidth: 0.04 + 0.07 * rnd(9),
        notchDepth: 0.025 + 0.065 * rnd(10)
      };
      let outline = makeConstrainedRockOutline(parameters);
      const extent = (contour) => {
        const xs = contour.map((p) => p[0]),
          ys = contour.map((p) => p[1]);
        return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
      };
      // Re-author aspect before validation, never stretch an accepted contour.
      // Uniform scale plus a quarter-turn gives independent physical width/length.
      for (let iteration = 0; iteration < 2; iteration++) {
        const [w, h] = extent(outline.contour),
          next = clamp((parameters.aspect * targetAspect) / (h / w), 1, 3);
        if (Math.abs(next - parameters.aspect) < 0.01) break;
        parameters.aspect = next;
        outline = makeConstrainedRockOutline(parameters);
      }
      const contour = outline.contour,
        [contourWidth, contourHeight] = extent(contour);
      const size = Math.sqrt((targetWidth * targetLength) / (contourWidth * contourHeight));
      const angle = inclination + (horizontal ? Math.PI / 2 : 0);
      const c = Math.cos(angle),
        s = Math.sin(angle);
      const u = (column + 0.5 + (row % 2) * 0.42 + (rnd(13) - 0.5) * 0.2) * cellWidth;
      const v = -height / 2 + (row + 0.5) * cellHeight + (rnd(14) - 0.5) * cellHeight * 0.72;
      const level = (id % 3) * 0.28 + 0.15 * rnd(15);
      const points = contour.map(([x, y]) => [u + size * (x * c - y * s), v + size * (x * s + y * c)]);
      shapes.push({
        id,
        u,
        v,
        size,
        c,
        s,
        level,
        targetWidth,
        targetLength,
        rise: 0.45 + 0.55 * rnd(18),
        bevel: Math.max(0.06, Math.min(targetWidth, targetLength) * 0.18),
        slopeU: (rnd(16) - 0.5) * 0.2,
        slopeV: (rnd(17) - 0.5) * 0.24,
        radii: contour.map((point) => Math.hypot(...point)),
        points,
        angles: outline.stats.angles
      });
    }
  }
  function sampleShape(shape, u, y) {
    const du = ((((u - shape.u) % width) + width * 1.5) % width) - width * 0.5,
      dv = y - shape.v;
    const x = (du * shape.c + dv * shape.s) / shape.size;
    const z = (-du * shape.s + dv * shape.c) / shape.size;
    const turn = ((Math.atan2(z, x) / TAU + 1) % 1) * shape.radii.length;
    const index = Math.floor(turn),
      boundary = mix(shape.radii[index], shape.radii[(index + 1) % shape.radii.length], turn - index);
    return { distance: (Math.hypot(x, z) - boundary) * shape.size, tilt: shape.slopeU * du + shape.slopeV * dv };
  }
  function depth(u, y) {
    let value = 1;
    for (const shape of shapes) {
      const { distance, tilt } = sampleShape(shape, u, y);
      // Upper envelope of the inclined faces: overlaps expose partial outlines
      // and T-junctions, not the complete rim of an inserted independent mesh.
      value = Math.min(value, shape.level + tilt + Math.max(0, distance) * 0.85);
    }
    return clamp(value) * p.wallStrength;
  }
  function relief(u, y) {
    if (!protrusion) return 0;
    let value = 0;
    for (const shape of shapes) {
      const { distance, tilt } = sampleShape(shape, u, y);
      // A broad inclined face with a short, tangent-continuous edge transition.
      // Taking the outer envelope combines volumes without independent meshes.
      const edge = clamp(-distance / shape.bevel);
      const amount = clamp(shape.rise + tilt, 0.2, 1) * edge * edge * (3 - 2 * edge);
      value = Math.max(value, amount);
    }
    return value * protrusion * 1.8;
  }
  return {
    depth,
    relief,
    composition: {
      width,
      height,
      shapes: shapes.map(({ id, points, level, angles, targetWidth, targetLength }) => ({
        id,
        points,
        level,
        angles,
        targetWidth,
        targetLength
      }))
    }
  };
}
