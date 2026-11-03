import { watercourseGeometry } from "./WatercourseGeometry";

/** CPU-only river authoring contract. Coordinates, widths and depths are metres. */
export interface WatercoursePoint {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly elevation?: number;
  readonly width: number;
  readonly depth: number;
}

export type WatercourseForm = "auto" | "slope" | "waterfall" | "steps";
export interface WatercourseSection {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly form: WatercourseForm;
  /** Explicitly authorizes a lower downstream bed, never filling terrain. */
  readonly carve?: boolean;
  readonly drop?: number;
  readonly stepCount?: number;
}
export interface WatercourseAuthoring {
  readonly id: string;
  readonly points: readonly WatercoursePoint[];
  readonly sections?: readonly WatercourseSection[];
  readonly bankClearance?: number;
  readonly dropThreshold?: number;
  readonly slopeThreshold?: number;
  /** Maximum spacing of the longitudinal Terrain probes used to recognize concentrated drops. */
  readonly probeSpacing?: number;
}
export interface ResolvedWatercoursePoint extends WatercoursePoint {
  readonly elevation: number;
  readonly bedElevation: number;
}
export interface WatercourseDrop {
  readonly id: string;
  readonly sectionId: string;
  readonly form: "waterfall" | "steps";
  readonly upstream: ResolvedWatercoursePoint;
  readonly downstream: ResolvedWatercoursePoint;
  readonly stepCount: number;
  readonly carved: boolean;
  readonly fractions: readonly number[];
  readonly levels: readonly number[];
}
export interface ResolvedWatercourse {
  readonly id: string;
  readonly points: readonly ResolvedWatercoursePoint[];
  readonly sections: readonly (WatercourseSection & { readonly form: Exclude<WatercourseForm, "auto"> })[];
  readonly drops: readonly WatercourseDrop[];
}

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`INVALID_ARGUMENT: ${label} must be positive.`);
  return value;
}

/** Resolve a locally downhill surface; never turns a concentrated drop into an ordinary steep reach.
 * The host supplies the unmodified terrain and owns application of any resulting bed intent.
 */
