import {
  BoundingBox,
  MeshRenderer,
  Script,
  ShaderProperty,
  Vector3,
  type Camera,
  type ModelMesh
} from "@galacean/engine";
import { ROCK_LOD_SCREEN_HEIGHTS } from "@galacean/engine-terrain/rock-formation/RockLodPolicy";
import type { RockVariantAsset } from "@galacean/engine-terrain/rock-formation/types";
import {
  createTerrainLodRendererSetScratch,
  TerrainLodGroupRuntime,
  type TerrainLodGroupInstance
} from "@galacean/engine-terrain/terrain/lod/TerrainLodGroupRuntime";
import { TREE_ASSEMBLY_LOD_CROSS_FADE_SECONDS } from "@galacean/engine-vegetation/asset-assembly/TreeAssemblyPlan";
import {
  createFarShadowMeshProxy,
  setFarShadowCascadeProxy,
  type FarShadowCascadeProxy
} from "@galacean/engine-modify/rendering/FarShadowCascadeProxy";
import type { SeedWorldTerrainOcclusionReadPort } from "../../../runtime/SeedWorldTerrainOcclusionCuller.ts";
import {
  SeedWorldExactInstanceCellRuntime,
  type SeedWorldExactInstanceSpatialEntry,
  type SeedWorldExactInstanceSpatialMode,
  type SeedWorldExactInstanceSpatialSnapshot
} from "../../../world/SeedWorldExactInstanceCellRuntime.ts";
import { rockLodMeshes } from "./RockLodMeshes";

let rockLodCrossFadeEnabled = true;

/** Enables or disables Bayer dither cross-fading between rock LOD levels (disable to avoid extra RENDERER_LOD_DITHER shader variants). */
export function setRockLodCrossFadeEnabled(enabled: boolean): void {
  rockLodCrossFadeEnabled = enabled;
}

export function getRockLodCrossFadeEnabled(): boolean {
  return rockLodCrossFadeEnabled;
}

const lodFadeProperty = ShaderProperty.getByName("renderer_LodFade");
const heights = [...ROCK_LOD_SCREEN_HEIGHTS, Number.MIN_VALUE];
const lodGroup = new TerrainLodGroupRuntime(
  {
    localReferencePoint: [0, 0, 0],
    size: 1,
    fadeMode: "CrossFade",
    animateCrossFading: true,
    lods: heights.map((screenRelativeTransitionHeight) => ({ screenRelativeTransitionHeight }))
  },
  TREE_ASSEMBLY_LOD_CROSS_FADE_SECONDS
);

interface RockLodEntry {
  readonly spatialEntry: SeedWorldExactInstanceSpatialEntry;
  readonly localBounds: BoundingBox;
  readonly localReferencePoint: Vector3;
  readonly localSize: number;
  readonly worldReferencePoint: Vector3;
  worldSize: number;
  readonly meshes: readonly ModelMesh[];
  readonly lod: TerrainLodGroupInstance;
  readonly farShadowProxy?: FarShadowCascadeProxy;
  screenHeight: number;
  /** Created on the first blend and then only toggled, so repeated LOD crossings do not churn components. */
  alternate?: MeshRenderer;
  fading: boolean;
}

/**
 * Schedules rock LOD transitions through the shared XZ Cell spatial runtime (`SeedWorldExactInstanceCellRuntime`).
 * Uses the shared vegetation dither transition with one extra renderer enabled only while blending.
 * Off-frustum / terrain-occluded rocks settle active cross-fades cleanly while keeping primary renderers enabled so
 * offscreen shadow casters and picking remain intact.
 */
export class RockLodView extends Script {
  camera!: Camera;
  terrainOcclusion?: SeedWorldTerrainOcclusionReadPort;
  private readonly entries = new Map<MeshRenderer, RockLodEntry>();
  private readonly scratch = createTerrainLodRendererSetScratch();
  private readonly visibleObservation = { timeSeconds: 0, visible: true as const, screenRelativeHeight: 0 };
  private readonly hiddenObservation = { timeSeconds: 0, visible: false as const };
  private cells?: SeedWorldExactInstanceCellRuntime;
  private nextEntryId = 0;
  private membershipDirty = false;
  private boundsDirty = false;
  private cameraOrthographic = false;
  private cameraEyeX = 0;
  private cameraEyeY = 0;
  private cameraEyeZ = 0;
  private cameraInvProjectionHeight = 1;

