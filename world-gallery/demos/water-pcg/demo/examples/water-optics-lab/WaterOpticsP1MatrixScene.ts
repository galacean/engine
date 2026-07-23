import {
  BlinnPhongMaterial,
  Engine,
  Entity,
  Layer,
  Material,
  MeshRenderer,
  ModelMesh,
  PrimitiveMesh
} from "@galacean/engine-core";
import { Color, Vector3 } from "@galacean/engine-math";
import { RiverMaterialPreset, RiverQualityLevel } from "../../../authoring/river/RiverAuthoringEnums";
import type { RiverMaterialConfig } from "../../../authoring/river/RiverAuthoringTypes";
import { WaterQualityTier } from "../../../authoring/wave/enums/WaterQualityTier";
import { WaterWaveModel } from "../../../authoring/wave/enums/WaterWaveModel";
import { WaterWaveSchemaVersion } from "../../../authoring/wave/enums/WaterWaveSchemaVersion";
import type { DirectionalGerstnerWaterWaveAssetV1 } from "../../../authoring/wave/WaterWaveTypes";
import { RiverGeometryCompiler } from "../../../compiler/river/RiverGeometryCompiler";
import type { RiverCompiledSurfaceMotionData, RiverSamplePoint } from "../../../compiler/river/types";
import { compileWaterWaveAsset } from "../../../compiler/wave/WaterWaveCompiler";
import type {
  WaterSurfaceOpticsBinding,
  WaterSurfaceOpticsBindingReadback
} from "../../../runtime/optics/WaterSurfaceOpticsTypes";
import {
  createRiverMaterial,
  setRiverSurfaceOpticsBinding,
  setRiverSurfaceTimeOverride
} from "../../../runtime/river/RiverMaterialFactory";
import { uploadRiverMeshes } from "../../../runtime/river/RiverMeshUploader";
import {
  createWaterWaveMaterial,
  setWaterWaveSurfaceOpticsBinding,
  setWaterWaveSurfaceTimeOverride
} from "../../../runtime/wave/WaterWaveMaterialFactory";
import type { WaterWaveMaterialState } from "../../../runtime/wave/WaterWaveRuntimeTypes";
import type {
  WaterOpticsP1BodyKind,
  WaterOpticsP1BodyReadback,
  WaterOpticsP1MatrixMode,
  WaterOpticsTier
} from "./types";

type ColorTuple = readonly [number, number, number, number];
type Vector3Tuple = readonly [number, number, number];

export const WATER_OPTICS_P1_POOL_CONSUMER_ID = "water-optics-lab";
export const WATER_OPTICS_P1_RIVER_CONSUMER_ID = "water-optics-lab-river";
export const WATER_OPTICS_P1_OCEAN_CONSUMER_ID = "water-optics-lab-ocean";
export const WATER_OPTICS_P1_SECONDARY_POOL_CONSUMER_ID = "water-optics-lab-secondary-pool";

export const WATER_OPTICS_P1_CONSUMERS = Object.freeze({
  pool: Object.freeze({
    id: WATER_OPTICS_P1_POOL_CONSUMER_ID,
    bodyKind: "pool-heightfield" as const,
    planarEligible: true,
    screenAreaRatio: 0.42,
    cameraDistanceMeters: 12,
    planeY: 0
  }),
  river: Object.freeze({
    id: WATER_OPTICS_P1_RIVER_CONSUMER_ID,
    bodyKind: "river" as const,
    planarEligible: false,
    screenAreaRatio: 0.18,
    cameraDistanceMeters: 17,
    planeY: 0.28
  }),
  ocean: Object.freeze({
    id: WATER_OPTICS_P1_OCEAN_CONSUMER_ID,
    bodyKind: "ocean" as const,
    planarEligible: true,
    screenAreaRatio: 0.28,
    cameraDistanceMeters: 16,
    planeY: 0.18
  }),
  secondaryPool: Object.freeze({
    id: WATER_OPTICS_P1_SECONDARY_POOL_CONSUMER_ID,
    bodyKind: "secondary-pool-heightfield" as const,
    planarEligible: true,
    screenAreaRatio: 0.28,
    cameraDistanceMeters: 16,
    planeY: -0.65
  })
});

const RIVER_MATERIAL: RiverMaterialConfig = Object.freeze({
  preset: RiverMaterialPreset.MountainCreek,
  baseColor: "#087985",
  foamColor: "#eaf8f7",
  foamIntensity: 0.82,
  clarity: 0.9
});

