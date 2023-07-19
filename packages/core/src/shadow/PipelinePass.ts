import { Engine } from "../Engine";
import { RenderContext } from "../RenderPipeline/RenderContext";

/**
 * PipelinePass is a base class for all pipeline passes.
 */
export class PipelinePass {
  protected _engine: Engine;

  constructor(engine: Engine) {
    this._engine = engine;
  }
  
  render(context: RenderContext): void {}
}
