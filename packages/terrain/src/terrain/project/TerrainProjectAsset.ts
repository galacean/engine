import {
  BufferAsset,
  JSONAsset,
  Material,
  Matrix,
  MeshRenderer,
  ModelMesh,
  PrefabResource,
  ReferResource,
  Script,
  Texture2D
} from "@galacean/engine";
import {
  decodeTerrainDetailTransforms,
  decodeTerrainHeightmap,
  validateTerrainProjectRuntimeDocument
} from "./TerrainProjectCodec";
import type {
  TerrainProjectDocument,
  TerrainProjectDetailTransforms,
  TerrainProjectLodGroup,
  TerrainProjectPrototypeGeometry,
  TerrainProjectPrototypeRenderer,
  TerrainProjectRegion,
  TerrainProjectWorldRegion
} from "./TerrainProjectContract";
import { collectTerrainProjectRenderableRefs } from "./TerrainProjectResidency";

/** Standard Scene-resolved texture resources for one TerrainLayer. */
export interface TerrainProjectLayerResources {
  id: string;
  diffuse: Texture2D;
  normal: Texture2D;
  mask?: Texture2D;
}

/** Standard Scene-resolved exact-transform resource for one detail prototype. */
export interface TerrainProjectDetailTransformResources {
  prototypeId: string;
  transforms: BufferAsset;
}

/** Standard Scene-resolved texture resource for one texture detail prototype. */
export interface TerrainProjectDetailTextureResources {
  prototypeId: string;
  texture: Texture2D;
}

/** Standard Scene-resolved Prefab resource for one prototype. */
export interface TerrainProjectPrototypeResources {
  prototypeId: string;
  prefab: PrefabResource;
}

/** Nested `$ref` bundle passed to the Scene Script after stock loaders finish. */
export interface TerrainProjectRegionResources {
  descriptor: TerrainProjectWorldRegion;
  manifest: JSONAsset;
  heightmap: BufferAsset;
  holes?: BufferAsset;
  alphamaps: BufferAsset[];
  detailTransforms: TerrainProjectDetailTransformResources[];
  detailTextures: TerrainProjectDetailTextureResources[];
  material: Material;
  layers: TerrainProjectLayerResources[];
  prototypes: TerrainProjectPrototypeResources[];
  placedPrefabs: TerrainProjectPrototypeResources[];
}

/** Prefab metadata component carrying authored LODGroup semantics. */
export class TerrainPrototypeMetadata extends Script {
  /** Exact authored renderer selectors and optional LODGroup semantics. */
  geometry: TerrainProjectPrototypeGeometry = {
    kind: "renderers",
    renderers: []
  };
}

/** One resolved Prefab renderer and its exact one-primitive binding. */
export interface TerrainProjectResolvedRenderer {
  /** Stable child-index path from the Prefab root to the renderer Entity. */
  entityPath: readonly number[];
  /** Exact `MeshRenderer` component index on the selected Entity. */
  componentIndex: number;
  /** Renderer mesh retained from the instantiated Prefab binding. */
  mesh: ModelMesh;
  /** Renderer material retained from the instantiated Prefab binding. */
  material: Material;
  /** Renderer Entity transform relative to the Prefab root. */
  localMatrix: Matrix;
  /** Inverse-transpose of `localMatrix` used to transform normals. */
  localNormalMatrix: Matrix;
  /** Whether the authored renderer casts shadows. */
  castShadows: boolean;
  /** Whether the authored renderer receives shadows. */
  receiveShadows: boolean;
  /** Whether the authored renderer consumes vertex colors. */
  enableVertexColor: boolean;
  /** Whether Prefab metadata explicitly permits exact Detail instance attributes. */
  detailInstancing: boolean;
  /** Whether Prefab metadata explicitly permits cylindrical Billboard instance attributes. */
  billboardInstancing: boolean;
}

/** One resolved authored LOD. */
export interface TerrainProjectResolvedLod {
  screenRelativeTransitionHeight: number;
  fadeTransitionWidth: number;
  renderers: readonly TerrainProjectResolvedRenderer[];
}

/** Resolved Prefab metadata consumed by surface renderer adapters. */
export type TerrainProjectResolvedGeometry =
  | {
      kind: "lod-group";
      lodGroup: {
        fadeMode: "None" | "CrossFade";
        animateCrossFading: boolean;
        localReferencePoint: TerrainProjectLodGroup["localReferencePoint"];
        size: number;
        lods: readonly TerrainProjectResolvedLod[];
      };
    }
  | {
      kind: "renderers";
      renderers: readonly TerrainProjectResolvedRenderer[];
    };

