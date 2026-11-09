import { Shader, ShaderPass } from "@galacean/engine-core";
import type { Vector3 } from "@galacean/engine-math";
import type { WaterSurfaceSample } from "../query/WaterSurfaceProvider";
import { resetWaterSurfaceSample } from "../query/WaterSurfaceProvider";
import { OceanWaterSurfaceProvider } from "./OceanWaterSurfaceProvider";
import { resolveFiniteOceanSurfaceEnvelope } from "./FiniteOceanSurfaceGeometry";
import { createWaterConnectionBinding, type WaterConnectionBinding } from "../connections/WaterConnectionBinding";
/** Runtime owner for one finite-authority Ocean rendered by a camera-relative near grid and graded far rings. */
import type { Engine, Entity, Texture2D } from "@galacean/engine-core";
import {
  OCEAN_LOOK,
  OCEAN_RENDER_BUDGET,
  OCEAN_WAVE_DISPLACEMENT_ENVELOPE
} from "../../authoring/ocean/presets/OceanLook";
import type { WaterCameraVisibilityProvider } from "../body/WaterBackendRegistry";
import type { WaterReflectionBinding } from "../optics/WaterReflectionService";
import { FiniteOceanSurfaceGeometry } from "./FiniteOceanSurfaceGeometry";
import {
  createOceanFarMaterial,
  setOceanFarDebugView,
  setOceanFarLodDebug,
  setOceanFarReflectionBinding,
  setOceanFarRuntimeTuning,
  setOceanFarViewportHeight,
  type OceanFarMaterialState
} from "./OceanFarMaterial";
import { createOceanNearshoreFieldTexture } from "./OceanNearshoreFieldTextureFactory";
import type { OceanNearshoreFieldResource } from "./OceanNearshoreFieldResource";
import {
  createOceanMaterial,
  setOceanBandlimitViewportHeight,
  setOceanCameraFeaturesAvailable,
  setOceanDebugView,
  setOceanLodDebug,
  setOceanReflectionBinding,
  setOceanRuntimeTuning,
  setOceanSurfaceTime,
  type OceanMaterialState
} from "./OceanMaterial";
import { OceanDebugView } from "./OceanDebugView";
import { OCEAN_TUNING_LIMITS, type OceanRuntimeTuning } from "./OceanRuntimeTuning";
import {
  OCEAN_SCENE_FIELD_DEMAND_BUDGET,
  OceanSceneFieldDemandResolver,
  type OceanSceneFieldCameraPosition,
  type OceanSceneFieldDemandResult
} from "./OceanSceneFieldDemand";
import type {
  OceanWaterRuntimeConfig,
  OceanWaterRuntimeFeatureAvailability,
  OceanWaterRuntimeMetrics
} from "./OceanWaterRuntimeTypes";

export interface OceanWaterRuntimeCompiledInput {
  readonly physicalSurfaceHash: string;
  readonly sourceHash?: string;
  readonly compiledHash?: string;
  readonly nearshoreResource: OceanNearshoreFieldResource;
}

export type OceanCameraPosition = OceanSceneFieldCameraPosition;

export type OceanCameraPositionProvider = () => Readonly<OceanCameraPosition>;

function readOceanCameraPosition(provider: OceanCameraPositionProvider): Readonly<OceanCameraPosition> {
  const position = provider();
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) {
    throw new RangeError("Ocean camera position provider must return finite XYZ coordinates.");
  }
  return position;
}

export interface OceanGpuFootprintInput {
  readonly vertexBufferBytes: number;
  readonly indexBufferBytes: number;
  readonly nearshoreAtlasBytes: number;
  readonly textureResourceBytes: number;
  readonly connectionAtlasBytes: number;
}

/** One Ocean is enforced per backend, so shared Look textures are counted exactly once here. */
export function computeOceanOwnedGpuBytes(input: Readonly<OceanGpuFootprintInput>): number {
  const values = [
    input.vertexBufferBytes,
    input.indexBufferBytes,
    input.nearshoreAtlasBytes,
    input.textureResourceBytes,
    input.connectionAtlasBytes
  ];
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new RangeError("Ocean GPU footprint components must be non-negative safe integers.");
  }
  return values.reduce((total, value) => total + value, 0);
}

