import { Component } from "../Component";
import { ignoreClone } from "../clone/CloneManager";
import { Entity } from "../Entity";
import { IStaticCollider } from "@oasis-engine/design";
import { PhysicsShape } from "./PhysicsShape";
import { Quaternion, Vector3 } from "@oasis-engine/math";
import { Engine } from "../Engine";

export class StaticCollider extends Component {
  /** @internal */
  @ignoreClone
  _index: number = -1;

  /** @internal */
  _collider: IStaticCollider;

  get index(): number {
    return this._index;
  }

  constructor(entity: Entity) {
    super(entity);
    this._collider = this.engine._physicsEngine.createStaticCollider();
  }

  init(
    position: Vector3 = this.entity.transform.position,
    rotation: Quaternion = this.entity.transform.rotationQuaternion
  ) {
    this._collider.init(position, rotation);
  }

  createShape<T extends PhysicsShape>(type: new (entity: Engine) => T): T {
    const component = new type(this.engine);
    component.init(this._index);
    return component;
  }

  /**
   * init Collider and alloc PhysX objects.
   * @param shape collider shape
   * @remarks must call after this component add to Entity.
   */
  attachShape(shape: PhysicsShape) {
    this._collider.attachShape(shape._shape);
  }

  /**
   * @override
   */
  _onEnable() {
    super._onEnable();
    this.engine._componentsManager.addCollider(this);
  }

  /**
   * @override
   */
  _onDisable() {
    super._onDisable();
    this.engine._componentsManager.removeCollider(this);
  }

  onUpdate() {}
}