  /**
   * Registers the render-only alternate meshes of a rock.
   * @param renderer Rock renderer carrying the fitted transform and picking registration.
   * @param original LOD0 geometry retained by its rock view.
   * @param asset Stable LOD0 bounds and lower-detail asset identity.
   * @returns Removes this renderer and releases its alternate meshes.
   */
  add(renderer: MeshRenderer, original: ModelMesh, asset: RockVariantAsset): () => void {
    const [middle, far] = rockLodMeshes(asset) ?? [];
    if (!middle && !far) return () => {};
    const [min, max] = asset.bounds;
    const localBounds = new BoundingBox(new Vector3(min[0], min[1], min[2]), new Vector3(max[0], max[1], max[2]));
    const localReferencePoint = new Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    const localSize = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    const alternates = new Set([middle, far]);
    for (const mesh of alternates) mesh?._addReferCount(1);
    renderer.shaderData.setFloat(lodFadeProperty, 1);
    const lowestMesh = far ?? middle ?? original;
    const farShadowProxy = lowestMesh !== original ? createFarShadowMeshProxy(lowestMesh) : undefined;
    if (farShadowProxy) setFarShadowCascadeProxy(renderer, farShadowProxy);
    const bounds = new BoundingBox();
    const entry: RockLodEntry = {
      spatialEntry: undefined as unknown as SeedWorldExactInstanceSpatialEntry,
      localBounds,
      localReferencePoint,
      localSize,
      worldReferencePoint: new Vector3(),
      worldSize: localSize,
      meshes: [original, middle ?? original, lowestMesh],
      lod: lodGroup.createInstance(),
      farShadowProxy,
      screenHeight: 0,
      fading: false
    };
    const refreshBounds = (): void => {
      const transform = renderer.entity.transform;
      const worldMatrix = transform.worldMatrix;
      BoundingBox.transform(localBounds, worldMatrix, bounds);
      Vector3.transformCoordinate(localReferencePoint, worldMatrix, entry.worldReferencePoint);
      const scale = transform.lossyWorldScale;
      entry.worldSize = localSize * Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
    };
    const spatialEntry: SeedWorldExactInstanceSpatialEntry = Object.freeze({
      id: `rock-lod-${this.nextEntryId++}`,
      category: "rock-formation",
      bounds,
      refreshBounds,
      controller: Object.freeze({
        update: (timeSeconds: number, cellVisible: boolean): boolean => {
          if (!cellVisible) {
            this.retire(renderer, entry, timeSeconds);
            return false;
          }
          entry.screenHeight = this.resolveScreenHeight(entry);
          return this.apply(renderer, entry, timeSeconds);
        },
        // Authoring visibility is owned by RockFormationView via entity.isActive.
        setAuthoringVisible: (): void => {}
      })
    });
    (entry as { spatialEntry: SeedWorldExactInstanceSpatialEntry }).spatialEntry = spatialEntry;
    this.entries.set(renderer, entry);
    this.membershipDirty = true;
    return () => {
      if (!this.entries.delete(renderer)) return;
      this.membershipDirty = true;
      setFarShadowCascadeProxy(renderer, undefined);
      if (entry.alternate) {
        setFarShadowCascadeProxy(entry.alternate, undefined);
        entry.alternate.destroy();
      }
      for (const mesh of alternates) mesh?._addReferCount(-1);
    };
  }

  /**
   * Finds the second renderer while the main renderer is fading.
   * @param renderer The rock's primary renderer.
   * @returns The active alternate renderer, if present.
   */
  fadingRenderer(renderer: MeshRenderer): MeshRenderer | undefined {
    const entry = this.entries.get(renderer);
    return entry?.fading ? entry.alternate : undefined;
  }

  /** Marks cached world bounds and projections stale after the planner moves a retained formation. */
  invalidate(): void {
    this.boundsDirty = true;
  }

  /** Switches between linear and Cell broad-phase scheduling (primarily for A/B diagnostics and tests). */
  setMode(mode: SeedWorldExactInstanceSpatialMode): void {
    this.ensureCells().setMode(mode);
  }

  /** Updates the horizontal Cell edge length in metres. */
  setCellSizeMetres(cellSizeMetres: number): void {
    this.ensureCells().setCellSizeMetres(cellSizeMetres);
  }

  /** Returns the latest Cell scheduler snapshot for diagnostics. */
  getSnapshot(): Readonly<SeedWorldExactInstanceSpatialSnapshot> | undefined {
    return this.cells?.getSnapshot();
  }

