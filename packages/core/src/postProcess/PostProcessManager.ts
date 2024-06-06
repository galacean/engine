import { SafeLoopArray } from "../utils/SafeLoopArray";
import { PostProcess } from "./PostProcess";

export class PostProcessManager {
  private _postProcess = new SafeLoopArray<PostProcess>();

  /**
   * Get the post process list.
   */
  get postProcesses(): ReadonlyArray<PostProcess> {
    return this._postProcess.getArray();
  }

  /**
   * Add post process.
   * @param value - The post process want to be added
   */
  addPostProcess(value: PostProcess): void;

  /**
   * Add post process at specified index.
   * @param index - Specified index
   * @param value - The post process want to be added
   */
  addPostProcess(index: number, value: PostProcess): void;

  addPostProcess(indexOrValue: number | PostProcess, value?: PostProcess): void {}

  /**
   * Remove post process.
   * @param value - The post process want to be removed
   */
  removePostProcess(value: PostProcess): void {}
}