/** Validated Region assembled only from assets resolved by standard Project loaders. */
export class TerrainProjectAsset {
  /** Standard resources the owning Scene Script must retain while this Region is loaded. */
  readonly dependencies: readonly ReferResource[];

  /**
   * Creates one renderer-agnostic Region asset.
   * @param document Canonical decoded Region data.
   * @param terrainMaterial Standard Project Material for terrain rendering.
   * @param layerTextures Standard Project Textures keyed by layer id.
   * @param prototypePrefabs Standard Project Prefabs keyed by prototype id.
   * @param prototypeGeometries Prefab-extracted renderer metadata keyed by prototype id.
   * @param placedPrefabs Standard ordinary Prefabs keyed by placed prototype id.
   * @param placedPrefabGeometries Optional authored renderer metadata keyed by placed prototype id.
   * @param dependencies Standard Project resources retained by the owning Scene Script.
   */
  constructor(
    public readonly document: TerrainProjectDocument,
    public readonly terrainMaterial: Material,
    public readonly layerTextures: ReadonlyMap<string, TerrainProjectLayerResources>,
    public readonly prototypePrefabs: ReadonlyMap<string, PrefabResource>,
    public readonly prototypeGeometries: ReadonlyMap<string, TerrainProjectResolvedGeometry>,
    public readonly placedPrefabs: ReadonlyMap<string, PrefabResource>,
    public readonly placedPrefabGeometries: ReadonlyMap<string, TerrainProjectResolvedGeometry>,
    dependencies: readonly ReferResource[]
  ) {
    this.dependencies = [...new Set(dependencies)];
  }
}

/**
 * Assembles one canonical Region from nested Scene `$ref` results.
 * @param resources Assets already resolved by JSON, Buffer, Material, Texture, and Prefab loaders.
 * @returns Validated Region asset with Prefab renderer metadata.
 * @throws If a resource type, source id, payload, or Prefab binding is invalid.
 */