const RIVER_MOTION: RiverCompiledSurfaceMotionData = Object.freeze({
  seed: 27491,
  maxDisplacement: 0.12,
  displacementLengthScale: 1.2,
  shoreDampingWidth: 0.78,
  turbulence: 0.58,
  crestIntensity: 0.88,
  microNormalStrength: 1.25
});

const RIVER_SAMPLE_COUNT = 17;
const RIVER_LENGTH = 18;
const RIVER_WIDTH = 8;
const RIVER_DEPTH = 1.25;
const RIVER_FLOW_SPEED = 1.35;

function createP1RiverMesh(engine: Engine): ModelMesh {
  const samples: RiverSamplePoint[] = [];
  for (let index = 0; index < RIVER_SAMPLE_COUNT; index++) {
    const normalized = index / (RIVER_SAMPLE_COUNT - 1);
    const distance = normalized * RIVER_LENGTH;
    samples.push({
      position: new Vector3(0, 0, distance - RIVER_LENGTH * 0.5),
      tangent: new Vector3(0, 0, 1),
      distance,
      flowTravelTime: distance / RIVER_FLOW_SPEED,
      width: RIVER_WIDTH,
      depth: RIVER_DEPTH,
      flowSpeed: RIVER_FLOW_SPEED,
      bankFeather: 0
    });
  }
  const artifact = RiverGeometryCompiler.compile(
    { points: samples, totalLength: RIVER_LENGTH, diagnostics: [] },
    RiverQualityLevel.Medium,
    0,
    0,
    { materialLevel: RiverQualityLevel.Medium, maxDisplacement: RIVER_MOTION.maxDisplacement }
  );
  const mesh = uploadRiverMeshes(engine, artifact).surfaceMesh;
  mesh.name = "WaterOpticsP1RiverSurface";
  return mesh;
}

const OCEAN_WAVE_ASSET: DirectionalGerstnerWaterWaveAssetV1 = Object.freeze({
  schemaVersion: WaterWaveSchemaVersion.V1,
  model: WaterWaveModel.DirectionalGerstner,
  generator: Object.freeze({
    waveCount: 16,
    seed: 41791,
    randomness: 0.82,
    minWavelength: 2.2,
    maxWavelength: 28,
    wavelengthFalloff: 1.25,
    minAmplitude: 0.018,
    maxAmplitude: 0.22,
    amplitudeFalloff: 1.55,
    dominantWindAngle: 0.35,
    dominantAngularSpread: 1.1,
    smallWaveSteepness: 0.24,
    largeWaveSteepness: 0.68,
    steepnessFalloff: 1.2
  })
});

function resolvedQuality(tier: WaterOpticsTier): WaterQualityTier {
  return tier === "medium" ? WaterQualityTier.Medium : WaterQualityTier.High;
}

function summarizeReadback(
  consumerId: string,
  bodyKind: WaterOpticsP1BodyKind,
  planarEligible: boolean,
  readback: Readonly<WaterSurfaceOpticsBindingReadback> | undefined
): WaterOpticsP1BodyReadback {
  const profile = readback?.opticalProfile;
  return Object.freeze({
    consumerId,
    bodyKind,
    planarEligible,
    requestedTier: readback?.requestedTier,
    resolvedTier: readback?.resolvedTier,
    tierFallbackReason: readback?.tierFallbackReason,
    requestedSource: readback?.requestedSource,
    bindingResolvedSource: readback?.bindingResolvedSource,
    effectiveSource: readback?.effectiveSource,
    fallbackReason: readback?.fallbackReason,
    refractionEnabled: readback?.refractionEnabled ?? false,
    debugView: readback?.debugView,
    filterSampleCount: readback?.filterSampleCount ?? 1,
    textureWidth: readback?.textureWidth ?? 0,
    textureHeight: readback?.textureHeight ?? 0,
    opticalProfile: profile
      ? Object.freeze({
          absorptionCoefficient: Object.freeze([...profile.absorptionCoefficient] as const),
          scatteringColor: Object.freeze([...profile.scatteringColor] as const),
          scatteringCoefficient: profile.scatteringCoefficient,
          maximumViewDistance: profile.maximumViewDistance,
          indexOfRefraction: profile.indexOfRefraction,
          fresnelF0: profile.fresnelF0,
          maximumSurfaceOpticalDistance: profile.maximumSurfaceOpticalDistance,
          refractionStrength: profile.refractionStrength,
          roughness: profile.roughness,
          reflectionIntensity: profile.reflectionIntensity
        })
      : undefined
  });
}

