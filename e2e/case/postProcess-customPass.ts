/**
 * @title Custom post process pass
 * @category PostProcess
 */
import {
  Blitter,
  BloomEffect,
  Camera,
  Material,
  PostProcess,
  PostProcessManager,
  PostProcessPass,
  PostProcessPassEvent,
  RenderTarget,
  Shader,
  Texture2D,
  TonemappingEffect,
  TonemappingMode
} from "@galacean/engine";
import { initPostProcessEnv } from "./.initPostProcessEnv";

const customShader = Shader.create(
  "Custom Post Process",
  `
  attribute vec4 POSITION_UV;
varying vec2 v_uv;

void main() {	
	gl_Position = vec4(POSITION_UV.xy, 0.0, 1.0);	
	v_uv = POSITION_UV.zw;
}
  `,
  `
  varying vec2 v_uv;
  uniform sampler2D renderer_BlitTexture;

  void main(){
  gl_FragColor = texture2D(renderer_BlitTexture, v_uv).rrra;
  }
  `
);

class CustomPass extends PostProcessPass {
  private _blitMaterial: Material;

  set intensity(value) {
    this._blitMaterial.shaderData.setFloat("intensity", value);
  }

  constructor(postProcessManager: PostProcessManager) {
    super(postProcessManager);
    this.event = PostProcessPassEvent.AfterUber;
    this._blitMaterial = new Material(this.engine, customShader);

    const depthState = this._blitMaterial.renderState.depthState;

    depthState.enabled = false;
    depthState.writeEnabled = false;
  }

  onRender(_, srcTexture: Texture2D, dst: RenderTarget): void {
    const engine = this.engine;
    Blitter.blitTexture(engine, srcTexture, dst, undefined, undefined, this._blitMaterial, 0);
  }
}

initPostProcessEnv((camera: Camera, resArray) => {
  const [_, __, dirtTexture] = resArray;
  const scene = camera.scene;
  const postProcessManager = scene.postProcessManager;

  camera.enablePostProcess = true;
  camera.enableHDR = true;

  const globalPostProcessEntity = scene.createRootEntity();
  const postProcess = globalPostProcessEntity.addComponent(PostProcess);
  const bloomEffect = postProcess.addEffect(BloomEffect);
  const tonemappingEffect = postProcess.addEffect(TonemappingEffect);
  tonemappingEffect.mode = TonemappingMode.ACES;

  bloomEffect.threshold = 0.5;
  bloomEffect.intensity = 1;
  bloomEffect.dirtTexture = dirtTexture;
  tonemappingEffect.mode = TonemappingMode.Neutral;

  const customPass = new CustomPass(postProcessManager);
  postProcessManager.addPostProcessPass(customPass);
});