export function resolveTerrainProjectRegion(resources: TerrainProjectRegionResources): TerrainProjectAsset {
  requireResource(resources.manifest, JSONAsset, "Region manifest");
  requireResource(resources.heightmap, BufferAsset, "heightmap");
  if (resources.holes) requireResource(resources.holes, BufferAsset, "holes");
  requireResource(resources.material, Material, "Terrain Material");
  const manifest = resources.manifest.data as TerrainProjectRegion;
  const detailTransforms = new Map<string, TerrainProjectDetailTransforms>();
  for (const detail of resources.detailTransforms) {
    requireResource(detail.transforms, BufferAsset, `detail transforms "${detail.prototypeId}"`);
    if (detailTransforms.has(detail.prototypeId)) {
      throw new Error(`Duplicate detail transforms "${detail.prototypeId}"`);
    }
    detailTransforms.set(detail.prototypeId, decodeTerrainDetailTransforms(bytesFromBuffer(detail.transforms)));
  }
  for (const detail of resources.detailTextures) {
    requireResource(detail.texture, Texture2D, `detail texture "${detail.prototypeId}"`);
  }
  const renderableRefs = collectTerrainProjectRenderableRefs(manifest);
  const resolvedDetailTextureIds = new Set(resources.detailTextures.map((detail) => detail.prototypeId));
  const declaredDetailTextureIds = new Set(
    manifest.detailPrototypes.flatMap((prototype) => (prototype.texture ? [prototype.id] : []))
  );
  if (
    resolvedDetailTextureIds.size !== resources.detailTextures.length ||
    [...renderableRefs.textureDetailPrototypeIds].some((id) => !resolvedDetailTextureIds.has(id)) ||
    [...resolvedDetailTextureIds].some((id) => !declaredDetailTextureIds.has(id))
  ) {
    throw new Error(`Region "${resources.descriptor.id}" did not resolve every active detail Texture`);
  }
  const layerTextures = new Map<string, TerrainProjectLayerResources>();
  for (const layer of resources.layers) {
    requireResource(layer.diffuse, Texture2D, `layer "${layer.id}" diffuse Texture`);
    requireResource(layer.normal, Texture2D, `layer "${layer.id}" normal Texture`);
    if (layer.mask) requireResource(layer.mask, Texture2D, `layer "${layer.id}" mask Texture`);
    if (layerTextures.has(layer.id)) throw new Error(`Duplicate layer resources "${layer.id}"`);
    layerTextures.set(layer.id, layer);
  }
  const prototypeGeometries = new Map<string, TerrainProjectResolvedGeometry>();
  const prototypePrefabs = new Map<string, PrefabResource>();
  for (const prototype of resources.prototypes) {
    requireResource(prototype.prefab, PrefabResource, `prototype "${prototype.prototypeId}" Prefab`);
    if (prototypeGeometries.has(prototype.prototypeId)) {
      throw new Error(`Duplicate prototype Prefab "${prototype.prototypeId}"`);
    }
    prototypePrefabs.set(prototype.prototypeId, prototype.prefab);
    prototypeGeometries.set(prototype.prototypeId, resolvePrototypePrefab(prototype.prefab, prototype.prototypeId));
  }
  const placedPrefabs = new Map<string, PrefabResource>();
  const placedPrefabGeometries = new Map<string, TerrainProjectResolvedGeometry>();
  for (const prototype of resources.placedPrefabs) {
    requireResource(prototype.prefab, PrefabResource, `placed prototype "${prototype.prototypeId}" Prefab`);
    if (placedPrefabs.has(prototype.prototypeId)) {
      throw new Error(`Duplicate placed prototype Prefab "${prototype.prototypeId}"`);
    }
    placedPrefabs.set(prototype.prototypeId, prototype.prefab);
    const geometry = resolveTerrainProjectPrefabGeometry(prototype.prefab, prototype.prototypeId);
    if (geometry) placedPrefabGeometries.set(prototype.prototypeId, geometry);
  }
  const document: TerrainProjectDocument = {
    descriptor: resources.descriptor,
    manifest,
    heightmap: decodeTerrainHeightmap(bytesFromBuffer(resources.heightmap)),
    holes: resources.holes ? bytesFromBuffer(resources.holes) : createSolidHoles(manifest),
    alphamaps: resources.alphamaps.map((asset, index) => {
      requireResource(asset, BufferAsset, `alphamap ${index}`);
      return bytesFromBuffer(asset);
    }),
    detailMaps: new Map(),
    detailTransforms
  };
  validateTerrainProjectRuntimeDocument(document);
  if (layerTextures.size !== manifest.layers.length) {
    throw new Error(
      `Region "${resources.descriptor.id}" resolved ${layerTextures.size} layer resources; expected ${manifest.layers.length}`
    );
  }
  const expectedPrefabIds = renderableRefs.prefabPrototypeIds;
  const declaredPrefabIds = new Set([
    ...manifest.treePrototypes.map((prototype) => prototype.id),
    ...manifest.detailPrototypes.flatMap((prototype) => (prototype.prefab ? [prototype.id] : []))
  ]);
  if (
    [...expectedPrefabIds].some((id) => !prototypeGeometries.has(id)) ||
    [...prototypeGeometries.keys()].some((id) => !declaredPrefabIds.has(id))
  ) {
    throw new Error(`Region "${resources.descriptor.id}" did not resolve every prototype Prefab`);
  }
  const expectedPlacedPrefabIds = renderableRefs.placedPrefabPrototypeIds;
  if (
    placedPrefabs.size !== expectedPlacedPrefabIds.size ||
    [...placedPrefabs.keys()].some((id) => !expectedPlacedPrefabIds.has(id))
  ) {
    throw new Error(`Region "${resources.descriptor.id}" did not resolve every placed Prefab`);
  }
  const prototypeRendererDependencies = [...prototypeGeometries.values(), ...placedPrefabGeometries.values()].flatMap(
    (geometry) => {
      const renderers =
        geometry.kind === "lod-group" ? geometry.lodGroup.lods.flatMap((lod) => lod.renderers) : geometry.renderers;
      return renderers.flatMap((renderer) => [renderer.mesh, renderer.material]);
    }
  );
  return new TerrainProjectAsset(
    document,
    resources.material,
    layerTextures,
    prototypePrefabs,
    prototypeGeometries,
    placedPrefabs,
    placedPrefabGeometries,
    [
      resources.material,
      ...resources.detailTextures.map((detail) => detail.texture),
      ...resources.layers.flatMap((layer) => [layer.diffuse, layer.normal, ...(layer.mask ? [layer.mask] : [])]),
      ...prototypePrefabs.values(),
      ...placedPrefabs.values(),
      ...prototypeRendererDependencies
    ]
  );
}

