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

const BALL_RADIUS = 0.75;
const BALL_MASS = 40;
const BALL_PONTOON_RADIUS = 0.72;
const BALL_SPAWN_HEIGHT = 6;
const INITIAL_SPAWN_DELAY = 0.8;

export interface PoolBallSpawnerOptions {
  readonly engine: Engine;
  readonly surfaceProvider: WaterSurfaceProvider;
  readonly interactionSink: WaterSurfaceInteractionSink;
  readonly spawnCenterX: number;
  readonly spawnCenterZ: number;
}

/** Uses a Galacean Script update only to schedule creation; PhysX owns all motion after spawn. */
export class PoolBallSpawner extends Script {
  private readonly _surfaceSample = createWaterSurfaceSample();
  private readonly _queryPosition = new Vector3();
  private _options: PoolBallSpawnerOptions | null = null;
  private _ballEntity: Entity | null = null;
  private _collider: DynamicCollider | null = null;
  private _buoyancy: WaterBuoyancy | null = null;
  private _mesh: ModelMesh | null = null;
  private _material: BlinnPhongMaterial | null = null;
  private _physicsMaterial: PhysicsMaterial | null = null;
  private _spawnDelay = INITIAL_SPAWN_DELAY;
  private _spawnScheduled = false;
  private _spawnCount = 0;
  private _initialHeightAboveSurface = 0;

  get ballEntity(): Entity | null {
    return this._ballEntity;
  }

  get collider(): DynamicCollider | null {
    return this._collider;
  }

  get buoyancy(): WaterBuoyancy | null {
    return this._buoyancy;
  }

  get spawnCount(): number {
    return this._spawnCount;
  }

  get initialHeightAboveSurface(): number {
    return this._initialHeightAboveSurface;
  }

  configure(options: PoolBallSpawnerOptions): void {
    this._options = options;
    this._mesh = PrimitiveMesh.createSphere(options.engine, BALL_RADIUS, 32);
    this._mesh.name = "interactive-pool-ball-mesh";
    this._mesh.isGCIgnored = true;
    this._material = new BlinnPhongMaterial(options.engine);
    this._material.name = "InteractivePoolBallMaterial";
    this._material.baseColor = new Color(0.96, 0.34, 0.08, 1);
    this._material.specularColor = new Color(1, 0.9, 0.72, 1);
    this._material.emissiveColor = new Color(0.08, 0.012, 0.002, 1);
    this._material.shininess = 72;
    this._material.isGCIgnored = true;
    this._physicsMaterial = new PhysicsMaterial();
    this._physicsMaterial.staticFriction = 0.16;
    this._physicsMaterial.dynamicFriction = 0.1;
    this._physicsMaterial.bounciness = 0.05;
    this.scheduleSpawn(INITIAL_SPAWN_DELAY);
  }

  scheduleSpawn(delaySeconds = 0.15): void {
    this._destroyBall();
    this._spawnDelay = Math.max(0, delaySeconds);
    this._spawnScheduled = true;
  }

  onUpdate(deltaTime: number): void {
    if (!this._spawnScheduled || !this._options) return;
    this._spawnDelay -= deltaTime;
    if (this._spawnDelay > 0) return;
    this._spawnScheduled = false;
    this._spawnBall();
  }

  dispose(): void {
    this._spawnScheduled = false;
    this._destroyBall();
    this._mesh?.destroy(true);
    this._material?.destroy(true);
    this._physicsMaterial?.destroy();
    this._mesh = null;
    this._material = null;
    this._physicsMaterial = null;
    this._options = null;
  }

  private _spawnBall(): void {
    const options = this._options;
    const mesh = this._mesh;
    const material = this._material;
    const physicsMaterial = this._physicsMaterial;
    if (!options || !mesh || !material || !physicsMaterial) return;
    this._queryPosition.set(options.spawnCenterX, 0, options.spawnCenterZ);
    if (!options.surfaceProvider.sampleSurface(this._queryPosition, this._surfaceSample)) {
      throw new Error("Interactive pool center is outside the active water surface.");
    }
    const surfaceHeight = this._surfaceSample.surfacePosition.y;
    const entity = this.entity.createChild(`interactive-pool-ball-${this._spawnCount + 1}`);
    entity.transform.setPosition(options.spawnCenterX, surfaceHeight + BALL_SPAWN_HEIGHT, options.spawnCenterZ);
    const renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.setMaterial(material);

    const collider = entity.addComponent(DynamicCollider);
    const shape = new SphereColliderShape();
    const defaultPhysicsMaterial = shape.material;
    shape.material = physicsMaterial;
    defaultPhysicsMaterial.destroy();
    shape.radius = BALL_RADIUS;
    collider.addShape(shape);
    collider.mass = BALL_MASS;
    collider.linearDamping = 0.02;
    collider.angularDamping = 0.08;
    collider.collisionDetectionMode = CollisionDetectionMode.Continuous;

    const buoyancy = entity.addComponent(WaterBuoyancy);
    buoyancy.surfaceProvider = options.surfaceProvider;
    buoyancy.interactionSink = options.interactionSink;
    buoyancy.pontoons = [{ localPosition: new Vector3(), radius: BALL_PONTOON_RADIUS, enabled: true }];
    buoyancy.buoyancyCoefficient = 2;
    buoyancy.verticalDamping = 1.8;
    buoyancy.maxForceMultiplier = 4;
    buoyancy.applyHorizontalDrag = true;
    buoyancy.horizontalLinearDrag = 0;
    buoyancy.waterDensity = 1000;
    buoyancy.horizontalDragCoefficient = 0.5;
    buoyancy.horizontalDragAreaScale = 1;
    buoyancy.maxHorizontalDragSpeed = 5;
    buoyancy.maxHorizontalForceMultiplier = 2;

    this._ballEntity = entity;
    this._collider = collider;
    this._buoyancy = buoyancy;
    this._spawnCount++;
    this._initialHeightAboveSurface = entity.transform.worldPosition.y - surfaceHeight;
  }

  private _destroyBall(): void {
    this._ballEntity?.destroy();
    this._ballEntity = null;
    this._collider = null;
    this._buoyancy = null;
  }
}