/**
 * Adds two real material consumers around the fixed Heightfield pool. The root
 * is active only for P1 presets so the six reviewed P0 Golden images stay bit-identical.
 */
export class WaterOpticsP1MatrixScene {
  readonly root: Entity;
  readonly dualPoolRoot: Entity;

  private readonly _meshes: ModelMesh[] = [];
  private readonly _fixtureMaterials: BlinnPhongMaterial[] = [];
  private readonly _riverMaterial: Material;
  private readonly _riverEntities: Entity[] = [];
  private readonly _oceanEntity: Entity;
  private readonly _oceanRenderer: MeshRenderer;
  private _oceanMaterialState: WaterWaveMaterialState;
  private _resolvedTier: WaterQualityTier;
  private _riverReadback?: Readonly<WaterSurfaceOpticsBindingReadback>;
  private _oceanReadback?: Readonly<WaterSurfaceOpticsBindingReadback>;
  private _lastRiverBinding?: Readonly<WaterSurfaceOpticsBinding>;
  private _lastOceanBinding?: Readonly<WaterSurfaceOpticsBinding>;

  constructor(
    private readonly _engine: Engine,
    parent: Entity,
    initialTier: WaterOpticsTier
  ) {
    this.root = parent.createChild("water-optics-p1-cross-body-matrix");
    this.root.isActive = false;
    this.dualPoolRoot = parent.createChild("water-optics-p1-dual-pool-fixture");
    this.dualPoolRoot.isActive = false;
    this._resolvedTier = resolvedQuality(initialTier);

    const riverMesh = createP1RiverMesh(_engine);
    this._meshes.push(riverMesh);
    this._riverMaterial = createRiverMaterial(_engine, RIVER_MATERIAL, 1, RIVER_MOTION);
    this._riverEntities.push(
      this._createRiverConsumer(
        "water-optics-p1-river-consumer",
        [-17, WATER_OPTICS_P1_CONSUMERS.river.planeY - 0.04, -0.5],
        riverMesh,
        this.root
      )
    );
    this._riverEntities.push(
      this._createRiverConsumer(
        "water-optics-p1-dual-pool-river-consumer",
        [13.5, WATER_OPTICS_P1_CONSUMERS.river.planeY - 0.04, -11],
        riverMesh,
        this.dualPoolRoot
      )
    );

    this._oceanEntity = this.root.createChild("water-optics-p1-ocean-consumer");
    this._oceanEntity.layer = Layer.Layer30;
    this._oceanEntity.transform.setPosition(17, WATER_OPTICS_P1_CONSUMERS.ocean.planeY, -1);
    const oceanMesh = PrimitiveMesh.createPlane(_engine, 12, 12, 32, 32);
    oceanMesh.name = "WaterOpticsP1OceanSurface";
    this._meshes.push(oceanMesh);
    this._oceanMaterialState = this._createOceanMaterialState(this._resolvedTier);
    this._oceanRenderer = this._oceanEntity.addComponent(MeshRenderer);
    this._oceanRenderer.mesh = oceanMesh;
    this._oceanRenderer.setMaterial(this._oceanMaterialState.material);

    this._createBasin("river-basin", [-17, -0.95, -0.5], [8.6, 1.6, 18.6], [0.055, 0.14, 0.13, 1]);
    this._createBasin("ocean-basin", [17, -1.05, -1], [12.6, 1.9, 12.6], [0.035, 0.105, 0.17, 1]);
    this._createMarker("river-submerged-marker-red", [-19, 0.19, -0.5], [0.7, 0.12, 4.5], [1, 0.12, 0.08, 1]);
    this._createMarker("river-submerged-marker-green", [-17, 0.19, -0.5], [0.7, 0.12, 4.5], [0.1, 1, 0.28, 1]);
    this._createMarker("river-submerged-marker-blue", [-15, 0.19, -0.5], [0.7, 0.12, 4.5], [0.12, 0.32, 1, 1]);
    this._createMarker("ocean-submerged-marker-red", [14.5, 0.09, -1], [0.8, 0.14, 4.2], [1, 0.12, 0.08, 1]);
    this._createMarker("ocean-submerged-marker-green", [17, 0.09, -1], [0.8, 0.14, 4.2], [0.1, 1, 0.28, 1]);
    this._createMarker("ocean-submerged-marker-blue", [19.5, 0.09, -1], [0.8, 0.14, 4.2], [0.12, 0.32, 1, 1]);
    this._createMarker("pool-heightfield-marker", [0, 4.8, -8.2], [0.55, 4.8, 0.55], [0.05, 0.95, 0.94, 1]);
    this._createMarker("river-marker", [-17, 3.2, -9.6], [0.55, 5.4, 0.55], [0.25, 1, 0.38, 1]);
    this._createMarker("ocean-marker", [17, 3.8, -7.8], [0.55, 6.5, 0.55], [1, 0.45, 0.12, 1]);
    this._createBasin(
      "secondary-pool-basin",
      [27, -1.15, 0],
      [24.6, 2.1, 14.6],
      [0.055, 0.11, 0.14, 1],
      this.dualPoolRoot
    );
    this._createMarker(
      "secondary-pool-marker",
      [37.5, 4.5, -7.7],
      [0.55, 7.2, 0.55],
      [1, 0.45, 0.12, 1],
      this.dualPoolRoot
    );
    this._createBasin(
      "dual-pool-river-basin",
      [13.5, -0.95, -11],
      [8.6, 1.6, 18.6],
      [0.055, 0.14, 0.13, 1],
      this.dualPoolRoot
    );
    this._createMarker(
      "dual-pool-river-submerged-marker-red",
      [11.5, 0.19, -11],
      [0.7, 0.12, 4.5],
      [1, 0.12, 0.08, 1],
      this.dualPoolRoot
    );
    this._createMarker(
      "dual-pool-river-submerged-marker-green",
      [13.5, 0.19, -11],
      [0.7, 0.12, 4.5],
      [0.1, 1, 0.28, 1],
      this.dualPoolRoot
    );
    this._createMarker(
      "dual-pool-river-submerged-marker-blue",
      [15.5, 0.19, -11],
      [0.7, 0.12, 4.5],
      [0.12, 0.32, 1, 1],
      this.dualPoolRoot
    );
    this._createMarker(
      "dual-pool-river-marker",
      [13.5, 3.2, -19],
      [0.55, 5.4, 0.55],
      [0.25, 1, 0.38, 1],
      this.dualPoolRoot
    );
  }

