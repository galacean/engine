import { sampleDensityOwner, hashDetailOwnership } from "../../world/SeedWorldDetailCandidateLattice";
import type { IslandPlan, PlanPoint } from "../../semantic-study/IslandPlanModel";
import type { SeedWorldPopulationPreview } from "../../runtime/SeedWorldPopulationPlan.ts";
import { vegetationCoverage } from "../ecology/VegetationCoverage";

/** Display-only projection of published instances; hierarchy switches never enter planning or persistence. */
export class PlanningPopulationVisibility {
  private treeIds: Set<string>;
  private flowerIds: Set<string>;
  private current: SeedWorldPopulationPreview;
  constructor(
    private plan: IslandPlan,
    private base: SeedWorldPopulationPreview
  ) {
    this.treeIds = new Set(base.treeInstances.map((p) => p.id));
    this.flowerIds = new Set((plan.flowerRegions ?? []).map((p) => p.id));
    this.current = base;
  }
  /** Return only changed visibility data and affected bounds; unchanged layers allocate no density fields. */
  resolve(layers: Readonly<Record<string, boolean>>) {
    const visible = (id: string | undefined) => !id || layers[`object:${id}`] !== false;
    const sites = new Map((this.plan.poiDistribution?.sites ?? []).map((p) => [p.id, p]));
    const ownerVisible = (id: string | undefined) =>
      visible(id) && (!id || !sites.has(id) || layers["poi-sites"] !== false);
    const trees = (this.plan.landscapes ?? []).filter(
      (p) => p.kind === "tree" && visible(p.id) && ownerVisible(p.ownerId) && ownerVisible(p.poiId)
    );
    const regions = (this.plan.flowerRegions ?? []).filter((p) => visible(p.id) && ownerVisible(p.ownerId));
    const treeIds = new Set(trees.map((p) => p.id)),
      flowerIds = new Set(regions.map((p) => p.id));
    const difference = (before: Set<string>, after: Set<string>) =>
      new Set([...before, ...after].filter((id) => before.has(id) !== after.has(id)));
    const treeChanges = difference(this.treeIds, treeIds),
      flowerChanges = difference(this.flowerIds, flowerIds);
    if (!treeChanges.size && !flowerChanges.size) return undefined;
    const points: PlanPoint[] = [];
    for (const p of this.plan.landscapes ?? [])
      if (treeChanges.has(p.id)) {
        points.push(
          { x: p.center.x - p.width, z: p.center.z - p.depth },
          { x: p.center.x + p.width, z: p.center.z + p.depth }
        );
      }
    for (const p of this.plan.flowerRegions ?? []) if (flowerChanges.has(p.id)) points.push(...p.outlines.flat());
    let fields = this.current.detailDensityFields;
    if (flowerChanges.size) {
      if (regions.length === (this.plan.flowerRegions ?? []).length) fields = this.base.detailDensityFields;
      else {
        const full = vegetationCoverage(this.plan);
        const selected = vegetationCoverage({ ...this.plan, flowerRegions: regions });
        const reference = this.base.detailDensityFields.find((f) => f.category === "flower");
        if (reference) {
          const resolution = reference.resolution,
            samples = new Uint8Array(reference.samples.length);
          const owners = new Uint32Array(samples.length);
          let hash = 2166136261;
          for (let z = 0; z < resolution; z++)
            for (let x = 0; x < resolution; x++) {
              const i = z * resolution + x;
              const original = coverageSample(
                full.flowers,
                full.resolution,
                x / (resolution - 1),
                z / (resolution - 1)
              );
              const displayed = coverageSample(
                selected.flowers,
                selected.resolution,
                x / (resolution - 1),
                z / (resolution - 1)
              );
              samples[i] = original > 0 ? Math.round(reference.samples[i] * Math.min(1, displayed / original)) : 0;
              if (samples[i])
                owners[i] = sampleDensityOwner(
                  selected.flowers,
                  selected.ownership.samples,
                  selected.resolution,
                  (x / (resolution - 1)) * (selected.resolution - 1),
                  (z / (resolution - 1)) * (selected.resolution - 1)
                );
              hash = Math.imul(hash ^ samples[i], 16777619);
            }
          const ownership = { ids: selected.ownership.ids, samples: owners };
          hash ^= hashDetailOwnership(ownership);
          fields = this.base.detailDensityFields.map((f) =>
            f.category === "flower"
              ? { ...f, samples, ownership, candidateSeed: f.candidateSeed ?? f.hash, hash: hash >>> 0 }
              : f
          );
        }
      }
    }
    this.treeIds = treeIds;
    this.flowerIds = flowerIds;
    this.current = {
      ...this.base,
      treeInstances: this.base.treeInstances.filter((p) => treeIds.has(p.id)),
      detailDensityFields: fields
    };
    const size = this.plan.parameters.width;
    const bounds = { minimumX: size, maximumX: 0, minimumZ: size, maximumZ: 0 };
    for (const p of points) {
      bounds.minimumX = Math.min(bounds.minimumX, p.x - 2);
      bounds.maximumX = Math.max(bounds.maximumX, p.x + 2);
      bounds.minimumZ = Math.min(bounds.minimumZ, p.z - 2);
      bounds.maximumZ = Math.max(bounds.maximumZ, p.z + 2);
    }
    if (!points.length) Object.assign(bounds, { minimumX: 0, minimumZ: 0, maximumX: size, maximumZ: size });
    return {
      layout: this.current,
      treeChanged: treeChanges.size > 0,
      bounds: {
        minimumX: Math.max(0, bounds.minimumX),
        minimumZ: Math.max(0, bounds.minimumZ),
        maximumX: Math.min(size, bounds.maximumX),
        maximumZ: Math.min(size, bounds.maximumZ)
      }
    };
  }
}
function coverageSample(samples: Uint8Array, resolution: number, u: number, v: number): number {
  const x = u * (resolution - 1),
    z = v * (resolution - 1),
    a = Math.floor(x),
    b = Math.floor(z);
  const c = Math.min(resolution - 1, a + 1),
    d = Math.min(resolution - 1, b + 1),
    fx = x - a,
    fz = z - b;
  return (
    (samples[b * resolution + a] * (1 - fx) + samples[b * resolution + c] * fx) * (1 - fz) +
    (samples[d * resolution + a] * (1 - fx) + samples[d * resolution + c] * fx) * fz
  );
}
