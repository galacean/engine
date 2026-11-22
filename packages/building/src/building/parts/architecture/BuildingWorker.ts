import { prepareBuildingCpu, compileBuildingCpu, type BuildingCpuPreparation } from "./BuildingCpu";
import { designInitialBuildingGroup } from "./BuildingInitialGroup";
import type { BuildingWorkerRequest, BuildingWorkerReply } from "./BuildingWorkerProtocol";
import type { ConstructionTerrainGrid } from "../../runtime/TerrainField";
import type { BuildingUnitAssets } from "../../runtime/BuildingUnitAssets";
import { packConstructionPreview, packDecorationPart } from "../../runtime/ConstructionPreview";
import { deflateCoreBuildingLayout } from "../../render/CoreBuilding";

function collectArrayBuffers(value: unknown, out: Set<ArrayBuffer>, excluded?: ReadonlySet<ArrayBuffer>): void {
  if (!value || typeof value !== "object") return;
  if (ArrayBuffer.isView(value)) {
    const buffer = value.buffer;
    if (buffer instanceof ArrayBuffer && buffer.byteLength > 0 && !excluded?.has(buffer)) {
      out.add(buffer);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) collectArrayBuffers(value[i], out, excluded);
    return;
  }
  for (const v of Object.values(value)) collectArrayBuffers(v, out, excluded);
}

function slimKeptPreviewPart(p: BuildingCpuPreparation["prepared"]["preview"]["parts"][number]): boolean {
  return (
    !!p.plaster || !!p.stonePaving || !!p.roofSpire || !(p.placement === "unit" || p.backing === false || p.decoration)
  );
}

// Immutable asset/terrain snapshots are shared by independent preview handles.
// A failed preparation retains its lease until the client's release arrives too.
const leases = new Map<number, { assetId: number; terrainId: number }>();
const preparations = new Map<number, BuildingCpuPreparation["prepared"]>();
const assets = new Map<number, BuildingUnitAssets>();
const terrains = new Map<number, ConstructionTerrainGrid>();
function release(token: number) {
  const lease = leases.get(token);
  preparations.delete(token);
  leases.delete(token);
  if (!lease) return;
  if (![...leases.values()].some((v) => v.assetId === lease.assetId)) assets.delete(lease.assetId);
  if (![...leases.values()].some((v) => v.terrainId === lease.terrainId)) terrains.delete(lease.terrainId);
}
const reply = (result: BuildingWorkerReply, transfer?: Transferable[]) =>
  transfer?.length ? self.postMessage(result, transfer) : self.postMessage(result);
