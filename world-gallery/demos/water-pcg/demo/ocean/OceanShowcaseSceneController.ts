import {
  BlinnPhongMaterial,
  DirectLight,
  Engine,
  Entity,
  Layer,
  MeshRenderer,
  ModelMesh,
  PrimitiveMesh
} from "@galacean/engine-core";
import { Color, Vector3 } from "@galacean/engine-math";
import type { OceanWaterSurfaceProvider } from "../../runtime/ocean/OceanWaterSurfaceProvider";
import { createWaterSurfaceSample } from "../../runtime/query/WaterSurfaceProvider";

type Vector3Tuple = readonly [number, number, number];
type ColorTuple = readonly [number, number, number, number];

export type OceanShowcaseSceneMode = "hero" | "gerstner" | "lod-debug";

export interface OceanShowcaseSceneMetrics {
  readonly mode: OceanShowcaseSceneMode;
  readonly fixtureObjectCount: number;
  readonly reflectionAnchorCount: number;
  readonly islandCount: number;
  readonly cloudCount: number;
  readonly boatVisible: boolean;
  readonly boatQueryHit: boolean;
  readonly boatSampleFinite: boolean;
  readonly boatX: number;
  readonly boatY: number;
  readonly boatZ: number;
  readonly wakeRibbonCount: number;
  readonly wakeEnergy: number;
}

interface OceanShowcaseLayout {
  readonly islandCenters: readonly Vector3Tuple[];
  readonly cloudCenters: readonly Vector3Tuple[];
  readonly boatPathCenter: Vector3Tuple;
  readonly boatPathRadius: Vector3Tuple;
}

export const OCEAN_SHOWCASE_LAYOUT: Readonly<OceanShowcaseLayout> = Object.freeze({
  islandCenters: Object.freeze([Object.freeze([-27, -2.7, -36] as const), Object.freeze([35, -3.4, -58] as const)]),
  cloudCenters: Object.freeze([
    Object.freeze([-22, 18, -58] as const),
    Object.freeze([14, 15.5, -48] as const),
    Object.freeze([38, 20, -72] as const)
  ]),
  boatPathCenter: Object.freeze([-1.5, 0, -8] as const),
  boatPathRadius: Object.freeze([9.5, 0, 4.2] as const)
});

const RAD_TO_DEG = 180 / Math.PI;
const BOAT_SURFACE_OFFSET = 0.36;
const BOAT_PATH_RATE = 0.16;
const OCEAN_WATER_LAYER = Layer.Layer30;

/**
 * Deterministic, demo-owned environment for making Planar reflection legible.
 *
 * The controller does not modify Ocean authoring/runtime data. The boat samples
 * the same OceanWaterSurfaceProvider used by gameplay queries and the wake is
 * excluded from the Planar pass with the same water layer as the ring mesh.
 */
export class OceanShowcaseSceneController {
  readonly root: Entity;

  private readonly _environmentRoot: Entity;
  private readonly _boatRoot: Entity;
  private readonly _wakeRoot: Entity;
  private readonly _queryPosition = new Vector3();
  private readonly _surfaceSample = createWaterSurfaceSample();
  private readonly _meshes: ModelMesh[] = [];
  private readonly _materials: BlinnPhongMaterial[] = [];
  private _mode: OceanShowcaseSceneMode;
  private _fixtureObjectCount = 0;
  private _boatQueryHit = false;
  private _boatSampleFinite = true;
  private _wakeEnergy = 0;
  private _boatX = 0;
  private _boatY = 0;
  private _boatZ = 0;

  private readonly _unitCube: ModelMesh;
  private readonly _unitSphere: ModelMesh;
  private readonly _unitCylinder: ModelMesh;
  private readonly _unitCone: ModelMesh;

