/**
 * @title Custom post process pass
 * @category PostProcess
 */
import {
  Blitter,
  BloomEffect,
  Camera,
  Engine,
  Material,
  PostProcess,
  PostProcessEffectFloatParameter,
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

  intensity = new PostProcessEffectFloatParameter(0.7, 0, 1);

  constructor(engine: Engine) {
    super(engine);
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
  const engine = scene.engine;

  camera.enablePostProcess = true;
  camera.enableHDR = true;

  const globalPostProcessEntity = scene.createRootEntity();
  const postProcess = globalPostProcessEntity.addComponent(PostProcess);
  const bloomEffect = postProcess.addEffect(BloomEffect);
  const tonemappingEffect = postProcess.addEffect(TonemappingEffect);
  tonemappingEffect.mode.value = TonemappingMode.ACES;

  bloomEffect.threshold.value = 0.5;
  bloomEffect.intensity.value = 1;
  bloomEffect.dirtTexture.value = dirtTexture;
  bloomEffect.dirtIntensity.value = 5;
  tonemappingEffect.mode.value = TonemappingMode.Neutral;

  const customPass = new CustomPass(engine);
  engine.addPostProcessPass(customPass);
});
