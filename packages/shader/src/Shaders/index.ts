// Material shaders
import PBRSource from "./PBR.shader";
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

// Particle shaders
import ParticleSource from "./Particle.shader";
import ParticleFeedbackSource from "./ParticleFeedback.shader";

// PostProcess shaders
import UberSource from "./PostProcess/Uber.shader";
import FinalSRGBSource from "./PostProcess/FinalSRGB.shader";
import FinalAntiAliasingSource from "./PostProcess/FinalAntiAliasing.shader";
import BloomSource from "./PostProcess/Bloom.shader";

// AO shader
import ScalableAmbientOcclusionSource from "./AO/ScalableAmbientOcclusion.shader";

export {
  PBRSource,
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
  ParticleFeedbackSource,
  UberSource,
  FinalSRGBSource,
  FinalAntiAliasingSource,
  BloomSource,
  ScalableAmbientOcclusionSource
};
