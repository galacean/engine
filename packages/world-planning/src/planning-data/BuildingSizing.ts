import source from "./units/building.json";
export const DEFAULT_MINIMUM_BUILDING_AREA_M2 = 50;

/** Metre-based generation ranges before scaling. Initial footprint area is a sampling reference only. */
export interface BuildingPolicy {
  widthMinM: number;
  widthMaxM: number;
  depthMinM: number;
  depthMaxM: number;
  floorHeightMinM: number;
  floorHeightMaxM: number;
  floorsMin: number;
  floorsMax: number;
  scale: number;
  /** Minimum final footprint after all scope multipliers, in square metres. */
  minimumFootprintM2?: number;
}

/** Exact instance overrides use the same unscaled metres as their generation policy. */
export interface BuildingSizeEdit {
  footprintAreaM2?: number;
  aspectRatio?: number;
  widthM?: number;
  depthM?: number;
  floorHeightM?: number;
  floorCount?: number;
  scale?: number;
}

export interface BuildingDimensions {
  width: number;
  depth: number;
  height: number;
  floorCount?: number;
  floorHeightsM?: number[];
  /** Product already applied to physical dimensions; never multiplied again by renderers. */
  sizingScale?: number;
}

export const DEFAULT_BUILDING_POLICY: Readonly<BuildingPolicy> = Object.freeze({
  widthMinM: source.footprintM.width.min,
  widthMaxM: source.footprintM.width.max,
  depthMinM: source.footprintM.depth.min,
  depthMaxM: source.footprintM.depth.max,
  floorHeightMinM: source.storeys.heightM.min,
  floorHeightMaxM: source.storeys.heightM.max,
  floorsMin: Math.min(...source.storeys.choices.map((c) => c.count)),
  floorsMax: Math.max(...source.storeys.choices.map((c) => c.count)),
  scale: 1
});

/** Validate numeric authoring ranges independently of the initial size distribution.
 * @param policy Ranges in metres, before the scope multiplier.
 * @throws When values are nonpositive, floor counts are fractional or ranges are reversed.
 */
export function validateBuildingPolicy(policy: Partial<BuildingPolicy>): void {
  for (const [key, value] of Object.entries(policy)) {
    if (!Number.isFinite(value) || value <= 0 || (key.startsWith("floors") && !Number.isInteger(value)))
      throw new Error("建筑尺寸、倍率须为正数，层数须为正整数");
  }
  for (const [min, max] of [
    [policy.widthMinM, policy.widthMaxM],
    [policy.depthMinM, policy.depthMaxM],
    [policy.floorHeightMinM, policy.floorHeightMaxM],
    [policy.floorsMin, policy.floorsMax]
  ])
    if (min !== undefined && max !== undefined && min > max) throw new Error("建筑尺寸范围上下限倒置");
}

/** Resolve global and group bounds by override; authored scale factors multiply once per scope.
 * @param global World building policy patch.
 * @param local Village or building-group patch.
 * @returns A validated complete generation policy.
 */
export function resolveBuildingPolicy(
  global?: Partial<BuildingPolicy>,
  local?: Partial<BuildingPolicy>
): BuildingPolicy {
  const policy = { ...DEFAULT_BUILDING_POLICY, ...global, ...local, scale: (global?.scale ?? 1) * (local?.scale ?? 1) };
  validateBuildingPolicy(policy);
  return policy;
}

/** Reuse the initial shape distribution across editable size ranges.
 * @param sample Stable random values in [0,1] indexed by semantic field name.
 * @param sizeIntent Legacy distribution bias; it does not change authored bounds.
 * @param policy Complete bounds and the already resolved global/group scale.
 * @returns Physical dimensions whose floor heights sum to their total height.
 */
export function sampleBuildingSize(
  sample: (key: string) => number,
  sizeIntent = 0.5,
  policy: BuildingPolicy = resolveBuildingPolicy()
) {
  const bias = 2 ** (1 - 2 * Math.max(0, Math.min(1, sizeIntent)));
  const unit = (key: string) => Math.max(0, Math.min(1, sample(key)));
  const between = (min: number, max: number, key: string) => min + (max - min) * unit(key) ** bias;
  // Area shapes the initialization distribution, not a constraint on later edits.
  // Keep its random quantiles so changing a range scales the same family of shapes.
  const reference = source.footprintM;
  const initialArea = between(source.footprintAreaM2.min, source.footprintAreaM2.max, "area");
  const initialWidth = between(
    Math.max(reference.width.min, initialArea / reference.depth.max),
    Math.min(reference.width.max, initialArea / reference.depth.min),
    "width"
  );
  const initialDepth = initialArea / initialWidth;
  const quantile = (value: number, range: { min: number; max: number }) =>
    range.max > range.min ? (value - range.min) / (range.max - range.min) : 0.5;
  const width = policy.widthMinM + (policy.widthMaxM - policy.widthMinM) * quantile(initialWidth, reference.width);
  const depth = policy.depthMinM + (policy.depthMaxM - policy.depthMinM) * quantile(initialDepth, reference.depth);
  const floorCount = Math.min(
    policy.floorsMax,
    policy.floorsMin + Math.floor(unit("floors") * (policy.floorsMax - policy.floorsMin + 1))
  );
  const floorHeightsM = Array.from(
    { length: floorCount },
    (_, i) =>
      (policy.floorHeightMinM + (policy.floorHeightMaxM - policy.floorHeightMinM) * unit("floor-" + i)) * policy.scale
  );
  const footprintScale = Math.max(
    1,
    Math.sqrt((policy.minimumFootprintM2 ?? DEFAULT_MINIMUM_BUILDING_AREA_M2) / (width * depth * policy.scale ** 2))
  );
  return {
    width: width * policy.scale * footprintScale,
    depth: depth * policy.scale * footprintScale,
    height: floorHeightsM.reduce((sum, h) => sum + h, 0),
    floorCount,
    floorHeightsM,
    sizingScale: policy.scale
  };
}

