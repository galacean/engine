import { Scene } from "../Scene";
import { SafeLoopArray } from "../utils/SafeLoopArray";
import { PostProcessPass } from "./PostProcessPass";

export class PostProcessManager {
  /** @internal */
  _passes = new SafeLoopArray<PostProcessPass>();

  /**
   * Get the post process pass list.
   */
  get passes(): ReadonlyArray<PostProcessPass> {
    return this._passes.getArray();
  }

  /**
   * Create a PostProcessManager.
   * @param scene - Scene to which the current PostProcessManager belongs
   */
  constructor(public readonly scene: Scene) {}

  /**
   * Add post process pass.
   * @param pass - The post process pass want to be added
   */
  addPass(pass: PostProcessPass): void;

  /**
   * Add post process pass at specified index.
   * @param index - Specified index
   * @param pass - The post process pass want to be added
   */
  addPass(index: number, pass: PostProcessPass): void;

  addPass(indexOrPass: number | PostProcessPass, pass?: PostProcessPass): void {
    const passes = this._passes;
    let index: number;

    if (typeof indexOrPass === "number") {
      if (indexOrPass < 0 || indexOrPass > passes.length) {
        throw "The index is out of range.";
      }
      index = indexOrPass;
    } else {
      index = passes.length;
      pass = indexOrPass;
    }

    const currentIndex = passes.indexOf(pass);
    if (currentIndex !== index) {
      if (pass.engine !== this.scene.engine) {
        throw "The post process pass is not belong to this engine.";
      }
      if (currentIndex !== -1) {
        passes.removeByIndex(currentIndex);
      }
      passes.add(index, pass);
    }
  }

  /**
   * Remove post process pass.
   * @param pass - The post process pass want to be removed
   */
  removePass(pass: PostProcessPass): void {
    const passes = this._passes;
    const index = passes.indexOf(pass);
    if (index !== -1) {
      passes.removeByIndex(index);
    }
  }
}
