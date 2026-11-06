/**
 * Limit relief relative to the guide-projected network, not its flat X/Z tile.
 * A small inset can cross a steep heightfield face and otherwise move a vertex
 * several metres vertically before the normal/depth displacement even runs.
 */
export function constrainCellularDisplacement(
  positions: Float32Array,
  projected: Float32Array,
  indices: Uint32Array,
  unitScale: number
): number {
  const count = positions.length / 3;
  const magnitude = new Float64Array(count);
  const weight = new Float64Array(count);
  // Source relief uses fractions of one module unit. Keep that world-scaled
  // distance as the displacement ceiling, independent of OBB height/slope.
  const maxOffset = unitScale;
  // Joint walls have almost coincident projected vertices. A finite allowance
  // retains their depth instead of welding the two sides back together.
  const jointAllowance = unitScale * 0.5;
  for (let i = 0; i < count; i++) {
    const k = i * 3;
    const distance = Math.hypot(
      positions[k] - projected[k],
      positions[k + 1] - projected[k + 1],
      positions[k + 2] - projected[k + 2]
    );
    magnitude[i] = distance;
    weight[i] = distance > maxOffset ? maxOffset / distance : 1;
  }
  for (let face = 0; face < indices.length; face += 3) {
    for (let corner = 0; corner < 3; corner++) {
      const a = indices[face + corner],
        b = indices[face + ((corner + 1) % 3)];
      const combined = magnitude[a] + magnitude[b];
      if (combined <= jointAllowance) continue;
      const ai = a * 3,
        bi = b * 3;
      const length = Math.hypot(
        projected[ai] - projected[bi],
        projected[ai + 1] - projected[bi + 1],
        projected[ai + 2] - projected[bi + 2]
      );
      const budget = Math.max(length, jointAllowance);
      if (combined <= budget) continue;
      const factor = budget / combined;
      weight[a] = Math.min(weight[a], factor);
      weight[b] = Math.min(weight[b], factor);
    }
  }
  // All factors are computed from the same input. Taking each vertex's minimum
  // guarantees |dA| + |dB| <= edge budget after *all* neighboring limits apply.
  // Thus final edge length <= projected length + budget, without an iterative
  // relaxation pass, changed connectivity, or extra heightfield evaluations.
  let constrained = 0;
  for (let i = 0; i < count; i++) {
    if (weight[i] === 1) continue;
    constrained++;
    for (let axis = 0; axis < 3; axis++) {
      const k = i * 3 + axis;
      positions[k] = projected[k] + (positions[k] - projected[k]) * weight[i];
    }
  }
  return constrained;
}
