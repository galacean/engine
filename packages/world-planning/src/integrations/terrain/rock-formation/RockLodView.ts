import { MeshRenderer, Script, ShaderProperty, Vector3, type Camera, type ModelMesh } from "@galacean/engine";
import { ROCK_LOD_SCREEN_HEIGHTS } from "@galacean/engine-terrain/rock-formation/RockLodPolicy";
import type { RockVariantAsset } from "@galacean/engine-terrain/rock-formation/types";
import {
  createTerrainLodRendererSetScratch,
  TerrainLodGroupRuntime,
  type TerrainLodGroupInstance
} from "@galacean/engine-terrain/terrain/lod/TerrainLodGroupRuntime";
import { TerrainScreenRelativeHeightRuntime } from "@galacean/engine-terrain/terrain/lod/TerrainScreenRelativeHeightRuntime";
import { TREE_ASSEMBLY_LOD_CROSS_FADE_SECONDS } from "@galacean/engine-vegetation/asset-assembly/TreeAssemblyPlan";
import { rockLodMeshes } from "./RockLodMeshes";

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
  readonly projection: TerrainScreenRelativeHeightRuntime;
  readonly meshes: readonly ModelMesh[];
  readonly lod: TerrainLodGroupInstance;
  screenHeight: number;
  /** Created on the first blend and then only toggled, so repeated LOD crossings do not churn components. */
  alternate?: MeshRenderer;
  fading: boolean;
}

/** Uses the shared vegetation dither transition with one extra renderer enabled only while blending. */
export class RockLodView extends Script {
  camera!: Camera;
  private readonly entries = new Map<MeshRenderer, RockLodEntry>();
  private readonly fading = new Set<MeshRenderer>();
  private readonly scratch = createTerrainLodRendererSetScratch();
  private readonly eye = new Vector3();
  private projectionSize = NaN;
  private readonly observation = { timeSeconds: 0, visible: true as const, screenRelativeHeight: 0 };
  private readonly refreshEntry = (entry: RockLodEntry, renderer: MeshRenderer): void => {
    entry.screenHeight = Math.max(Number.MIN_VALUE, entry.projection.resolve());
    this.apply(renderer, entry);
  };
  private readonly advanceFade = (renderer: MeshRenderer): void => {
    this.apply(renderer, this.entries.get(renderer)!);
  };

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
    const projection = new TerrainScreenRelativeHeightRuntime(
      renderer.entity,
      this.camera,
      [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
      Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2])
    );
    const alternates = new Set([middle, far]);
    for (const mesh of alternates) mesh?._addReferCount(1);
    renderer.shaderData.enableMacro("RENDERER_LOD_DITHER");
    renderer.shaderData.setFloat(lodFadeProperty, 1);
    const entry: RockLodEntry = {
      projection,
      meshes: [original, middle ?? original, far ?? middle ?? original],
      lod: lodGroup.createInstance(),
      screenHeight: 0,
      fading: false
    };
    this.entries.set(renderer, entry);
    this.invalidate();
    return () => {
      if (!this.entries.delete(renderer)) return;
      this.fading.delete(renderer);
      entry.alternate?.destroy();
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

  /** Marks projections stale after the planner moves a retained formation. */
  invalidate(): void {
    this.projectionSize = NaN;
  }

  override onUpdate(): void {
    const { camera } = this;
    const position = camera.entity.transform.worldPosition;
    const size = camera.isOrthographic ? -camera.orthographicSize : camera.fieldOfView;
    const refresh =
      size !== this.projectionSize ||
      (!camera.isOrthographic && (position.x !== this.eye.x || position.y !== this.eye.y || position.z !== this.eye.z));
    this.observation.timeSeconds = this.engine.time.elapsedTime;
    if (refresh) {
      this.projectionSize = size;
      this.eye.copyFrom(position);
      this.entries.forEach(this.refreshEntry);
    } else if (this.fading.size) {
      this.fading.forEach(this.advanceFade);
    }
  }

  private apply(renderer: MeshRenderer, entry: RockLodEntry): void {
    this.observation.screenRelativeHeight = entry.screenHeight;
    const sets = entry.lod.updateInto(this.observation, this.scratch);
    const first = sets[0];
    const second = sets.length > 1 ? sets[1] : undefined;
    const sourceMesh = entry.meshes[first.lodIndex];
    const targetMesh = second ? entry.meshes[second.lodIndex] : sourceMesh;
    if (renderer.mesh !== sourceMesh) renderer.mesh = sourceMesh;
    if (second && sourceMesh !== targetMesh) {
      let alternate = entry.alternate;
      if (!alternate) {
        alternate = entry.alternate = renderer.entity.addComponent(MeshRenderer);
        alternate.shaderData.enableMacro("RENDERER_LOD_DITHER");
      }
      if (!entry.fading) {
        // Material and shadow flags may change between blends; refresh them once per blend
        alternate.setMaterial(renderer.getMaterial());
        alternate.castShadows = renderer.castShadows;
        alternate.receiveShadows = renderer.receiveShadows;
        alternate.enabled = true;
        entry.fading = true;
        this.fading.add(renderer);
      }
      renderer.shaderData.setFloat(lodFadeProperty, first.signedFade);
      if (alternate.mesh !== targetMesh) alternate.mesh = targetMesh;
      alternate.shaderData.setFloat(lodFadeProperty, second.signedFade);
    } else if (entry.fading) {
      renderer.shaderData.setFloat(lodFadeProperty, 1);
      entry.alternate!.enabled = false;
      entry.fading = false;
      this.fading.delete(renderer);
    }
  }
}
