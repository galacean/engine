import type { ConstructionCpuHandle } from "./ConstructionWorkerClient";
import { inspectMasonrySurface } from "./MasonrySurfaceInspection";
import { ConstructionEntrance, constructionEntranceRanges } from "./ConstructionEntrance";
import { buildingAssets, retainBuildingResource } from "../resources/BuildingAssetKit";
import { PrefabResource } from "@galacean/engine";
import { isFlatRoofHeight } from "./RoofMode";
import { inspectConstructionJunctions } from "./ConstructionJunctions";
import { Script, type Engine, type Entity, type Camera } from "@galacean/engine";
import { constructionDecorationLights, type ConstructionDecorationLight } from "./ConstructionDecorationLightPolicy";
import { parseMasonryDocument, resolvedArrangement } from "./MasonryDocument";
import type { MasonryDocument } from "./MasonryDocument";
import { compileInWorker } from "./ConstructionWorkerClient";
import { constructionGlobals } from "./ConstructionGlobals";
import { buildConstructionRenderPackage } from "./ConstructionRenderPackage";
import { EngineResidentScene } from "./EngineResidentScene";
import { resolveDocument } from "./PlacementDocument.js";
import type { ConstructionTerrainSource, ConstructionGrounding } from "./ConstructionTerrain";
export { parseMasonryDocument };
export type { MasonryDocument };
// Baked support colors and exact support cuts must be invalidated together with
// their placements. Native pitched overlap layouts retain the cheap mask path.
function hasBakedSupport(d: MasonryDocument, b: MasonryDocument["bindings"][number]) {
  return (
    b.geometry_id.endsWith("-wall") ||
    b.geometry_id.endsWith("-foundation") ||
    resolvedArrangement(b) !== "overlap_rows" ||
    d.construction.buildings.some((x) => x.id + "-roof" === b.geometry_id && isFlatRoofHeight(x.roof.height))
  );
}
const key = (d: MasonryDocument, terrain: ConstructionTerrainSource) =>
  JSON.stringify({
    construction: d.construction,
    supportOverrides: d.overrides.filter((o) => hasBakedSupport(d, d.bindings.find((b) => b.id === o.binding_id)!)),
    bindings: d.bindings.map((b) => ({
      ...b,
      unit_id: b.rule.type === "auto" || hasBakedSupport(d, b) ? b.unit_id : null
    })),
    terrainRevision: terrain.revision,
    placement: d.placement
  });
/** A standalone prepared asset owns its clock. Planned scenes instead share an
 * author-owned clock across coarse/fine residency and opt out of this driver. */
class ConstructionEntrancePlayback extends Script {
  timeline?: ConstructionEntrance;
  runtime?: EngineResidentScene;
  onUpdate(dt: number) {
    if (!this.timeline || !this.runtime) return;
    if (this.timeline.advance(Math.max(0, dt))) this.runtime.setEntrance(this.timeline.states);
    if (!this.timeline.active) this.enabled = false;
  }
}
interface Entry {
  entrance?: ConstructionEntrance;
  entranceRanges?: ReturnType<typeof constructionEntranceRanges>;
  entrancePlayback?: ConstructionEntrancePlayback;
  localLights: ConstructionDecorationLight[];
  grounding?: ConstructionGrounding;
  key: string;
  runtime: EngineResidentScene;
  pack: any;
  refs: number;
  stats: Record<string, unknown>;
}
const active = new WeakMap<Entity, Entry>();
/** Prepare is invisible. Commit publishes already-validated GPU resources only
 * after the caller has persisted author intent. A rejected candidate leaves the
 * previous scene alive. Material/local-only transactions reuse resident data. */