  constructor(
    private readonly _engine: Engine,
    parent: Entity,
    private readonly _surfaceProvider: OceanWaterSurfaceProvider,
    mode: OceanShowcaseSceneMode
  ) {
    this.root = parent.createChild("ocean-showcase-scene");
    this._environmentRoot = this.root.createChild("ocean-showcase-environment");
    this._boatRoot = this.root.createChild("ocean-showcase-boat");
    this._wakeRoot = this._boatRoot.createChild("ocean-showcase-wake");
    this._mode = mode;

    this._unitCube = this._trackMesh(PrimitiveMesh.createCuboid(this._engine, 1, 1, 1));
    this._unitSphere = this._trackMesh(PrimitiveMesh.createSphere(this._engine, 1, 18));
    this._unitCylinder = this._trackMesh(PrimitiveMesh.createCylinder(this._engine, 0.5, 0.5, 1, 16, 1));
    this._unitCone = this._trackMesh(PrimitiveMesh.createCone(this._engine, 0.5, 1, 16, 1));

    this._createEnvironment();
    this._createBoat();
    this.setMode(mode);
  }

  get metrics(): Readonly<OceanShowcaseSceneMetrics> {
    const environmentVisible = this._environmentRoot.isActive;
    return Object.freeze({
      mode: this._mode,
      fixtureObjectCount: environmentVisible ? this._fixtureObjectCount : 0,
      reflectionAnchorCount: environmentVisible ? 10 : 0,
      islandCount: environmentVisible ? OCEAN_SHOWCASE_LAYOUT.islandCenters.length : 0,
      cloudCount: environmentVisible ? OCEAN_SHOWCASE_LAYOUT.cloudCenters.length : 0,
      boatVisible: this._boatRoot.isActive,
      boatQueryHit: this._boatQueryHit,
      boatSampleFinite: this._boatSampleFinite,
      boatX: this._boatX,
      boatY: this._boatY,
      boatZ: this._boatZ,
      wakeRibbonCount: this._wakeRoot.isActive ? this._wakeRoot.children.length : 0,
      wakeEnergy: this._wakeEnergy
    });
  }

  setMode(mode: OceanShowcaseSceneMode): void {
    this._mode = mode;
    const heroEnvironment = mode !== "gerstner";
    this._environmentRoot.isActive = heroEnvironment;
    this._boatRoot.isActive = heroEnvironment;
    this._wakeRoot.isActive = heroEnvironment;
    if (!heroEnvironment) this._wakeEnergy = 0;
  }

  /** Provider-driven visual buoyancy with no duplicated wave equation. */
  update(elapsedTime: number): void {
    if (!this._boatRoot.isActive) return;
    const layout = OCEAN_SHOWCASE_LAYOUT;
    const phase = Math.max(0, elapsedTime) * BOAT_PATH_RATE;
    const x = layout.boatPathCenter[0] + Math.sin(phase) * layout.boatPathRadius[0];
    const z = layout.boatPathCenter[2] + Math.cos(phase) * layout.boatPathRadius[2];
    const velocityX = Math.cos(phase) * layout.boatPathRadius[0] * BOAT_PATH_RATE;
    const velocityZ = -Math.sin(phase) * layout.boatPathRadius[2] * BOAT_PATH_RATE;
    this._queryPosition.set(x, 0, z);
    this._boatQueryHit = this._surfaceProvider.sampleSurface(this._queryPosition, this._surfaceSample);

    const sample = this._surfaceSample;
    const y = this._boatQueryHit ? sample.surfacePosition.y + BOAT_SURFACE_OFFSET : BOAT_SURFACE_OFFSET;
    const normal = sample.surfaceNormal;
    const yaw = Math.atan2(velocityX, velocityZ) * RAD_TO_DEG;
    const pitch = this._boatQueryHit ? Math.atan2(-normal.z, Math.max(0.001, normal.y)) * RAD_TO_DEG : 0;
    const roll = this._boatQueryHit ? Math.atan2(normal.x, Math.max(0.001, normal.y)) * RAD_TO_DEG : 0;
    this._boatRoot.transform.setPosition(x, y, z);
    this._boatRoot.transform.setRotation(pitch, yaw, roll);

    this._boatX = x;
    this._boatY = y;
    this._boatZ = z;
    this._boatSampleFinite =
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      Number.isFinite(z) &&
      Number.isFinite(normal.x) &&
      Number.isFinite(normal.y) &&
      Number.isFinite(normal.z);
    const speed = Math.hypot(velocityX, velocityZ);
    this._wakeEnergy = this._boatQueryHit ? Math.min(1, 0.28 + speed * 0.32) : 0;
    const pulse = 0.94 + Math.sin(phase * 5) * 0.06;
    this._wakeRoot.transform.setScale(1, pulse, 0.82 + this._wakeEnergy * 0.3);
  }

