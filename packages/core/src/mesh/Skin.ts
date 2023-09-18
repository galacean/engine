import { Matrix } from "@galacean/engine-math";
import { EngineObject } from "../base/EngineObject";
import { Entity } from "../Entity";

/**
 * Mesh skin data, equal glTF skins define
 */
export class Skin extends EngineObject {
  public inverseBindMatrices: Matrix[];
  public joints: string[];
  public skeleton: string;

  public _rootBone: Entity;
  public _bones: Entity[] = [];

  /**
   * Constructor of skin
   * @param name - name
   */
  constructor(public name: string) {
    super(null);
    this.inverseBindMatrices = []; // inverse bind matrix array
    this.joints = []; // joints name array, element type: string
    this.skeleton = "none"; // root bone name
  }
}
