import { Entity } from "../Entity";
import { Shader } from "../shader";
import { Fog } from "./Fog";

/**
 * Linear fog, according to the distance of the camera linear difference fog density.
 */
export class LinearFog extends Fog {
  private static _nearProperty = Shader.getPropertyByName("u_fogNear");
  private static _farProperty = Shader.getPropertyByName("u_fogFar");

  /**
   * Start of fog.
   */
  get near(): number {
    return this._near;
  }

  set near(value: number) {
    this._near = value;
    this.scene.shaderData.setFloat(LinearFog._nearProperty, value);
  }

  /**
   * End of fog.
   */
  get far(): number {
    return this._far;
  }

  set far(value: number) {
    this._far = value;
    this.scene.shaderData.setFloat(LinearFog._farProperty, value);
  }

  private _near: number = 1;
  private _far: number = 1000;

  constructor(entity: Entity) {
    super(entity);
    this.near = this._near;
    this.far = this._far;
  }
}