  destroy(): void {
    this.root.destroy();
    for (const mesh of this._meshes) mesh.destroy(true);
    for (const material of this._materials) material.destroy(true);
    this._meshes.length = 0;
    this._materials.length = 0;
  }

  private _createEnvironment(): void {
    const deepRock = this._createMaterial("OceanShowcaseDeepRock", [0.12, 0.17, 0.17, 1], 14);
    const warmRock = this._createMaterial("OceanShowcaseWarmRock", [0.31, 0.29, 0.23, 1], 18);
    const sand = this._createMaterial("OceanShowcaseSand", [0.66, 0.57, 0.35, 1], 12);
    const foliage = this._createMaterial("OceanShowcaseFoliage", [0.08, 0.28, 0.17, 1], 20);
    const trunk = this._createMaterial("OceanShowcaseTrunk", [0.24, 0.14, 0.075, 1], 10);
    const lighthouse = this._createMaterial("OceanShowcaseLighthouse", [0.86, 0.82, 0.69, 1], 40);
    const lighthouseBand = this._createMaterial("OceanShowcaseLighthouseBand", [0.7, 0.11, 0.07, 1], 34);
    const cloud = this._createMaterial("OceanShowcaseCloud", [0.78, 0.86, 0.86, 1], 6, [0.08, 0.1, 0.1, 1]);
    const sun = this._createMaterial("OceanShowcaseSun", [1, 0.61, 0.2, 1], 4, [0.95, 0.38, 0.08, 1]);

    const [primaryIsland, distantIsland] = OCEAN_SHOWCASE_LAYOUT.islandCenters;
    this._createPrimitive("primary-island-rock", this._unitSphere, deepRock, primaryIsland, [14, 3.8, 10]);
    this._createPrimitive(
      "primary-island-sand",
      this._unitSphere,
      sand,
      [primaryIsland[0] + 1, -1.45, primaryIsland[2] + 1],
      [10.5, 1.7, 7.4]
    );
    this._createPrimitive("distant-island", this._unitSphere, warmRock, distantIsland, [12, 3.1, 7]);
    this._createPrimitive(
      "distant-island-cap",
      this._unitSphere,
      foliage,
      [distantIsland[0], -0.85, distantIsland[2]],
      [8, 1.4, 4.8]
    );

    this._createPrimitive(
      "lighthouse-tower",
      this._unitCylinder,
      lighthouse,
      [primaryIsland[0] - 2.5, 3.15, primaryIsland[2] - 1],
      [1.35, 8.4, 1.35]
    );
    this._createPrimitive(
      "lighthouse-band",
      this._unitCylinder,
      lighthouseBand,
      [primaryIsland[0] - 2.5, 5.4, primaryIsland[2] - 1],
      [1.45, 0.85, 1.45]
    );
    this._createPrimitive(
      "lighthouse-roof",
      this._unitCone,
      lighthouseBand,
      [primaryIsland[0] - 2.5, 7.8, primaryIsland[2] - 1],
      [1.75, 1.8, 1.75]
    );

    const treePositions: readonly Vector3Tuple[] = [
      [-33, 1.1, -35],
      [-21, 0.8, -39],
      [-29, 0.5, -30],
      [32, -0.2, -57],
      [39, -0.4, -60]
    ];
    for (let index = 0; index < treePositions.length; index++) {
      const [x, y, z] = treePositions[index];
      this._createPrimitive(`tree-${index}-trunk`, this._unitCylinder, trunk, [x, y + 1.3, z], [0.45, 2.8, 0.45]);
      this._createPrimitive(`tree-${index}-crown`, this._unitCone, foliage, [x, y + 3.5, z], [2.2, 4.5, 2.2]);
    }

    for (let cloudIndex = 0; cloudIndex < OCEAN_SHOWCASE_LAYOUT.cloudCenters.length; cloudIndex++) {
      const [x, y, z] = OCEAN_SHOWCASE_LAYOUT.cloudCenters[cloudIndex];
      for (let lobe = 0; lobe < 3; lobe++) {
        this._createPrimitive(
          `cloud-${cloudIndex}-${lobe}`,
          this._unitSphere,
          cloud,
          [x + (lobe - 1) * 3.5, y + (lobe === 1 ? 1 : 0), z],
          [4.4, 1.8, 2.1]
        );
      }
    }
    this._createPrimitive("sun-disc", this._unitSphere, sun, [48, 25, -83], [4.8, 4.8, 2.2]);

    const lightEntity = this.root.createChild("ocean-showcase-key-light");
    lightEntity.transform.setRotation(-46, -32, 0);
    lightEntity.addComponent(DirectLight).color = new Color(1, 0.88, 0.7, 1);
  }

