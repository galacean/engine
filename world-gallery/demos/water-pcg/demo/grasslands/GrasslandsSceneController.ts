import {
  BlinnPhongMaterial,
  Camera,
  DirectLight,
  Engine,
  Entity,
  MeshRenderer,
  MeshTopology,
  ModelMesh,
  PrimitiveMesh
} from "@galacean/engine-core";
import { Color, Vector3 } from "@galacean/engine-math";
import { createGrasslandsPcgFixture } from "./GrasslandsPcgFixture";
import { GRASSLANDS_WORLD_SCALE } from "./GrasslandsPcgPreset";
import type {
  GrasslandsAnchorRockFixture,
  GrasslandsPcgFixture,
  GrasslandsSceneMaterialFixture,
  GrasslandsTerrainRecipe,
  GrasslandsVector3,
  GrasslandsWorldBounds
} from "./GrasslandsPcgTypes";

export type GrasslandsRockProbeState = "default" | "raised" | "removed";
export type GrasslandsDirectLightState = "default" | "rotated" | "disabled";

export const GRASSLANDS_ROTATED_DIRECT_LIGHT_FORWARD: GrasslandsVector3 = Object.freeze([
  -0.647150228929434, -0.539291857441195, 0.539291857441195
] as const);

export interface GrasslandsTerrainGeometry {
  readonly positions: readonly GrasslandsVector3[];
  readonly normals: readonly GrasslandsVector3[];
  readonly indices: Uint16Array;
  readonly bedIndexCount: number;
  readonly bankIndexCount: number;
  readonly bounds: GrasslandsWorldBounds;
}

export interface GrasslandsAnchorRockReadback {
  readonly id: string;
  readonly state: GrasslandsRockProbeState;
  readonly active: boolean;
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
  readonly terrainBedIndexCount: number;
  readonly terrainBankIndexCount: number;
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
  readonly entity: Entity;
  state: GrasslandsRockProbeState;
  position: GrasslandsVector3;
}

const TERRAIN_BANK_HEIGHT = 2.6 * GRASSLANDS_WORLD_SCALE;
const TERRAIN_BANK_SLOPE = 0.55;
const TERRAIN_BED_SLOPE = 0.75;
const CONTACT_PROBE_CLEARANCE = 0.35 * GRASSLANDS_WORLD_SCALE;

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

function applySceneMaterial(target: BlinnPhongMaterial, source: GrasslandsSceneMaterialFixture): void {
  target.baseColor = new Color(...source.baseColor);
  target.specularColor = new Color(...source.specularColor);
  target.emissiveColor = new Color(...source.emissiveColor);
  target.shininess = source.shininess;
}

function interpolateTerrainCrossSection(
  terrain: GrasslandsTerrainRecipe,
  z: number
): { readonly centerX: number; readonly halfWidth: number } {
  const crossSections = terrain.crossSections;
  if (crossSections.length < 2) {
    throw new Error("Grasslands terrain requires at least two analytic cross sections.");
  }
  const first = crossSections[0];
  if (z <= first.centerXZ[1]) return { centerX: first.centerXZ[0], halfWidth: first.halfWidth };
  const last = crossSections[crossSections.length - 1];
  if (z >= last.centerXZ[1]) return { centerX: last.centerXZ[0], halfWidth: last.halfWidth };

  for (let index = 1; index < crossSections.length; index++) {
    const end = crossSections[index];
    if (z > end.centerXZ[1]) continue;
    const start = crossSections[index - 1];
    const span = end.centerXZ[1] - start.centerXZ[1];
    if (!(span > 0)) throw new Error("Grasslands terrain cross sections must be ordered by increasing Z.");
    const weight = (z - start.centerXZ[1]) / span;
    return {
      centerX: start.centerXZ[0] + (end.centerXZ[0] - start.centerXZ[0]) * weight,
      halfWidth: start.halfWidth + (end.halfWidth - start.halfWidth) * weight
    };
  }
  return { centerX: last.centerXZ[0], halfWidth: last.halfWidth };
}

/**
 * Samples the one authoritative analytic ground surface used for both the
 * underwater bed and the opaque banks. Its zero crossing is the visible shore.
 */
export function sampleGrasslandsTerrainHeight(terrain: GrasslandsTerrainRecipe, x: number, z: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    throw new TypeError("Grasslands terrain coordinates must be finite.");
  }
  const { centerX, halfWidth } = interpolateTerrainCrossSection(terrain, z);
  const signedBankDistance = Math.abs(x - centerX) - halfWidth;
  if (signedBankDistance >= 0) {
    return Math.min(TERRAIN_BANK_HEIGHT, signedBankDistance * TERRAIN_BANK_SLOPE);
  }
  return Math.max(terrain.authoredBedHeight, signedBankDistance * TERRAIN_BED_SLOPE);
}