function createSolidHoles(manifest: TerrainProjectRegion): Uint8Array {
  const width = manifest.holes?.sampleSize[0] ?? manifest.heightmap.sampleSize[0] - 1;
  const height = manifest.holes?.sampleSize[1] ?? manifest.heightmap.sampleSize[1] - 1;
  return new Uint8Array(width * height).fill(255);
}

function resolvePrototypePrefab(prefab: PrefabResource, prototypeId: string): TerrainProjectResolvedGeometry {
  const geometry = resolveTerrainProjectPrefabGeometry(prefab, prototypeId);
  if (!geometry) throw new Error(`Prototype "${prototypeId}" Prefab requires TerrainPrototypeMetadata`);
  return geometry;
}

/**
 * Resolves the exact Mesh, Material, transform, shadow, and LOD bindings authored by one standard Prefab.
 * @param prefab Standard Project Prefab resource.
 * @param prototypeId Stable identity used in validation errors.
 * @returns Renderer geometry declared by TerrainPrototypeMetadata, or null when the Prefab has no metadata.
 * @throws If a declared renderer, Material, transform, or LOD binding is invalid.
 */
export function resolveTerrainProjectPrefabGeometry(
  prefab: PrefabResource,
  prototypeId: string
): TerrainProjectResolvedGeometry | null {
  const root = prefab.instantiate();
  if (!root) throw new Error(`Prototype "${prototypeId}" Prefab could not be instantiated`);
  try {
    const metadata = root.getComponent(TerrainPrototypeMetadata);
    if (!metadata) return null;
    validatePrototypeGeometry(prototypeId, metadata.geometry);
    const inverseRootMatrix = root.transform.worldMatrix.clone();
    invertFiniteMatrix(inverseRootMatrix, inverseRootMatrix, `Prototype "${prototypeId}" Prefab root transform`);
    const resolveRenderer = (binding: TerrainProjectPrototypeRenderer): TerrainProjectResolvedRenderer => {
      const entity = resolveEntityPath(root, binding.entityPath);
      const renderers: MeshRenderer[] = [];
      entity?.getComponents(MeshRenderer, renderers);
      const renderer = renderers[binding.componentIndex];
      if (!renderer || renderer.constructor !== MeshRenderer || !(renderer.mesh instanceof ModelMesh)) {
        throw new Error(`Prototype "${prototypeId}" Prefab renderer selector has no exact ModelMesh`);
      }
      const materials = renderer.getMaterials();
      if (materials.length !== 1 || !(materials[0] instanceof Material)) {
        throw new Error(`Prototype "${prototypeId}" Prefab renderer selector must bind one Material`);
      }
      const localMatrix = new Matrix();
      Matrix.multiply(inverseRootMatrix, entity.transform.worldMatrix.clone(), localMatrix);
      const localNormalMatrix = localMatrix.clone();
      const selector = `${binding.entityPath.length ? binding.entityPath.join("/") : "<root>"}:${binding.componentIndex}`;
      invertFiniteMatrix(
        localNormalMatrix,
        localNormalMatrix,
        `Prototype "${prototypeId}" Prefab renderer selector "${selector}" transform`
      );
      localNormalMatrix.transpose();
      return {
        entityPath: [...binding.entityPath],
        componentIndex: binding.componentIndex,
        mesh: renderer.mesh,
        material: materials[0],
        localMatrix,
        localNormalMatrix,
        castShadows: renderer.castShadows,
        receiveShadows: renderer.receiveShadows,
        enableVertexColor: renderer.enableVertexColor,
        detailInstancing: binding.detailInstancing === true,
        billboardInstancing: binding.billboardInstancing === true
      };
    };
    if (metadata.geometry.kind === "renderers") {
      return {
        kind: "renderers",
        renderers: metadata.geometry.renderers.map(resolveRenderer)
      };
    }
    return {
      kind: "lod-group",
      lodGroup: {
        fadeMode: metadata.geometry.lodGroup.fadeMode,
        animateCrossFading: metadata.geometry.lodGroup.animateCrossFading,
        localReferencePoint: [...metadata.geometry.lodGroup.localReferencePoint],
        size: metadata.geometry.lodGroup.size,
        lods: metadata.geometry.lodGroup.lods.map((lod) => ({
          screenRelativeTransitionHeight: lod.screenRelativeTransitionHeight,
          fadeTransitionWidth: lod.fadeTransitionWidth,
          renderers: lod.renderers.map(resolveRenderer)
        }))
      }
    };
  } finally {
    root.destroy();
  }
}

