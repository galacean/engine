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
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { initPostProcessEnv } from "./.initPostProcessEnv";

const shaderCompiler = new ShaderCompiler();

const customShaderSource = `Shader "Custom Post Process" {
  SubShader "Default" {
    Pass "Forward" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      struct Attributes {
        vec4 POSITION_UV;
      };

      struct Varyings {
        vec2 uv;
      };

      sampler2D renderer_BlitTexture;

      VertexShader = vert;
      FragmentShader = frag;

      Varyings vert(Attributes attr) {
        Varyings v;
        gl_Position = vec4(attr.POSITION_UV.xy, 0.0, 1.0);
        v.uv = attr.POSITION_UV.zw;
        return v;
      }

      vec4 frag(Varyings v) {
        return texture2D(renderer_BlitTexture, v.uv).rrra;
      }
    }
  }
}`;

class CustomPass extends PostProcessPass {
  private _blitMaterial: Material;

  intensity = new PostProcessEffectFloatParameter(0.7, 0, 1);

  constructor(engine: Engine, customShader: Shader) {
    super(engine);
    this.event = PostProcessPassEvent.AfterUber;
    this._blitMaterial = new Material(this.engine, customShader);
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

  bloomEffect.threshold.value = 0.21404114048223255;
  bloomEffect.intensity.value = 1;
  bloomEffect.dirtTexture.value = dirtTexture;
  bloomEffect.dirtIntensity.value = 5;
  tonemappingEffect.mode.value = TonemappingMode.Neutral;

  const customShader = Shader.create(customShaderSource);
  const customPass = new CustomPass(engine, customShader);
  engine.addPostProcessPass(customPass);
}, shaderCompiler);
