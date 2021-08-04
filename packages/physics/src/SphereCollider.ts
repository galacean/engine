import { PhysXManager } from "./PhysXManager";
import { Collider } from "./Collider";

export class SphereCollider extends Collider {
  private _radius: number = 0.0;
  /**
   * PhysX geometry object
   * @internal
   */
  private _pxGeometry: any;

  get radius(): number {
    return this._radius;
  }

  /**
   * set size of collider
   * @param value size of SphereCollider
   * @remarks will re-alloc new PhysX object.
   */
  set radius(value: number) {
    this._radius = value;
    this.initWithRadius(value);
  }

  /**
   * init Collider and alloc PhysX objects.
   * @param value size of SphereCollider
   * @remarks must call after this component add to Entity.
   */
  initWithRadius(value: number) {
    this._radius = value;

    // alloc Physx object
    this._allocGeometry();
    this._allocShape();
    this._setLocalPose();
    this._pxShape.setQueryFilterData(new PhysXManager.PhysX.PxFilterData(this._group_id, 0, 0, 0));
    this._allocActor();
  }

  //----------------------------------------------------------------------------
  private _allocGeometry() {
    this._pxGeometry = new PhysXManager.PhysX.PxSphereGeometry(this._radius);
  }

  private _allocShape() {
    this._pxShape = PhysXManager.physics.createShape(
      this._pxGeometry,
      this._material._pxMaterial,
      false,
      new PhysXManager.PhysX.PxShapeFlags(this._shapeFlags)
    );
  }
}