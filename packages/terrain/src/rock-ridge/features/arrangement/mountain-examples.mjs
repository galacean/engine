import { random } from "../../ridge-utils.mjs";
import { createRidgeEnvelope } from "./ridge.mjs";
import { createMountainProfile, MOUNTAIN_PROFILE_SOURCE } from "./mountain-profile.mjs";

const GRID = 32;
const bits = () => new Uint32Array(Math.ceil((GRID * GRID) / 32));
const set = (mask, index) => {
  mask[index >>> 5] |= 1 << (index & 31);
};
function pop(v) {
  v -= (v >>> 1) & 0x55555555;
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

// Compare the same descending ridge envelope consumed by the rock fitter.
// All columns extend to the ground: openings and detached islands are not a
// source of diversity for this mountain-only domain.
export function mountainSignature(source, plan) {
  const { direct, ground } = createRidgeEnvelope(source, plan),
    views = [bits(), bits(), bits()];
  let weight = 0,
    cx = 0,
    cz = 0;
  for (const n of plan.nodes) {
    const w = Math.max(1, n.y - ground(n.position[0], n.position[2]));
    weight += w;
    cx += n.position[0] * w;
    cz += n.position[2] * w;
  }
  cx /= weight;
  cz /= weight;
  let xx = 0,
    xz = 0,
    zz = 0;
  for (const n of plan.nodes) {
    const x = n.position[0] - cx,
      z = n.position[2] - cz,
      w = Math.max(1, n.y - ground(n.position[0], n.position[2]));
    xx += x * x * w;
    xz += x * z * w;
    zz += z * z * w;
  }
  const angle = 0.5 * Math.atan2(2 * xz, xx - zz),
    c = Math.cos(angle),
    s = Math.sin(angle);
  let filled = 0;
  for (let z = 0; z < GRID; z++)
    for (let x = 0; x < GRID; x++) {
      const px = ((x + 0.5) / GRID) * 136 - 68,
        pz = ((z + 0.5) / GRID) * 136 - 68,
        wx = cx + c * px - s * pz,
        wz = cz + s * px + c * pz;
      const floor = ground(wx, wz);
      if (!Number.isFinite(floor)) continue;
      const height = direct(wx, wz).height - floor;
      if (!Number.isFinite(height) || height < 1.4) continue;
      const top = Math.min(GRID, Math.ceil((height / 60) * GRID));
      set(views[2], z * GRID + x);
      filled += top;
      for (let y = 0; y < top; y++) {
        set(views[0], y * GRID + x);
        set(views[1], y * GRID + z);
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
  // Match coherent reflections to remove the sign ambiguity of the principal
  // axis. A rotation alone must not count as a new mountain profile.
  const reflections = [0, 1, 2, 3].map((sign) => [
    flip(views[0], sign & 1, false),
    flip(views[1], sign & 2, false),
    flip(views[2], sign & 1, sign & 2)
  ]);
  return { views: views.map((v) => Array.from(v)), reflections, filled };
}
export function mountainDistance(a, b) {
  return Math.min(
    ...b.reflections.map((reflection) => {
      let distance = 0;
      for (let view = 0; view < 3; view++) {
        let intersection = 0,
          union = 0;
        for (let i = 0; i < a.views[view].length; i++) {
          intersection += pop(a.views[view][i] & reflection[view][i]);
          union += pop(a.views[view][i] | reflection[view][i]);
        }
        distance += 1 - intersection / Math.max(1, union);
      }
      return distance / 3;
    })
  );
}

// All candidates come from one mountain profile family. The set is selected
// from runtime seeds, never a catalogue of ten stored arrangements or types.
export function generateMountainExamples(inputSeed, count = 10, candidateCount = 64) {
  if (!Number.isInteger(count) || count < 1 || count > 16) throw new RangeError("Example count must be 1–16");
  if (!Number.isInteger(candidateCount) || candidateCount < count || candidateCount > 256)
    throw new RangeError("Candidate count must be an integer between example count and 256");
  const seed = Number(inputSeed) >>> 0,
    r = random(seed, "mountain-examples-1"),
    candidates = [],
    seen = new Set();
  for (let i = 0; i < candidateCount; i++) {
    const exampleSeed = Math.floor(r() * 4294967296),
      plan = createMountainProfile(MOUNTAIN_PROFILE_SOURCE, exampleSeed),
      signature = mountainSignature(MOUNTAIN_PROFILE_SOURCE, plan);
    if (signature.filled && !seen.has(exampleSeed)) {
      candidates.push({ seed: exampleSeed, signature, profile: plan.profile });
      seen.add(exampleSeed);
    }
  }
  if (candidates.length < count) throw new Error("Not enough non-empty mountains in candidate pool");
  const selected = [candidates.shift()];
  while (selected.length < count) {
    let best = -1,
      score = -Infinity;
    for (let i = 0; i < candidates.length; i++) {
      const separation = Math.min(...selected.map((s) => mountainDistance(candidates[i].signature, s.signature)));
      if (separation > score) {
        best = i;
        score = separation;
      }
    }
    selected.push(candidates.splice(best, 1)[0]);
  }
  let minimumSeparation = 1;
  for (let i = 0; i < selected.length; i++)
    for (let j = i + 1; j < selected.length; j++)
      minimumSeparation = Math.min(minimumSeparation, mountainDistance(selected[i].signature, selected[j].signature));
  return {
    seed,
    candidateCount,
    minimumSeparation,
    examples: selected.map((s, index) => ({
      index,
      seed: s.seed,
      atomicSeed: seed,
      profile: s.profile
    }))
  };
}