function invertFiniteMatrix(source: Matrix, out: Matrix, label: string): void {
  const elements = source.elements;
  for (let index = 0; index < elements.length; index++) {
    if (!Number.isFinite(elements[index])) throw new Error(`${label} must be finite and invertible`);
  }
  const determinant = source.determinant();
  if (!Number.isFinite(determinant) || determinant === 0) {
    throw new Error(`${label} must be finite and invertible`);
  }
  Matrix.invert(source, out);
  const inverseElements = out.elements;
  for (let index = 0; index < inverseElements.length; index++) {
    if (!Number.isFinite(inverseElements[index])) throw new Error(`${label} must be finite and invertible`);
  }
}

function validatePrototypeGeometry(prototypeId: string, geometry: TerrainProjectPrototypeGeometry): void {
  if (geometry.kind === "renderers") {
    validateRendererBindings(prototypeId, "direct", geometry.renderers);
    return;
  }
  const { lodGroup } = geometry;
  if (lodGroup.fadeMode !== "None" && lodGroup.fadeMode !== "CrossFade") {
    throw new Error(`Prototype "${prototypeId}" has unsupported fade mode`);
  }
  if (
    !Array.isArray(lodGroup.localReferencePoint) ||
    lodGroup.localReferencePoint.length !== 3 ||
    lodGroup.localReferencePoint.some((value) => !Number.isFinite(value)) ||
    !Number.isFinite(lodGroup.size) ||
    lodGroup.size <= 0
  ) {
    throw new Error(`Prototype "${prototypeId}" has invalid LOD reference geometry`);
  }
  if (!lodGroup.lods.length) throw new Error(`Prototype "${prototypeId}" requires at least one LOD`);
  let previousHeight = Number.POSITIVE_INFINITY;
  for (let index = 0; index < lodGroup.lods.length; index++) {
    const lod = lodGroup.lods[index];
    if (
      !Number.isFinite(lod.screenRelativeTransitionHeight) ||
      lod.screenRelativeTransitionHeight < 0 ||
      lod.screenRelativeTransitionHeight > 1 ||
      lod.screenRelativeTransitionHeight >= previousHeight
    ) {
      throw new Error(`Prototype "${prototypeId}" LOD ${index} has an invalid transition height`);
    }
    if (!Number.isFinite(lod.fadeTransitionWidth) || lod.fadeTransitionWidth < 0 || lod.fadeTransitionWidth > 1) {
      throw new Error(`Prototype "${prototypeId}" LOD ${index} has an invalid fade width`);
    }
    previousHeight = lod.screenRelativeTransitionHeight;
    validateRendererBindings(prototypeId, `LOD ${index}`, lod.renderers);
  }
}

function validateRendererBindings(
  prototypeId: string,
  scope: string,
  renderers: readonly TerrainProjectPrototypeRenderer[]
): void {
  if (!renderers.length) throw new Error(`Prototype "${prototypeId}" ${scope} requires renderer bindings`);
  const selectors = new Set(renderers.map((renderer) => `${renderer.entityPath.join("/")}:${renderer.componentIndex}`));
  if (
    selectors.size !== renderers.length ||
    renderers.some(
      (renderer) =>
        !Array.isArray(renderer.entityPath) ||
        renderer.entityPath.some((index) => !Number.isInteger(index) || index < 0) ||
        !Number.isInteger(renderer.componentIndex) ||
        renderer.componentIndex < 0 ||
        (renderer.detailInstancing !== undefined && renderer.detailInstancing !== true) ||
        (renderer.billboardInstancing !== undefined && renderer.billboardInstancing !== true)
    )
  ) {
    throw new Error(`Prototype "${prototypeId}" ${scope} renderer selectors must be valid and unique`);
  }
}

function resolveEntityPath(root: ReturnType<PrefabResource["instantiate"]>, path: readonly number[]) {
  let entity = root;
  for (const childIndex of path) {
    entity = entity?.children[childIndex];
  }
  return entity;
}

function bytesFromBuffer(asset: BufferAsset): Uint8Array {
  return new Uint8Array(asset.buffer).slice();
}

function requireResource<T>(
  value: unknown,
  ResourceType: abstract new (...args: never[]) => T,
  label: string
): asserts value is T {
  if (!(value instanceof ResourceType)) throw new Error(`${label} did not resolve through its standard Project loader`);
}
