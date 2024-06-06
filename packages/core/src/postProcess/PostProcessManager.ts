import { SafeLoopArray } from "../utils/SafeLoopArray";
import { PostProcessPass } from "./PostProcessPass";

export class PostProcessManager {
  /** @internal */
  _postProcessPasses = new SafeLoopArray<PostProcessPass>();

  /**
   * Get the post process pass list.
   */
  get postProcessPasses(): ReadonlyArray<PostProcessPass> {
    return this._postProcessPasses.getArray();
  }

  /**
   * Add post process pass.
   * @param value - The post process pass want to be added
   */
  addPostProcessPass(value: PostProcessPass): void;

  /**
   * Add post process pass at specified index.
   * @param index - Specified index
   * @param value - The post process pass want to be added
   */
  addPostProcessPass(index: number, value: PostProcessPass): void;

  addPostProcessPass(indexOrValue: number | PostProcessPass, value?: PostProcessPass): void {}

  /**
   * Remove post process.
   * @param value - The post process pass want to be removed
   */
  removePostProcessPass(value: PostProcessPass): void {}
}