  get active(): boolean {
    return this.mode !== "inactive";
  }

  get mode(): WaterOpticsP1MatrixMode {
    if (this.root.isActive) return "cross-body";
    if (this.dualPoolRoot.isActive) return "dual-pool";
    return "inactive";
  }

  get materialConsumerCount(): 0 | 2 | 3 {
    return this.mode === "cross-body" || this.mode === "dual-pool" ? 3 : 0;
  }

  setMode(mode: WaterOpticsP1MatrixMode): void {
    this.root.isActive = mode === "cross-body";
    this.dualPoolRoot.isActive = mode === "dual-pool";
  }

  setOceanVisible(visible: boolean): void {
    this._oceanEntity.isActive = visible;
  }

  setRiverVisible(visible: boolean): void {
    for (const river of this._riverEntities) river.isActive = visible;
  }

  setTier(tier: WaterOpticsTier): void {
    const quality = resolvedQuality(tier);
    if (quality === this._resolvedTier) return;
    const previous = this._oceanMaterialState;
    this._resolvedTier = quality;
    this._oceanMaterialState = this._createOceanMaterialState(quality);
    this._oceanRenderer.setMaterial(this._oceanMaterialState.material);
    previous.material.destroy(true);
    this._oceanReadback = undefined;
  }

  setSurfaceTimeOverride(elapsedTime?: number): void {
    setRiverSurfaceTimeOverride(this._riverMaterial, elapsedTime);
    setWaterWaveSurfaceTimeOverride(this._oceanMaterialState, elapsedTime);
  }

  applyRiverBinding(binding: Readonly<WaterSurfaceOpticsBinding>): Readonly<WaterSurfaceOpticsBindingReadback> {
    this._lastRiverBinding = binding;
    this._riverReadback = setRiverSurfaceOpticsBinding(this._riverMaterial, binding);
    return this._riverReadback;
  }

  applyOceanBinding(binding: Readonly<WaterSurfaceOpticsBinding>): Readonly<WaterSurfaceOpticsBindingReadback> {
    this._lastOceanBinding = binding;
    this._oceanReadback = setWaterWaveSurfaceOpticsBinding(this._oceanMaterialState, binding);
    return this._oceanReadback;
  }

  getRiverReadback(): WaterOpticsP1BodyReadback {
    const consumer = WATER_OPTICS_P1_CONSUMERS.river;
    return summarizeReadback(consumer.id, consumer.bodyKind, consumer.planarEligible, this._riverReadback);
  }