export function resolveWatercourse(
  source: WatercourseAuthoring,
  terrain: (x: number, z: number) => number | undefined
): ResolvedWatercourse {
  if (!source.id?.trim() || source.points.length < 2)
    throw new Error("INVALID_ARGUMENT: A river needs an ID and two points.");
  const clearance = source.bankClearance ?? 0.05;
  const dropThreshold = positive(source.dropThreshold ?? 0.5, "dropThreshold");
  const slopeThreshold = positive(source.slopeThreshold ?? 0.2, "slopeThreshold");
  const probeSpacing = positive(source.probeSpacing ?? 0.25, "probeSpacing");
  if (!Number.isFinite(clearance) || clearance < 0)
    throw new Error("INVALID_ARGUMENT: bankClearance must be nonnegative.");
  const ids = new Set<string>();
  const points: ResolvedWatercoursePoint[] = source.points.map((point) => {
    if (!point.id?.trim() || ids.has(point.id)) throw new Error("INVALID_ARGUMENT: Point IDs must be unique.");
    ids.add(point.id);
    if (![point.x, point.z].every(Number.isFinite)) throw new Error("INVALID_ARGUMENT: Invalid point coordinates.");
    positive(point.width, "width");
    positive(point.depth, "depth");
    const height = terrain(point.x, point.z);
    if (height === undefined || !Number.isFinite(height))
      throw new Error("MISSING_DEPENDENCY: Terrain does not cover the path.");
    const elevation = point.elevation ?? height - clearance;
    if (!Number.isFinite(elevation)) throw new Error("INVALID_ARGUMENT: Invalid surface elevation.");
    if (elevation > height + 1e-6)
      throw new Error("INVALID_ARGUMENT: Surface above terrain requires an explicit basin, not terrain filling.");
    return { ...point, elevation, bedElevation: elevation - point.depth };
  });
  const authored = new Map<string, WatercourseSection>();
  const sectionIds = new Set<string>();
  for (const section of source.sections ?? []) {
    const index = source.points.findIndex((p) => p.id === section.from);
    if (!section.id?.trim() || sectionIds.has(section.id) || index < 0 || source.points[index + 1]?.id !== section.to)
      throw new Error("INVALID_ARGUMENT: Sections must join consecutive points with unique IDs.");
    if (!["auto", "slope", "waterfall", "steps"].includes(section.form))
      throw new Error("INVALID_ARGUMENT: Unknown section form.");
    if (authored.has(section.from)) throw new Error("INVALID_ARGUMENT: Duplicate section interval.");
    if (section.carve !== undefined && typeof section.carve !== "boolean")
      throw new Error("INVALID_ARGUMENT: carve must be boolean.");
    if (section.drop !== undefined) positive(section.drop, "drop");
    if (
      section.stepCount !== undefined &&
      (!Number.isSafeInteger(section.stepCount) || section.stepCount < 2 || section.stepCount > 64)
    )
      throw new Error("INVALID_ARGUMENT: stepCount must be an integer between 2 and 64.");
    sectionIds.add(section.id);
    authored.set(section.from, section);
  }
  const sections: Array<WatercourseSection & { form: Exclude<WatercourseForm, "auto"> }> = [];
  const drops: WatercourseDrop[] = [];
  for (let i = 1; i < points.length; i++) {
    const upstream = points[i - 1];
    let downstream = points[i];
    const length = Math.hypot(downstream.x - upstream.x, downstream.z - upstream.z);
    positive(length, "horizontal section length");
    const input = authored.get(upstream.id) ?? {
      id: `${source.id}:${upstream.id}:${downstream.id}`,
      from: upstream.id,
      to: downstream.id,
      form: "auto" as const
    };
    if (downstream.elevation > upstream.elevation + 1e-6) {
      if (source.points[i].elevation !== undefined) throw new Error("INVALID_ARGUMENT: Authored river flows uphill.");
      downstream = points[i] = {
        ...downstream,
        elevation: upstream.elevation,
        bedElevation: upstream.elevation - downstream.depth
      };
    }
    const requiredDrop = input.drop;
    let drop = upstream.elevation - downstream.elevation;
    const carved = requiredDrop !== undefined && drop + 1e-6 < requiredDrop;
    if (carved) {
      if (!input.carve)
        throw new Error(`TERRAIN_CHANGE_REQUIRED: Section '${input.id}' needs explicit carving authorization.`);
      downstream = points[i] = {
        ...downstream,
        elevation: upstream.elevation - requiredDrop!,
        bedElevation: upstream.elevation - requiredDrop! - downstream.depth
      };
      drop = requiredDrop!;
    }
    const probeCount = Math.ceil(length / probeSpacing);
    if (probeCount > 16384) throw new Error("RESOURCE_LIMIT: Watercourse section exceeds the Terrain probe budget.");
    const runs: number[] = [],
      locations: number[] = [],
      runLengths: number[] = [];
    let run = 0,
      runLength = 0,
      previousHeight = terrain(upstream.x, upstream.z)!;
    for (let probe = 1; probe <= probeCount; probe++) {
      const t = probe / probeCount;
      const height = terrain(
        upstream.x + (downstream.x - upstream.x) * t,
        upstream.z + (downstream.z - upstream.z) * t
      );
      if (height === undefined || !Number.isFinite(height))
        throw new Error("MISSING_DEPENDENCY: Terrain does not cover the complete path.");
      const delta = previousHeight - height;
      if (delta / (length / probeCount) >= slopeThreshold) {
        run += delta;
        runLength += length / probeCount;
      } else {
        if (run >= dropThreshold) {
          runs.push(run);
          runLengths.push(runLength);
          locations.push((probe - 1) / probeCount);
        }
        run = 0;
        runLength = 0;
      }
      previousHeight = height;
    }
    if (run >= dropThreshold) {
      runs.push(run);
      runLengths.push(runLength);
      locations.push(1 - 0.5 / probeCount);
    }
    const steep =
      (drop >= dropThreshold && runLengths.some((span) => span <= probeSpacing + 1e-6)) ||
      drop / length > slopeThreshold;
    const form = input.form === "auto" ? (steep ? (runs.length > 1 ? "steps" : "waterfall") : "slope") : input.form;
    if (form === "slope" && steep)
      throw new Error("INVALID_ARGUMENT: Concentrated elevation changes require a drop section.");
    if (form !== "slope" && drop < dropThreshold)
      throw new Error("TERRAIN_CHANGE_REQUIRED: Insufficient elevation difference for a drop.");
    const requestedSteps = input.stepCount ?? Math.max(2, runs.length);
    const needsSculptedForm =
      form !== "slope" &&
      (runLengths.some((span) => span > probeSpacing + 1e-6) ||
        (form === "waterfall" ? runs.length !== 1 : runs.length !== requestedSteps));
    if (needsSculptedForm && !input.carve)
      throw new Error(
        `TERRAIN_CHANGE_REQUIRED: Section '${input.id}' lacks the requested ledge or platforms; authorize carving explicitly.`
      );
    sections.push({ ...input, form });
    if (form !== "slope")
      drops.push({
        id: `${input.id}:drop`,
        sectionId: input.id,
        form,
        upstream,
        downstream,
        stepCount: form === "steps" ? requestedSteps : 1,
        carved: carved || needsSculptedForm,
        levels: [
          upstream.elevation,
          ...Array.from({ length: form === "steps" ? requestedSteps : 1 }, (_, j) => {
            const fraction =
              !needsSculptedForm && runs.length > 0
                ? runs.slice(0, j + 1).reduce((a, b) => a + b, 0) / runs.reduce((a, b) => a + b, 0)
                : (j + 1) / (form === "steps" ? requestedSteps : 1);
            return upstream.elevation - drop * fraction;
          })
        ],
        fractions: needsSculptedForm
          ? Array.from(
              { length: form === "steps" ? requestedSteps : 1 },
              (_, j) => (j + 1) / ((form === "steps" ? requestedSteps : 1) + 1)
            )
          : locations.map((t) => Math.max(0.01, Math.min(0.99, t)))
      });
  }
  const result = { id: source.id, points, sections, drops };
  // Validate the generated ordinary surfaces, including the short platforms beside
  // curtains. Dig-only Terrain cannot support a surface above the existing ground.
  // Checking author anchors alone misses suspended platforms on continuous ramps.
  const geometry = watercourseGeometry(result);
  for (const path of geometry.paths) {
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        b = path[i];
      const distance = Math.hypot(b.x - a.x, b.z - a.z);
      const count = Math.max(1, Math.ceil(distance / probeSpacing));
      for (let j = 0; j <= count; j++) {
        const t = j / count,
          x = a.x + (b.x - a.x) * t,
          z = a.z + (b.z - a.z) * t;
        const elevation = a.elevation + (b.elevation - a.elevation) * t;
        const height = terrain(x, z);
        if (height === undefined || !Number.isFinite(height))
          throw new Error("MISSING_DEPENDENCY: Terrain does not cover generated platforms.");
        if (elevation > height + 1e-6)
          throw new Error(
            "TERRAIN_CHANGE_REQUIRED: Generated surface lacks ground support; digging cannot create a raised platform. Adjust the path or elevations."
          );
      }
    }
  }
  return result;
}