const FEATURE_AVAILABILITY: Readonly<OceanWaterRuntimeFeatureAvailability> = Object.freeze({
  environmentReflection: true,
  refraction: true,
  surfaceFoam: true,
  intersectionFoam: true,
  caustics: true,
  translucency: true,
  screenSpaceReflection: false,
  crestFoam: false,
  windField: false,
  surfaceQuery: true,
  temporalFoam: false,
  interaction: false
});

function cleanupRuntime(actions: readonly (() => void)[], errors: unknown[] = []): void {
  for (const action of actions) {
    try {
      action();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, "Ocean runtime cleanup reported multiple errors.");
}

export class OceanWaterRuntimeController {
  readonly root: Entity;
  readonly nearshoreFieldResource: OceanNearshoreFieldResource;
  get spatialField() {
    return this._surfaceProvider;
  }
  get opticalProfile() {
    return this._materialState.renderContract.optics.profile;
  }
  readonly featureAvailability = FEATURE_AVAILABILITY;

  private readonly _surfaceProvider: OceanWaterSurfaceProvider;
  private readonly _engine: Engine;
  private readonly _cameraPositionProvider: OceanCameraPositionProvider;
  private readonly _geometry: FiniteOceanSurfaceGeometry;
  private readonly _geometryMetrics: FiniteOceanSurfaceGeometry["metrics"];
  private readonly _nearshoreTexture: Texture2D;
  private readonly _materialState: OceanMaterialState;
  private readonly _farMaterialState: OceanFarMaterialState;
  private readonly _ownedGpuBytes: number;
  private readonly _connectionBinding: WaterConnectionBinding | undefined;
  private readonly _maximumDisplacement: Readonly<{ readonly x: number; readonly y: number; readonly z: number }>;
  private readonly _sceneFieldDemandResolver: OceanSceneFieldDemandResolver;
  private _bandlimitViewportHeight: number;
  private _config: OceanWaterRuntimeConfig;
  private _reflectionSource: OceanWaterRuntimeMetrics["reflectionSource"] = "sky";
  private _externalCameraFeaturesAvailable = true;
  private _cameraFeaturesAvailable = true;
  private _cameraSceneFieldDemand: Readonly<OceanSceneFieldDemandResult>;
  private _cameraSceneFieldDemandListener?: (required: boolean) => void;
  private _cameraSceneFieldTransitionCount = 0;
  private _lastCameraPosition: Readonly<OceanCameraPosition>;
  private _frameCount = 0;
  private _meshDestroyCount = 0;
  private _materialDestroyCount = 0;
  private _surfaceLevelOffsetMetres = 0;
  private _destroyed = false;
  private _authoredFarShader?: Shader;

  constructor(
    engine: Engine,
    parent: Entity,
    config: OceanWaterRuntimeConfig,
    compiled: Readonly<OceanWaterRuntimeCompiledInput>,
    cameraPositionProvider: OceanCameraPositionProvider
  ) {
    if (config.surfaceTopology !== "finite" || config.capabilityMode !== "render-and-query") {
      throw new Error("Ocean runtime supports only finite render-and-query configuration.");
    }
    if (config.nearshoreDescriptor.waterLevel !== config.waterLevel) {
      throw new Error("Ocean runtime waterLevel must equal the nearshore field waterLevel.");
    }
    this._engine = engine;
    this._cameraPositionProvider = cameraPositionProvider;
    this._bandlimitViewportHeight = Math.max(engine.canvas.height, 1);
    this._config = config;
    const envelope = resolveFiniteOceanSurfaceEnvelope({
      nearshore: config.nearshoreDescriptor,
      surfaceCenterXZ: config.surfaceCenterXZ,
      size: config.size
    });
    this._surfaceProvider = new OceanWaterSurfaceProvider(
      config.waterBodyId,
      config.nearshoreDescriptor,
      compiled.nearshoreResource.atlas,
      {
        minX: envelope.worldMinimumX,
        minZ: envelope.worldMinimumZ,
        maxX: envelope.worldMaximumX,
        maxZ: envelope.worldMaximumZ
      },
      () => this._config.waterLevel + this._surfaceLevelOffsetMetres,
      {
        sourceHash: compiled.sourceHash ?? compiled.nearshoreResource.identity.sourceHash,
        compiledHash: compiled.compiledHash ?? compiled.nearshoreResource.identity.compiledHash
      }
    );
    this._maximumDisplacement = Object.freeze({
      x:
        OCEAN_WAVE_DISPLACEMENT_ENVELOPE.maximumXMetres *
        (OCEAN_TUNING_LIMITS.wave.height.maximum / OCEAN_LOOK.wave.height) *
        (OCEAN_TUNING_LIMITS.wave.steepness.maximum / OCEAN_LOOK.wave.steepness),
      y:
        OCEAN_WAVE_DISPLACEMENT_ENVELOPE.maximumYMetres *
        (OCEAN_TUNING_LIMITS.wave.height.maximum / OCEAN_LOOK.wave.height),
      z:
        OCEAN_WAVE_DISPLACEMENT_ENVELOPE.maximumZMetres *
        (OCEAN_TUNING_LIMITS.wave.height.maximum / OCEAN_LOOK.wave.height) *
        (OCEAN_TUNING_LIMITS.wave.steepness.maximum / OCEAN_LOOK.wave.steepness)
    });
    this._sceneFieldDemandResolver = new OceanSceneFieldDemandResolver(compiled.nearshoreResource.atlas, {
      horizontalMagnitude: Math.hypot(this._maximumDisplacement.x, this._maximumDisplacement.z),
      vertical: this._maximumDisplacement.y
    });
    this.nearshoreFieldResource = compiled.nearshoreResource;
    this.nearshoreFieldResource.retain();
    this.root = parent.createChild(`ocean-render-${config.waterBodyId}`);
    this.root.layer = parent.layer;
    let nearshoreTexture: Texture2D | undefined;
    let materialState: OceanMaterialState | undefined;
    let farMaterialState: OceanFarMaterialState | undefined;
    let geometry: FiniteOceanSurfaceGeometry | undefined;
    let connectionBinding: WaterConnectionBinding | undefined;
    try {
      const initialCameraPosition = readOceanCameraPosition(cameraPositionProvider);
      nearshoreTexture = createOceanNearshoreFieldTexture(engine, compiled.nearshoreResource);
      const atlas = compiled.nearshoreResource.atlas;
      this._lastCameraPosition = initialCameraPosition;
      this._cameraSceneFieldDemand = this._sceneFieldDemandResolver.resolve(
        initialCameraPosition.x,
        initialCameraPosition.y,
        initialCameraPosition.z,
        config.waterLevel,
        true,
        (config.debugView !== undefined && config.debugView !== OceanDebugView.Final) || config.lodDebug === true
      );
      this._cameraFeaturesAvailable = this._cameraSceneFieldDemand.required;
      const nearshoreBinding = {
        texture: nearshoreTexture,
        worldToUv: atlas.worldToUv,
        maximumDepth: atlas.maximumDepth,
        shoreDistanceRange: atlas.shoreDistanceRange,
        wetShoreDistanceCode: atlas.wetShoreDistanceCode,
        cellSizeXZ: config.nearshoreDescriptor.grid.cellSizeXZ,
        outsidePolicy: config.nearshoreDescriptor.outsidePolicy
      } as const;
      const tuning = config.color ? { ...OCEAN_LOOK, color: config.color } : OCEAN_LOOK;
      materialState = createOceanMaterial(engine, {
        renderContract: config.renderContract,
        tuning,
        waterLevel: config.waterLevel,
        textures: config.textures,
        nearshore: nearshoreBinding,
        surfaceTimeOverride: config.surfaceTimeOverride,
        cameraFeaturesAvailable: this._cameraFeaturesAvailable,
        debugView: config.debugView,
        lodDebug: config.lodDebug,
        sceneFogEnabled: config.sceneFogEnabled
      });
      if (config.surfaceShader) materialState.material.shader = config.surfaceShader;
      farMaterialState = createOceanFarMaterial(engine, {
        renderContract: config.renderContract,
        waterLevel: config.waterLevel,
        viewportHeight: this._bandlimitViewportHeight,
        debugView: config.debugView,
        nearshore: nearshoreBinding,
        tuning,
        lodDebug: config.lodDebug,
        sceneFogEnabled: config.sceneFogEnabled
      });
      if (config.surfaceShader) {
        const far = config.surfaceShader.subShaders.find((sub) => sub.name === "WaterFar");
        if (!far) throw new Error("NOT_SUPPORTED: Ocean Shader requires its authored WaterFar SubShader.");
        const passes = far.passes.map((source) => {
          const pass = new ShaderPass(
            source.name,
            source._vertexShaderInstructions,
            source._fragmentShaderInstructions,
            source._platformTarget,
            {
              pipelineStage: source.getTagValue("pipelineStage") ?? "Forward"
            }
          );
          pass._renderState = source._renderState;
          pass._renderStateDataMap = { ...source._renderStateDataMap };
          return pass;
        });
        this._authoredFarShader = Shader.create(`WaterFar/${crypto.randomUUID()}`, passes)!;
        farMaterialState.material.shader = this._authoredFarShader;
      }
      connectionBinding = createWaterConnectionBinding(engine, config.connections);
      connectionBinding?.bind(materialState.material);
      connectionBinding?.bind(farMaterialState.material);
      geometry = new FiniteOceanSurfaceGeometry(
        engine,
        this.root,
        { near: materialState.material, far: farMaterialState.material },
        {
          layer: parent.layer,
          nearshore: config.nearshoreDescriptor,
          surfaceCenterXZ: config.surfaceCenterXZ,
          size: config.size,
          waterLevel: config.waterLevel,
          maximumDisplacement: this._maximumDisplacement,
          initialCameraPositionXZ: initialCameraPosition,
          initialPresentationPath: this._cameraSceneFieldDemand.required ? "detailed" : "far-only"
        }
      );
      const drawCount = Math.max(geometry.metrics.detailedPathDrawCount, geometry.metrics.farOnlyPathDrawCount);
      const residentMeshCount = geometry.metrics.residentMeshCount;
      const triangleCount = geometry.metrics.residentTriangleCount;
      const vertexCount = geometry.metrics.residentVertexCount;
      const vertexBufferBytes = geometry.metrics.vertexBufferBytes;
      const indexBufferBytes = geometry.metrics.indexBufferBytes;
      if (drawCount > OCEAN_RENDER_BUDGET.maximumDrawCount) {
        throw new Error(`Ocean draw count ${drawCount} exceeds fixed budget ${OCEAN_RENDER_BUDGET.maximumDrawCount}.`);
      }
      if (residentMeshCount > OCEAN_RENDER_BUDGET.maximumResidentMeshCount) {
        throw new Error(
          `Ocean resident Mesh count ${residentMeshCount} exceeds fixed budget ${OCEAN_RENDER_BUDGET.maximumResidentMeshCount}.`
        );
      }
      if (triangleCount > OCEAN_RENDER_BUDGET.maximumResidentTriangleCount) {
        throw new Error(
          `Ocean resident triangle count ${triangleCount} exceeds fixed budget ${OCEAN_RENDER_BUDGET.maximumResidentTriangleCount}.`
        );
      }
      if (vertexCount > OCEAN_RENDER_BUDGET.maximumResidentVertexCount) {
        throw new Error(
          `Ocean resident vertex count ${vertexCount} exceeds fixed budget ${OCEAN_RENDER_BUDGET.maximumResidentVertexCount}.`
        );
      }
      const geometryResourceBytes = vertexBufferBytes + indexBufferBytes;
      if (geometryResourceBytes > OCEAN_RENDER_BUDGET.maximumGeometryBytes) {
        throw new Error(
          `Ocean geometry bytes ${geometryResourceBytes} exceed fixed budget ${OCEAN_RENDER_BUDGET.maximumGeometryBytes}.`
        );
      }
      const ownedGpuBytes = computeOceanOwnedGpuBytes({
        vertexBufferBytes,
        indexBufferBytes,
        nearshoreAtlasBytes: compiled.nearshoreResource.atlasByteLength,
        textureResourceBytes: config.textures.resourceBytes,
        connectionAtlasBytes: connectionBinding?.byteLength ?? 0
      });
      if (ownedGpuBytes > OCEAN_RENDER_BUDGET.maximumOwnedGpuBytes) {
        throw new Error(
          `Ocean owned GPU bytes ${ownedGpuBytes} exceed fixed budget ${OCEAN_RENDER_BUDGET.maximumOwnedGpuBytes}.`
        );
      }
      this._nearshoreTexture = nearshoreTexture;
      this._materialState = materialState;
      this._farMaterialState = farMaterialState;
      this._geometry = geometry;
      this._geometryMetrics = geometry.metrics;
      this._ownedGpuBytes = ownedGpuBytes;
      this._connectionBinding = connectionBinding;
    } catch (error) {
      cleanupRuntime(
        [
          () => {
            if (farMaterialState) connectionBinding?.unbind(farMaterialState.material);
          },
          () => farMaterialState?.material.destroy(true),
          () => {
            if (materialState) connectionBinding?.unbind(materialState.material);
          },
          () => materialState?.material.destroy(true),
          () => this._authoredFarShader?.destroy(),
          () => connectionBinding?.destroy(),
          () => geometry?.destroy(),
          () => nearshoreTexture?.destroy(true),
          () => this.root.destroy(),
          () => this.nearshoreFieldResource.release()
        ],
        [error]
      );
      throw error;
    }
  }

  /** True when at least one active Ocean surface chunk intersects the current source-Camera frustum. */
  hasCameraVisibleSurfaceChunk(provider: WaterCameraVisibilityProvider): boolean {
    return this._geometry.hasCameraVisibleChunk(provider);
  }

  get waterBodyId(): string {
    return this._config.waterBodyId;
  }

  get config(): Readonly<OceanWaterRuntimeConfig> {
    return this._config;
  }

  get isDestroyed(): boolean {
    return this._destroyed;
  }

  get surfaceTimeOverride(): number | undefined {
    return this._config.surfaceTimeOverride;
  }

  get surfaceLevelOffsetMetres(): number {
    return this._surfaceLevelOffsetMetres;
  }

  get cameraSceneFieldsRequired(): boolean {
    return this._cameraSceneFieldDemand.required;
  }

  get lodDebugEnabled(): boolean {
    return this._materialState.lodDebug;
  }

  get debugView(): OceanDebugView {
    return this._materialState.debugView;
  }

  get tuning(): Readonly<OceanRuntimeTuning> {
    return this._materialState.tuning;
  }

  get metrics(): Readonly<OceanWaterRuntimeMetrics> {
    const geometry = this._geometryMetrics;
    const materialCount = 2;
    const nearshore = this.nearshoreFieldResource.isDisposed ? undefined : this.nearshoreFieldResource.data;
    return Object.freeze({
      responseModel: "ocean",
      lookId: this._materialState.lookId,
      parameterHash: this._materialState.parameterHash,
      waterLevel: this._config.waterLevel + this._surfaceLevelOffsetMetres,
      surfaceTopology: "finite",
      cameraRelative: true,
      capabilityMode: "render-and-query",
      sceneFogEnabled: this._config.sceneFogEnabled,
      reflectionSource: this._reflectionSource,
      screenSpaceReflectionEnabled: false,
      crestFoamEnabled: false,
      windFieldEnabled: false,
      surfaceQueryEnabled: true,
      interactionEnabled: false,
      temporalFoamEnabled: false,
      waveGroupCount: 3,
      sourceWaveCount: OCEAN_LOOK.wave.count,
      geometryWaveBandlimitEnabled: true,
      maximumGeometryWaveTrigonometricEvaluationsPerVertex: 24,
      bandlimitViewportHeight: this._bandlimitViewportHeight,
      farFieldPresentation: "camera-relative-graded-rings",
      farFieldMaximumTextureSampleCount: OCEAN_RENDER_BUDGET.farFieldMaximumTextureSampleCount,
      farFieldAdditionalRenderTargetCount: 0,
      farFieldUsesSceneTextures: false,
      farFieldClosureTransitionStartMetres: OCEAN_RENDER_BUDGET.farFieldClosureTransitionStartMetres,
      farFieldClosureTransitionEndMetres: OCEAN_RENDER_BUDGET.farFieldClosureTransitionEndMetres,
      farFieldRingCount: geometry.farFieldRingCount,
      farFieldSegmentsPerEdge: geometry.farFieldSegmentsPerEdge,
      farFieldInnerHalfExtentMetres: geometry.farFieldInnerHalfExtentMetres,
      farFieldActualDepthOuterHalfExtentMetres: geometry.farFieldActualDepthOuterHalfExtentMetres,
      farFieldProjectionMarkerHalfExtentMetres: geometry.farFieldProjectionMarkerHalfExtentMetres,
      farFieldProjectionMinimumDistanceMetres: geometry.farFieldProjectionMinimumDistanceMetres,
      farFieldProjectionMaximumDistanceMetres: geometry.farFieldProjectionMaximumDistanceMetres,
      farFieldProjectionMaximumErrorPixels: geometry.farFieldProjectionMaximumErrorPixels,
      farFieldQuadCount: geometry.farFieldQuadCount,
      presentationPath: this._geometry.presentationPath,
      presentationPathTransitionCount: this._geometry.presentationPathTransitionCount,
      detailedPathDrawCount: geometry.detailedPathDrawCount,
      detailedPathVertexCount: geometry.detailedPathVertexCount,
      detailedPathTriangleCount: geometry.detailedPathTriangleCount,
      farOnlyPathDrawCount: geometry.farOnlyPathDrawCount,
      farOnlyPathVertexCount: geometry.farOnlyPathVertexCount,
      farOnlyPathTriangleCount: geometry.farOnlyPathTriangleCount,
      farOnlyFillDrawCount: geometry.farOnlyFillDrawCount,
      farOnlyFillVertexCount: geometry.farOnlyFillVertexCount,
      farOnlyFillTriangleCount: geometry.farOnlyFillTriangleCount,
      textureCount: this._config.textures.textureCount,
      textureContainerFormat: this._config.textures.containerFormat,
      compressedTextureCount: this._config.textures.compressedTextureCount,
      uncompressedTextureFallbackCount: this._config.textures.uncompressedFallbackTextureCount,
      textureResourceBytes: this._config.textures.resourceBytes,
      geometryResourceBytes: this._destroyed ? 0 : geometry.vertexBufferBytes + geometry.indexBufferBytes,
      ownedGpuBytes: this._destroyed ? 0 : this._ownedGpuBytes,
      maximumOwnedGpuBytes: OCEAN_RENDER_BUDGET.maximumOwnedGpuBytes,
      gpuBudgetHeadroomBytes: this._destroyed
        ? OCEAN_RENDER_BUDGET.maximumOwnedGpuBytes
        : OCEAN_RENDER_BUDGET.maximumOwnedGpuBytes - this._ownedGpuBytes,
      nearshoreEnabled: true,
      outsidePolicy: this._config.nearshoreDescriptor.outsidePolicy,
      nearshoreSourceHash: nearshore?.sourceHash ?? "disposed",
      nearshoreWetTexelCount: nearshore?.stats.wetTexelCount ?? 0,
      nearshoreDryTexelCount: nearshore?.stats.dryTexelCount ?? 0,
      nearshoreResourceBytes: nearshore?.stats.atlasByteLength ?? 0,
      nearshoreQueryResourceBytes: 0,
      drawCount: this._destroyed ? 0 : this._geometry.activeDrawCount,
      triangleCount: this._destroyed ? 0 : this._geometry.activeTriangleCount,
      vertexCount: this._destroyed ? 0 : this._geometry.activeVertexCount,
      residentMeshCount: this._destroyed ? 0 : geometry.residentMeshCount,
      residentTriangleCount: this._destroyed ? 0 : geometry.residentTriangleCount,
      residentVertexCount: this._destroyed ? 0 : geometry.residentVertexCount,
      meshCreateCount: geometry.meshCreateCount,
      meshDestroyCount: this._meshDestroyCount,
      meshUploadCount: geometry.meshUploadCount,
      activeMeshCount: this._destroyed ? 0 : geometry.meshCreateCount - this._meshDestroyCount,
      materialCreateCount: materialCount,
      materialDestroyCount: this._materialDestroyCount,
      activeMaterialCount: this._destroyed ? 0 : materialCount - this._materialDestroyCount,
      vertexBufferBytes: this._destroyed ? 0 : geometry.vertexBufferBytes,
      indexBufferBytes: this._destroyed ? 0 : geometry.indexBufferBytes,
      nearFieldWindowSizeMetres: geometry.nearFieldWindowSizeMetres,
      nearFieldCellSizeMetres: geometry.nearFieldCellSizeMetres,
      nearFieldSnapSizeMetres: geometry.nearFieldSnapSizeMetres,
      nearFieldMinimumGuaranteedRadiusMetres: geometry.nearFieldMinimumGuaranteedRadiusMetres,
      nearFieldCellCount: geometry.nearFieldCellCount,
      nearFieldCenterX: this._geometry.nearFieldCenterX,
      nearFieldCenterZ: this._geometry.nearFieldCenterZ,
      nearFieldRelocationCount: this._geometry.nearFieldRelocationCount,
      nearFieldDrawCount: geometry.nearFieldDrawCount,
      nearFieldVertexCount: geometry.nearFieldVertexCount,
      nearFieldTriangleCount: geometry.nearFieldTriangleCount,
      activeNearFieldDrawCount: this._destroyed ? 0 : this._geometry.activeNearFieldDrawCount,
      activeNearFieldVertexCount: this._destroyed ? 0 : this._geometry.activeNearFieldVertexCount,
      activeNearFieldTriangleCount: this._destroyed ? 0 : this._geometry.activeNearFieldTriangleCount,
      activeFarOnlyFillDrawCount: this._destroyed ? 0 : this._geometry.activeFarOnlyFillDrawCount,
      activeFarOnlyFillVertexCount: this._destroyed ? 0 : this._geometry.activeFarOnlyFillVertexCount,
      activeFarOnlyFillTriangleCount: this._destroyed ? 0 : this._geometry.activeFarOnlyFillTriangleCount,
      farFieldDrawCount: geometry.farFieldDrawCount,
      farFieldVertexCount: geometry.farFieldVertexCount,
      farFieldTriangleCount: geometry.farFieldTriangleCount,
      minimumCellSize: geometry.minimumCellSize,
      maximumActualCellSize: geometry.maximumActualCellSize,
      worldMinimumX: geometry.authorityWorldMinimumX,
      worldMinimumZ: geometry.authorityWorldMinimumZ,
      worldMaximumX: geometry.authorityWorldMaximumX,
      worldMaximumZ: geometry.authorityWorldMaximumZ,
      cameraFeatureRequested: this._cameraSceneFieldDemand.required,
      cameraFeaturesAvailable: this._cameraFeaturesAvailable,
      cameraSceneFieldsRequired: this._cameraSceneFieldDemand.required,
      cameraSceneFieldDemandReason: this._cameraSceneFieldDemand.reason,
      cameraSceneFieldMinimumDistanceMetres: this._cameraSceneFieldDemand.minimumWetSurfaceDistanceMetres,
      cameraSceneFieldReleaseDistanceMetres:
        OCEAN_SCENE_FIELD_DEMAND_BUDGET.detailedClosureEndMetres + OCEAN_SCENE_FIELD_DEMAND_BUDGET.releaseMarginMetres,
      cameraSceneFieldReacquireDistanceMetres:
        OCEAN_SCENE_FIELD_DEMAND_BUDGET.detailedClosureEndMetres +
        OCEAN_SCENE_FIELD_DEMAND_BUDGET.reacquireMarginMetres,
      cameraSceneFieldTransitionCount: this._cameraSceneFieldTransitionCount,
      refractionEnabled: this.tuning.refraction.enabled,
      surfaceTimeOverride: this._config.surfaceTimeOverride,
      frameCount: this._frameCount,
      perFrameMeshUpload: false
    });
  }

  /** Queries remain available when presentation is hidden; destruction ends access. */
  sampleSurface(position: Vector3, out: WaterSurfaceSample): boolean {
    if (this._destroyed) {
      resetWaterSurfaceSample(out);
      return false;
    }
    return this._surfaceProvider.sampleSurface(position, out);
  }

  setReflectionBinding(binding?: Readonly<WaterReflectionBinding>): void {
    this._assertActive();
    const readback = setOceanReflectionBinding(this._materialState, binding);
    setOceanFarReflectionBinding(this._farMaterialState, binding);
    this._reflectionSource = readback.effectiveSource;
  }

  setSurfaceTimeOverride(elapsedTime?: number): void {
    this._assertActive();
    if (elapsedTime !== undefined && (!Number.isFinite(elapsedTime) || elapsedTime < 0)) {
      throw new RangeError("Ocean surface time must be finite and non-negative.");
    }
    this._config = Object.freeze({ ...this._config, surfaceTimeOverride: elapsedTime });
    setOceanSurfaceTime(this._materialState, elapsedTime);
  }

  /** Moves only the rendered Ocean datum; source, nearshore fields, Mesh data, and Look remain immutable. */
  setSurfaceLevelOffsetMetres(offsetMetres: number): void {
    this._assertActive();
    if (!Number.isFinite(offsetMetres)) {
      throw new RangeError("Ocean surface-level offset must be finite.");
    }
    if (offsetMetres === this._surfaceLevelOffsetMetres) return;
    this.root.transform.setPosition(0, offsetMetres, 0);
    this._surfaceLevelOffsetMetres = offsetMetres;
    this._refreshCameraSceneFieldDemand(this._lastCameraPosition);
  }

  setExternalCameraFeatureAvailability(available: boolean): void {
    this._assertActive();
    this._externalCameraFeaturesAvailable = available;
    this._applyCameraFeatureAvailability();
  }

  /** Loader-owned listener; demand changes acquire/release shared Camera leases transactionally. */
  setCameraSceneFieldDemandListener(listener?: (required: boolean) => void): void {
    this._assertActive();
    if (this._cameraSceneFieldDemandListener === listener) return;
    listener?.(this._cameraSceneFieldDemand.required);
    this._cameraSceneFieldDemandListener = listener;
  }

  setRenderPriority(priority: number): void {
    this._assertActive();
    this._geometry.setRenderPriority(priority);
  }

  setLodDebug(enabled: boolean): void {
    this._assertActive();
    setOceanLodDebug(this._materialState, enabled);
    setOceanFarLodDebug(this._farMaterialState, enabled);
    this._refreshCameraSceneFieldDemand(this._lastCameraPosition);
  }

  setDebugView(view: OceanDebugView): void {
    this._assertActive();
    setOceanDebugView(this._materialState, view);
    setOceanFarDebugView(this._farMaterialState, view);
    this._refreshCameraSceneFieldDemand(this._lastCameraPosition);
  }

  setTuning(tuning: Readonly<OceanRuntimeTuning>): void {
    this._assertActive();
    setOceanRuntimeTuning(this._materialState, tuning);
    setOceanFarRuntimeTuning(this._farMaterialState, tuning);
  }

  update(deltaTime: number): void {
    this._assertActive();
    if (!Number.isFinite(deltaTime) || deltaTime < 0) {
      throw new RangeError("Ocean update deltaTime must be finite and non-negative.");
    }
    const viewportHeight = Math.max(this._engine.canvas.height, 1);
    if (viewportHeight !== this._bandlimitViewportHeight) {
      this._bandlimitViewportHeight = viewportHeight;
      setOceanBandlimitViewportHeight(this._materialState, viewportHeight);
      setOceanFarViewportHeight(this._farMaterialState, viewportHeight);
    }
    const cameraPosition = readOceanCameraPosition(this._cameraPositionProvider);
    this._lastCameraPosition = cameraPosition;
    this._geometry.updateCameraPosition(cameraPosition.x, cameraPosition.z);
    this._refreshCameraSceneFieldDemand(cameraPosition);
    this._frameCount++;
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._surfaceProvider.destroy();
    this._cameraSceneFieldDemandListener = undefined;
    cleanupRuntime([
      () => this._connectionBinding?.unbind(this._farMaterialState.material),
      () => {
        this._farMaterialState.material.destroy(true);
        this._materialDestroyCount++;
      },
      () => this._connectionBinding?.unbind(this._materialState.material),
      () => {
        this._materialState.material.destroy(true);
        this._materialDestroyCount++;
      },
      () => this._authoredFarShader?.destroy(),
      () => this._connectionBinding?.destroy(),
      () => {
        this._geometry.destroy();
        this._meshDestroyCount += this._geometryMetrics.meshCreateCount;
      },
      () => this._nearshoreTexture.destroy(true),
      () => this.root.destroy(),
      () => this.nearshoreFieldResource.release()
    ]);
  }

  private _assertActive(): void {
    if (this._destroyed) throw new Error(`Ocean runtime '${this.waterBodyId}' has been destroyed.`);
  }

  private _refreshCameraSceneFieldDemand(cameraPosition: Readonly<OceanCameraPosition>): boolean {
    const previousRequired = this._cameraSceneFieldDemand.required;
    const next = this._sceneFieldDemandResolver.resolve(
      cameraPosition.x,
      cameraPosition.y,
      cameraPosition.z,
      this._config.waterLevel + this._surfaceLevelOffsetMetres,
      previousRequired,
      this.debugView !== OceanDebugView.Final || this.lodDebugEnabled
    );
    if (next.required !== previousRequired) {
      this._cameraSceneFieldDemandListener?.(next.required);
      this._cameraSceneFieldTransitionCount++;
    }
    this._cameraSceneFieldDemand = next;
    this._geometry.setPresentationPath(next.required ? "detailed" : "far-only");
    this._applyCameraFeatureAvailability();
    return next.required !== previousRequired;
  }

  private _applyCameraFeatureAvailability(): void {
    const available = this._externalCameraFeaturesAvailable && this._cameraSceneFieldDemand.required;
    if (available === this._cameraFeaturesAvailable) return;
    this._cameraFeaturesAvailable = available;
    setOceanCameraFeaturesAvailable(this._materialState, available);
  }
}
