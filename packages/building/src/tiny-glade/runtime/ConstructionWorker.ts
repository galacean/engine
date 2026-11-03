import { validateBuildingInstallations } from "./BuildingInstallationValidation";
import { prepareConstructionCpu } from "./ConstructionCpu";
import { compileMasonryLayout } from "./ConstructionLayout";
import { prepareConstructionTerrain } from "./ConstructionTerrain";
import { roofHeight } from "./RecoveredRoofMath";
const preparations = new Map<
  number,
  {
    document: any;
    terrain: any;
    units: any;
    prepared: ReturnType<typeof prepareConstructionCpu>["prepared"];
    assetId: number;
    terrainId: number;
  }
>();
const assets = new Map<number, any>();
const terrains = new Map<number, ArrayBuffer | Uint16Array>();
async function handle(data: any) {
  const { id, mode, token } = data;
  if (mode === "release") {
    preparations.delete(token);
    if (![...preparations.values()].some((snapshot) => snapshot.assetId === data.assetId)) assets.delete(data.assetId);
    if (![...preparations.values()].some((snapshot) => snapshot.terrainId === data.terrainId))
      terrains.delete(data.terrainId);
    return;
  }

  try {
    const snapshot = token === undefined ? data : preparations.get(token);
    if (!snapshot) throw Error("Building compilation snapshot is unavailable");
    if (mode === "preview" && data.units) assets.set(data.assetId, data.units);
    const { document } = snapshot;
    let { terrain } = snapshot;
    if (mode === "preview") {
      const samples = terrain instanceof ArrayBuffer ? terrain : terrain?.samples;
      if (samples) terrains.set(data.terrainId, samples);
      const retained = terrains.get(data.terrainId);
      if (!retained) throw Error("Building terrain snapshot is unavailable");
      terrain = retained instanceof ArrayBuffer ? retained : { ...terrain, samples: retained };
    }
    const units = mode === "preview" ? assets.get(data.assetId) : snapshot.units;
    if (!units) throw Error("Building geometry snapshot is unavailable");
    const preparation = snapshot.prepared;
    if (mode === "validate") {
      validateBuildingInstallations(
        document,
        units,
        terrain ? prepareConstructionTerrain(document, terrain).height : () => 0
      );
      self.postMessage({ id, ok: true });
      return;
    }
    if (mode === "preview") {
      const { prepared, ...result } = prepareConstructionCpu(document, terrain, units, data.previewOptions);
      preparations.set(id, { document, terrain, units, prepared, assetId: data.assetId, terrainId: data.terrainId });
      self.postMessage({ id, ok: true, result });
      return;
    }
    const prepared = prepareConstructionTerrain(document, terrain);
    const layout = await compileMasonryLayout(document, prepared.height, units, preparation);
    let contacts;
    if (prepared.grounding) {
      const points = layout.construction.owners.flatMap((o) => o.profile.points);
      prepared.grounding.supports = layout.construction.owners.map((o) => ({
        id: o.building.id,
        minGround: o.profile.minGround,
        maxGround: o.profile.maxGround,
        topY: o.profile.topY,
        layoutOriginY: layout.construction.walls.find((w) => w.building.id === o.building.id)?.layoutOriginY ?? 0
      }));
      prepared.grounding.minWorldHeight = Math.min(...points.map((p) => p[1]));
      prepared.grounding.maxWorldHeight = Math.max(...points.map((p) => p[1]));
      prepared.grounding.localBounds = {
        min: [
          Math.min(...points.map((p) => p[0])) - 1,
          Math.min(...points.map((p) => p[1])),
          Math.min(...points.map((p) => p[2])) - 1
        ],
        max: [
          Math.max(...points.map((p) => p[0])) + 1,
          Math.max(
            ...layout.construction.owners.map((o) =>
              Math.max(
                o.profile.maxYGable,
                o.profile.topY + (o.building.kind ? 0.46 : roofHeight(o.roof.surface, o.roof.footprint))
              )
            )
          ) + 0.5,
          Math.max(...points.map((p) => p[2])) + 1
        ]
      };
      // Wall bases may sit above a separate foundation. Keep the analytical
      // roof/unit envelope, and include all published support/attachment geometry
      // before handing the one render bound to resident meshes and frustum culling.
      for (let axis = 0; axis < 3; axis++) {
        prepared.grounding.localBounds.min[axis] = Math.min(
          prepared.grounding.localBounds.min[axis],
          layout.preview.bounds.min[axis] - 0.5
        );
        prepared.grounding.localBounds.max[axis] = Math.max(
          prepared.grounding.localBounds.max[axis],
          layout.preview.bounds.max[axis] + 0.5
        );
      }
      let sampleError = 0,
        aboveTerrain = 0,
        belowTerrain = 0,
        checks = 0;
      for (const wall of layout.construction.walls) {
        const points = wall.profile.points;
        for (const p of points) sampleError = Math.max(sampleError, Math.abs(p[1] - prepared.height(p[0], p[2])));
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1],
            b = points[i],
            n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.125));
          for (let j = 0; j <= n; j++) {
            const t = j / n,
              x = a[0] + (b[0] - a[0]) * t,
              z = a[2] + (b[2] - a[2]) * t;
            const error = a[1] + (b[1] - a[1]) * t - prepared.height(x, z);
            aboveTerrain = Math.max(aboveTerrain, error);
            belowTerrain = Math.max(belowTerrain, -error);
            checks++;
          }
        }
      }
      // CPU boundary diagnostics, not GPU readback or a claim of mesh watertightness.
      contacts = { sampleError, aboveTerrain, belowTerrain, checks };
    }
    const result = { ...layout, grounding: prepared.grounding && { ...prepared.grounding, contacts } };
    // Prepared curves/geometry remain owned by this Worker. Clone the response;
    // transferring a shared buffer would detach the next detail compilation's input.
    self.postMessage({ id, ok: true, result });
  } catch (e) {
    if (mode === "preview") preparations.delete(id);
    self.postMessage({ id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}
// Detail compilation yields while packing. Preserve order with releases and later edits.
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent) => {
  queue = queue.then(() => handle(event.data));
};
