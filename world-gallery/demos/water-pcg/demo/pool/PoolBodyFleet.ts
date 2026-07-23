import {
  BlinnPhongMaterial,
  CollisionDetectionMode,
  Color,
  DynamicCollider,
  Entity,
  MeshRenderer,
  ModelMesh,
  PhysicsMaterial,
  PrimitiveMesh,
  Script,
  SphereColliderShape,
  Vector3,
  type Engine
} from "@galacean/engine";
import { WaterBuoyancy } from "../../runtime/buoyancy/WaterBuoyancy";
import type { WaterSurfaceInteractionSink } from "../../runtime/interaction/WaterSurfaceInteractionSink";
import { createWaterSurfaceSample, type WaterSurfaceProvider } from "../../runtime/query/WaterSurfaceProvider";
import { createPoolFleetPlacements, type PoolFleetPlacement } from "./PoolBodyFleetLayout";

const DUCK_COLLIDER_RADIUS = 0.52;
const DUCK_MASS = 18;
const DUCK_DRIVE_DURATION_SECONDS = 2.4;
const DUCK_DRIVE_FORCE = 18;
const DUCK_HORIZONTAL_DRAG = 1.2;
export interface PoolBodyFleetOptions {
  readonly engine: Engine;
  readonly surfaceProvider: WaterSurfaceProvider;
  readonly createInteractionSink: (emitterId: number) => WaterSurfaceInteractionSink;
  readonly centerX: number;
  readonly centerZ: number;
  readonly lengthAxisX: number;
  readonly lengthAxisZ: number;
  readonly length: number;
  readonly width: number;
}

export interface PoolBodyFleetMetrics {
  readonly bodyCount: number;
  readonly drivingBodyCount: number;
  readonly submergedBodyCount: number;
  readonly maximumHorizontalSpeed: number;
}

class PoolWakeDrive extends Script {
  collider: DynamicCollider | null = null;
  readonly force = new Vector3();
  remainingSeconds = 0;

  get driving(): boolean {
    return this.remainingSeconds > 0;
  }

  onPhysicsUpdate(): void {
    if (!this.collider || this.remainingSeconds <= 0) return;
    this.collider.applyForce(this.force);
    this.remainingSeconds = Math.max(0, this.remainingSeconds - this.scene.physics.fixedTimeStep);
  }
}

interface PoolFleetBody {
  readonly entity: Entity;
  readonly collider: DynamicCollider;
  readonly buoyancy: WaterBuoyancy;
  readonly drive: PoolWakeDrive;
}

/**
 * Bounded set of simple duck-shaped PhysX bodies used to exercise P1 wake aggregation.
 *
 * The fleet only owns actors and their one-shot drive. Surface deformation, wake,
 * foam and buoyancy remain separate consumers of the shared water contracts.
 */
export class PoolBodyFleet extends Script {
  private readonly _queryPosition = new Vector3();
  private readonly _surfaceSample = createWaterSurfaceSample();
  private readonly _bodies: PoolFleetBody[] = [];
  private _options: PoolBodyFleetOptions | null = null;
  private _sphereMesh: ModelMesh | null = null;
  private _beakMesh: ModelMesh | null = null;
  private _yellowMaterial: BlinnPhongMaterial | null = null;
  private _orangeMaterial: BlinnPhongMaterial | null = null;
  private _physicsMaterial: PhysicsMaterial | null = null;

  get metrics(): PoolBodyFleetMetrics {
    let drivingBodyCount = 0;
    let submergedBodyCount = 0;
    let maximumHorizontalSpeed = 0;
    for (const body of this._bodies) {
      if (body.drive.driving) drivingBodyCount++;
      if (body.buoyancy.isInWater) submergedBodyCount++;
      const velocity = body.collider.linearVelocity;
      maximumHorizontalSpeed = Math.max(maximumHorizontalSpeed, Math.hypot(velocity.x, velocity.z));
    }
    return Object.freeze({
      bodyCount: this._bodies.length,
      drivingBodyCount,
      submergedBodyCount,
      maximumHorizontalSpeed
    });
  }

  configure(options: PoolBodyFleetOptions): void {
    if (this._options) throw new Error("PoolBodyFleet is already configured.");
    this._options = options;
    this._sphereMesh = PrimitiveMesh.createSphere(options.engine, 1, 20);
    this._sphereMesh.name = "p1-pool-duck-sphere";
    this._sphereMesh.isGCIgnored = true;
    this._beakMesh = PrimitiveMesh.createCuboid(options.engine, 1, 1, 1);
    this._beakMesh.name = "p1-pool-duck-beak";
    this._beakMesh.isGCIgnored = true;
    this._yellowMaterial = new BlinnPhongMaterial(options.engine);
    this._yellowMaterial.name = "P1PoolDuckYellow";
    this._yellowMaterial.baseColor = new Color(0.98, 0.78, 0.05, 1);
    this._yellowMaterial.specularColor = new Color(1, 0.92, 0.52, 1);
    this._yellowMaterial.shininess = 48;
    this._yellowMaterial.isGCIgnored = true;
    this._orangeMaterial = new BlinnPhongMaterial(options.engine);
    this._orangeMaterial.name = "P1PoolDuckOrange";
    this._orangeMaterial.baseColor = new Color(1, 0.34, 0.04, 1);
    this._orangeMaterial.isGCIgnored = true;
    this._physicsMaterial = new PhysicsMaterial();
    this._physicsMaterial.staticFriction = 0.12;
    this._physicsMaterial.dynamicFriction = 0.08;
    this._physicsMaterial.bounciness = 0.02;
  }

