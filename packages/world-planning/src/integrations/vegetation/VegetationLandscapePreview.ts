import { createNaturalVegetationPreviewLayers } from "./NaturalVegetationPreviewLayers.ts";
import {
  BoundingBox,
  Color,
  Entity,
  Material,
  Matrix,
  MeshRenderer,
  ModelMesh,
  PBRMaterial,
  PrimitiveMesh,
  Vector3,
  Vector4
} from "@galacean/engine";
import {
  compileVegetationLandscape,
  type LandscapeBounds,
  type LandscapePlantAsset,
  type LandscapePosition,
  type VegetationLandscapePlan,
  type VegetationLandscapeRequest
} from "@galacean/engine-vegetation/world/VegetationLandscapePlan";
import type { ProceduralPlantLibraryRuntime } from "@galacean/engine-vegetation/asset-assembly/ProceduralPlantLibraryRuntime";
import type { AssetAssemblySourceLibrary } from "@galacean/engine-vegetation/asset-assembly/AssetAssemblySourceLibrary";
import {
  bindSeedWorldGrassColorField,
  createSeedWorldSurfaceColorFieldTexture
} from "@galacean/engine-vegetation/world/SeedWorldGrassColorFieldUniforms";
import {
  SEED_WORLD_GRASS_COLOR_FIELD_DEFAULTS,
  freezeSeedWorldGrassColorFieldTuning,
  type SeedWorldGrassColorFieldBinding
} from "@galacean/engine-vegetation/world/SeedWorldGrassColorField";
import {
  adjustLandscapeColor,
  type LandscapeColorAdjustment,
  type LandscapeSceneDirection
} from "@galacean/engine-vegetation/world/LandscapeSceneDirection";
import { bakeSeedWorldSurfaceColorField } from "@galacean/engine-terrain/world/SeedWorldSurfaceColorField";
import { SEED_WORLD_POPULATION_RUNTIME_PROFILE } from "../../runtime/SeedWorldPopulationRuntimeCell.ts";
import { LANDSCAPE_GRASS_LAYER, withLandscapeGrassMode, type LandscapeGrassMode } from "./VegetationLandscapeGrass.ts";

type Source = {
  entry: { id: string };
  bounds: LandscapeBounds;
  renderers: readonly MeshRenderer[];
  /** Explicit authored root; other library sources are planted at their bottom-centre. */
  placementOrigin?: LandscapePosition;
};

/** Entity.destroy removes children from the front and updates the remaining sibling indices.
 * Release our large preview hierarchy from the tail through public APIs so rebuilding is linear. */
function destroyPreviewTree(root?: Entity): void {
  if (!root) return;
  for (let index = root.children.length - 1; index >= 0; index--) destroyPreviewTree(root.children[index]);
  root.destroy();
}

/** Materials retain the shared field texture; release those references before disposing texture storage. */
function destroyPreviewResources(resources: readonly { destroy(): void }[]): void {
  for (const resource of resources) if (resource instanceof Material) resource.destroy();
  for (const resource of resources) if (!(resource instanceof Material)) resource.destroy();
}

const LANDSCAPE_ROAD_COLOR = new Vector4(0.21, 0.17, 0.085, 1);
export type LandscapeExample = "building" | "tree" | "rock";

export function landscapeAssets(sources: readonly Source[]): LandscapePlantAsset[] {
  return sources.map(({ entry, bounds, placementOrigin }) => {
    const origin = placementOrigin ?? [
      (bounds.min[0] + bounds.max[0]) / 2,
      bounds.min[1],
      (bounds.min[2] + bounds.max[2]) / 2
    ];
    return {
      id: entry.id,
      height: bounds.max[1] - origin[1],
      footprintArea: (bounds.max[0] - bounds.min[0]) * (bounds.max[2] - bounds.min[2]),
      radius: Math.hypot(
        ...[0, 2].map((axis) =>
          Math.max(Math.abs(bounds.min[axis] - origin[axis]), Math.abs(bounds.max[axis] - origin[axis]))
        )
      )
    };
  });
}