/** Builds the deterministic Scene-Depth-producing bed/bank mesh from the same fixture as the water. */
export function createGrasslandsTerrainGeometry(fixture: GrasslandsPcgFixture): GrasslandsTerrainGeometry {
  const { width, height, originXZ, cellSizeXZ } = fixture.descriptor.grid;
  const vertexWidth = width + 1;
  const vertexHeight = height + 1;
  const vertexCount = vertexWidth * vertexHeight;
  if (vertexCount > 0xffff) {
    throw new RangeError("Grasslands terrain exceeds the deterministic Uint16 index budget.");
  }

  const firstX = originXZ[0] - cellSizeXZ[0] * 0.5;
  const firstZ = originXZ[1] - cellSizeXZ[1] * 0.5;
  const heights = new Float32Array(vertexCount);
  const positions: GrasslandsVector3[] = [];
  const normals: GrasslandsVector3[] = [];
  const bedIndices: number[] = [];
  const bankIndices: number[] = [];
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;

  for (let row = 0; row < vertexHeight; row++) {
    const z = firstZ + row * cellSizeXZ[1];
    for (let column = 0; column < vertexWidth; column++) {
      const x = firstX + column * cellSizeXZ[0];
      const y = sampleGrasslandsTerrainHeight(fixture.terrain, x, z);
      heights[row * vertexWidth + column] = y;
      positions.push(freezeVector3(x, y, z));
      minimumY = Math.min(minimumY, y);
      maximumY = Math.max(maximumY, y);
    }
  }

  for (let row = 0; row < vertexHeight; row++) {
    for (let column = 0; column < vertexWidth; column++) {
      const left = heights[row * vertexWidth + Math.max(0, column - 1)];
      const right = heights[row * vertexWidth + Math.min(width, column + 1)];
      const back = heights[Math.max(0, row - 1) * vertexWidth + column];
      const front = heights[Math.min(height, row + 1) * vertexWidth + column];
      const dx = (right - left) / (column === 0 || column === width ? cellSizeXZ[0] : cellSizeXZ[0] * 2);
      const dz = (front - back) / (row === 0 || row === height ? cellSizeXZ[1] : cellSizeXZ[1] * 2);
      const inverseLength = 1 / Math.hypot(dx, 1, dz);
      normals.push(freezeVector3(-dx * inverseLength, inverseLength, -dz * inverseLength));
    }
  }

  const appendTriangle = (a: number, b: number, c: number): void => {
    const triangleMaximumHeight = Math.max(heights[a], heights[b], heights[c]);
    const target = triangleMaximumHeight < fixture.terrain.waterSurfaceHeight ? bedIndices : bankIndices;
    target.push(a, b, c);
  };
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const topLeft = row * vertexWidth + column;
      const bottomLeft = topLeft + vertexWidth;
      appendTriangle(topLeft, bottomLeft, topLeft + 1);
      appendTriangle(topLeft + 1, bottomLeft, bottomLeft + 1);
    }
  }
  const indices = new Uint16Array([...bedIndices, ...bankIndices]);

  return Object.freeze({
    positions: Object.freeze(positions),
    normals: Object.freeze(normals),
    indices,
    bedIndexCount: bedIndices.length,
    bankIndexCount: bankIndices.length,
    bounds: Object.freeze({
      minimum: freezeVector3(firstX, minimumY, firstZ),
      maximum: freezeVector3(firstX + width * cellSizeXZ[0], maximumY, firstZ + height * cellSizeXZ[1])
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
  private readonly _terrainGeometry: GrasslandsTerrainGeometry;
  private readonly _terrainMesh: ModelMesh;
  private readonly _rockMesh: ModelMesh;
  private readonly _bedMaterial: BlinnPhongMaterial;
  private readonly _bankMaterial: BlinnPhongMaterial;
  private readonly _rockMaterial: BlinnPhongMaterial;
  private readonly _rocks = new Map<string, GrasslandsAnchorRockRuntime>();
  private _meshDestroyCount = 0;
  private _materialDestroyCount = 0;
  private _directLightState: GrasslandsDirectLightState = "default";
  private _destroyed = false;

  constructor(engine: Engine, parent: Entity, fixture: GrasslandsPcgFixture = createGrasslandsPcgFixture()) {
    requireFixture(fixture);
    this._fixture = fixture;
    this.root = parent.createChild("grasslands-scene");

    this._terrainGeometry = createGrasslandsTerrainGeometry(fixture);
    this._terrainMesh = new ModelMesh(engine);
    this._terrainMesh.name = "GrasslandsAnalyticBankAndBedMesh";
    this._terrainMesh.bounds.min.set(...this._terrainGeometry.bounds.minimum);
    this._terrainMesh.bounds.max.set(...this._terrainGeometry.bounds.maximum);
    this._terrainMesh.setPositions(this._terrainGeometry.positions.map((position) => new Vector3(...position)));
    this._terrainMesh.setNormals(this._terrainGeometry.normals.map((normal) => new Vector3(...normal)));
    this._terrainMesh.setIndices(this._terrainGeometry.indices);
    this._terrainMesh.addSubMesh(0, this._terrainGeometry.bedIndexCount, MeshTopology.Triangles);
    this._terrainMesh.addSubMesh(
      this._terrainGeometry.bedIndexCount,
      this._terrainGeometry.bankIndexCount,
      MeshTopology.Triangles
    );
    this._terrainMesh.uploadData(false);

    this._bedMaterial = new BlinnPhongMaterial(engine);
    this._bedMaterial.name = "GrasslandsAnalyticBedMaterial";
    applySceneMaterial(this._bedMaterial, fixture.sceneMaterials.bed);
    this._bankMaterial = new BlinnPhongMaterial(engine);
    this._bankMaterial.name = "GrasslandsAnalyticBankMaterial";
    applySceneMaterial(this._bankMaterial, fixture.sceneMaterials.bank);

    const terrainEntity = this.root.createChild("grasslands-analytic-bank-and-bed");
    const terrainRenderer = terrainEntity.addComponent(MeshRenderer);
    terrainRenderer.mesh = this._terrainMesh;
    terrainRenderer.setMaterial(0, this._bedMaterial);
    terrainRenderer.setMaterial(1, this._bankMaterial);

    this._rockMesh = PrimitiveMesh.createSphere(engine, 1, 18);
    this._rockMesh.name = "GrasslandsSceneRockMesh";
    this._rockMaterial = new BlinnPhongMaterial(engine);
    this._rockMaterial.name = "GrasslandsSceneRockMaterial";
    applySceneMaterial(this._rockMaterial, fixture.sceneMaterials.rock);

    for (const rockFixture of fixture.anchorRocks) {
      const entity = this.root.createChild(rockFixture.id);
      entity.transform.setPosition(...rockFixture.position);
      entity.transform.setScale(...rockFixture.halfExtents);
      const renderer = entity.addComponent(MeshRenderer);
      renderer.mesh = this._rockMesh;
      renderer.setMaterial(this._rockMaterial);
      this._rocks.set(rockFixture.id, {
        fixture: rockFixture,
        entity,
        state: "default",
        position: rockFixture.position
      });
    }
    for (const rockFixture of fixture.scenicRocks) {
      const entity = this.root.createChild(rockFixture.id);
      entity.transform.setPosition(...rockFixture.position);
      entity.transform.setScale(...rockFixture.halfExtents);
      const renderer = entity.addComponent(MeshRenderer);
      renderer.mesh = this._rockMesh;
      renderer.setMaterial(this._rockMaterial);
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
  }

  get metrics(): Readonly<GrasslandsSceneMetrics> {
    const anchorRocks = Object.freeze(Array.from(this._rocks.values(), (rock) => this._createRockReadback(rock)));
    const activeRockCount = anchorRocks.filter(({ active }) => active).length;
    const scenicRockCount = this._fixture.scenicRocks.length;
    const submergedScenicRockCount = this._fixture.scenicRocks.filter(({ kind }) => kind === "underwater-bed").length;
    const shoreScenicRockCount = scenicRockCount - submergedScenicRockCount;
    const contactProbeCount = anchorRocks.filter(({ sceneDepthContactExpected }) => sceneDepthContactExpected).length;
    const createdSceneEntityCount = 3 + anchorRocks.length + scenicRockCount;
    const entityCount = this._destroyed ? 0 : createdSceneEntityCount;
    const activeEntityCount = this._destroyed ? 0 : 3 + activeRockCount + scenicRockCount;
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
      this._terrainGeometry.positions.every(isFiniteVector3) &&
      this._terrainGeometry.normals.every(isFiniteVector3) &&
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
      meshCreateCount: 2,
      meshDestroyCount: this._meshDestroyCount,
      materialCreateCount: 3,
      materialDestroyCount: this._materialDestroyCount,
      entityCreateCount: 1 + createdSceneEntityCount,
      entityDestroyCount: this._destroyed ? 1 + createdSceneEntityCount : 0,
      terrainVertexCount: this._terrainGeometry.positions.length,
      terrainIndexCount: this._terrainGeometry.indices.length,
      terrainBedIndexCount: this._terrainGeometry.bedIndexCount,
      terrainBankIndexCount: this._terrainGeometry.bankIndexCount,
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
    this.root.destroy();
    this._terrainMesh.destroy(true);
    this._rockMesh.destroy(true);
    this._bedMaterial.destroy(true);
    this._bankMaterial.destroy(true);
    this._rockMaterial.destroy(true);
    this._meshDestroyCount = 2;
    this._materialDestroyCount = 3;
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
      position: rock.position,
      bounds,
      crossesWaterSurface,
      sceneDepthContactExpected: crossesWaterSurface
    });
  }
}
