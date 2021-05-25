import { Matrix } from "@oasis-engine/math";
import { EngineObject } from "../base/EngineObject";
import { Entity } from "../Entity";

/**
 * Mesh skin data, equal glTF skins define
 */
export class Skin extends EngineObject {
  public inverseBindMatrices: Matrix[];
  public joints: Entity[];
  public skeleton: Entity;
  /**
   * Contructor of skin
   * @param name - name
   */
  constructor(public name: string) {
    super(null);
    this.inverseBindMatrices = []; // inverse bind matrix array, element type: gl-matrix.mat4
    this.joints = []; // joints entity array
    this.skeleton = null; // root entity
  }
}