export async function prepareMasonry(
  input: unknown,
  options: {
    engine: Engine;
    assets: PrefabResource;
    parent: Entity;
    signal: AbortSignal;
    camera?: Camera;
    terrain: () => ConstructionTerrainSource;
    /** false when the enclosing scene owns animation across resource replacement. */
    entrance?: boolean;
    /** Disable reuse when preparation must not mutate a currently published runtime. */
    reuse?: boolean;
    cpu?: ConstructionCpuHandle;
    rigidDecorations?: { poses: ReadonlyMap<string, readonly number[]>; resolve(id: string): Entity | undefined };
  }
) {
  const document = parseMasonryDocument(input);
  if (document.construction.environment.type !== "host_terrain")
    throw Error("Building runtime requires an explicit host terrain field");
  const hostTerrain = options.terrain();
  if (!hostTerrain) throw Error("Host terrain grounding requires a published terrain source");
  if (options.assets.destroyed) throw Error("Construction library is destroyed");
  retainBuildingResource(options.assets, 1);
  try {
    buildingAssets(options.assets);
    // Resource preparation can yield. Do not reuse or compile a captured terrain
    // snapshot after the host has published a different one in the meantime.
    if (options.terrain().revision !== hostTerrain.revision)
      throw Error("Terrain changed during masonry preparation; regenerate against the current terrain");
    const start = performance.now(),
      geometryKey = JSON.stringify([options.assets.instanceId, key(document, hostTerrain)]),
      old = active.get(options.parent);
    options.signal.throwIfAborted();
    let entry: Entry;
    if (!options.rigidDecorations && options.reuse !== false && old && old.key === geometryKey) {
      resolveDocument(old.pack, {
        ...old.pack.document,
        bindings: document.bindings,
        overrides: document.overrides
      });
      entry = old;
      entry.refs++;
    } else {
      const assets = buildingAssets(options.assets);
      const terrain = hostTerrain.grid;
      options.signal.throwIfAborted();
      const beganCompile = performance.now(),
        layout = await (options.cpu
          ? options.cpu.compile(options.signal)
          : compileInWorker(document, terrain, buildingAssets(options.assets).compilation, options.signal)),
        compileMs = performance.now() - beganCompile;
      const globals = constructionGlobals(layout, assets.frame);
      const built = buildConstructionRenderPackage(
        layout,
        assets,
        globals,
        true,
        options.rigidDecorations?.poses,
        buildingAssets(options.assets).compilation.stoneGeometry
      );
      const runtime = new EngineResidentScene(
        options.engine,
        options.parent,
        built.asset,
        layout.grounding?.localBounds
      );
      runtime.root.isActive = false;
      try {
        await runtime.load(built.package);
        if (options.rigidDecorations) runtime.bindRigidDecorations(options.rigidDecorations.resolve);
        options.signal.throwIfAborted();
        if (options.terrain().revision !== hostTerrain.revision)
          throw Error("Terrain changed during masonry preparation; regenerate against the current terrain");
        runtime.applyDocument(layout.placementDocument);
        if (options.camera) runtime.bindCamera(options.camera);
      } catch (e) {
        runtime.destroy();
        throw e;
      }
      entry = {
        ...(options.entrance !== false
          ? {
              entrance: new ConstructionEntrance(),
              entranceRanges: constructionEntranceRanges(layout.preview.parts),
              entrancePlayback: runtime.root.addComponent(ConstructionEntrancePlayback)
            }
          : {}),
        localLights: constructionDecorationLights(layout.construction.decorations.flatMap((d) => d.parts)),
        grounding: layout.grounding,
        key: geometryKey,
        runtime,
        pack: built.package,
        refs: 1,
        stats: {
          workerWallMs: compileMs,
          generation: layout.timings,
          junctions: inspectConstructionJunctions(layout, built.package.draws),
          ...runtime.metrics,
          ...(layout.grounding
            ? {
                grounding: { ...layout.grounding, sourceRevision: hostTerrain.revision },
                renderPosition: layout.grounding.renderPosition
              }
            : {}),
          prepareMs: performance.now() - start
        }
      };
    }
    let dead = false,
      prepared = false,
      committed = false;
    const stats: Record<string, unknown> = {
      ...entry.stats,
      reused: entry === old,
      prepareMs: performance.now() - start
    };
    // Cache local geometry only. A prepared candidate owns its placement-derived
    // emitters, so reuse/movement and aborted transactions cannot move old lights.
    const angle = document.placement?.rotationY ?? 0,
      c = Math.cos(angle),
      s = Math.sin(angle),
      origin = entry.grounding?.renderPosition ?? document.placement?.position ?? [0, 0, 0];
    const lights = entry.localLights.map((light) => {
      const [x, y, z] = light.position;
      return {
        ...light,
        position: [origin[0] + c * x + s * z, origin[1] + y, origin[2] - s * x + c * z] as [number, number, number]
      };
    });
    return {
      lights,
      runtime: entry.runtime,
      grounding: entry.grounding,
      stats,
      inspectSurface(bindingId: string, polygon?: number[][]) {
        if (dead || !committed) throw new Error("Masonry surface is not published");
        if (!document.bindings.some((b) => b.id === bindingId))
          throw new Error(`Unknown masonry binding '${bindingId}'`);
        const resolved = resolveDocument(entry.pack, {
          ...entry.pack.document,
          bindings: document.bindings,
          overrides: document.overrides
        });
        return inspectMasonrySurface(resolved.cells, bindingId, polygon);
      },
      prepareCommit() {
        if (dead) throw Error("Destroyed masonry candidate");
        if (prepared) return;
        stats.edit = entry.runtime.applyDocument({
          ...entry.pack.document,
          bindings: document.bindings,
          overrides: document.overrides
        });
        const position = (entry.stats.renderPosition as number[] | undefined) ??
          document.placement?.position ?? [0, 0, 0];
        entry.runtime.root.transform.setPosition(position[0], position[1], position[2]);
        entry.runtime.root.transform.setRotation(0, ((document.placement?.rotationY ?? 0) * 180) / Math.PI, 0);
        if (entry.entrance && entry.entrancePlayback) {
          // Placement may change while reusing geometry; publish its current world interval too.
          for (const [owner, range] of entry.entranceRanges!)
            entry.entrance.define(owner, range.min + position[1], range.max + position[1]);
          entry.runtime.setEntrance(entry.entrance.states);
        }
        prepared = true;
      },
      commit() {
        if (committed) return;
        this.prepareCommit();
        if (entry.entrance && entry.entrancePlayback) {
          const previous = active.get(options.parent);
          if (previous !== entry) {
            entry.entrance.publish(previous?.entrance);
            entry.entrance.start();
          }
          // publish() resolves the latest accepted timeline, so upload those
          // values before activation rather than the preflight's finished defaults.
          entry.runtime.setEntrance(entry.entrance.states);
          entry.entrancePlayback.timeline = entry.entrance;
          entry.entrancePlayback.runtime = entry.runtime;
          entry.entrancePlayback.enabled = entry.entrance.active;
        }
        entry.runtime.root.isActive = true;
        active.set(options.parent, entry);
        committed = true;
      },
      destroy() {
        if (dead) return;
        dead = true;
        if (--entry.refs === 0) {
          if (active.get(options.parent) === entry) active.delete(options.parent);
          entry.runtime.destroy();
        }
      }
    };
  } finally {
    // Loaded GPU resources own their leases; retain the source through all
    // asynchronous reads even when the component switches libraries mid-build.
    retainBuildingResource(options.assets, -1);
  }
}