export type LandscapeStory = "inhabited" | "abandoned";

/** Editable natural-meadow art direction; physical dimensions come from the actual shared assets. */
export function createLandscapeExample(
  kind: LandscapeExample,
  assets: readonly LandscapePlantAsset[],
  seed = 1729,
  story: LandscapeStory = "inhabited",
  rockSize?: readonly [number, number, number]
): VegetationLandscapeRequest {
  const tree = assets.find((a) => a.id === "SM_BirchTree_01");
  if (!tree) throw new Error("Landscape example needs the Asset Assembly meadow library");
  if (kind === "rock" && !rockSize) throw new Error("Rock example needs measured source dimensions");
  const unit = tree.height,
    extent = unit * 1.6;
  const focusHeight = kind === "tree" ? tree.height : kind === "building" ? unit * 0.48 : unit * 0.28;
  const halfWidth =
    kind === "tree"
      ? tree.radius
      : kind === "building"
        ? unit * 0.32
        : ((rockSize![0] / rockSize![1]) * focusHeight) / 2;
  const halfDepth =
    kind === "tree"
      ? tree.radius
      : kind === "building"
        ? unit * 0.25
        : ((rockSize![2] / rockSize![1]) * focusHeight) / 2;
  const bounds: LandscapeBounds = {
    min: [-halfWidth, 0, -unit * 0.35 - halfDepth],
    max: [halfWidth, focusHeight, -unit * 0.35 + halfDepth]
  };
  const support: LandscapeBounds =
    kind === "tree"
      ? {
          min: [-unit * 0.025, 0, -unit * 0.375],
          max: [unit * 0.025, unit * 0.2, -unit * 0.325]
        }
      : bounds;
  const visible: LandscapeBounds = {
    min: [bounds.min[0], focusHeight * (kind === "tree" ? 0.45 : 0.28), bounds.min[2]],
    max: bounds.max
  };
  const pathPoints = [
    [unit * 0.42, extent],
    [unit * 0.55, unit * 0.9],
    [unit * 0.18, unit * 0.38],
    [0, bounds.max[2]]
  ] as const;
  return {
    version: 1,
    regionId: "meadow-landscape",
    seed,
    region: {
      outer: [
        [-extent, -extent],
        [extent, -extent],
        [extent, extent],
        [-extent, extent]
      ]
    },
    views: [
      {
        id: "入口",
        eye: [unit * 0.48, unit * 0.24, extent * 0.93],
        lookAt: [0, unit * 0.22, -unit * 0.35],
        weight: 1,
        depthBreaks: [extent * 0.6, extent * 1.8]
      },
      {
        id: "侧面",
        eye: [-extent * 0.93, unit * 0.3, extent * 0.5],
        lookAt: [0, unit * 0.2, -unit * 0.35],
        weight: 0,
        depthBreaks: [extent * 0.6, extent * 1.8]
      }
    ],
    focalTargets: [
      {
        id: "main-focus",
        objectId: kind === "tree" ? tree.id : `example-${kind}`,
        kind,
        bounds,
        occupiedBounds: support,
        clearance: 0,
        visibility: ["入口", "侧面"].map((viewId) => ({ viewId, bounds: visible, padding: 0 }))
      }
    ],
    occupied: [],
    exclusions: [],
    paths: [
      {
        id: "林间旧路",
        points: pathPoints,
        width: unit * (story === "inhabited" ? 0.07 : 0.022),
        clearance: 0,
        shoulder: unit * (story === "inhabited" ? 0.09 : 0.04)
      }
    ],
    seams: [
      {
        id: "主体与地面接缝",
        points: [
          [support.min[0], support.min[2]],
          [support.max[0], support.min[2]],
          [support.max[0], support.max[2]],
          [support.min[0], support.max[2]],
          [support.min[0], support.min[2]]
        ],
        width: unit * 0.22,
        layers: ["低草铺底", "匍匐地被", "高草与杂草", "小灌木"],
        densityMultiplier: 2.5
      }
    ],
    influences: [
      {
        id: "入口活动",
        description:
          story === "inhabited" ? "门前常有人经过，低草仍在，灌木与高草受踩踏" : "小路逐渐废弃，草木回到门前",
        polygon: {
          outer: [
            [-unit * 0.2, bounds.max[2]],
            [unit * 0.2, bounds.max[2]],
            [unit * 0.32, unit * 0.45],
            [-unit * 0.15, unit * 0.55]
          ]
        },
        falloff: unit * 0.15,
        densityMultipliers:
          story === "inhabited"
            ? { 低草铺底: 0.55, 高草与杂草: 0.08, 小灌木: 0, 乔木: 0 }
            : { 低草铺底: 1.2, 高草与杂草: 2, 小灌木: 1.5, 乔木: 0 }
      },
      {
        id: "避扰角落",
        description: "主体背侧少受打扰，灌木、杂草和地被形成不对称的生长团块",
        polygon: {
          outer: [
            [support.min[0] - unit * 0.35, support.min[2] - unit * 0.2],
            [support.min[0] + unit * 0.1, support.min[2] - unit * 0.25],
            [support.min[0] + unit * 0.15, support.max[2]],
            [support.min[0] - unit * 0.25, support.max[2] + unit * 0.1]
          ]
        },
        falloff: unit * 0.2,
        densityMultipliers: { 小灌木: 2.5, 高草与杂草: 2, 匍匐地被: 2 }
      }
    ],
    layers: createNaturalVegetationPreviewLayers(assets, seed),
    budget: { candidates: 180000, instances: 60000 }
  };
}

