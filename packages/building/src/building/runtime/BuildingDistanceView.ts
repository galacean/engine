import { buildingPartKey, buildingGroupKey } from "./BuildingObjectIdentity";
import type { PrefabResource } from "@galacean/engine";
import { constructionStoneFloorGLSL } from "./ConstructionStoneFloorShader";
import { leaseStoneFloorTextures } from "./ConstructionStoneFloorTextures";
import { createConstructionLodTexture } from "./ConstructionLodTexture";
import type { ConstructionLodAppearance } from "./ConstructionLodAppearance";
import {
  constructionEntranceGLSL,
  constructionEntranceCoverageGLSL,
  entranceBinding
} from "./ConstructionEntranceShader";
import { constructionEntranceRanges, type ConstructionEntranceState } from "./ConstructionEntrance";
import entranceShadow from "./ConstructionEntranceShadow.shader?raw";
import { subscribeDistanceAppearance } from "./MasonryDistanceAppearance";
import { plannedMasonryVertexData } from "./MasonryDistanceVertexData";
import { constructionDecorationGLSL } from "./ConstructionDecorationShader";
import { leaseDecorationTextures } from "./ConstructionDecorationTextures";
import { registerConstructionSceneLighting } from "./ConstructionSceneLighting";
import { leasePlasterTextures } from "./ConstructionPlasterTextures";
import { constructionPlasterGLSL, constructionPlasterFinishGLSL } from "./ConstructionPlasterShader";
import { uploadRestorableModelMesh } from "@galacean/engine-modify/rendering/RestorableResources";
import { masonryAppearance, masonryTintGLSL, restoreMasonryTextureSamples } from "./MasonryAppearance";
import { masonryColorSeed } from "./MasonryColorRules";
import lodDither from "./MasonryLodDither.glsl?raw";
import {
  CompareFunction,
  Vector4,
  Buffer,
  BufferBindFlag,
  BufferUsage,
  VertexAttribute,
  VertexElement,
  VertexElementFormat,
  ModelMesh,
  MeshRenderer,
  PBRMaterial,
  Material,
  RenderFace,
  Shader,
  ShaderLanguage,
  ShaderFactory,
  type Engine,
  type Entity
} from "@galacean/engine";
import shader from "./MasonryDistanceSurface.shader?raw";
import {
  addV2Surface,
  destroyV2ViewResources,
  type V2ViewResources
} from "@galacean/engine-modify/rendering/V2ViewGeometry";
import {
  SeedWorldArrayPickBatch,
  type SeedWorldPickBatch,
  type SeedWorldPickVisitor
} from "@galacean/engine-modify/rendering/SeedWorldPickBatch";
import { plasterPalette } from "./ConstructionPlasterPalette";
import { type ConstructionPreview, constructionBrickLayer, woodPalette, wallPalette } from "./ConstructionPreview";
import type { BuildingPaletteSlot } from "./BuildingGlobals";
import { createDecorationNativeView } from "./DecorationNativeView";
import { createBuildingFarProxy } from "./BuildingFarProxy";
export interface BuildingDistanceInput {
  colorOwners: readonly ({ id: string } & BuildingPaletteSlot)[];
  paletteSlots: readonly BuildingPaletteSlot[];
  rigidDecorations?: { poses: ReadonlyMap<string, readonly number[]>; resolve(id: string): Entity | undefined };
}
/** Lightweight actual roof/wall geometry, with per-owner picking and frustum bounds. */
export async function createBuildingDistanceView(
  engine: Engine,
  parent: Entity,
  group: BuildingDistanceInput,
  geometry: ConstructionPreview,
  assets: PrefabResource,
  camera?: import("@galacean/engine").Camera,
  signal: AbortSignal = new AbortController().signal
) {
  registerConstructionSceneLighting();
  if (!ShaderFactory.includeMap["Masonry/Entrance.glsl"])
    ShaderFactory.registerInclude("Masonry/Entrance.glsl", constructionEntranceGLSL);
  if (!ShaderFactory.includeMap["Masonry/EntranceCoverage.glsl"])
    ShaderFactory.registerInclude("Masonry/EntranceCoverage.glsl", constructionEntranceCoverageGLSL);
  const entranceBindings: { owner: string; apply: ReturnType<typeof entranceBinding> }[] = [];
  signal.throwIfAborted();

  if (group.rigidDecorations && geometry.parts.some((part) => part.decoration && !part.roofSpire))
    throw Error("Scene-bound distance geometry must retain native decoration parts");
  const entranceRanges = constructionEntranceRanges(geometry.parts);
  if (!ShaderFactory.includeMap["Masonry/LodDither.glsl"])
    ShaderFactory.registerInclude("Masonry/LodDither.glsl", lodDither);
  if (!ShaderFactory.includeMap["Masonry/Plaster.glsl"])
    ShaderFactory.registerInclude("Masonry/Plaster.glsl", constructionPlasterGLSL);
  if (!ShaderFactory.includeMap["Masonry/PlasterFinish.glsl"])
    ShaderFactory.registerInclude(
      "Masonry/PlasterFinish.glsl",
      restoreMasonryTextureSamples(constructionPlasterFinishGLSL, [
        { sampler: "material_PlasterColors", layers: plasterPalette.length, array: true },
        { sampler: "material_PlasterMortar", layers: 1, array: false }
      ]).replace(/\buniform\s+/g, "")
    );
  if (!ShaderFactory.includeMap["Masonry/Decoration.glsl"])
    ShaderFactory.registerInclude(
      "Masonry/Decoration.glsl",
      restoreMasonryTextureSamples(constructionDecorationGLSL, [
        { sampler: "material_WindowTimber", layers: woodPalette.length, array: true }
      ]).replace(/\buniform\s+/g, "")
    );
  if (!ShaderFactory.includeMap["Masonry/StoneFloor.glsl"])
    ShaderFactory.registerInclude(
      "Masonry/StoneFloor.glsl",
      restoreMasonryTextureSamples(constructionStoneFloorGLSL, [
        { sampler: "material_StoneFloorPalette", layers: wallPalette.length, array: true }
      ]).replace(/\buniform\s+/g, "")
    );
  const resources: V2ViewResources = {
    root: parent.createChild("Building surfaces"),
    meshes: [],
    materials: []
  };
  // Stable shadow silhouette shares existing meshes, independent of visual LOD.
  // No forward/depth/picking pass, no extra vertex buffers or detailed tile draws.
  const visualRoot = resources.root.createChild("Visual surfaces");
  const visualResources = { ...resources, root: visualRoot };
  const shadowRoot = resources.root.createChild("Shadow surfaces");
  const shadowMaterial = new Material(
    engine,
    Shader.find("Masonry/ShadowSurface") ?? Shader.create(entranceShadow, ShaderLanguage.GLSLES300)
  );
  resources.materials.push(shadowMaterial);
  if (!ShaderFactory.includeMap["Masonry/Tint.glsl"])
    ShaderFactory.registerInclude("Masonry/Tint.glsl", masonryTintGLSL.replace(/\buniform\s+/g, ""));
  const appearance = masonryAppearance(engine),
    tintSubscriptions: Array<{ destroy(): void }> = [];
  const colorSeeds = new Map(
    group.colorOwners.map((b) => {
      const seed = masonryColorSeed(b);
      appearance.registerSourceReference(seed, {
        brick: constructionBrickLayer(b.wallColor),
        roof_tile: b.roofColor,
        wooden_plank: b.woodColor
      });
      return [b.id, seed] as const;
    })
  );
  const materials = new Map<string, PBRMaterial>(),
    batches: SeedWorldArrayPickBatch[] = [],
    residencyProbes: MeshRenderer[] = [];
  const lodAppearanceIds = new Map<ConstructionLodAppearance, number>();
  const lodTextures = new Map<ConstructionLodAppearance, ReturnType<typeof createConstructionLodTexture>>();
  const lodMaterialBindings: Array<{
    material: PBRMaterial;
    appearance: ConstructionLodAppearance;
    uvTransform: readonly [number, number, number, number];
  }> = [];
  const ownerEntities = new Map<string, Entity[]>();
  let disposed = false;
  let detailedInitialized = false;
  let detailedReady: Promise<void> | undefined;
  let lastEntranceStates: ReadonlyMap<string, ConstructionEntranceState> | undefined;
  let lastFade = 1;
  let lastLodDebugEnabled = false;
  let textureLease: ReturnType<typeof leasePlasterTextures> | undefined;
  const plasterMaterials: PBRMaterial[] = [];
  const stoneFloorMaterials: PBRMaterial[] = [];
  let stoneFloorLease: ReturnType<typeof leaseStoneFloorTextures> | undefined;
  const decorationMaterials: PBRMaterial[] = [];
  let decorationTextureLease: ReturnType<typeof leaseDecorationTextures> | undefined;
  let nativeDecorationView: ReturnType<typeof createDecorationNativeView> | undefined;
  let farProxy: ReturnType<typeof createBuildingFarProxy> | undefined;
  const nativeDecorationPicks: SeedWorldPickBatch[] = [];
  const disposeView = () => {
    if (disposed) return;
    disposed = true;
    nativeDecorationView?.destroy();
    tintSubscriptions.forEach((subscription) => subscription.destroy());
    destroyV2ViewResources(resources);
    farProxy?.destroy();
    const releaseTextures = () => {
      for (const texture of lodTextures.values()) texture.destroy();
      lodTextures.clear();
      textureLease?.destroy();
      stoneFloorLease?.destroy();
      decorationTextureLease?.destroy();
    };
    // Frame-time entity retirement defers material destruction. A texture's
    // destroy() is refused while those materials still reference it. Queue
    // after destroyV2ViewResources' material release, retaining ownership until then.
    queueMicrotask(releaseTextures);
  };
  try {
    for (const p of geometry.parts) {
      let lodAppearanceId: number | undefined;
      if (p.lodAppearance) {
        lodAppearanceId = lodAppearanceIds.get(p.lodAppearance);
        if (lodAppearanceId === undefined) {
          lodAppearanceId = lodAppearanceIds.size;
          lodAppearanceIds.set(p.lodAppearance, lodAppearanceId);
        }
      }
      const materialKey = JSON.stringify([
        p.placement,
        lodAppearanceId,
        p.plaster && [p.plaster.wear, p.plaster.wallLength, p.plaster.color],
        p.stonePaving,
        colorSeeds.get(p.owner),
        p.material,
        p.color,
        p.decoration,
        p.emissive
      ]);
      let material = materials.get(materialKey);
      if (!material) {
        material = new PBRMaterial(engine);
        material.shader = Shader.find("Masonry/SupportSurface") ?? Shader.create(shader, ShaderLanguage.GLSLES300);
        material.shaderData.setFloat("material_WorldPickDepthCompare", CompareFunction.LessEqual);
        const owner = group.colorOwners.find((b) => b.id === p.owner)!;
        tintSubscriptions.push(
          subscribeDistanceAppearance(appearance, material, {
            role: p.material === "wall" ? "brick" : p.material,
            plaster: !!p.plaster,
            decoration: !!p.decoration,
            color: p.color!,
            owner
          })
        );
        material.shaderData.setFloat(
          "material_MasonryPattern",
          p.plaster ? -2 : p.decoration ? -1 : p.material === "wooden_plank" ? 2 : p.material === "roof_tile" ? 1 : 0
        );
        material.shaderData.setFloat("material_MasonryUnit", p.placement === "unit" ? 1 : 0);
        if (p.lodAppearance) {
          lodMaterialBindings.push({
            material,
            appearance: p.lodAppearance,
            uvTransform: p.lodAppearance.uvTransform
          });
        }
        material.shaderData.setVector4(
          "material_MasonryPlaster",
          new Vector4(p.plaster?.wear ?? 0, p.plaster?.wallLength ?? 1, p.plaster?.color ?? 0, 0)
        );
        if (p.stonePaving) {
          material.shaderData.enableMacro("MASONRY_STONE_FLOOR");
          material.shaderData.setVector4("material_StoneFloorMapping", new Vector4(...p.stonePaving.uvTransform));
          material.shaderData.setFloat("material_StoneFloorColor", p.stonePaving.color);
          stoneFloorMaterials.push(material);
        }
        material.roughness = 0.9;
        material.renderFace = RenderFace.Double;
        materials.set(materialKey, material);
        material.shaderData.setFloat("material_MasonryEmission", p.emissive ?? 0);
        resources.materials.push(material);
        if (p.plaster) plasterMaterials.push(material);
        if (p.decoration) decorationMaterials.push(material);
      }
      if (!p.indices.length) continue;
      const entity =
        (p.decoration || p.plaster) && p.colors && p.normals && p.emission
          ? (() => {
              const { data, stride, count } = plannedMasonryVertexData(p);
              const mesh = new ModelMesh(engine, p.owner + " decorations");
              resources.meshes.push(mesh);
              const elements = [
                new VertexElement(VertexAttribute.Position, 0, VertexElementFormat.Vector3, 0),
                new VertexElement(VertexAttribute.Normal, 12, VertexElementFormat.Vector3, 0),
                new VertexElement(VertexAttribute.Color, 24, VertexElementFormat.Vector4, 0),
                new VertexElement(VertexAttribute.UV, 40, VertexElementFormat.Vector2, 0),
                new VertexElement(VertexAttribute.UV1, 48, VertexElementFormat.Vector2, 0)
              ];
              if (p.appearance)
                elements.push(new VertexElement(VertexAttribute.Tangent, 56, VertexElementFormat.Vector4, 0));
              mesh.setVertexElements(elements);
              // Keep the existing mesh-owned restore/disposal path. The helper
              // retains these packed bytes, including custom vertex bindings.
              mesh.setVertexBufferBinding(
                new Buffer(engine, BufferBindFlag.VertexBuffer, data, BufferUsage.Static, true),
                stride
              );
              mesh.setIndices(count > 65535 ? new Uint32Array(p.indices) : new Uint16Array(p.indices));
              mesh.addSubMesh(0, p.indices.length);
              const min = [Infinity, Infinity, Infinity],
                max = [-Infinity, -Infinity, -Infinity];
              for (let i = 0; i < p.positions.length; i++) {
                const k = i % 3;
                const warp = (p.plaster || p.appearance) && k !== 1 ? 0.03 : 0;
                min[k] = Math.min(min[k], p.positions[i] - warp);
                max[k] = Math.max(max[k], p.positions[i] + warp);
              }
              mesh.bounds.min.set(min[0], min[1], min[2]);
              mesh.bounds.max.set(max[0], max[1], max[2]);
              uploadRestorableModelMesh(mesh);
              const entity = visualRoot.createChild(p.owner),
                renderer = entity.addComponent(MeshRenderer);
              renderer.mesh = mesh;
              renderer.setMaterial(material!);
              renderer.enableVertexColor = true;
              renderer.castShadows = !p.plaster;
              renderer.receiveShadows = true;
              return entity;
            })()
          : addV2Surface(
              engine,
              visualResources,
              p.owner,
              { ...p, pickIds: Array<number>(p.positions.length / 3).fill(0) },
              material,
              { upward: false, shadows: true }
            );
      const entities = ownerEntities.get(p.owner) ?? [];
      entities.push(entity);
      ownerEntities.set(p.owner, entities);
      const renderer = entity.getComponent(MeshRenderer)!;
      renderer.priority = -100;
      renderer.castShadows = false;
      if (!p.plaster) {
        const caster = shadowRoot.createChild(p.owner).addComponent(MeshRenderer);
        entities.push(caster.entity);
        caster.mesh = renderer.mesh;
        caster.setMaterial(shadowMaterial);
        caster.receiveShadows = false;
        caster.shaderData.setFloat("renderer_MasonryEntranceDecoration", p.decoration ? 1 : 0);
        residencyProbes.push(caster);
        entranceBindings.push({ owner: p.owner, apply: entranceBinding(caster.shaderData) });
      }
      renderer.shaderData.setFloat("renderer_MasonryLodFade", 1);
      entranceBindings.push({ owner: p.owner, apply: entranceBinding(renderer.shaderData) });
      const batch = new SeedWorldArrayPickBatch(renderer);
      batch.count = 1;
      batch.id = p.pickId === undefined ? buildingGroupKey(p.owner) : buildingPartKey(p.pickId);
      batches.push(batch);
    }
    const hasNativeDecorations = Boolean(
      geometry.decorationParts.length ||
        geometry.retainedWallUnits?.length ||
        geometry.stones.length ||
        geometry.frames.length ||
        geometry.woodArchFrames.length ||
        geometry.woodArchPillars.length
    );
    const ensureDetailedVisual = (): Promise<void> => {
      if (detailedReady) return detailedReady;
      detailedInitialized = true;
      for (const binding of lodMaterialBindings) {
        if (disposed) break;
        let appearanceTexture = lodTextures.get(binding.appearance);
        if (!appearanceTexture) {
          appearanceTexture = createConstructionLodTexture(engine, binding.appearance);
          lodTextures.set(binding.appearance, appearanceTexture);
        }
        binding.material.shaderData.enableMacro("MASONRY_LAYOUT_APPEARANCE");
        binding.material.shaderData.setTexture("material_MasonryLayout", appearanceTexture);
        binding.material.shaderData.setVector4("material_MasonryLayoutUV", new Vector4(...binding.uvTransform));
      }
      stoneFloorLease = stoneFloorMaterials.length ? leaseStoneFloorTextures(engine, assets) : undefined;
      textureLease = plasterMaterials.length ? leasePlasterTextures(engine, assets) : undefined;
      decorationTextureLease = decorationMaterials.length ? leaseDecorationTextures(engine, assets) : undefined;
      if (hasNativeDecorations) {
        nativeDecorationView = createDecorationNativeView(engine, visualRoot, geometry.stones, group.paletteSlots, {
          assets,
          retainedWallUnits: geometry.retainedWallUnits,
          parts: geometry.decorationParts,
          rigidDecorations: group.rigidDecorations,
          frames: geometry.frames,
          woodArchFrames: geometry.woodArchFrames,
          woodArchPillars: geometry.woodArchPillars,
          camera,
          bounds: geometry.bounds
        });
        if (lastEntranceStates) nativeDecorationView.setEntrance(lastEntranceStates);
        for (const hiddenOwner of hiddenOwners) nativeDecorationView.setOwnerVisible(hiddenOwner, false);
        if (lastFade !== 1) nativeDecorationView.setFade(lastFade);
        if (lastLodDebugEnabled) nativeDecorationView.setLodDebugEnabled(true);
      }
      detailedReady = Promise.all([
        stoneFloorLease?.ready.then((bind) => {
          if (!disposed && bind) for (const m of stoneFloorMaterials) bind(m);
        }),
        textureLease?.ready.then((bind) => {
          if (!disposed && bind) for (const m of plasterMaterials) bind(m);
        }),
        decorationTextureLease?.ready.then((bind) => {
          if (!disposed && bind) for (const m of decorationMaterials) bind(m);
        }),
        nativeDecorationView?.ready.then(() => {
          if (disposed) return;
          nativeDecorationView?.visitRenderers((renderer, ownerId, draw) => {
            const ids = draw.pickIds ?? [
              draw.objectBinding?.id ??
                (draw.pickId === undefined ? buildingGroupKey(ownerId) : buildingPartKey(draw.pickId))
            ];
            nativeDecorationPicks.push({
              renderer,
              count: ids.length,
              resolve: (index) => ids[index],
              prepare: () => {
                if (draw.pickIds) renderer.shaderData.setFloat("renderer_MasonryPickObjects", 1);
              },
              restore: () => renderer.shaderData.setFloat("renderer_MasonryPickObjects", 0)
            });
          });
        })
      ]).then(() => undefined);
      return detailedReady;
    };
    const surfaceTriangles = geometry.parts.reduce((n, p) => n + p.indices.length / 3, 0);
    farProxy = createBuildingFarProxy(
      engine,
      resources.root,
      geometry.parts,
      group.colorOwners,
      appearance,
      geometry.decorationParts
    );
    const ready = farProxy ? Promise.resolve() : ensureDetailedVisual();
    if (farProxy) {
      let proxyPaletteInitialized = false;
      const proxyRef = farProxy;
      tintSubscriptions.push(
        appearance.subscribe(() => {
          if (!proxyPaletteInitialized) {
            proxyPaletteInitialized = true;
            return;
          }
          if (!disposed) proxyRef.refreshColors();
        })
      );
    }
    let visualVisible = false;
    let farProxyMode = !!farProxy;
    let entranceSettled = true;
    let detailedCheckQueued = false;
    const hiddenOwners = new Set<string>();
    const syncVisualRoots = () => {
      const useFar = visualVisible && farProxyMode && entranceSettled && hiddenOwners.size === 0 && !!farProxy;
      if (farProxy) farProxy.root.isActive = useFar;
      visualRoot.isActive = visualVisible && !useFar;
      if (!detailedInitialized && visualVisible && !farProxyMode && !detailedCheckQueued) {
        detailedCheckQueued = true;
        queueMicrotask(() => {
          detailedCheckQueued = false;
          if (disposed || detailedInitialized) return;
          if (visualVisible && !farProxyMode) void ensureDetailedVisual();
        });
      }
    };
    syncVisualRoots();
    return {
      ready,
      entranceRanges,
      setEntrance(states: ReadonlyMap<string, ConstructionEntranceState>) {
        lastEntranceStates = states;
        for (const binding of entranceBindings) binding.apply(states.get(binding.owner));
        nativeDecorationView?.setEntrance(states);
        let settled = true;
        for (const s of states.values()) {
          if (s.progress < 1) {
            settled = false;
            break;
          }
        }
        entranceSettled = settled;
        syncVisualRoots();
      },
      root: resources.root,
      bounds: geometry.bounds,
      get triangles() {
        return surfaceTriangles + (nativeDecorationView?.triangles ?? 0);
      },
      // Always-enabled coarse shadow renderers avoid feedback from disabled LODs.
      // This engine feedback may include shadows/other cameras; use ONLY for load priority.
      get recentlyRendered() {
        return residencyProbes.some((renderer) => !renderer.isCulled);
      },
      get isVisualVisible() {
        return visualRoot.isActiveInHierarchy || (farProxy?.root.isActiveInHierarchy ?? false);
      },
      setOwnerVisible(owner: string, visible: boolean) {
        if (visible) hiddenOwners.delete(owner);
        else hiddenOwners.add(owner);
        for (const entity of ownerEntities.get(owner) ?? []) entity.isActive = visible;
        nativeDecorationView?.setOwnerVisible(owner, visible);
        syncVisualRoots();
      },
      setVisualVisible(visible: boolean) {
        visualVisible = visible;
        syncVisualRoots();
      },
      setFarProxyActive(active: boolean) {
        if (farProxyMode === active) return;
        farProxyMode = active;
        syncVisualRoots();
      },
      setFade(fade: number) {
        lastFade = fade;
        for (const batch of batches) batch.renderer.shaderData.setFloat("renderer_MasonryLodFade", fade);
        nativeDecorationView?.setFade(fade);
        farProxy?.setFade(fade);
      },
      setLodDebugEnabled(enabled: boolean) {
        lastLodDebugEnabled = enabled;
        const lod1Color = enabled ? new Vector4(0.95, 0.78, 0.08, 0.82) : new Vector4(0, 0, 0, 0);
        for (const batch of batches) batch.renderer.shaderData.setVector4("renderer_MasonryLodDebugColor", lod1Color);
        nativeDecorationView?.setLodDebugEnabled(enabled);
        if (enabled) farProxy?.setLodDebugColor(0.95, 0.2, 0.18, 0.82);
        else farProxy?.setLodDebugColor(0, 0, 0, 0);
      },
      visitPickBatches(visitor: SeedWorldPickVisitor) {
        if (visualVisible && resources.root.isActiveInHierarchy) {
          const prevVisual = visualRoot.isActive;
          const prevFar = farProxy?.root.isActive ?? false;
          if (!prevVisual) {
            visualRoot.isActive = true;
            if (farProxy) farProxy.root.isActive = false;
          }
          try {
            for (const b of batches) if (b.renderer.enabled && b.renderer.entity.isActiveInHierarchy) visitor(b);
            for (const b of nativeDecorationPicks)
              if (b.renderer.enabled && b.renderer.entity.isActiveInHierarchy) visitor(b);
          } finally {
            if (!prevVisual) {
              visualRoot.isActive = prevVisual;
              if (farProxy) farProxy.root.isActive = prevFar;
            }
          }
        }
      },
      destroy: disposeView
    };
  } catch (e) {
    disposeView();
    throw e;
  }
}
