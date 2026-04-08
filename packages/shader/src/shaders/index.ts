// Common chunks
import BlendShape from "./skin/BlendShape.glsl";
import Common from "./common/Common.glsl";
import Color from "./common/Color.glsl";
import Fog from "./common/Fog.glsl";
import Light from "./common/Light.glsl";
import MobileBlinnPhong from "./common/MobileBlinnPhong.glsl";
import Normal from "./common/Normal.glsl";
import Position from "./common/Position.glsl";
import PositionClipSpace from "./common/PositionClipSpace.glsl";
import Transform from "./common/Transform.glsl";
import UV from "./common/UV.glsl";
import ViewDirection from "./common/ViewDirection.glsl";
import WorldPosition from "./common/WorldPosition.glsl";
import Shadow from "./shadow/Shadow.glsl";
import ShadowSampleTent from "./shadow/ShadowSampleTent.glsl";
import Skin from "./skin/Skin.glsl";

// PBR
import PBRSource from "./pbr/PBR.shader";
import PBRSpecularSource from "./pbr/PBRSpecular.shader";
import shadingPBR from "./pbr/shadingPBR";

// BlinnPhong
import ForwardPassBlinnPhong from "./blinnphong/ForwardPassBlinnPhong.glsl";
import BlinnPhongSource from "./blinnphong/BlinnPhong.shader";

// Unlit
import UnlitSource from "./unlit/Unlit.shader";

// 2D
import SpriteSource from "./2d/Sprite.shader";
import SpriteMaskSource from "./2d/SpriteMask.shader";
import TextSource from "./2d/Text.shader";
import TrailSource from "./2d/Trail.shader";
import UIDefaultSource from "./2d/UIDefault.shader";

// Sky
import SkyboxSource from "./sky/Skybox.shader";
import BackgroundTextureSource from "./sky/BackgroundTexture.shader";
import SkyProceduralSource from "./sky/SkyProcedural.shader";

// Utility
import DepthOnlySource from "./utility/DepthOnly.shader";
import ShadowMapSource from "./utility/ShadowMap.shader";
import BlitSource from "./utility/Blit.shader";
import BlitScreenSource from "./utility/BlitScreen.shader";

// Particle
import ParticleSource from "./particle/Particle.shader";

// Particle chunks
import ParticleCommon from "./particle/ParticleCommon.glsl";
import ParticleMesh from "./particle/ParticleMesh.glsl";
import ParticleFeedback from "./particle/ParticleFeedback.glsl";
import SphereBillboard from "./particle/billboards/SphereBillboard.glsl";
import StretchedBillboard from "./particle/billboards/StretchedBillboard.glsl";
import VerticalBillboard from "./particle/billboards/VerticalBillboard.glsl";
import HorizontalBillboard from "./particle/billboards/HorizontalBillboard.glsl";
import VelocityOverLifetime from "./particle/modules/VelocityOverLifetime.glsl";
import RotationOverLifetime from "./particle/modules/RotationOverLifetime.glsl";
import SizeOverLifetime from "./particle/modules/SizeOverLifetime.glsl";
import ColorOverLifetime from "./particle/modules/ColorOverLifetime.glsl";
import TextureSheetAnimation from "./particle/modules/TextureSheetAnimation.glsl";
import ForceOverLifetime from "./particle/modules/ForceOverLifetime.glsl";
import LimitVelocityOverLifetime from "./particle/modules/LimitVelocityOverLifetime.glsl";

// Noise chunks
import NoiseCommon from "./noise/NoiseCommon.glsl";
import NoiseSimplex from "./noise/NoiseSimplex.glsl";
import NoisePerlin from "./noise/NoisePerlin.glsl";
import NoiseCellular from "./noise/NoiseCellular.glsl";
import NoisePsrd from "./noise/NoisePsrd.glsl";

// Post-process chunks
import PostCommon from "./postProcess/PostCommon.glsl";
import Filtering from "./postProcess/Filtering.glsl";
import UberPost from "./postProcess/UberPost.glsl";
import BloomPrefilter from "./postProcess/bloom/BloomPrefilter.glsl";
import BloomBlurH from "./postProcess/bloom/BloomBlurH.glsl";
import BloomBlurV from "./postProcess/bloom/BloomBlurV.glsl";
import BloomUpsample from "./postProcess/bloom/BloomUpsample.glsl";
import FXAA3_11 from "./postProcess/fxaa/FXAA3_11.glsl";
import ACESTonemapping from "./postProcess/tonemapping/ACESTonemapping.glsl";
import NeutralTonemapping from "./postProcess/tonemapping/NeutralTonemapping.glsl";
import ColorTransform from "./postProcess/tonemapping/aces/ColorTransform.glsl";
import ODT from "./postProcess/tonemapping/aces/ODT.glsl";
import RRT from "./postProcess/tonemapping/aces/RRT.glsl";
import Tonescale from "./postProcess/tonemapping/aces/Tonescale.glsl";
import FinalAntiAliasing from "./postProcess/FinalAntiAliasing.fs.glsl";
import FinalSRGB from "./postProcess/FinalSRGB.fs.glsl";

