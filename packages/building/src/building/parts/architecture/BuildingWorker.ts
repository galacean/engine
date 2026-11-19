import { prepareBuildingCpu, compileBuildingCpu, type BuildingCpuPreparation } from "./BuildingCpu";
import type { BuildingWorkerRequest, BuildingWorkerReply } from "./BuildingWorkerProtocol";
import type { ConstructionTerrainGrid } from "../../runtime/TerrainField";
import type { BuildingUnitAssets } from "../../runtime/BuildingUnitAssets";

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
    if (input.mode === "preview") {
      leases.set(id, { assetId: input.assetId, terrainId: input.terrainId });
      if (input.units) assets.set(input.assetId, input.units);
      if (input.terrain) terrains.set(input.terrainId, input.terrain);
      const units = assets.get(input.assetId),
        terrain = terrains.get(input.terrainId);
      if (!units || !terrain) throw Error("Building Worker input snapshot is unavailable");
      const { prepared, ...result } = await prepareBuildingCpu(input.draft, terrain, units, input.options);
      preparations.set(id, prepared);
      reply({ id, ok: true, result });
      if (input.workerSlim) {
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
          if (
            !p.plaster &&
            !p.stonePaving &&
            !p.roofSpire &&
            (p.placement === "unit" || p.backing === false || p.decoration)
          ) {
            p.positions = [];
            p.normals = undefined;
            p.colors = undefined;
            p.uvs = undefined;
            p.emission = undefined;
            p.indices = [];
          }
        }
      }
    } else {
      const prepared = preparations.get(input.token);
      if (!prepared) throw Error("Building compilation snapshot is unavailable");
      const result = await compileBuildingCpu(prepared, { feedbackGrid: input.feedbackGrid });
      const transfer: Transferable[] = [];
      for (const g of result.renderInput.groups) {
        if (g.brickFeedback?.kind === "pack") transfer.push(g.brickFeedback.data.buffer);
      }
      // Cloning preserves buffers shared with the retained solved geometry.
      reply({ id, ok: true, result }, transfer);
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
