import { random } from "../../../ridge-utils.mjs";
import { growStructure, massFrame } from "./plan.mjs";
const GRID = 22;
function bits() {
  return new Uint32Array(Math.ceil((GRID * GRID) / 32));
}
function set(mask, index) {
  mask[index >>> 5] |= 1 << (index & 31);
}
function pop(v) {
  v -= (v >>> 1) & 0x55555555;
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

// Three silhouettes of the union of rounded mass envelopes, sampled before
// expensive atom carving. Fixed physical coordinates retain height/width cues;
// the three views prevent accepting merely rotated copies of one side profile.
export function structureSignature(plan) {
  const views = [bits(), bits(), bits()];
  let xx = 0,
    xz = 0,
    zz = 0;
  for (const m of plan.masses) {
    const axes = massFrame(m),
      weight = m.size.reduce((a, b) => a * b, 1);
    xx += weight * (m.center[0] ** 2 + axes.reduce((sum, a, i) => sum + (a[0] * m.size[i]) ** 2 / 12, 0));
    zz += weight * (m.center[2] ** 2 + axes.reduce((sum, a, i) => sum + (a[2] * m.size[i]) ** 2 / 12, 0));
    xz +=
      weight * (m.center[0] * m.center[2] + axes.reduce((sum, a, i) => sum + (a[0] * a[2] * m.size[i] ** 2) / 12, 0));
  }
  const angle = 0.5 * Math.atan2(2 * xz, xx - zz),
    c = Math.cos(angle),
    s = Math.sin(angle),
    rotate = (p) => [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]];
  // Align the principal footprint axis before scoring: a yaw change alone is
  // not a new archetype. Mirror-equivalent projections are matched below.
  const prepared = plan.masses.map((m) => ({ ...m, center: rotate(m.center), axes: massFrame(m).map(rotate) }));
  let filled = 0;
  for (let y = 0; y < GRID; y++)
    for (let z = 0; z < GRID; z++)
      for (let x = 0; x < GRID; x++) {
        const p = [((x + 0.5) / GRID) * 128 - 64, ((y + 0.5) / GRID) * 60, ((z + 0.5) / GRID) * 128 - 64];
        const hit = prepared.some((m) => {
          const delta = p.map((v, d) => v - m.center[d]);
          let norm = 0;
          for (let axis = 0; axis < 3; axis++) {
            const a = m.axes[axis],
              q = (2 * (a[0] * delta[0] + a[1] * delta[1] + a[2] * delta[2])) / m.size[axis];
            norm += q ** 4;
            if (norm > 1) return false;
          }
          return true;
        });
        if (hit) {
          filled++;
          set(views[0], y * GRID + x);
          set(views[1], y * GRID + z);
          set(views[2], z * GRID + x);
        }
      }
  const flip = (mask, flipX, flipY) => {
    const result = bits();
    for (let y = 0; y < GRID; y++)
      for (let x = 0; x < GRID; x++) {
        const index = y * GRID + x;
        if (mask[index >>> 5] & (1 << (index & 31)))
          set(result, (flipY ? GRID - 1 - y : y) * GRID + (flipX ? GRID - 1 - x : x));
      }
    return Array.from(result);
  };
  // PCA has a 180-degree sign ambiguity. Compare coherent reflections of the
  // whole 3D form, including both axes of the top view, not independent images.
  const reflections = [0, 1, 2, 3].map((sign) => [
    flip(views[0], sign & 1, false),
    flip(views[1], sign & 2, false),
    flip(views[2], sign & 1, sign & 2)
  ]);
  return { views: views.map((v) => Array.from(v)), reflections, filled };
}
export function structureDistance(a, b) {
  return Math.min(
    ...b.reflections.map((reflection) => {
      let distance = 0;
      for (let view = 0; view < 3; view++) {
        const other = reflection[view];
        let intersection = 0,
          union = 0;
        for (let i = 0; i < a.views[view].length; i++) {
          intersection += pop(a.views[view][i] & other[i]);
          union += pop(a.views[view][i] | other[i]);
        }
        distance += 1 - intersection / Math.max(1, union);
      }
      return distance / 3;
    })
  );
}

// Select examples by geometry, not by a list of archetype names. Deterministic
// farthest-point selection keeps a ten-example set deliberately spread out.
export function generateStructureExamples(inputSeed, count = 10, candidateCount = 64) {
  if (!Number.isInteger(count) || count < 1 || count > 16) throw new RangeError("Example count must be 1–16");
  if (!Number.isInteger(candidateCount) || candidateCount < count || candidateCount > 256)
    throw new RangeError("Candidate count must be an integer between example count and 256");
  const seed = Number(inputSeed) >>> 0,
    rng = random(seed, "structure-examples-1"),
    candidates = [],
    seen = new Set();
  for (let i = 0; i < candidateCount; i++) {
    const exampleSeed = Math.floor(rng() * 4294967296),
      plan = growStructure(exampleSeed),
      signature = structureSignature(plan);
    if (signature.filled && !seen.has(exampleSeed)) {
      candidates.push({ seed: exampleSeed, signature });
      seen.add(exampleSeed);
    }
  }
  if (candidates.length < count) throw new Error("Not enough non-empty structures in candidate pool");
  const selected = [candidates.shift()];
  while (selected.length < count) {
    let best = -1,
      score = -Infinity;
    for (let i = 0; i < candidates.length; i++) {
      const separation = Math.min(...selected.map((s) => structureDistance(candidates[i].signature, s.signature)));
      if (separation > score) {
        best = i;
        score = separation;
      }
    }
    selected.push({ ...candidates.splice(best, 1)[0], separation: score });
  }
  let minimumSeparation = 1;
  for (let i = 0; i < selected.length; i++)
    for (let j = i + 1; j < selected.length; j++)
      minimumSeparation = Math.min(minimumSeparation, structureDistance(selected[i].signature, selected[j].signature));
  return { seed, candidateCount, minimumSeparation, examples: selected.map((s, index) => ({ index, seed: s.seed })) };
}