async function handle(input: BuildingWorkerRequest) {
  if (input.mode === "release") {
    release(input.token);
    return;
  }
  const { id } = input;
  try {
    if (input.mode === "preview" || input.mode === "previewOnly") {
      const retainPreparation = input.mode === "preview";
      leases.set(id, { assetId: input.assetId, terrainId: input.terrainId });
      if (input.units) assets.set(input.assetId, input.units);
      if (input.terrain) terrains.set(input.terrainId, input.terrain);
      const units = assets.get(input.assetId),
        terrain = terrains.get(input.terrainId);
      if (!units || !terrain) throw Error("Building Worker input snapshot is unavailable");
      const { prepared, ...result } = await prepareBuildingCpu(input.draft, terrain, units, input.options);
      packConstructionPreview(result.preview);
      if (retainPreparation) preparations.set(id, prepared);
      if (input.workerSlim) {
        if (!retainPreparation) {
          const excluded = new Set<ArrayBuffer>();
          collectArrayBuffers(units, excluded);
          collectArrayBuffers(terrain, excluded);
          const transferSet = new Set<ArrayBuffer>();
          collectArrayBuffers(result.preview, transferSet, excluded);
          collectArrayBuffers(result.occupancy, transferSet, excluded);
          reply({ id, ok: true, result }, [...transferSet]);
          return;
        }
        // Keep buffers shared with surface/backing parts for future compile(), while
        // transferring buffers belonging exclusively to preview-only fields being dropped.
        const keepBuffers = new Set<ArrayBuffer>();
        for (const p of prepared.preview.parts) {
          if (!slimKeptPreviewPart(p)) continue;
          const savedLod = p.lodAppearance;
          p.lodAppearance = undefined;
          collectArrayBuffers(p, keepBuffers);
          p.lodAppearance = savedLod;
        }
        collectArrayBuffers(result.occupancy, keepBuffers);
        const transferSet = new Set<ArrayBuffer>();
        collectArrayBuffers(result.preview.decorationParts, transferSet, keepBuffers);
        collectArrayBuffers(result.preview.retainedWallUnits, transferSet, keepBuffers);
        collectArrayBuffers(result.preview.stones, transferSet, keepBuffers);
        collectArrayBuffers(result.preview.frames, transferSet, keepBuffers);
        collectArrayBuffers(result.preview.woodArchFrames, transferSet, keepBuffers);
        collectArrayBuffers(result.preview.woodArchPillars, transferSet, keepBuffers);
        for (const p of result.preview.parts) {
          if (p.lodAppearance) collectArrayBuffers(p.lodAppearance, transferSet, keepBuffers);
          if (!slimKeptPreviewPart(p)) collectArrayBuffers(p, transferSet, keepBuffers);
        }
        reply({ id, ok: true, result }, [...transferSet]);
        prepared.preview.decorationParts = [];
        prepared.preview.retainedWallUnits = [];
        prepared.preview.occupancyBounds = [];
        prepared.preview.archGroups = [];
        prepared.preview.stones = [];
        prepared.preview.frames = [];
        prepared.preview.woodArchFrames = [];
        prepared.preview.woodArchPillars = [];
        for (const p of prepared.preview.parts) {
          p.lodAppearance = undefined;
          if (!slimKeptPreviewPart(p)) {
            p.positions = [];
            p.normals = undefined;
            p.colors = undefined;
            p.neutralColors = undefined;
            p.tintRoles = undefined;
            p.appearance = undefined;
            p.uvs = undefined;
            p.emission = undefined;
            p.indices = [];
          }
        }
        deflateCoreBuildingLayout(prepared.layout);
      } else {
        reply({ id, ok: true, result });
      }
    } else if (input.mode === "detailFromDraft") {
      leases.set(id, { assetId: input.assetId, terrainId: input.terrainId });
      if (input.units) assets.set(input.assetId, input.units);
      if (input.terrain) terrains.set(input.terrainId, input.terrain);
      const units = assets.get(input.assetId),
        terrain = terrains.get(input.terrainId);
      if (!units || !terrain) throw Error("Building Worker input snapshot is unavailable");
      const { prepared } = await prepareBuildingCpu(input.draft, terrain, units, input.options);
      const slim = Boolean(input.workerSlim);
      const result = await compileBuildingCpu(prepared, {
        feedbackGrid: input.feedbackGrid,
        activeMaterialsOnly: slim,
        omitEmptyCells: Boolean(input.omitEmptyCells),
        deflateAfterCompile: slim
      });
      if (slim) {
        for (const deco of result.renderInput.decorations) {
          for (const part of deco.parts) packDecorationPart(part);
        }
      }
      const excluded = new Set<ArrayBuffer>();
      collectArrayBuffers(units, excluded);
      collectArrayBuffers(terrain, excluded);
      const transferSet = new Set<ArrayBuffer>();
      collectArrayBuffers(result.renderInput, transferSet, excluded);
      reply({ id, ok: true, result }, [...transferSet]);
    } else if (input.mode === "initial-group") {
      leases.set(id, { assetId: input.assetId, terrainId: input.terrainId });
      if (input.units) assets.set(input.assetId, input.units);
      if (input.terrain) terrains.set(input.terrainId, input.terrain);
      const units = assets.get(input.assetId),
        terrain = terrains.get(input.terrainId);
      if (!units || !terrain) throw Error("Building Worker input snapshot is unavailable");
      const result = designInitialBuildingGroup(input.group, terrain, units, input.library, input.layoutKey);
      reply({ id, ok: true, result });
    } else {
      const prepared = preparations.get(input.token);
      if (!prepared) throw Error("Building compilation snapshot is unavailable");
      const slim = Boolean(input.workerSlim);
      const result = await compileBuildingCpu(prepared, {
        feedbackGrid: input.feedbackGrid,
        activeMaterialsOnly: slim,
        omitEmptyCells: Boolean(input.omitEmptyCells),
        deflateAfterCompile: slim
      });
      const transferSet = new Set<ArrayBuffer>();
      for (const g of result.renderInput.groups) {
        if (g.brickFeedback?.kind === "pack" && g.brickFeedback.data.buffer.byteLength > 0) {
          transferSet.add(g.brickFeedback.data.buffer);
        }
        if (slim) collectArrayBuffers(g.units, transferSet);
      }
      if (slim) {
        collectArrayBuffers(result.renderInput.dormerBins, transferSet);
        for (const deco of result.renderInput.decorations) {
          for (const part of deco.parts) {
            packDecorationPart(part);
            collectArrayBuffers(part, transferSet);
          }
        }
      }
      // Cloning preserves backing/surface buffers shared with the retained solved geometry.
      reply({ id, ok: true, result }, [...transferSet]);
    }
  } catch (error) {
    if (input.mode === "preview") preparations.delete(id);
    reply({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}
// Packing yields; releases and later previews must not overtake earlier detail work.
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<BuildingWorkerRequest>) => {
  queue = queue.then(() => handle(event.data));
};
