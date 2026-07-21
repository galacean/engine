import {
  BoxColliderShape,
  Entity,
  PhysicsMaterial,
  StaticCollider,
  Vector3,
  type Engine
} from "@galacean/engine";
import type { PoolSceneLayout } from "../decoration/PoolSceneController";

const WALL_THICKNESS = 0.28;
const BOTTOM_THICKNESS = 0.3;
const WALL_HEIGHT_ABOVE_WATER = 0.45;

/** Creates the pool's public Galacean static-collider shell. */
export class PoolPhysicsSceneController {
  readonly root: Entity;
  readonly colliderCount = 5;

  private readonly _material: PhysicsMaterial;

  constructor(
    _engine: Engine,
    parent: Entity,
    layout: PoolSceneLayout
  ) {
    this.root = parent.createChild("interactive-pool-static-colliders");
    this.root.transform.setPosition(...layout.position);
    this.root.transform.setRotation(0, layout.rotationY, 0);
    this._material = new PhysicsMaterial();
    this._material.staticFriction = 0.18;
    this._material.dynamicFriction = 0.12;
    this._material.bounciness = 0.02;

    const halfLength = layout.length * 0.5;
    const halfWidth = layout.width * 0.5;
    const wallHeight = layout.depth + WALL_HEIGHT_ABOVE_WATER;
    const wallY = (WALL_HEIGHT_ABOVE_WATER - layout.depth) * 0.5;
    this._createBox(
      "pool-physics-bottom",
      [layout.length, BOTTOM_THICKNESS, layout.width],
      [0, -layout.depth - BOTTOM_THICKNESS * 0.5, 0]
    );
    this._createBox(
      "pool-physics-near-wall",
      [layout.length, wallHeight, WALL_THICKNESS],
      [0, wallY, -halfWidth - WALL_THICKNESS * 0.5]
    );
    this._createBox(
      "pool-physics-far-wall",
      [layout.length, wallHeight, WALL_THICKNESS],
      [0, wallY, halfWidth + WALL_THICKNESS * 0.5]
    );
    this._createBox(
      "pool-physics-left-wall",
      [WALL_THICKNESS, wallHeight, layout.width],
      [-halfLength - WALL_THICKNESS * 0.5, wallY, 0]
    );
    this._createBox(
      "pool-physics-right-wall",
      [WALL_THICKNESS, wallHeight, layout.width],
      [halfLength + WALL_THICKNESS * 0.5, wallY, 0]
    );
  }

  destroy(): void {
    this.root.destroy();
    this._material.destroy();
  }

  private _createBox(
    name: string,
    size: readonly [number, number, number],
    position: readonly [number, number, number]
  ): void {
    const entity = this.root.createChild(name);
    entity.transform.setPosition(...position);
    const collider = entity.addComponent(StaticCollider);
    const shape = new BoxColliderShape();
    const defaultMaterial = shape.material;
    shape.material = this._material;
    defaultMaterial.destroy();
    shape.size = new Vector3(...size);
    collider.addShape(shape);
  }
}
