import { Engine } from "../../Engine";
import { PipelineUtils } from "../../RenderPipeline/PipelineUtils";
import { RenderContext } from "../../RenderPipeline/RenderContext";
import { Material } from "../../material";
import { Shader } from "../../shader";
import blitVs from "../../shaderlib/extra/Blit.vs.glsl";
import { Texture2D } from "../../texture";
import { PostProcessEffect } from "../PostProcessEffect";

const shader = Shader.create(
  "postProcessEffect-tonemapping",
  blitVs,
  `
  	varying vec2 v_uv;
	uniform sampler2D renderer_BlitTexture;

	void main(){
		gl_FragColor = texture2D(renderer_BlitTexture, v_uv) * vec4(1,0,0,1);
	}
`
);

export class TonemappingEffect extends PostProcessEffect {
  private _material: Material;

  constructor(engine: Engine) {
    super(engine);
    this._material = new Material(engine, shader);
  }

  override onRender(context: RenderContext): void {
    PipelineUtils.blitTexture(
      this.engine,
      <Texture2D>context.srcRT.getColorTexture(0),
      context.destRT,
      undefined,
      undefined,
      this._material
    );
  }
}
