// Material shaders
import PBRSource from "./PBR.gsp";
import PBRSpecularSource from "./PBRSpecular.gsp";
import BlinnPhongSource from "./BlinnPhong.gsp";
import UnlitSource from "./Unlit.gsp";

// 2D shaders
import SpriteSource from "./2D/Sprite.gsp";
import SpriteMaskSource from "./2D/SpriteMask.gsp";
import TextSource from "./2D/Text.gsp";
import TrailSource from "./2D/Trail.gsp";
import UIDefaultSource from "./2D/UIDefault.gsp";

// Sky shaders
import SkyboxSource from "./Sky/Skybox.gsp";
import BackgroundTextureSource from "./Sky/BackgroundTexture.gsp";
import SkyProceduralSource from "./Sky/SkyProcedural.gsp";

// Utility shaders
import DepthOnlySource from "./Utility/DepthOnly.gsp";
import ShadowMapSource from "./Utility/ShadowMap.gsp";
import BlitSource from "./Utility/Blit.gsp";
import BlitScreenSource from "./Utility/BlitScreen.gsp";

// Particle shader
import ParticleSource from "./Particle.gsp";

// PostProcess shaders
import UberShaderSource from "./PostProcess/Uber.gsp";
import FinalSRGBShaderSource from "./PostProcess/FinalSRGB.gsp";
import BloomShaderSource from "./PostProcess/Bloom.gsp";

// AO shader
import SAOShaderSource from "./AO/ScalableAmbientOcclusion.gsp";

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
  BloomShaderSource,
  SAOShaderSource
};
