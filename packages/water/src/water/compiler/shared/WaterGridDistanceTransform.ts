/** Scratch buffers are local to a compilation and reused across all rows, columns and site lattices. */
export class WaterGridDistanceWorkspace {
  source!: Float64Array;
  result!: Float64Array;
  sites!: Int32Array;
  intersections!: Float64Array;
  intermediate!: Float64Array;
  /** Typed-array allocations after construction, for deterministic allocation measurements. */
  allocationCount = 0;

  prepare(length: number, intermediateLength: number): void {
    if (!this.source || this.source.length < length) {
      this.source = new Float64Array(length);
      this.result = new Float64Array(length);
      this.sites = new Int32Array(length);
      this.intersections = new Float64Array(length + 1);
      this.allocationCount += 4;
    }
    if (!this.intermediate || this.intermediate.length < intermediateLength) {
      this.intermediate = new Float64Array(intermediateLength);
      this.allocationCount++;
    }
  }
}

/** Exact squared Euclidean distance to grid-aligned point sites, in axis-specific units.
 * Source and output lattices may differ by a constant fractional cell offset.
 * The separable lower-envelope kernel is shared by visual bakes and physical queries.
 */
export function squaredWaterGridDistances(
  width: number,
  height: number,
  isSite: (x: number, z: number) => boolean,
  options: Readonly<{
    workspace?: WaterGridDistanceWorkspace;
    spacingX?: number;
    spacingZ?: number;
    outputWidth?: number;
    outputHeight?: number;
    offsetX?: number;
    offsetZ?: number;
  }> = {}
): Float64Array {
  const { spacingX = 1, spacingZ = 1, outputWidth = width, outputHeight = height, offsetX = 0, offsetZ = 0 } = options;
  if (
    ![width, height, outputWidth, outputHeight].every((value) => Number.isSafeInteger(value) && value > 0) ||
    ![spacingX, spacingZ].every((value) => value > 0 && Number.isFinite(value * value) && value * value > 0) ||
    ![offsetX, offsetZ].every(Number.isFinite)
  )
    throw new RangeError("Invalid Water distance-transform lattice.");
  const workspace = options.workspace ?? new WaterGridDistanceWorkspace();
  workspace.prepare(Math.max(width, height, outputWidth, outputHeight), outputWidth * height);
  const { intermediate, source, result, sites, intersections } = workspace;
  const output = new Float64Array(outputWidth * outputHeight);
  const transform = (sourceLength: number, targetLength: number, spacing: number, offset: number) => {
    const scale = spacing * spacing;
    let last = -1;
    for (let point = 0; point < sourceLength; point++) {
      if (!Number.isFinite(source[point])) continue;
      let separation = Number.NEGATIVE_INFINITY;
      while (last >= 0) {
        const prior = sites[last];
        separation = ((source[point] - source[prior]) / scale + point * point - prior * prior) / (2 * (point - prior));
        if (separation > intersections[last]) break;
        last--;
      }
      sites[++last] = point;
      intersections[last] = last === 0 ? Number.NEGATIVE_INFINITY : separation;
      intersections[last + 1] = Number.POSITIVE_INFINITY;
    }
    if (last < 0) {
      result.fill(Number.POSITIVE_INFINITY, 0, targetLength);
      return;
    }
    let site = 0;
    for (let point = 0; point < targetLength; point++) {
      const position = point + offset;
      while (site < last && intersections[site + 1] < position) site++;
      const distance = position - sites[site];
      result[point] = distance * distance * scale + source[sites[site]];
    }
  };
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) source[x] = isSite(x, z) ? 0 : Number.POSITIVE_INFINITY;
    transform(width, outputWidth, spacingX, offsetX);
    for (let x = 0; x < outputWidth; x++) intermediate[z * outputWidth + x] = result[x];
  }
  for (let x = 0; x < outputWidth; x++) {
    for (let z = 0; z < height; z++) source[z] = intermediate[z * outputWidth + x];
    transform(height, outputHeight, spacingZ, offsetZ);
    for (let z = 0; z < outputHeight; z++) output[z * outputWidth + x] = result[z];
  }
  return output;
}
