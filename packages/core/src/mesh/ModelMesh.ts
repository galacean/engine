import { Engine } from "..";
import { Mesh } from "../graphic/Mesh";

/**
 * Mesh containing common vertex elements of the model.
 */
export class ModelMesh extends Mesh {
  /**
   * Create a model mesh.
   * @param engine - Engine to which the mesh belongs
   * @param name - Mesh name
   */
  constructor(engine: Engine, name?: string) {
    super(engine);
    this.name = name;
  }
}