/** Gallery adapter: borrow library Mesh/Material/ShaderData, own only instance transforms and preview props. */
export class VegetationLandscapePreview {
  private _root?: Entity;
  private _vegetation?: Entity;
  private _vegetationVisible = true;
  private _owned: { destroy: () => void }[] = [];
  private _plan?: VegetationLandscapePlan;
  private _request?: VegetationLandscapeRequest;
  private _direction?: LandscapeSceneDirection;
  private _rendering?: {
    componentRenderers: number;
    renderers: number;
    meshes: number;
    materials: number;
    grass: { cards: number; mesh: number; triangles: number };
    colorAdjustedRenderers: number;
  };
  constructor(
    private readonly _owner: Entity,
    private readonly _library: ProceduralPlantLibraryRuntime,
    private readonly _sourceLibrary: AssetAssemblySourceLibrary,
    private readonly _grassColorTemplate: Uint8Array
  ) {}

  get plan(): VegetationLandscapePlan | undefined {
    return this._plan;
  }
  get request(): VegetationLandscapeRequest | undefined {
    return this._request;
  }
  get direction(): LandscapeSceneDirection | undefined {
    return this._direction;
  }
  get rendering() {
    return this._rendering;
  }

  createExample(
    kind: LandscapeExample,
    seed = 1729,
    story: LandscapeStory = "inhabited",
    grassMode: LandscapeGrassMode = "mesh"
  ): VegetationLandscapeRequest {
    const bounds = this._rockSourceBounds();
    const request = createLandscapeExample(kind, landscapeAssets(this._library.getPlacementSources()), seed, story, [
      bounds.max.x - bounds.min.x,
      bounds.max.y - bounds.min.y,
      bounds.max.z - bounds.min.z
    ]);
    return this.withGrassMode(request, grassMode);
  }

  withGrassMode(request: VegetationLandscapeRequest, mode: LandscapeGrassMode): VegetationLandscapeRequest {
    const sources = this._library.getPlacementSources();
    return withLandscapeGrassMode(
      request,
      mode,
      landscapeAssets([...sources, this._meshGrassDescriptor()]),
      this._sourceLibrary.grass.id
    );
  }

