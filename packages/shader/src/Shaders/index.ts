// Material shaders
import PBRSource from "./PBR.shader";
import PBRSpecularSource from "./PBRSpecular.shader";
import BlinnPhongSource from "./BlinnPhong.shader";
import UnlitSource from "./Unlit.shader";

// 2D shaders
import SpriteSource from "./2D/Sprite.shader";
import SpriteMaskSource from "./2D/SpriteMask.shader";
import TextSource from "./2D/Text.shader";
import TrailSource from "./2D/Trail.shader";
import UIDefaultSource from "./2D/UIDefault.shader";

// Sky shaders
import SkyboxSource from "./Sky/Skybox.shader";
import BackgroundTextureSource from "./Sky/BackgroundTexture.shader";
import SkyProceduralSource from "./Sky/SkyProcedural.shader";

// Utility shaders
import DepthOnlySource from "./Utility/DepthOnly.shader";
import ShadowMapSource from "./Utility/ShadowMap.shader";
import BlitSource from "./Utility/Blit.shader";
import BlitScreenSource from "./Utility/BlitScreen.shader";

// Particle shader
import ParticleSource from "./Particle.shader";

// PostProcess shaders
import UberShaderSource from "./PostProcess/Uber.shader";
import FinalSRGBShaderSource from "./PostProcess/FinalSRGB.shader";
import FinalAntiAliasingShaderSource from "./PostProcess/FinalAntiAliasing.shader";
import BloomShaderSource from "./PostProcess/Bloom.shader";

// AO shader
import SAOShaderSource from "./AO/ScalableAmbientOcclusion.shader";

export {
  PBRSource,
  PBRSpecularSource,
  BlinnPhongSource,
  UnlitSource,
  SpriteSource,
  SpriteMaskSource,
  TextSource,
  TrailSource,
  UIDefaultSource,
  SkyboxSource,
  BackgroundTextureSource,
  SkyProceduralSource,
  DepthOnlySource,
  ShadowMapSource,
  BlitSource,
  BlitScreenSource,
  ParticleSource,
  UberShaderSource,
  FinalSRGBShaderSource,
  FinalAntiAliasingShaderSource,
  BloomShaderSource,
  SAOShaderSource
};