/** Apply a single building's exact dimensions without re-sampling its neighbours.
 * @param dimensions Generated physical dimensions, including inherited scale.
 * @param patch Exact baseline dimensions and a local multiplier.
 * @param inheritedScale Global/group factor already applied to the generated dimensions.
 * @returns The replacement physical envelope and consistent floor metadata.
 */
export function applyBuildingSize(
  dimensions: BuildingDimensions,
  patch: BuildingSizeEdit,
  inheritedScale = 1,
  minimumFootprintM2 = DEFAULT_MINIMUM_BUILDING_AREA_M2
) {
  for (const [key, value] of Object.entries(patch))
    if (!Number.isFinite(value) || value <= 0 || (key === "floorCount" && !Number.isInteger(value)))
      throw new Error("建筑尺寸和倍率须为正数，层数须为正整数");
  const scale = patch.scale ?? 1;
  const floors = patch.floorCount ?? dimensions.floorCount ?? 1;
  const previousFloors = dimensions.floorHeightsM ?? [dimensions.height];
  const meanFloor = dimensions.height / (dimensions.floorCount ?? previousFloors.length);
  const floorHeightsM = Array.from(
    { length: floors },
    (_, i) =>
      (patch.floorHeightM === undefined ? (previousFloors[i] ?? meanFloor) : patch.floorHeightM * inheritedScale) *
      scale
  );
  let width = patch.widthM === undefined ? dimensions.width : patch.widthM * inheritedScale;
  let depth = patch.depthM === undefined ? dimensions.depth : patch.depthM * inheritedScale;
  if (patch.footprintAreaM2 !== undefined || patch.aspectRatio !== undefined) {
    const area = patch.footprintAreaM2 === undefined ? width * depth : patch.footprintAreaM2 * inheritedScale ** 2;
    const aspect = patch.aspectRatio ?? width / depth;
    width = Math.sqrt(area * aspect);
    depth = Math.sqrt(area / aspect);
  }
  const footprintScale = Math.max(1, Math.sqrt(minimumFootprintM2 / (width * depth * scale ** 2)));
  return {
    width: width * scale * footprintScale,
    depth: depth * scale * footprintScale,
    height: floorHeightsM.reduce((sum, h) => sum + h, 0),
    floorCount: floors,
    floorHeightsM,
    sizingScale: inheritedScale * scale
  };
}

/** Clamp only the edited footprint controls to the final minimum area.
 * @param patch Requested baseline dimensions or area/aspect and local scale.
 * @param current Resolved baseline values before the edit.
 * @param inheritedScale World and owner scale, excluding the instance scale.
 * @param minimumArea Minimum final square metres.
 * @returns A normalized patch suitable for persistence and exact replay.
 */
export function projectBuildingSizeEdit(
  patch: BuildingSizeEdit,
  current: Required<Pick<BuildingSizeEdit, "widthM" | "depthM" | "scale">> & BuildingSizeEdit,
  inheritedScale: number,
  minimumArea: number
): BuildingSizeEdit {
  const out = { ...patch },
    value = { ...current, ...patch };
  const area = value.footprintAreaM2 ?? value.widthM * value.depthM;
  const scale = inheritedScale * value.scale;
  if (area * scale ** 2 >= minimumArea - 1e-8) return out;
  if (out.footprintAreaM2 !== undefined) out.footprintAreaM2 = minimumArea / scale ** 2;
  else if (out.scale !== undefined && out.widthM === undefined && out.depthM === undefined)
    out.scale = Math.sqrt(minimumArea / area) / inheritedScale;
  else if (out.widthM !== undefined && out.depthM === undefined) out.widthM = minimumArea / (value.depthM * scale ** 2);
  else if (out.depthM !== undefined && out.widthM === undefined) out.depthM = minimumArea / (value.widthM * scale ** 2);
  else if (out.widthM !== undefined && out.depthM !== undefined) {
    const factor = Math.sqrt(minimumArea / (value.widthM * value.depthM * scale ** 2));
    out.widthM *= factor;
    out.depthM *= factor;
  }
  return out;
}