  get grassMode(): LandscapeGrassMode {
    const palette = this._request?.layers.find((layer) => layer.id === LANDSCAPE_GRASS_LAYER)?.palette ?? [];
    const mesh = palette.some((member) => member.assetId === this._sourceLibrary.grass.id);
    return mesh
      ? palette.some((member) => member.assetId !== this._sourceLibrary.grass.id)
        ? "mixed"
        : "mesh"
      : "cards";
  }

  /** Transactional rebuild: validation/allocation failures retain the previous visible plan. */
  apply(request: VegetationLandscapeRequest, direction?: LandscapeSceneDirection): VegetationLandscapePlan {
    const detached = structuredClone(request);
    const originals = this._library.getPlacementSources(true);
    const descriptor = this._meshGrassDescriptor();
    const plan = compileVegetationLandscape(detached, landscapeAssets([...originals, descriptor]));
    const next = this._owner.createChild("Vegetation landscape");
    next.isActive = false;
    const owned: { destroy: () => void }[] = [];
    const renderers: { assetId: string; renderer: MeshRenderer }[] = [];
    const vegetation = next.createChild("Natural vegetation layers");
    vegetation.isActive = this._vegetationVisible;
    let sources: readonly Source[] = [];
    let colorAdjustedRenderers = 0;
    try {
      const grass = this._grassSources(next, originals, descriptor, detached.seed, owned, direction?.grass);
      sources = grass.sources;
      const groundMaterial = this._sourceLibrary.grass.lods[0].renderer.material.clone();
      groundMaterial.shaderData.enableMacro("MATERIAL_GRASS_GROUND_SURFACE");
      groundMaterial.shaderData.enableMacro("MATERIAL_GRASS_SHARED_COLOR_FIELD");
      bindSeedWorldGrassColorField(groundMaterial.shaderData, "material", grass.field);
      owned.push(groundMaterial);
      const bindGround = (renderer: MeshRenderer) => {
        renderer.setMaterial(groundMaterial);
        renderer.castShadows = false;
        renderer.receiveShadows = true;
        renderer.shaderData.setVector4("renderer_GrassRoadColor", LANDSCAPE_ROAD_COLOR);
      };
      const minX = Math.min(...detached.region.outer.map((p) => p[0])),
        maxX = Math.max(...detached.region.outer.map((p) => p[0]));
      const minZ = Math.min(...detached.region.outer.map((p) => p[1])),
        maxZ = Math.max(...detached.region.outer.map((p) => p[1]));
      const ground = next.createChild("Grass colour-field ground");
      ground.transform.setPosition((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
      const groundRenderer = ground.addComponent(MeshRenderer);
      const groundMesh = PrimitiveMesh.createPlane(next.engine, maxX - minX, maxZ - minZ);
      owned.push(groundMesh);
      groundRenderer.mesh = groundMesh;
      bindGround(groundRenderer);
      const sourceMap = new Map(sources.map((s) => [s.entry.id, s]));
      const colors = new Map(direction?.layers.map((layer) => [layer.layerId, layer.color]) ?? []);
      for (const instance of plan.instances)
        colorAdjustedRenderers += this._plant(
          vegetation,
          sourceMap.get(instance.assetId)!,
          instance.position,
          instance.scale,
          instance.yaw,
          renderers,
          instance.scaleAxes,
          colors.get(instance.layerId)
        );
      for (const focus of detached.focalTargets) {
        if (sourceMap.has(focus.objectId)) {
          const source = sourceMap.get(focus.objectId)!;
          const scale = Math.min(
            ...source.bounds.min.map(
              (value, axis) => (focus.bounds.max[axis] - focus.bounds.min[axis]) / (source.bounds.max[axis] - value)
            )
          );
          this._plant(
            next,
            source,
            [
              (focus.bounds.min[0] + focus.bounds.max[0]) / 2,
              focus.bounds.min[1],
              (focus.bounds.min[2] + focus.bounds.max[2]) / 2
            ],
            scale,
            0
          );
        } else if (focus.objectId === "example-rock") this._rock(next, focus.bounds);
        else if (focus.objectId === "example-building") this._building(next, focus.bounds, owned);
        else this._box(next, focus.bounds, new Color(0.42, 0.35, 0.22, 1), owned);
      }
      // Soil core and fading shoulder share the upstream width used by planting constraints.
      for (const path of detached.paths) {
        const positions: Vector3[] = [],
          normals: Vector3[] = [],
          colors: Color[] = [],
          indices: number[] = [];
        const shoulder = path.shoulder ?? 0,
          core = path.width / 2,
          outer = core + shoulder;
        path.points.slice(1).forEach((b, i) => {
          const a = path.points[i],
            dx = b[0] - a[0],
            dz = b[1] - a[1],
            length = Math.hypot(dx, dz);
          if (!length) return;
          const offset = positions.length;
          for (const p of [a, b])
            for (const x of [-outer, -core, core, outer]) {
              positions.push(new Vector3(p[0] + (dz / length) * x, 0.012, p[1] - (dx / length) * x));
              normals.push(new Vector3(0, 1, 0));
              // Vertex channels carry grass / road / soil weights, not already-lit RGB.
              colors.push(Math.abs(x) > core ? new Color(1, 0, 0, 1) : new Color(0, 1, 0, 1));
            }
          for (let j = 0; j < 3; j++)
            indices.push(offset + j, offset + j + 4, offset + j + 1, offset + j + 1, offset + j + 4, offset + j + 5);
        });
        const mesh = new ModelMesh(next.engine);
        mesh.setPositions(positions);
        mesh.setNormals(normals);
        mesh.setColors(colors);
        mesh.setIndices(new Uint32Array(indices));
        mesh.addSubMesh(0, indices.length);
        mesh.uploadData(true);
        owned.push(mesh);
        const renderer = next.createChild(path.id).addComponent(MeshRenderer);
        renderer.mesh = mesh;
        bindGround(renderer);
        renderer.enableVertexColor = true;
      }
    } catch (error) {
      destroyPreviewTree(next);
      destroyPreviewResources(owned);
      throw error;
    }
    this.clear();
    this._root = next;
    this._vegetation = vegetation;
    this._owned = owned;
    this._plan = plan;
    this._request = detached;
    this._direction = direction ? structuredClone(direction) : undefined;
    const componentCounts = new Map(
      this._library.getPlacementSources().map((source) => [source.entry.id, source.renderers.length])
    );
    componentCounts.set(this._sourceLibrary.grass.id, 1);
    const grass = { cards: 0, mesh: 0, triangles: 0 };
    for (const instance of plan.instances.filter((instance) => instance.layerId === LANDSCAPE_GRASS_LAYER)) {
      grass[instance.assetId === this._sourceLibrary.grass.id ? "mesh" : "cards"]++;
      const source = sources.find((source) => source.entry.id === instance.assetId)!;
      grass.triangles += source.renderers.reduce(
        (sum, renderer) => sum + renderer.mesh!.subMeshes.reduce((sum, subMesh) => sum + subMesh.count / 3, 0),
        0
      );
    }
    this._rendering = {
      componentRenderers: plan.instances.reduce((sum, instance) => sum + componentCounts.get(instance.assetId)!, 0),
      renderers: renderers.length,
      meshes: new Set(renderers.map(({ renderer }) => renderer.mesh)).size,
      materials: new Set(renderers.flatMap(({ renderer }) => renderer.getMaterials())).size,
      grass,
      colorAdjustedRenderers
    };
    this._library.setPopulationRenderers(renderers);
    next.isActive = true;
    return plan;
  }

  setVegetationVisible(visible: boolean): void {
    this._vegetationVisible = visible;
    if (this._vegetation) this._vegetation.isActive = visible;
  }

  clear(): void {
    this._library.setPopulationRenderers([]);
    destroyPreviewTree(this._root);
    this._root = undefined;
    this._vegetation = undefined;
    destroyPreviewResources(this._owned);
    this._owned = [];
  }

  getBounds(): LandscapeBounds {
    if (!this._request) throw new Error("No landscape plan");
    const points = this._request.region.outer;
    return {
      min: [Math.min(...points.map((p) => p[0])), 0, Math.min(...points.map((p) => p[1]))],
      max: [
        Math.max(...points.map((p) => p[0])),
        Math.max(
          0,
          ...this._plan!.instances.map((i) => i.position[1] + i.height),
          ...this._request.focalTargets.map((f) => f.bounds.max[1])
        ),
        Math.max(...points.map((p) => p[1]))
      ]
    };
  }

  /** Measure the exact authored prefab, including its source transform; never fit it to another species. */
  private _meshGrassDescriptor(): Source {
    const binding = this._sourceLibrary.grass.lods[0].renderer;
    const bounds = new BoundingBox();
    BoundingBox.transform(binding.mesh.bounds, binding.localMatrix, bounds);
    return {
      entry: { id: this._sourceLibrary.grass.id },
      renderers: [],
      placementOrigin: [0, 0, 0],
      bounds: { min: [bounds.min.x, bounds.min.y, bounds.min.z], max: [bounds.max.x, bounds.max.y, bounds.max.z] }
    };
  }

  /** The same Terrain/Grass material, source geometry, colour-field texture and tuning as Seed World.
   * Each instance is still a native MeshRenderer, batched by the engine's GPU Instance path. */
  private _grassSources(
    owner: Entity,
    sources: readonly Source[],
    meshSource: Source,
    seed: number,
    owned: { destroy(): void }[],
    palette?: LandscapeSceneDirection["grass"]
  ): { sources: readonly Source[]; field: SeedWorldGrassColorFieldBinding } {
    const root = owner.createChild("Shared Seed World grass source");
    root.isActive = false;
    const binding = this._sourceLibrary.grass.lods[0].renderer;
    const material = binding.material.clone();
    owned.push(material);
    material.shaderData.setFloat(
      "material_GrassFadeDistance",
      SEED_WORLD_POPULATION_RUNTIME_PROFILE.detail.materialFade.maximumDistanceMetres
    );
    // Distance fading is a material policy, independent of the instance buffer layout.
    material.shaderData.enableMacro("MATERIAL_GRASS_RADIAL_DISTANCE_FADE");
    const texture = createSeedWorldSurfaceColorFieldTexture(
      owner.engine,
      bakeSeedWorldSurfaceColorField(seed, this._grassColorTemplate)
    );
    owned.push(texture);
    const renderer = root.createChild(meshSource.entry.id).addComponent(MeshRenderer);
    renderer.mesh = binding.mesh;
    renderer.setMaterial(material);
    renderer.entity.transform.localMatrix = binding.localMatrix.clone();
    renderer.enableVertexColor = binding.enableVertexColor;
    renderer.castShadows = binding.castShadows;
    renderer.receiveShadows = binding.receiveShadows;
    const field = {
      texture,
      tuning: palette
        ? freezeSeedWorldGrassColorFieldTuning({ ...SEED_WORLD_GRASS_COLOR_FIELD_DEFAULTS, ...palette })
        : SEED_WORLD_GRASS_COLOR_FIELD_DEFAULTS
    };
    material.shaderData.enableMacro("MATERIAL_GRASS_SHARED_COLOR_FIELD");
    bindSeedWorldGrassColorField(material.shaderData, "material", field);
    return { sources: [...sources, { ...meshSource, renderers: [renderer] }], field };
  }

  private _plant(
    owner: Entity,
    source: Source,
    position: LandscapePosition,
    scale: number,
    yaw: number,
    owners?: { assetId: string; renderer: MeshRenderer }[],
    scaleAxes?: LandscapePosition,
    color?: LandscapeColorAdjustment
  ): number {
    const parent = owner.createChild(source.entry.id);
    let adjusted = 0;
    parent.transform.setPosition(...position);
    parent.transform.setScale(...(scaleAxes ?? ([scale, scale, scale] as const)));
    parent.transform.setRotation(0, yaw, 0);
    const origin = new Matrix();
    const placementOrigin = source.placementOrigin ?? [
      (source.bounds.min[0] + source.bounds.max[0]) / 2,
      source.bounds.min[1],
      (source.bounds.min[2] + source.bounds.max[2]) / 2
    ];
    origin.elements[12] = -placementOrigin[0];
    origin.elements[13] = -placementOrigin[1];
    origin.elements[14] = -placementOrigin[2];
    for (const original of source.renderers) {
      const child = parent.createChild(original.entity.name),
        renderer = child.addComponent(MeshRenderer);
      const local = new Matrix();
      Matrix.multiply(origin, original.entity.transform.worldMatrix, local);
      child.transform.localMatrix = local;
      renderer.mesh = original.mesh;
      renderer.setMaterials([...original.getMaterials()]);
      original.shaderData.cloneTo(renderer.shaderData);
      const foliage = original
        .getMaterials()
        .some((material) =>
          material?.shaderData
            .getMacros()
            .some(
              (macro) =>
                macro.name === "MATERIAL_VEGETATION_CLIMATE_LEAF" || macro.name === "MATERIAL_VEGETATION_CLIMATE_GRASS"
            )
        );
      if (color && (!color.foliageOnly || foliage)) {
        const originalColor = original.shaderData.getVector4("renderer_AssetAssemblyColor");
        if (originalColor) {
          const rgb = adjustLandscapeColor([originalColor.x, originalColor.y, originalColor.z], color);
          renderer.shaderData.setVector4("renderer_AssetAssemblyColor", new Vector4(...rgb, originalColor.w));
          if (original.shaderData.getVector4("renderer_ProceduralTreeLeafColor"))
            renderer.shaderData.setVector4("renderer_ProceduralTreeLeafColor", new Vector4(...rgb, originalColor.w));
          adjusted++;
        }
      }
      renderer.enableVertexColor = original.enableVertexColor;
      renderer.castShadows = original.castShadows;
      renderer.receiveShadows = original.receiveShadows;
      owners?.push({ assetId: source.entry.id, renderer });
    }
    return adjusted;
  }

  private _rock(owner: Entity, bounds: LandscapeBounds): void {
    const sources = this._sourceLibrary.rock.lods[0].renderers;
    const sourceBounds = this._rockSourceBounds();
    const size = [
      sourceBounds.max.x - sourceBounds.min.x,
      sourceBounds.max.y - sourceBounds.min.y,
      sourceBounds.max.z - sourceBounds.min.z
    ];
    const scale = Math.min(...size.map((v, i) => (bounds.max[i] - bounds.min[i]) / v));
    const parent = owner.createChild("Rock focal object");
    parent.transform.setScale(scale, scale, scale);
    parent.transform.setPosition(
      (bounds.min[0] + bounds.max[0]) / 2 - ((sourceBounds.min.x + sourceBounds.max.x) / 2) * scale,
      bounds.min[1] - sourceBounds.min.y * scale,
      (bounds.min[2] + bounds.max[2]) / 2 - ((sourceBounds.min.z + sourceBounds.max.z) / 2) * scale
    );
    for (const source of sources) {
      const child = parent.createChild("Rock"),
        renderer = child.addComponent(MeshRenderer);
      child.transform.localMatrix = source.localMatrix;
      renderer.mesh = source.mesh;
      renderer.setMaterial(source.material);
      renderer.enableVertexColor = source.enableVertexColor;
      renderer.castShadows = true;
      renderer.receiveShadows = true;
    }
  }

  private _rockSourceBounds() {
    const sources = this._sourceLibrary.rock.lods[0].renderers;
    const bounds = sources[0].mesh.bounds.clone().transform(sources[0].localMatrix);
    for (const source of sources.slice(1)) {
      const part = source.mesh.bounds.clone().transform(source.localMatrix);
      Vector3.min(bounds.min, part.min, bounds.min);
      Vector3.max(bounds.max, part.max, bounds.max);
    }
    return bounds;
  }

  private _box(owner: Entity, bounds: LandscapeBounds, color: Color, owned: { destroy: () => void }[]): Entity {
    const entity = owner.createChild("External focal volume"),
      renderer = entity.addComponent(MeshRenderer);
    const mesh = PrimitiveMesh.createCuboid(owner.engine, 1, 1, 1),
      material = new PBRMaterial(owner.engine);
    material.baseColor = color;
    material.roughness = 0.9;
    owned.push(mesh, material);
    renderer.mesh = mesh;
    renderer.setMaterial(material);
    renderer.castShadows = true;
    renderer.receiveShadows = true;
    entity.transform.setPosition(...(bounds.min.map((v, i) => (v + bounds.max[i]) / 2) as [number, number, number]));
    entity.transform.setScale(...(bounds.min.map((v, i) => bounds.max[i] - v) as [number, number, number]));
    return entity;
  }

  /** A labelled architectural massing example; production buildings are owned by the upstream world. */
  private _building(owner: Entity, b: LandscapeBounds, owned: { destroy: () => void }[]): void {
    const [x, y, z] = b.min,
      [X, Y, Z] = b.max,
      h = Y - y,
      w = X - x,
      d = Z - z;
    this._box(owner, { min: b.min, max: [X, y + h * 0.67, Z] }, new Color(0.52, 0.34, 0.16, 1), owned);
    const roof = new ModelMesh(owner.engine);
    const vertices = [
      new Vector3(x, y + h * 0.67, z),
      new Vector3(X, y + h * 0.67, z),
      new Vector3((x + X) / 2, Y, z),
      new Vector3(x, y + h * 0.67, Z),
      new Vector3(X, y + h * 0.67, Z),
      new Vector3((x + X) / 2, Y, Z)
    ];
    const indices = [0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4];
    const positions: Vector3[] = [],
      normals: Vector3[] = [];
    for (let i = 0; i < indices.length; i += 3) {
      const a = vertices[indices[i]],
        b = vertices[indices[i + 1]],
        c = vertices[indices[i + 2]];
      const ab = new Vector3(),
        ac = new Vector3(),
        normal = new Vector3();
      Vector3.subtract(b, a, ab);
      Vector3.subtract(c, a, ac);
      Vector3.cross(ab, ac, normal);
      normal.normalize();
      positions.push(a, b, c);
      normals.push(normal.clone(), normal.clone(), normal.clone());
    }
    roof.setPositions(positions);
    roof.setNormals(normals);
    roof.setIndices(new Uint16Array(indices.map((_, i) => i)));
    roof.addSubMesh(0, indices.length);
    roof.uploadData(true);
    const material = new PBRMaterial(owner.engine);
    material.baseColor = new Color(0.16, 0.09, 0.055, 1);
    material.roughness = 1;
    const renderer = owner.createChild("Cabin roof").addComponent(MeshRenderer);
    renderer.mesh = roof;
    renderer.setMaterial(material);
    renderer.castShadows = true;
    owned.push(roof, material);
    this._box(
      owner,
      { min: [x + w * 0.42, y, Z], max: [x + w * 0.58, y + h * 0.45, Z + d * 0.012] },
      new Color(0.09, 0.055, 0.025, 1),
      owned
    );
    for (const t of [0.18, 0.7])
      this._box(
        owner,
        { min: [x + w * t, y + h * 0.28, Z], max: [x + w * (t + 0.12), y + h * 0.48, Z + d * 0.014] },
        new Color(0.75, 0.6, 0.25, 1),
        owned
      );
  }
}