  private _createBoat(): void {
    const hull = this._createMaterial("OceanShowcaseBoatHull", [0.055, 0.16, 0.19, 1], 52);
    const trim = this._createMaterial("OceanShowcaseBoatTrim", [0.85, 0.33, 0.07, 1], 38);
    const cabin = this._createMaterial("OceanShowcaseBoatCabin", [0.82, 0.88, 0.82, 1], 46);
    this._createPrimitive("boat-hull", this._unitCube, hull, [0, 0, 0], [1.55, 0.55, 4.2], this._boatRoot);
    this._createPrimitive("boat-bow", this._unitCube, trim, [0, 0.12, 1.9], [1.7, 0.42, 0.55], this._boatRoot);
    this._createPrimitive("boat-cabin", this._unitCube, cabin, [0, 0.72, -0.25], [1.08, 0.9, 1.45], this._boatRoot);
    this._createPrimitive("boat-mast", this._unitCylinder, trim, [0, 2, -0.35], [0.12, 2.4, 0.12], this._boatRoot);

    const wakeColors: readonly ColorTuple[] = [
      [0.78, 0.96, 1, 0.42],
      [0.72, 0.91, 0.96, 0.25],
      [0.64, 0.84, 0.9, 0.12]
    ];
    for (let segment = 0; segment < wakeColors.length; segment++) {
      const wakeMaterial = this._createMaterial(
        `OceanShowcaseWake${segment}`,
        wakeColors[segment],
        4,
        [0.2, 0.34, 0.36, wakeColors[segment][3]],
        true
      );
      const z = -2.8 - segment * 2.2;
      const length = 2.4 + segment * 0.7;
      for (const side of [-1, 1] as const) {
        const wake = this._createPrimitive(
          `wake-${segment}-${side}`,
          this._unitCube,
          wakeMaterial,
          [side * (0.72 + segment * 0.28), -0.22, z],
          [0.16 + segment * 0.05, 0.035, length],
          this._wakeRoot,
          [0, side * (7 + segment * 2), 0]
        );
        wake.layer = OCEAN_WATER_LAYER;
      }
    }
  }

  private _createMaterial(
    name: string,
    color: ColorTuple,
    shininess: number,
    emissive: ColorTuple = [0.01, 0.01, 0.01, 1],
    transparent = false
  ): BlinnPhongMaterial {
    const material = new BlinnPhongMaterial(this._engine);
    material.name = name;
    material.baseColor = new Color(...color);
    material.emissiveColor = new Color(...emissive);
    material.specularColor = new Color(0.16, 0.18, 0.18, 1);
    material.shininess = shininess;
    material.isTransparent = transparent;
    this._materials.push(material);
    return material;
  }

  private _createPrimitive(
    name: string,
    mesh: ModelMesh,
    material: BlinnPhongMaterial,
    position: Vector3Tuple,
    scale: Vector3Tuple,
    parent: Entity = this._environmentRoot,
    rotation: Vector3Tuple = [0, 0, 0]
  ): Entity {
    const entity = parent.createChild(name);
    entity.transform.setPosition(...position);
    entity.transform.setRotation(...rotation);
    entity.transform.setScale(...scale);
    const renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.setMaterial(material);
    this._fixtureObjectCount++;
    return entity;
  }

  private _trackMesh(mesh: ModelMesh): ModelMesh {
    this._meshes.push(mesh);
    return mesh;
  }
}
