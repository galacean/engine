import {
  BlinnPhongMaterial,
  Engine,
  Entity,
  Layer,
  MeshRenderer,
  ModelMesh,
  PrimitiveMesh,
  RenderFace,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode
} from "@galacean/engine-core";
import { Color, Vector4 } from "@galacean/engine-math";
import {
  WATER_OPTICS_LAB_DEPTHS,
  WATER_OPTICS_LAB_LENGTH,
  WATER_OPTICS_LAB_REFLECTOR_MOTION,
  WATER_OPTICS_LAB_SURFACE_TIME,
  WATER_OPTICS_LAB_WIDTH
} from "./constants";
import type { WaterOpticsLabFixture, WaterOpticsLabTargetDefinition } from "./WaterOpticsLabFixture";
import { WATER_OPTICS_PLANAR_ANCHOR_LAYER } from "./WaterOpticsPlanarAnchorReference";
import type { WaterOpticsTransparentOrderingProbeMode } from "./types";

type ColorTuple = readonly [number, number, number, number];
type Vector3Tuple = readonly [number, number, number];

const CHECKER_PIXELS = new Uint8Array([235, 238, 232, 255, 19, 25, 28, 255, 19, 25, 28, 255, 235, 238, 232, 255]);

export const WATER_OPTICS_PLANAR_CLIP_SENTINEL_LAYER = Layer.Layer29;
export const WATER_OPTICS_TRANSPARENT_SENTINEL_NORMAL_PRIORITY = 0;
export const WATER_OPTICS_TRANSPARENT_SENTINEL_BEFORE_WATER_PRIORITY = -200;

/** Owns only deterministic opaque validation geometry; water rendering stays in the Heightfield runtime. */
export class WaterOpticsLabScene {
  readonly root: Entity;

  private readonly _engine: Engine;
  private readonly _meshes: ModelMesh[] = [];
  private readonly _materials: BlinnPhongMaterial[] = [];
  private readonly _checkerTexture: Texture2D;
  private _fixtureObjectCount = 0;
  private _planarAnchor?: Entity;
  private readonly _planarOrientationMarkers: Entity[] = [];
  private _planarOrientationMarkersVisible = true;
  private _movingReflector?: Entity;
  private _reflectorTime = WATER_OPTICS_LAB_SURFACE_TIME;
  private _transparentOrderingProbeMode: WaterOpticsTransparentOrderingProbeMode = "hidden";
  private _transparentOrderingSentinel?: Entity;
  private _transparentOrderingSentinelRenderer?: MeshRenderer;
  private _transparentOrderingSentinelMaterial?: BlinnPhongMaterial;

  get fixtureObjectCount(): number {
    return this._fixtureObjectCount;
  }

  get transparentOrderingProbeMode(): WaterOpticsTransparentOrderingProbeMode {
    return this._transparentOrderingProbeMode;
  }

  get transparentOrderingSentinelPriority(): number {
    return this._transparentOrderingSentinelRenderer?.priority ?? WATER_OPTICS_TRANSPARENT_SENTINEL_NORMAL_PRIORITY;
  }

  get transparentOrderingSentinelTransparent(): boolean {
    return this._transparentOrderingSentinelMaterial?.isTransparent === true;
  }

  get planarOrientationMarkersVisible(): boolean {
    return this._planarOrientationMarkersVisible;
  }

  get reflectorTime(): number {
    return this._reflectorTime;
  }

  get reflectorVisible(): boolean {
    return this._movingReflector?.isActive === true;
  }

  get reflectorWorldPosition(): readonly [number, number, number] {
    const position = this._movingReflector?.transform.worldPosition;
    return Object.freeze(
      position
        ? ([position.x, position.y, position.z] as const)
        : ([
            WATER_OPTICS_LAB_REFLECTOR_MOTION.centerX,
            WATER_OPTICS_LAB_REFLECTOR_MOTION.positionY,
            WATER_OPTICS_LAB_REFLECTOR_MOTION.positionZ
          ] as const)
    );
  }

  /** Calibration-only marker; hidden by default so product Golden images stay unchanged. */
  setPlanarAnchorVisible(visible: boolean): void {
    if (this._planarAnchor) this._planarAnchor.isActive = visible;
  }

  /** Keeps the four asymmetric references controllable without changing their fixed authored transforms. */
  setPlanarOrientationMarkersVisible(visible: boolean): void {
    this._planarOrientationMarkersVisible = visible;
    for (const marker of this._planarOrientationMarkers) marker.isActive = visible;
  }

