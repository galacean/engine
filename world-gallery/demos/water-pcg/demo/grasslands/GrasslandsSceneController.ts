import { Camera, DirectLight, Engine, Entity, MeshRenderer, MeshTopology, ModelMesh } from "@galacean/engine-core";
import { Color, Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import type {
  GrasslandsEnvironmentAssets,
  GrasslandsRockInstance,
  GrasslandsRockModelId,
  GrasslandsTerrainMaterialRegionId
} from "./GrasslandsEnvironmentAssets";
import { createGrasslandsPcgFixture } from "./GrasslandsPcgFixture";
import { GRASSLANDS_WORLD_SCALE } from "./GrasslandsPcgPreset";
import type {
  GrasslandsAnchorRockFixture,
  GrasslandsLandscapeRegionId,
  GrasslandsPcgFixture,
  GrasslandsSceneMaterialFixture,
  GrasslandsTerrainRecipe,
  GrasslandsVector3,
  GrasslandsWorldBounds
} from "./GrasslandsPcgTypes";
import { sampleGrasslandsTerrainModelHeight, sampleGrasslandsTerrainProfile } from "./GrasslandsTerrainModel";

export type GrasslandsRockProbeState = "default" | "raised" | "removed";
export type GrasslandsDirectLightState = "default" | "rotated" | "disabled";

export const GRASSLANDS_ROTATED_DIRECT_LIGHT_FORWARD: GrasslandsVector3 = Object.freeze([
  -0.647150228929434, -0.539291857441195, 0.539291857441195
] as const);

export interface GrasslandsTerrainGeometry {
  readonly positions: readonly GrasslandsVector3[];
  readonly normals: readonly GrasslandsVector3[];
  readonly uvs: readonly (readonly [number, number])[];
  readonly tangents: readonly (readonly [number, number, number, number])[];
  readonly indices: Uint16Array;
  readonly mudStonesIndexCount: number;
  readonly sandIndexCount: number;
  readonly grassMudIndexCount: number;
  readonly bedIndexCount: number;
  readonly bankIndexCount: number;
  readonly finite: boolean;
  readonly shorelineSampleCount: number;
  readonly degenerateTriangleCount: number;
  readonly directMudGrassAdjacencyCount: 0;
  readonly bounds: GrasslandsWorldBounds;
}

export interface GrasslandsAnchorRockReadback {
  readonly id: string;
  readonly state: GrasslandsRockProbeState;
  readonly active: boolean;
  readonly modelId: GrasslandsRockModelId;
  readonly position: GrasslandsVector3;
  readonly bounds: GrasslandsWorldBounds;
  readonly crossesWaterSurface: boolean;
  readonly sceneDepthContactExpected: boolean;
}

export interface GrasslandsSceneMetrics {
  readonly fixtureId: string;
  readonly fixtureHash: string;
  readonly destroyed: boolean;
  readonly finite: boolean;
  readonly entityCount: number;
  readonly activeEntityCount: number;
  readonly ownedEntityCount: number;
  readonly terrainEntityCount: number;
  readonly anchorRockCount: number;
  readonly activeRockCount: number;
  readonly scenicRockCount: number;
  readonly submergedScenicRockCount: number;
  readonly shoreScenicRockCount: number;
  readonly contactProbeCount: number;
  readonly cameraCount: number;
  readonly directLightCount: number;
  readonly rendererCount: number;
  readonly activeRendererCount: number;
  readonly meshCreateCount: number;
  readonly meshDestroyCount: number;
  readonly materialCreateCount: number;
  readonly materialDestroyCount: number;
  readonly entityCreateCount: number;
  readonly entityDestroyCount: number;
  readonly terrainVertexCount: number;
  readonly terrainIndexCount: number;
  readonly terrainMudStonesIndexCount: number;
  readonly terrainSandIndexCount: number;
  readonly terrainGrassMudIndexCount: number;
  readonly terrainBedIndexCount: number;
  readonly terrainBankIndexCount: number;
  readonly terrainShorelineSampleCount: number;
  readonly terrainDegenerateTriangleCount: number;
  readonly terrainDirectMudGrassAdjacencyCount: 0;
  readonly environmentReady: boolean;
  readonly environmentAssetSetHash: string;
  readonly terrainMaterialRegionCount: 3;
  readonly terrainMaterialRegionIds: readonly GrasslandsTerrainMaterialRegionId[];
  readonly rockModelResourceCount: number;
  readonly largeRockVariantCount: 2;
  readonly smallRockVariantCount: 3;
  readonly sharedRockMeshCount: number;
  readonly proxyRockMeshCount: 0;
  readonly sceneMeshUploadCount: number;
  readonly connectedWaterBodyCount: 1;
  readonly landscapeRegionCount: 4;
  readonly landscapeRegionIds: readonly GrasslandsLandscapeRegionId[];
  readonly landscapeExtentScaleXZ: readonly [number, number];
  readonly terrainBounds: GrasslandsWorldBounds;
  readonly waterSurfaceHeight: number;
  readonly waterExtendsUnderBanks: true;
  readonly visibleWaterlineUsesSceneDepth: true;
  readonly gameplayQueryRegistered: false;
  readonly camera: {
    readonly mode: "fixed";
    readonly position: GrasslandsVector3;
    readonly target: GrasslandsVector3;
    readonly forward: GrasslandsVector3;
    readonly fieldOfViewDegrees: number;
    readonly nearClip: number;
    readonly farClip: number;
  };
  readonly directLight: {
    readonly state: GrasslandsDirectLightState;
    readonly enabled: boolean;
    readonly color: GrasslandsVector3;
    readonly intensity: number;
    readonly effectiveColor: GrasslandsVector3;
    readonly forward: GrasslandsVector3;
  };
  readonly anchorRocks: readonly GrasslandsAnchorRockReadback[];
  readonly skyboxCount: 0;
  readonly planarCameraCount: 0;
  readonly reflectionProbeCount: 0;
  readonly renderTargetCount: 0;
}

interface GrasslandsAnchorRockRuntime {
  readonly fixture: GrasslandsAnchorRockFixture;
  readonly instance: GrasslandsRockInstance;
  readonly entity: Entity;
  state: GrasslandsRockProbeState;
  position: GrasslandsVector3;
}

const TERRAIN_UV_WORLD_SCALE = 0.13;
const CONTACT_PROBE_CLEARANCE = 0.35 * GRASSLANDS_WORLD_SCALE;
const BASELINE_LANDSCAPE_EXTENT_X = 40;
const BASELINE_LANDSCAPE_EXTENT_Z = 24;

function freezeVector3(x: number, y: number, z: number): GrasslandsVector3 {
  return Object.freeze([x, y, z] as const);
}

function createBounds(position: GrasslandsVector3, halfExtents: GrasslandsVector3): GrasslandsWorldBounds {
  return Object.freeze({
    minimum: freezeVector3(position[0] - halfExtents[0], position[1] - halfExtents[1], position[2] - halfExtents[2]),
    maximum: freezeVector3(position[0] + halfExtents[0], position[1] + halfExtents[1], position[2] + halfExtents[2])
  });
}

function isFiniteVector3(value: GrasslandsVector3): boolean {
  return value.every(Number.isFinite);
}

function isFiniteBounds(bounds: GrasslandsWorldBounds): boolean {
  return (
    isFiniteVector3(bounds.minimum) &&
    isFiniteVector3(bounds.maximum) &&
    bounds.minimum.every((value, axis) => value <= bounds.maximum[axis])
  );
}

function isFiniteSceneMaterial(material: GrasslandsSceneMaterialFixture): boolean {
  return (
    material.baseColor.every(Number.isFinite) &&
    material.specularColor.every(Number.isFinite) &&
    material.emissiveColor.every(Number.isFinite) &&
    Number.isFinite(material.shininess) &&
    material.shininess >= 0
  );
}

/**
 * Samples the one authoritative analytic ground surface used for both the
 * underwater bed and the opaque banks. Its zero crossing is the visible shore.
 */
export function sampleGrasslandsTerrainHeight(terrain: GrasslandsTerrainRecipe, x: number, z: number): number {
  return sampleGrasslandsTerrainModelHeight(terrain, x, z);
}

/** Builds the deterministic Scene-Depth-producing bed/bank mesh from the same fixture as the water. */
export function createGrasslandsTerrainGeometry(fixture: GrasslandsPcgFixture): GrasslandsTerrainGeometry {
  const { sampling } = fixture.terrain;
  const lateralSegments =
    sampling.grassLateralSegments * 2 + sampling.sandLateralSegments * 2 + sampling.bedLateralSegments;
  const vertexWidth = lateralSegments + 1;
  const vertexHeight = sampling.longitudinalSegments + 1;
  const vertexCount = vertexWidth * vertexHeight;
  if (vertexCount > 0xffff) {
    throw new RangeError("Grasslands terrain exceeds the deterministic Uint16 index budget.");
  }

  const firstX = fixture.waterBounds.minimum[0];
  const lastX = fixture.waterBounds.maximum[0];
  const firstZ = fixture.waterBounds.minimum[2];
  const lastZ = fixture.waterBounds.maximum[2];
  const rowStepZ = (lastZ - firstZ) / sampling.longitudinalSegments;
  const positions: GrasslandsVector3[] = [];
  const normals: GrasslandsVector3[] = [];
  const uvs: Array<readonly [number, number]> = [];
  const tangents: Array<readonly [number, number, number, number]> = [];
  const mudStonesIndices: number[] = [];
  const sandIndices: number[] = [];
  const grassMudIndices: number[] = [];
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;

  for (let row = 0; row < vertexHeight; row++) {
    const z = firstZ + row * rowStepZ;
    const profile = sampleGrasslandsTerrainProfile(fixture.terrain, z);
    const breakpoints = [
      firstX,
      profile.leftShoreX - sampling.sandBandWidth,
      profile.leftShoreX + sampling.sandBandWidth,
      profile.rightShoreX - sampling.sandBandWidth,
      profile.rightShoreX + sampling.sandBandWidth,
      lastX
    ] as const;
    const segmentCounts = [
      sampling.grassLateralSegments,
      sampling.sandLateralSegments,
      sampling.bedLateralSegments,
      sampling.sandLateralSegments,
      sampling.grassLateralSegments
    ] as const;
    for (let segment = 0; segment < segmentCounts.length; segment++) {
      const count = segmentCounts[segment];
      for (let step = segment === 0 ? 0 : 1; step <= count; step++) {
        const x = breakpoints[segment] + ((breakpoints[segment + 1] - breakpoints[segment]) * step) / count;
        const y = sampleGrasslandsTerrainHeight(fixture.terrain, x, z);
        positions.push(freezeVector3(x, y, z));
        uvs.push(Object.freeze([x * TERRAIN_UV_WORLD_SCALE, z * TERRAIN_UV_WORLD_SCALE] as const));
        minimumY = Math.min(minimumY, y);
        maximumY = Math.max(maximumY, y);
      }
    }
  }

  for (let row = 0; row < vertexHeight; row++) {
    for (let column = 0; column < vertexWidth; column++) {
      const position = positions[row * vertexWidth + column];
      const left = positions[row * vertexWidth + Math.max(0, column - 1)];
      const right = positions[row * vertexWidth + Math.min(lateralSegments, column + 1)];
      const back = positions[Math.max(0, row - 1) * vertexWidth + column];
      const front = positions[Math.min(sampling.longitudinalSegments, row + 1) * vertexWidth + column];
      const lateralX = right[0] - left[0];
      const lateralY = right[1] - left[1];
      const longitudinalX = front[0] - back[0];
      const longitudinalY = front[1] - back[1];
      const longitudinalZ = front[2] - back[2];
      const normalX = -longitudinalZ * lateralY;
      const normalY = longitudinalZ * lateralX;
      const normalZ = longitudinalX * lateralY - longitudinalY * lateralX;
      const normalInverseLength = 1 / Math.hypot(normalX, normalY, normalZ);
      normals.push(
        freezeVector3(normalX * normalInverseLength, normalY * normalInverseLength, normalZ * normalInverseLength)
      );
      const tangentInverseLength = 1 / Math.hypot(lateralX, lateralY);
      tangents.push(Object.freeze([lateralX * tangentInverseLength, lateralY * tangentInverseLength, 0, -1] as const));
      if (!isFiniteVector3(position)) {
        throw new Error("Grasslands terrain generated a non-finite position.");
      }
    }
  }

  const lateralMaterial: Array<"grass" | "sand" | "mud"> = [
    ...Array.from({ length: sampling.grassLateralSegments }, () => "grass" as const),
    ...Array.from({ length: sampling.sandLateralSegments }, () => "sand" as const),
    ...Array.from({ length: sampling.bedLateralSegments }, () => "mud" as const),
    ...Array.from({ length: sampling.sandLateralSegments }, () => "sand" as const),
    ...Array.from({ length: sampling.grassLateralSegments }, () => "grass" as const)
  ];
  let degenerateTriangleCount = 0;
  const appendTriangle = (target: number[], a: number, b: number, c: number): void => {
    const pa = positions[a];
    const pb = positions[b];
    const pc = positions[c];
    const abX = pb[0] - pa[0];
    const abY = pb[1] - pa[1];
    const abZ = pb[2] - pa[2];
    const acX = pc[0] - pa[0];
    const acY = pc[1] - pa[1];
    const acZ = pc[2] - pa[2];
    const areaTwice = Math.hypot(abY * acZ - abZ * acY, abZ * acX - abX * acZ, abX * acY - abY * acX);
    if (areaTwice <= Number.EPSILON) degenerateTriangleCount++;
    target.push(a, b, c);
  };
  for (let row = 0; row < sampling.longitudinalSegments; row++) {
    for (let column = 0; column < lateralSegments; column++) {
      const material = lateralMaterial[column];
      const target = material === "mud" ? mudStonesIndices : material === "sand" ? sandIndices : grassMudIndices;
      const topLeft = row * vertexWidth + column;
      const bottomLeft = topLeft + vertexWidth;
      appendTriangle(target, topLeft, bottomLeft, topLeft + 1);
      appendTriangle(target, topLeft + 1, bottomLeft, bottomLeft + 1);
    }
  }
  const indices = new Uint16Array([...mudStonesIndices, ...sandIndices, ...grassMudIndices]);
  const finite =
    positions.every(isFiniteVector3) &&
    normals.every(isFiniteVector3) &&
    uvs.every((uv) => uv.every(Number.isFinite)) &&
    tangents.every((tangent) => tangent.every(Number.isFinite));

  return Object.freeze({
    positions: Object.freeze(positions),
    normals: Object.freeze(normals),
    uvs: Object.freeze(uvs),
    tangents: Object.freeze(tangents),
    indices,
    mudStonesIndexCount: mudStonesIndices.length,
    sandIndexCount: sandIndices.length,
    grassMudIndexCount: grassMudIndices.length,
    bedIndexCount: mudStonesIndices.length,
    bankIndexCount: sandIndices.length + grassMudIndices.length,
    finite,
    shorelineSampleCount: vertexHeight * 2,
    degenerateTriangleCount,
    directMudGrassAdjacencyCount: 0,
    bounds: Object.freeze({
      minimum: freezeVector3(firstX, minimumY, firstZ),
      maximum: freezeVector3(lastX, maximumY, lastZ)
    })
  });
}

function requireFixture(fixture: GrasslandsPcgFixture): void {
  if (fixture.gameplayQueryRegistered !== false) {
    throw new Error("Grasslands rendering fixture must not register a gameplay water query.");
  }
  if (fixture.anchorRocks.length < 3) {
    throw new Error("Grasslands scene requires at least three validation-critical anchor rocks.");
  }
  const requiredLandscapeRegions: readonly GrasslandsLandscapeRegionId[] = [
    "far-river",
    "narrow-channel",
    "mid-bay",
    "near-shoal"
  ];
  if (
    fixture.terrain.landscapeRegions.length !== requiredLandscapeRegions.length ||
    requiredLandscapeRegions.some(
      (id, index) =>
        fixture.terrain.landscapeRegions[index]?.id !== id ||
        !fixture.terrain.landscapeRegions[index].zRange.every(Number.isFinite) ||
        fixture.terrain.landscapeRegions[index].zRange[0] >= fixture.terrain.landscapeRegions[index].zRange[1]
    )
  ) {
    throw new Error("Grasslands terrain must declare the four ordered, finite landscape regions.");
  }
  if (
    fixture.terrain.interpolation !== "catmull-rom" ||
    fixture.terrain.sampling.longitudinalSegments < 2 ||
    fixture.terrain.sampling.grassLateralSegments < 1 ||
    fixture.terrain.sampling.sandLateralSegments < 1 ||
    fixture.terrain.sampling.bedLateralSegments < 1 ||
    fixture.terrain.sampling.sandBandWidth <= 0
  ) {
    throw new Error("Grasslands terrain sampling must define the deterministic curved-strip topology.");
  }
  const waterSurfaceHeight = fixture.terrain.waterSurfaceHeight;
  const rockIds = new Set<string>();
  for (const rock of fixture.anchorRocks) {
    if (
      !rock.validationCritical ||
      !isFiniteBounds(rock.bounds) ||
      !(rock.bounds.minimum[1] < waterSurfaceHeight && rock.bounds.maximum[1] > waterSurfaceHeight)
    ) {
      throw new Error(`Grasslands anchor rock "${rock.id}" must have finite bounds crossing the water surface.`);
    }
    if (!rock.id || rockIds.has(rock.id)) {
      throw new Error(`Grasslands rock id "${rock.id}" must be non-empty and unique.`);
    }
    rockIds.add(rock.id);
  }
  for (const rock of fixture.scenicRocks) {
    const verticallySeparated =
      rock.kind === "underwater-bed"
        ? rock.bounds.maximum[1] < waterSurfaceHeight
        : rock.bounds.minimum[1] > waterSurfaceHeight;
    if (
      rock.validationCritical !== false ||
      !isFiniteVector3(rock.position) ||
      !isFiniteVector3(rock.halfExtents) ||
      !rock.halfExtents.every((value) => value > 0) ||
      !isFiniteBounds(rock.bounds) ||
      !verticallySeparated
    ) {
      throw new Error(`Grasslands scenic rock "${rock.id}" must remain wholly within its declared scene region.`);
    }
    if (!rock.id || rockIds.has(rock.id)) {
      throw new Error(`Grasslands rock id "${rock.id}" must be non-empty and unique.`);
    }
    rockIds.add(rock.id);
  }
  if (
    !isFiniteSceneMaterial(fixture.sceneMaterials.bed) ||
    !isFiniteSceneMaterial(fixture.sceneMaterials.bank) ||
    !isFiniteSceneMaterial(fixture.sceneMaterials.rock)
  ) {
    throw new Error("Grasslands scene materials must contain finite colors and non-negative shininess.");
  }
  if (
    !isFiniteVector3(fixture.camera.position) ||
    !isFiniteVector3(fixture.camera.target) ||
    !isFiniteVector3(fixture.camera.forward) ||
    !isFiniteVector3(fixture.directLight.color) ||
    !isFiniteVector3(fixture.directLight.forward) ||
    !Number.isFinite(fixture.directLight.intensity) ||
    fixture.directLight.intensity <= 0
  ) {
    throw new Error("Grasslands Hero camera and DirectLight fixture values must be finite.");
  }
}

/**
 * Demo-owned Scene Depth fixture for Grasslands.
 *
 * It creates no sky, reflection probe, planar camera, render target, gameplay
 * query, shader, or water resource. The full wet Heightfield remains a separate
 * runtime and extends below this opaque bank/bed mesh.
 */
export class GrasslandsSceneController {
  readonly root: Entity;
  readonly cameraEntity: Entity;
  readonly camera: Camera;
  readonly directLightEntity: Entity;
  readonly directLight: DirectLight;

  private readonly _fixture: GrasslandsPcgFixture;
  private readonly _environmentAssets: GrasslandsEnvironmentAssets;
  private readonly _terrainGeometry: GrasslandsTerrainGeometry;
  private readonly _terrainMesh: ModelMesh;
  private readonly _rocks = new Map<string, GrasslandsAnchorRockRuntime>();
  private readonly _rockInstances: GrasslandsRockInstance[] = [];
  private _meshDestroyCount = 0;
  private _directLightState: GrasslandsDirectLightState = "default";
  private _destroyed = false;

  constructor(
    engine: Engine,
    parent: Entity,
    environmentAssets: GrasslandsEnvironmentAssets,
    fixture: GrasslandsPcgFixture = createGrasslandsPcgFixture()
  ) {
    requireFixture(fixture);
    this._fixture = fixture;
    this._environmentAssets = environmentAssets;
    if (!environmentAssets.metrics.ready) {
      throw new Error("Grasslands environment assets must be ready before the SceneController is created.");
    }
    this._terrainGeometry = createGrasslandsTerrainGeometry(fixture);
    this._terrainMesh = new ModelMesh(engine);
    let createdRoot: Entity | undefined;
    try {
      createdRoot = parent.createChild("grasslands-scene");
      this.root = createdRoot;
      this._terrainMesh.name = "GrasslandsAnalyticBankAndBedMesh";
      this._terrainMesh.bounds.min.set(...this._terrainGeometry.bounds.minimum);
      this._terrainMesh.bounds.max.set(...this._terrainGeometry.bounds.maximum);
      this._terrainMesh.setPositions(this._terrainGeometry.positions.map((position) => new Vector3(...position)));
      this._terrainMesh.setNormals(this._terrainGeometry.normals.map((normal) => new Vector3(...normal)));
      this._terrainMesh.setUVs(this._terrainGeometry.uvs.map((uv) => new Vector2(...uv)));
      this._terrainMesh.setTangents(this._terrainGeometry.tangents.map((tangent) => new Vector4(...tangent)));
      this._terrainMesh.setIndices(this._terrainGeometry.indices);
      this._terrainMesh.addSubMesh(0, this._terrainGeometry.mudStonesIndexCount, MeshTopology.Triangles);
      this._terrainMesh.addSubMesh(
        this._terrainGeometry.mudStonesIndexCount,
        this._terrainGeometry.sandIndexCount,
        MeshTopology.Triangles
      );
      this._terrainMesh.addSubMesh(
        this._terrainGeometry.mudStonesIndexCount + this._terrainGeometry.sandIndexCount,
        this._terrainGeometry.grassMudIndexCount,
        MeshTopology.Triangles
      );
      this._terrainMesh.uploadData(true);

      const terrainEntity = this.root.createChild("grasslands-analytic-bank-and-bed");
      const terrainRenderer = terrainEntity.addComponent(MeshRenderer);
      terrainRenderer.mesh = this._terrainMesh;
      terrainRenderer.setMaterial(0, environmentAssets.mudStonesMaterial);
      terrainRenderer.setMaterial(1, environmentAssets.sandMaterial);
      terrainRenderer.setMaterial(2, environmentAssets.grassMudMaterial);

      for (let index = 0; index < fixture.anchorRocks.length; index++) {
        const rockFixture = fixture.anchorRocks[index];
        const instance = environmentAssets.instantiateLargeRock(
          this.root,
          rockFixture.id,
          index,
          rockFixture.position,
          rockFixture.halfExtents
        );
        this._rockInstances.push(instance);
        this._rocks.set(rockFixture.id, {
          fixture: rockFixture,
          instance,
          entity: instance.entity,
          state: "default",
          position: rockFixture.position
        });
      }
      for (let index = 0; index < fixture.scenicRocks.length; index++) {
        const rockFixture = fixture.scenicRocks[index];
        this._rockInstances.push(
          environmentAssets.instantiateSmallRock(
            this.root,
            rockFixture.id,
            index,
            rockFixture.position,
            rockFixture.halfExtents
          )
        );
      }

      this.cameraEntity = this.root.createChild("grasslands-hero-camera");
      this.camera = this.cameraEntity.addComponent(Camera);
      this.camera.fieldOfView = fixture.camera.fieldOfViewDegrees;
      this.camera.nearClipPlane = fixture.camera.nearClip;
      this.camera.farClipPlane = fixture.camera.farClip;
      this.resetHeroCamera();

      this.directLightEntity = this.root.createChild("grasslands-direct-light");
      this.directLightEntity.transform.setPosition(0, 0, 0);
      this.directLightEntity.transform.lookAt(new Vector3(...fixture.directLight.forward));
      this.directLight = this.directLightEntity.addComponent(DirectLight);
      const { color, intensity } = fixture.directLight;
      // Galacean DirectLight has no separate intensity field; linear radiance is
      // represented by scaling the white light color while readback keeps both.
      this.directLight.color = new Color(color[0] * intensity, color[1] * intensity, color[2] * intensity, 1);
      this.setDirectLightState("default");
    } catch (error) {
      try {
        createdRoot?.destroy();
      } finally {
        for (const instance of this._rockInstances) instance.releaseAfterEntityDestroy();
        this._terrainMesh.destroy(true);
      }
      throw error;
    }
  }

  get metrics(): Readonly<GrasslandsSceneMetrics> {
    const anchorRocks = Object.freeze(Array.from(this._rocks.values(), (rock) => this._createRockReadback(rock)));
    const activeRockCount = anchorRocks.filter(({ active }) => active).length;
    const scenicRockCount = this._fixture.scenicRocks.length;
    const submergedScenicRockCount = this._fixture.scenicRocks.filter(({ kind }) => kind === "underwater-bed").length;
    const shoreScenicRockCount = scenicRockCount - submergedScenicRockCount;
    const contactProbeCount = anchorRocks.filter(({ sceneDepthContactExpected }) => sceneDepthContactExpected).length;
    const anchorInstances = this._rockInstances.slice(0, anchorRocks.length);
    const scenicInstances = this._rockInstances.slice(anchorRocks.length);
    const countRockEntities = (instance: GrasslandsRockInstance): number => 1 + instance.modelEntityCount;
    const createdSceneEntityCount =
      3 + this._rockInstances.reduce((count, instance) => count + countRockEntities(instance), 0);
    const entityCount = this._destroyed ? 0 : createdSceneEntityCount;
    const activeEntityCount = this._destroyed
      ? 0
      : 3 +
        scenicInstances.reduce((count, instance) => count + countRockEntities(instance), 0) +
        anchorInstances.reduce(
          (count, instance, index) => count + (anchorRocks[index].active ? countRockEntities(instance) : 0),
          0
        );
    const environment = this._environmentAssets.metrics;
    const directLightEnabled = !this._destroyed && this.directLight.enabled;
    const lightColor = this.directLight.color;
    const directLightIntensity = Math.max(0, lightColor.r, lightColor.g, lightColor.b);
    const directLightColor =
      directLightIntensity > 0
        ? freezeVector3(
            lightColor.r / directLightIntensity,
            lightColor.g / directLightIntensity,
            lightColor.b / directLightIntensity
          )
        : freezeVector3(0, 0, 0);
    const effectiveColor = directLightEnabled
      ? freezeVector3(lightColor.r, lightColor.g, lightColor.b)
      : freezeVector3(0, 0, 0);
    const actualForward = this.directLightEntity.transform.worldForward;
    const directLightForward = freezeVector3(actualForward.x, actualForward.y, actualForward.z);
    const finite =
      !this._destroyed &&
      isFiniteBounds(this._terrainGeometry.bounds) &&
      this._terrainGeometry.finite &&
      environment.ready &&
      anchorRocks.every(({ position, bounds }) => isFiniteVector3(position) && isFiniteBounds(bounds)) &&
      this._fixture.scenicRocks.every(({ position, bounds }) => isFiniteVector3(position) && isFiniteBounds(bounds)) &&
      isFiniteVector3(directLightColor) &&
      isFiniteVector3(effectiveColor) &&
      isFiniteVector3(directLightForward);

    return Object.freeze({
      fixtureId: this._fixture.fixtureId,
      fixtureHash: this._fixture.fixtureHash,
      destroyed: this._destroyed,
      finite,
      entityCount,
      activeEntityCount,
      ownedEntityCount: this._destroyed ? 0 : 1 + entityCount,
      terrainEntityCount: this._destroyed ? 0 : 1,
      anchorRockCount: this._destroyed ? 0 : anchorRocks.length,
      activeRockCount: this._destroyed ? 0 : activeRockCount,
      scenicRockCount: this._destroyed ? 0 : scenicRockCount,
      submergedScenicRockCount: this._destroyed ? 0 : submergedScenicRockCount,
      shoreScenicRockCount: this._destroyed ? 0 : shoreScenicRockCount,
      contactProbeCount: this._destroyed ? 0 : contactProbeCount,
      cameraCount: this._destroyed ? 0 : 1,
      directLightCount: this._destroyed ? 0 : 1,
      rendererCount: this._destroyed ? 0 : 1 + anchorRocks.length + scenicRockCount,
      activeRendererCount: this._destroyed ? 0 : 1 + activeRockCount + scenicRockCount,
      meshCreateCount: 1 + environment.meshCreateCount,
      meshDestroyCount: this._meshDestroyCount + environment.meshDestroyCount,
      materialCreateCount: environment.materialCreateCount,
      materialDestroyCount: environment.materialDestroyCount,
      entityCreateCount: 1 + createdSceneEntityCount,
      entityDestroyCount: this._destroyed ? 1 + createdSceneEntityCount : 0,
      terrainVertexCount: this._terrainGeometry.positions.length,
      terrainIndexCount: this._terrainGeometry.indices.length,
      terrainMudStonesIndexCount: this._terrainGeometry.mudStonesIndexCount,
      terrainSandIndexCount: this._terrainGeometry.sandIndexCount,
      terrainGrassMudIndexCount: this._terrainGeometry.grassMudIndexCount,
      terrainBedIndexCount: this._terrainGeometry.bedIndexCount,
      terrainBankIndexCount: this._terrainGeometry.bankIndexCount,
      terrainShorelineSampleCount: this._terrainGeometry.shorelineSampleCount,
      terrainDegenerateTriangleCount: this._terrainGeometry.degenerateTriangleCount,
      terrainDirectMudGrassAdjacencyCount: this._terrainGeometry.directMudGrassAdjacencyCount,
      environmentReady: environment.ready,
      environmentAssetSetHash: environment.assetSetHash,
      terrainMaterialRegionCount: environment.terrainMaterialRegionCount,
      terrainMaterialRegionIds: environment.terrainMaterialRegionIds,
      rockModelResourceCount: environment.rockModelResourceCount,
      largeRockVariantCount: environment.largeRockVariantCount,
      smallRockVariantCount: environment.smallRockVariantCount,
      sharedRockMeshCount: environment.sharedRockMeshCount,
      proxyRockMeshCount: environment.proxyRockMeshCount,
      sceneMeshUploadCount: 1 + environment.meshCreateCount,
      connectedWaterBodyCount: 1,
      landscapeRegionCount: this._fixture.terrain.landscapeRegions.length as 4,
      landscapeRegionIds: Object.freeze(this._fixture.terrain.landscapeRegions.map(({ id }) => id)),
      landscapeExtentScaleXZ: Object.freeze([
        (this._fixture.waterBounds.maximum[0] - this._fixture.waterBounds.minimum[0]) / BASELINE_LANDSCAPE_EXTENT_X,
        (this._fixture.waterBounds.maximum[2] - this._fixture.waterBounds.minimum[2]) / BASELINE_LANDSCAPE_EXTENT_Z
      ] as const),
      terrainBounds: this._terrainGeometry.bounds,
      waterSurfaceHeight: this._fixture.terrain.waterSurfaceHeight,
      waterExtendsUnderBanks: true,
      visibleWaterlineUsesSceneDepth: true,
      gameplayQueryRegistered: false,
      camera: this._fixture.camera,
      directLight: Object.freeze({
        state: this._directLightState,
        enabled: directLightEnabled,
        color: directLightColor,
        intensity: directLightIntensity,
        effectiveColor,
        forward: directLightForward
      }),
      anchorRocks,
      skyboxCount: 0,
      planarCameraCount: 0,
      reflectionProbeCount: 0,
      renderTargetCount: 0
    });
  }

  resetHeroCamera(): void {
    if (this._destroyed) return;
    const { position, target } = this._fixture.camera;
    this.cameraEntity.transform.setPosition(...position);
    this.cameraEntity.transform.lookAt(new Vector3(...target));
  }

  setDirectLightState(state: GrasslandsDirectLightState): void {
    if (this._destroyed) throw new Error("Grasslands scene is destroyed.");
    if (state !== "default" && state !== "rotated" && state !== "disabled") {
      throw new RangeError(`Unknown Grasslands DirectLight state "${String(state)}".`);
    }
    const forward = state === "rotated" ? GRASSLANDS_ROTATED_DIRECT_LIGHT_FORWARD : this._fixture.directLight.forward;
    this.directLightEntity.transform.lookAt(new Vector3(...forward));
    this.directLight.enabled = state !== "disabled";
    this._directLightState = state;
  }

  raiseContactProbe(id: string): GrasslandsAnchorRockReadback {
    const rock = this._requireRock(id);
    const waterSurfaceHeight = this._fixture.terrain.waterSurfaceHeight;
    const raisedPosition = freezeVector3(
      rock.fixture.position[0],
      waterSurfaceHeight + rock.fixture.halfExtents[1] + CONTACT_PROBE_CLEARANCE,
      rock.fixture.position[2]
    );
    rock.state = "raised";
    rock.position = raisedPosition;
    rock.entity.isActive = true;
    rock.entity.transform.setPosition(...raisedPosition);
    return this._createRockReadback(rock);
  }

  removeContactProbe(id: string): GrasslandsAnchorRockReadback {
    const rock = this._requireRock(id);
    rock.state = "removed";
    rock.entity.isActive = false;
    return this._createRockReadback(rock);
  }

  restoreContactProbe(id: string): GrasslandsAnchorRockReadback {
    const rock = this._requireRock(id);
    rock.state = "default";
    rock.position = rock.fixture.position;
    rock.entity.transform.setPosition(...rock.fixture.position);
    rock.entity.isActive = true;
    return this._createRockReadback(rock);
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    try {
      this.root.destroy();
    } finally {
      for (const instance of this._rockInstances) instance.releaseAfterEntityDestroy();
      this._terrainMesh.destroy(true);
      this._meshDestroyCount = 1;
    }
  }

  private _requireRock(id: string): GrasslandsAnchorRockRuntime {
    if (this._destroyed) throw new Error("Grasslands scene is destroyed.");
    const rock = this._rocks.get(id);
    if (!rock) throw new RangeError(`Unknown Grasslands contact probe "${id}".`);
    return rock;
  }

  private _createRockReadback(rock: GrasslandsAnchorRockRuntime): GrasslandsAnchorRockReadback {
    const bounds = createBounds(rock.position, rock.fixture.halfExtents);
    const waterSurfaceHeight = this._fixture.terrain.waterSurfaceHeight;
    const active = !this._destroyed && rock.state !== "removed";
    const crossesWaterSurface =
      active && bounds.minimum[1] < waterSurfaceHeight && bounds.maximum[1] > waterSurfaceHeight;
    return Object.freeze({
      id: rock.fixture.id,
      state: rock.state,
      active,
      modelId: rock.instance.modelId,
      position: rock.position,
      bounds,
      crossesWaterSurface,
      sceneDepthContactExpected: crossesWaterSurface
    });
  }
}