  setAdditionalBodyCount(count: number): void {
    const options = this._options;
    if (!options) throw new Error("PoolBodyFleet must be configured before spawning bodies.");
    this._destroyBodies();
    const placements = createPoolFleetPlacements(count, options.length, options.width);
    for (let index = 0; index < placements.length; index++) this._spawnBody(index, placements[index]);
  }

  restartDrives(): void {
    for (const body of this._bodies) body.drive.remainingSeconds = DUCK_DRIVE_DURATION_SECONDS;
  }

  dispose(): void {
    this._destroyBodies();
    this._sphereMesh?.destroy(true);
    this._beakMesh?.destroy(true);
    this._yellowMaterial?.destroy(true);
    this._orangeMaterial?.destroy(true);
    this._physicsMaterial?.destroy();
    this._sphereMesh = null;
    this._beakMesh = null;
    this._yellowMaterial = null;
    this._orangeMaterial = null;
    this._physicsMaterial = null;
    this._options = null;
  }

  private _spawnBody(index: number, placement: PoolFleetPlacement): void {
    const options = this._options;
    const sphereMesh = this._sphereMesh;
    const beakMesh = this._beakMesh;
    const yellowMaterial = this._yellowMaterial;
    const orangeMaterial = this._orangeMaterial;
    const physicsMaterial = this._physicsMaterial;
    if (!options || !sphereMesh || !beakMesh || !yellowMaterial || !orangeMaterial || !physicsMaterial) return;
    const widthAxisX = -options.lengthAxisZ;
    const widthAxisZ = options.lengthAxisX;
    const worldX = options.centerX + placement.localX * options.lengthAxisX + placement.localZ * widthAxisX;
    const worldZ = options.centerZ + placement.localX * options.lengthAxisZ + placement.localZ * widthAxisZ;
    this._queryPosition.set(worldX, 0, worldZ);
    if (!options.surfaceProvider.sampleSurface(this._queryPosition, this._surfaceSample)) return;

    const entity = this.entity.createChild(`p1-wake-duck-${index + 1}`);
    entity.transform.setPosition(worldX, this._surfaceSample.surfacePosition.y + 0.6, worldZ);
    const bodyVisual = entity.createChild("body");
    bodyVisual.transform.setScale(0.78, 0.46, 0.55);
    const bodyRenderer = bodyVisual.addComponent(MeshRenderer);
    bodyRenderer.mesh = sphereMesh;
    bodyRenderer.setMaterial(yellowMaterial);
    const headVisual = entity.createChild("head");
    headVisual.transform.setPosition(0.54, 0.3, 0);
    headVisual.transform.setScale(0.3, 0.3, 0.3);
    const headRenderer = headVisual.addComponent(MeshRenderer);
    headRenderer.mesh = sphereMesh;
    headRenderer.setMaterial(yellowMaterial);
    const beakVisual = entity.createChild("beak");
    beakVisual.transform.setPosition(0.82, 0.26, 0);
    beakVisual.transform.setScale(0.26, 0.1, 0.2);
    const beakRenderer = beakVisual.addComponent(MeshRenderer);
    beakRenderer.mesh = beakMesh;
    beakRenderer.setMaterial(orangeMaterial);

    const collider = entity.addComponent(DynamicCollider);
    const shape = new SphereColliderShape();
    const defaultPhysicsMaterial = shape.material;
    shape.material = physicsMaterial;
    defaultPhysicsMaterial.destroy();
    shape.radius = DUCK_COLLIDER_RADIUS;
    collider.addShape(shape);
    collider.mass = DUCK_MASS;
    collider.linearDamping = 0.3;
    collider.angularDamping = 0.8;
    collider.collisionDetectionMode = CollisionDetectionMode.Continuous;

    const buoyancy = entity.addComponent(WaterBuoyancy);
    buoyancy.surfaceProvider = options.surfaceProvider;
    buoyancy.interactionSink = options.createInteractionSink(index + 1);
    buoyancy.pontoons = [
      { localPosition: new Vector3(-0.24, 0, 0), radius: 0.42, enabled: true },
      { localPosition: new Vector3(0.24, 0, 0), radius: 0.42, enabled: true }
    ];
    buoyancy.buoyancyCoefficient = 2;
    buoyancy.verticalDamping = 2.2;
    buoyancy.maxForceMultiplier = 4;
    buoyancy.applyHorizontalDrag = true;
    buoyancy.horizontalLinearDrag = DUCK_HORIZONTAL_DRAG;
    buoyancy.waterDensity = 1000;
    buoyancy.horizontalDragCoefficient = 0.8;
    buoyancy.horizontalDragAreaScale = 1;
    buoyancy.maxHorizontalDragSpeed = 6;
    buoyancy.maxHorizontalForceMultiplier = 3;

    const drive = entity.addComponent(PoolWakeDrive);
    drive.collider = collider;
    const directionX = placement.directionLocalX * options.lengthAxisX + placement.directionLocalZ * widthAxisX;
    const directionZ = placement.directionLocalX * options.lengthAxisZ + placement.directionLocalZ * widthAxisZ;
    const inverseDirectionLength = 1 / (Math.hypot(directionX, directionZ) || 1);
    drive.force.set(
      directionX * inverseDirectionLength * DUCK_DRIVE_FORCE,
      0,
      directionZ * inverseDirectionLength * DUCK_DRIVE_FORCE
    );
    drive.remainingSeconds = DUCK_DRIVE_DURATION_SECONDS;
    this._bodies.push({ entity, collider, buoyancy, drive });
  }

  private _destroyBodies(): void {
    for (const body of this._bodies) body.entity.destroy();
    this._bodies.length = 0;
  }
}