  override onUpdate(): void {
    if (!this.cells && this.entries.size === 0) return;
    const cells = this.ensureCells();
    if (this.membershipDirty) {
      const nextEntries: SeedWorldExactInstanceSpatialEntry[] = [];
      this.entries.forEach((entry) => nextEntries.push(entry.spatialEntry));
      cells.replaceEntries(nextEntries);
      this.membershipDirty = false;
      this.boundsDirty = false;
    } else if (this.boundsDirty) {
      cells.rebuildSpatialIndex();
      this.boundsDirty = false;
    }

    const { camera } = this;
    this.cameraOrthographic = camera.isOrthographic;
    if (this.cameraOrthographic) {
      this.cameraInvProjectionHeight = 1 / (2 * camera.orthographicSize);
    } else {
      const eye = camera.entity.transform.worldPosition;
      this.cameraEyeX = eye.x;
      this.cameraEyeY = eye.y;
      this.cameraEyeZ = eye.z;
      this.cameraInvProjectionHeight = 1 / (2 * Math.tan((camera.fieldOfView * Math.PI) / 360));
    }

    cells.update(this.engine.time.elapsedTime);
  }

  private ensureCells(): SeedWorldExactInstanceCellRuntime {
    if (!this.cells) {
      this.cells = new SeedWorldExactInstanceCellRuntime(
        this.camera,
        [],
        this.terrainOcclusion,
        true,
        "rock-formation"
      );
    }
    return this.cells;
  }

  private resolveScreenHeight(entry: RockLodEntry): number {
    if (this.cameraOrthographic) {
      return Math.max(Number.MIN_VALUE, entry.worldSize * this.cameraInvProjectionHeight);
    }
    const ref = entry.worldReferencePoint;
    const dx = ref.x - this.cameraEyeX;
    const dy = ref.y - this.cameraEyeY;
    const dz = ref.z - this.cameraEyeZ;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (distance <= Number.EPSILON) return Number.MAX_SAFE_INTEGER;
    return Math.max(Number.MIN_VALUE, (entry.worldSize * this.cameraInvProjectionHeight) / distance);
  }

  private retire(renderer: MeshRenderer, entry: RockLodEntry, timeSeconds: number): void {
    this.hiddenObservation.timeSeconds = timeSeconds;
    entry.lod.updateInto(this.hiddenObservation, this.scratch);
    if (entry.fading) {
      renderer.shaderData.disableMacro?.("RENDERER_LOD_DITHER");
      renderer.shaderData.setFloat(lodFadeProperty, 1);
      entry.alternate!.enabled = false;
      entry.fading = false;
    }
  }

  private apply(renderer: MeshRenderer, entry: RockLodEntry, timeSeconds: number): boolean {
    this.visibleObservation.timeSeconds = timeSeconds;
    this.visibleObservation.screenRelativeHeight = entry.screenHeight;
    const sets = entry.lod.updateInto(this.visibleObservation, this.scratch);
    const first = sets[0];
    const second = rockLodCrossFadeEnabled && sets.length > 1 ? sets[1] : undefined;
    const sourceMesh = entry.meshes[first.lodIndex];
    const targetMesh = second ? entry.meshes[second.lodIndex] : sourceMesh;
    if (renderer.mesh !== sourceMesh) renderer.mesh = sourceMesh;
    if (second && sourceMesh !== targetMesh) {
      let alternate = entry.alternate;
      if (!alternate) {
        alternate = entry.alternate = renderer.entity.addComponent(MeshRenderer);
        alternate.shaderData.enableMacro("RENDERER_LOD_DITHER");
        if (entry.farShadowProxy) setFarShadowCascadeProxy(alternate, entry.farShadowProxy);
      }
      if (!entry.fading) {
        // Material and shadow flags may change between blends; refresh them once per blend
        renderer.shaderData.enableMacro("RENDERER_LOD_DITHER");
        alternate.setMaterial(renderer.getMaterial());
        alternate.castShadows = renderer.castShadows;
        alternate.receiveShadows = renderer.receiveShadows;
        alternate.enabled = true;
        entry.fading = true;
      }
      renderer.shaderData.setFloat(lodFadeProperty, first.signedFade);
      if (alternate.mesh !== targetMesh) alternate.mesh = targetMesh;
      alternate.shaderData.setFloat(lodFadeProperty, second.signedFade);
      return true;
    } else if (entry.fading) {
      renderer.shaderData.disableMacro?.("RENDERER_LOD_DITHER");
      renderer.shaderData.setFloat(lodFadeProperty, 1);
      entry.alternate!.enabled = false;
      entry.fading = false;
    }
    return false;
  }
}