// AO chunks
import ScalableAmbientOcclusion from "./ao/ScalableAmbientOcclusion.glsl";
import BilateralBlur from "./ao/BilateralBlur.glsl";

interface IShaderFragment {
  includeKey: string;
  source: string;
}

const fragmentList: IShaderFragment[] = [
  // Common
  { source: BlendShape, includeKey: "BlendShape.glsl" },
  { source: Common, includeKey: "Common.glsl" },
  { source: Color, includeKey: "Color.glsl" },
  { source: Fog, includeKey: "Fog.glsl" },
  { source: Light, includeKey: "Light.glsl" },
  { source: MobileBlinnPhong, includeKey: "MobileBlinnPhong.glsl" },
  { source: Normal, includeKey: "Normal.glsl" },
  { source: Position, includeKey: "Position.glsl" },
  { source: PositionClipSpace, includeKey: "PositionClipSpace.glsl" },
  { source: ShadowSampleTent, includeKey: "ShadowSampleTent.glsl" },
  { source: Shadow, includeKey: "Shadow.glsl" },
  { source: Transform, includeKey: "Transform.glsl" },
  { source: UV, includeKey: "UV.glsl" },
  { source: ViewDirection, includeKey: "ViewDirection.glsl" },
  { source: WorldPosition, includeKey: "WorldPosition.glsl" },
  { source: Skin, includeKey: "Skin.glsl" },

  // PBR shading
  ...shadingPBR,

  // BlinnPhong
  { source: ForwardPassBlinnPhong, includeKey: "ForwardPassBlinnPhong.glsl" },

  // Particle
  { source: ParticleCommon, includeKey: "ParticleCommon.glsl" },
  { source: ParticleMesh, includeKey: "ParticleMesh.glsl" },
  { source: ParticleFeedback, includeKey: "ParticleFeedback.glsl" },
  { source: SphereBillboard, includeKey: "SphereBillboard.glsl" },
  { source: StretchedBillboard, includeKey: "StretchedBillboard.glsl" },
  { source: VerticalBillboard, includeKey: "VerticalBillboard.glsl" },
  { source: HorizontalBillboard, includeKey: "HorizontalBillboard.glsl" },
  { source: VelocityOverLifetime, includeKey: "VelocityOverLifetime.glsl" },
  { source: RotationOverLifetime, includeKey: "RotationOverLifetime.glsl" },
  { source: SizeOverLifetime, includeKey: "SizeOverLifetime.glsl" },
  { source: ColorOverLifetime, includeKey: "ColorOverLifetime.glsl" },
  { source: TextureSheetAnimation, includeKey: "TextureSheetAnimation.glsl" },
  { source: ForceOverLifetime, includeKey: "ForceOverLifetime.glsl" },
  { source: LimitVelocityOverLifetime, includeKey: "LimitVelocityOverLifetime.glsl" },

  // Noise
  { source: NoiseCommon, includeKey: "NoiseCommon.glsl" },
  { source: NoiseSimplex, includeKey: "NoiseSimplex.glsl" },
  { source: NoisePerlin, includeKey: "NoisePerlin.glsl" },
  { source: NoiseCellular, includeKey: "NoiseCellular.glsl" },
  { source: NoisePsrd, includeKey: "NoisePsrd.glsl" },

  // Post-process
  { source: PostCommon, includeKey: "PostCommon.glsl" },
  { source: Filtering, includeKey: "Filtering.glsl" },
  { source: UberPost, includeKey: "UberPost.glsl" },
  { source: BloomPrefilter, includeKey: "BloomPrefilter.glsl" },
  { source: BloomBlurH, includeKey: "BloomBlurH.glsl" },
  { source: BloomBlurV, includeKey: "BloomBlurV.glsl" },
  { source: BloomUpsample, includeKey: "BloomUpsample.glsl" },
  { source: FXAA3_11, includeKey: "FXAA3_11.glsl" },
  { source: ACESTonemapping, includeKey: "ACESTonemapping.glsl" },
  { source: NeutralTonemapping, includeKey: "NeutralTonemapping.glsl" },
  { source: ColorTransform, includeKey: "ColorTransform.glsl" },
  { source: ODT, includeKey: "ODT.glsl" },
  { source: RRT, includeKey: "RRT.glsl" },
  { source: Tonescale, includeKey: "Tonescale.glsl" },
  { source: FinalAntiAliasing, includeKey: "FinalAntiAliasing.glsl" },
  { source: FinalSRGB, includeKey: "FinalSRGB.glsl" },

  // AO
  { source: ScalableAmbientOcclusion, includeKey: "ScalableAmbientOcclusion.glsl" },
  { source: BilateralBlur, includeKey: "BilateralBlur.glsl" }
];

export {
  // Fragment list for ShaderFactory.registerInclude()
  fragmentList,
  // Complete shader sources (.shader files)
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
  ParticleSource
};