  /** Deterministic boat pose shared by frozen Golden capture and causal two-time reflection checks. */
  setReflectorTime(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0)
      throw new RangeError("Reflector time must be finite and non-negative.");
    this._reflectorTime = seconds;
    const motion = WATER_OPTICS_LAB_REFLECTOR_MOTION;
    const phase = seconds * motion.angularRate;
    const x = motion.centerX + Math.sin(phase) * motion.halfTravelX;
    const velocityX = Math.cos(phase) * motion.halfTravelX * motion.angularRate;
    this._movingReflector?.transform.setPosition(x, motion.positionY, motion.positionZ);
    this._movingReflector?.transform.setRotation(0, velocityX >= 0 ? 90 : -90, 0);
  }

  constructor(engine: Engine, parent: Entity, fixture: WaterOpticsLabFixture) {
    this._engine = engine;
    this.root = parent.createChild("water-optics-lab-fixed-scene");
    this._checkerTexture = new Texture2D(engine, 2, 2, TextureFormat.R8G8B8A8, true, false);
    this._checkerTexture.name = "WaterOpticsLabChecker1m";
    this._checkerTexture.filterMode = TextureFilterMode.Point;
    this._checkerTexture.wrapModeU = TextureWrapMode.Repeat;
    this._checkerTexture.wrapModeV = TextureWrapMode.Repeat;
    this._checkerTexture.setPixelBuffer(CHECKER_PIXELS);
    this._checkerTexture.generateMipmaps();

    this._createDepthSteps();
    this._createPoolWalls();
    for (const target of fixture.targets) this._createTarget(target);
    this._createMovingReflector();
    this._createTransparentOrderingSentinel();
  }

  destroy(): void {
    this.root.destroy();
    for (const mesh of this._meshes) mesh.destroy(true);
    for (const material of this._materials) material.destroy(true);
    this._checkerTexture.destroy(true);
    this._meshes.length = 0;
    this._materials.length = 0;
    this._fixtureObjectCount = 0;
    this._planarAnchor = undefined;
    this._planarOrientationMarkers.length = 0;
    this._movingReflector = undefined;
    this._transparentOrderingSentinel = undefined;
    this._transparentOrderingSentinelRenderer = undefined;
    this._transparentOrderingSentinelMaterial = undefined;
  }

  /** Calibration-only A/B: normal transparent order, intentionally wrong order, or hidden negative control. */
  setTransparentOrderingProbeMode(mode: WaterOpticsTransparentOrderingProbeMode): void {
    const sentinel = this._transparentOrderingSentinel;
    const renderer = this._transparentOrderingSentinelRenderer;
    if (!sentinel || !renderer) return;
    this._transparentOrderingProbeMode = mode;
    sentinel.isActive = mode !== "hidden";
    renderer.priority =
      mode === "before-water"
        ? WATER_OPTICS_TRANSPARENT_SENTINEL_BEFORE_WATER_PRIORITY
        : WATER_OPTICS_TRANSPARENT_SENTINEL_NORMAL_PRIORITY;
  }

  private _createDepthSteps(): void {
    const bandWidth = WATER_OPTICS_LAB_WIDTH / WATER_OPTICS_LAB_DEPTHS.length;
    const checkerMaterial = this._createMaterial("WaterOpticsLabCheckerMaterial", [1, 1, 1, 1]);
    checkerMaterial.baseTexture = this._checkerTexture;
    checkerMaterial.tilingOffset = new Vector4(bandWidth, WATER_OPTICS_LAB_LENGTH, 0, 0);
    checkerMaterial.specularColor = new Color(0.035, 0.035, 0.035, 1);
    checkerMaterial.shininess = 5;

    for (let index = 0; index < WATER_OPTICS_LAB_DEPTHS.length; index++) {
      const depth = WATER_OPTICS_LAB_DEPTHS[index];
      const centerX = -WATER_OPTICS_LAB_WIDTH * 0.5 + bandWidth * (index + 0.5);
      this._createCuboid(
        `depth-step-${index}-${depth.toFixed(1)}m`,
        [bandWidth, 0.18, WATER_OPTICS_LAB_LENGTH],
        [centerX, -depth - 0.09, 0],
        checkerMaterial
      );
    }
  }

  private _createPoolWalls(): void {
    const wallMaterial = this._createMaterial("WaterOpticsLabWallMaterial", [0.4, 0.47, 0.49, 1]);
    wallMaterial.specularColor = new Color(0.08, 0.1, 0.1, 1);
    wallMaterial.shininess = 18;
    const wallHeight = Math.max(...WATER_OPTICS_LAB_DEPTHS) + 0.5;
    const wallY = -wallHeight * 0.5 + 0.2;
    const thickness = 0.35;
    this._createCuboid(
      "pool-wall-north",
      [WATER_OPTICS_LAB_WIDTH + thickness * 2, wallHeight, thickness],
      [0, wallY, -WATER_OPTICS_LAB_LENGTH * 0.5 - thickness * 0.5],
      wallMaterial
    );
    this._createCuboid(
      "pool-wall-south",
      [WATER_OPTICS_LAB_WIDTH + thickness * 2, wallHeight, thickness],
      [0, wallY, WATER_OPTICS_LAB_LENGTH * 0.5 + thickness * 0.5],
      wallMaterial
    );
    this._createCuboid(
      "pool-wall-west",
      [thickness, wallHeight, WATER_OPTICS_LAB_LENGTH],
      [-WATER_OPTICS_LAB_WIDTH * 0.5 - thickness * 0.5, wallY, 0],
      wallMaterial
    );
    this._createCuboid(
      "pool-wall-east",
      [thickness, wallHeight, WATER_OPTICS_LAB_LENGTH],
      [WATER_OPTICS_LAB_WIDTH * 0.5 + thickness * 0.5, wallY, 0],
      wallMaterial
    );
  }

  private _createTarget(target: WaterOpticsLabTargetDefinition): void {
    const material = this._createMaterial(`${target.id}-material`, target.color);
    material.specularColor = new Color(0.12, 0.12, 0.12, 1);
    material.shininess = 22;
    material.emissiveColor = new Color(
      target.color[0] * (target.kind === "planar-anchor" ? 0.72 : 0.08),
      target.color[1] * (target.kind === "planar-anchor" ? 0.72 : 0.08),
      target.color[2] * (target.kind === "planar-anchor" ? 0.72 : 0.08),
      target.color[3]
    );
    const entity = this._createCuboid(target.id, target.size, target.position, material);
    if (target.kind === "underwater-sentinel") entity.layer = WATER_OPTICS_PLANAR_CLIP_SENTINEL_LAYER;
    else if (target.kind === "orientation-marker") this._planarOrientationMarkers.push(entity);
    else if (target.kind === "planar-anchor") {
      entity.layer = WATER_OPTICS_PLANAR_ANCHOR_LAYER;
      entity.isActive = false;
      this._planarAnchor = entity;
    }
  }

  private _createMovingReflector(): void {
    const hull = this._createMaterial("WaterOpticsMovingReflectorHullMaterial", [0.96, 0.29, 0.035, 1]);
    hull.specularColor = new Color(0.24, 0.2, 0.14, 1);
    hull.shininess = 36;
    const cabin = this._createMaterial("WaterOpticsMovingReflectorCabinMaterial", [0.94, 0.96, 0.89, 1]);
    cabin.emissiveColor = new Color(0.08, 0.09, 0.07, 1);
    const bow = this._createMaterial("WaterOpticsMovingReflectorBowMaterial", [0.04, 0.16, 0.22, 1]);

    const root = this.root.createChild("moving-reflector-boat");
    this._createCuboid("moving-reflector-boat-hull", [2.8, 0.55, 1.15], [0, 0, 0], hull, root);
    this._createCuboid("moving-reflector-boat-cabin", [1.05, 0.75, 0.82], [-0.25, 0.62, 0], cabin, root);
    this._createCuboid("moving-reflector-boat-bow", [0.48, 0.35, 1.3], [1.35, 0.08, 0], bow, root);
    this._movingReflector = root;
    this.setReflectorTime(WATER_OPTICS_LAB_SURFACE_TIME);
  }

  private _createTransparentOrderingSentinel(): void {
    const material = this._createMaterial("WaterOpticsTransparentOrderingSentinelMaterial", [1, 0.025, 0.12, 0.7]);
    material.isTransparent = true;
    material.renderFace = RenderFace.Double;
    material.specularColor = new Color(0, 0, 0, 1);
    material.emissiveColor = new Color(1, 0.01, 0.08, 1);

    const entity = this.root.createChild("transparent-ordering-sentinel");
    entity.transform.setPosition(3, 0.18, 1);
    entity.transform.setRotation(90, 0, 0);
    const mesh = PrimitiveMesh.createPlane(this._engine, 4.2, 3.2);
    mesh.name = "transparent-ordering-sentinel-mesh";
    this._meshes.push(mesh);
    const renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.priority = WATER_OPTICS_TRANSPARENT_SENTINEL_NORMAL_PRIORITY;
    renderer.setMaterial(material);
    entity.isActive = false;
    this._fixtureObjectCount++;
    this._transparentOrderingSentinel = entity;
    this._transparentOrderingSentinelRenderer = renderer;
    this._transparentOrderingSentinelMaterial = material;
  }

  private _createMaterial(name: string, color: ColorTuple): BlinnPhongMaterial {
    const material = new BlinnPhongMaterial(this._engine);
    material.name = name;
    material.baseColor = new Color(...color);
    this._materials.push(material);
    return material;
  }

  private _createCuboid(
    name: string,
    size: Vector3Tuple,
    position: Vector3Tuple,
    material: BlinnPhongMaterial,
    parent: Entity = this.root
  ): Entity {
    const entity = parent.createChild(name);
    entity.transform.setPosition(...position);
    const mesh = PrimitiveMesh.createCuboid(this._engine, ...size);
    mesh.name = `${name}-mesh`;
    this._meshes.push(mesh);
    const renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.setMaterial(material);
    this._fixtureObjectCount++;
    return entity;
  }
}