  getOceanReadback(): WaterOpticsP1BodyReadback {
    const consumer = WATER_OPTICS_P1_CONSUMERS.ocean;
    return summarizeReadback(consumer.id, consumer.bodyKind, consumer.planarEligible, this._oceanReadback);
  }

  usesSharedBindingReference(binding: Readonly<WaterSurfaceOpticsBinding>): boolean {
    return this._lastRiverBinding === binding && this._lastOceanBinding === binding;
  }

  usesRiverBindingReference(binding: Readonly<WaterSurfaceOpticsBinding>): boolean {
    return this._lastRiverBinding === binding;
  }

  destroy(): void {
    this.root.destroy();
    this.dualPoolRoot.destroy();
    for (const mesh of this._meshes) mesh.destroy(true);
    for (const material of this._fixtureMaterials) material.destroy(true);
    this._riverMaterial.destroy(true);
    this._oceanMaterialState.material.destroy(true);
    this._meshes.length = 0;
    this._fixtureMaterials.length = 0;
    this._riverReadback = undefined;
    this._oceanReadback = undefined;
    this._lastRiverBinding = undefined;
    this._lastOceanBinding = undefined;
  }

  private _createOceanMaterialState(quality: WaterQualityTier): WaterWaveMaterialState {
    const waveSet = compileWaterWaveAsset(OCEAN_WAVE_ASSET, quality);
    return createWaterWaveMaterial(this._engine, waveSet, {
      baseColor: "#1c8fc7",
      alpha: 0.86,
      waterLevel: 0,
      timeScale: 0.42,
      crestIntensity: 0.72,
      reflectionIntensity: 0.82,
      surfaceTimeOverride: 12.5
    });
  }

  private _createRiverConsumer(name: string, position: Vector3Tuple, mesh: ModelMesh, parent: Entity): Entity {
    const river = parent.createChild(name);
    river.layer = Layer.Layer30;
    river.transform.setPosition(...position);
    const renderer = river.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.setMaterial(this._riverMaterial);
    return river;
  }

  private _createBasin(
    name: string,
    position: Vector3Tuple,
    size: Vector3Tuple,
    color: ColorTuple,
    parent: Entity = this.root
  ): void {
    const material = this._createFixtureMaterial(`${name}-material`, color);
    material.specularColor = new Color(0.035, 0.045, 0.05, 1);
    material.shininess = 4;
    this._createCuboid(name, position, size, material, parent);
  }

  private _createMarker(
    name: string,
    position: Vector3Tuple,
    size: Vector3Tuple,
    color: ColorTuple,
    parent: Entity = this.root
  ): void {
    const material = this._createFixtureMaterial(`${name}-material`, color);
    material.emissiveColor = new Color(color[0] * 0.32, color[1] * 0.32, color[2] * 0.32, 1);
    material.specularColor = new Color(0.22, 0.22, 0.22, 1);
    material.shininess = 42;
    this._createCuboid(name, position, size, material, parent);
  }

  private _createFixtureMaterial(name: string, color: ColorTuple): BlinnPhongMaterial {
    const material = new BlinnPhongMaterial(this._engine);
    material.name = name;
    material.baseColor = new Color(...color);
    this._fixtureMaterials.push(material);
    return material;
  }

  private _createCuboid(
    name: string,
    position: Vector3Tuple,
    size: Vector3Tuple,
    material: BlinnPhongMaterial,
    parent: Entity = this.root
  ): void {
    const entity = parent.createChild(name);
    entity.transform.setPosition(...position);
    const mesh = PrimitiveMesh.createCuboid(this._engine, ...size);
    mesh.name = `${name}-mesh`;
    this._meshes.push(mesh);
    const renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.setMaterial(material);
  }
}

export function summarizeWaterOpticsP1PoolReadback(
  readback: Readonly<WaterSurfaceOpticsBindingReadback> | undefined
): WaterOpticsP1BodyReadback {
  const consumer = WATER_OPTICS_P1_CONSUMERS.pool;
  return summarizeReadback(consumer.id, consumer.bodyKind, consumer.planarEligible, readback);
}

export function summarizeWaterOpticsP1SecondaryPoolReadback(
  readback: Readonly<WaterSurfaceOpticsBindingReadback> | undefined
): WaterOpticsP1BodyReadback {
  const consumer = WATER_OPTICS_P1_CONSUMERS.secondaryPool;
  return summarizeReadback(consumer.id, consumer.bodyKind, consumer.planarEligible, readback);
}
