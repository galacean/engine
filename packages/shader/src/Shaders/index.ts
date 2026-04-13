// ========================
// ShaderLibrary — include fragments (.glsl)
// ========================

// Common
import BlendShape from "../ShaderLibrary/Skin/BlendShape.glsl";
import Common from "../ShaderLibrary/Common/Common.glsl";
import Color from "../ShaderLibrary/Common/Color.glsl";
import Fog from "../ShaderLibrary/Common/Fog.glsl";
import Light from "../ShaderLibrary/Common/Light.glsl";
import MobileBlinnPhong from "../ShaderLibrary/Common/MobileBlinnPhong.glsl";
import Normal from "../ShaderLibrary/Common/Normal.glsl";
import Position from "../ShaderLibrary/Common/Position.glsl";
import PositionClipSpace from "../ShaderLibrary/Common/PositionClipSpace.glsl";
import Transform from "../ShaderLibrary/Common/Transform.glsl";
import UV from "../ShaderLibrary/Common/UV.glsl";
import ViewDirection from "../ShaderLibrary/Common/ViewDirection.glsl";
import WorldPosition from "../ShaderLibrary/Common/WorldPosition.glsl";
import BlitVertex from "../ShaderLibrary/Common/BlitVertex.glsl";

// Shadow
import Shadow from "../ShaderLibrary/Shadow/Shadow.glsl";
import ShadowSampleTent from "../ShaderLibrary/Shadow/ShadowSampleTent.glsl";

// Skin
import Skin from "../ShaderLibrary/Skin/Skin.glsl";

// PBR shading
import ForwardPassPBR from "../ShaderLibrary/PBR/ForwardPassPBR.glsl";
import AttributesPBR from "../ShaderLibrary/PBR/AttributesPBR.glsl";
import VaryingsPBR from "../ShaderLibrary/PBR/VaryingsPBR.glsl";
import FragmentPBR from "../ShaderLibrary/PBR/FragmentPBR.glsl";
import LightDirectPBR from "../ShaderLibrary/PBR/LightDirectPBR.glsl";
import LightIndirectPBR from "../ShaderLibrary/PBR/LightIndirectPBR.glsl";
import LightIndirectFunctions from "../ShaderLibrary/PBR/LightIndirectFunctions.glsl";
import VertexPBR from "../ShaderLibrary/PBR/VertexPBR.glsl";
import ReflectionLobe from "../ShaderLibrary/PBR/ReflectionLobe.glsl";
import Refraction from "../ShaderLibrary/PBR/Refraction.glsl";
import BSDF from "../ShaderLibrary/PBR/BSDF.glsl";

// BlinnPhong
import ForwardPassBlinnPhong from "../ShaderLibrary/BlinnPhong/ForwardPassBlinnPhong.glsl";

// Particle
import ParticleCommon from "../ShaderLibrary/Particle/ParticleCommon.glsl";
import ParticleMesh from "../ShaderLibrary/Particle/ParticleMesh.glsl";
import ParticleFeedback from "../ShaderLibrary/Particle/ParticleFeedback.glsl";
import SphereBillboard from "../ShaderLibrary/Particle/Billboard/SphereBillboard.glsl";
import StretchedBillboard from "../ShaderLibrary/Particle/Billboard/StretchedBillboard.glsl";
import VerticalBillboard from "../ShaderLibrary/Particle/Billboard/VerticalBillboard.glsl";
import HorizontalBillboard from "../ShaderLibrary/Particle/Billboard/HorizontalBillboard.glsl";
import VelocityOverLifetime from "../ShaderLibrary/Particle/Module/VelocityOverLifetime.glsl";
import RotationOverLifetime from "../ShaderLibrary/Particle/Module/RotationOverLifetime.glsl";
import SizeOverLifetime from "../ShaderLibrary/Particle/Module/SizeOverLifetime.glsl";
import ColorOverLifetime from "../ShaderLibrary/Particle/Module/ColorOverLifetime.glsl";
import TextureSheetAnimation from "../ShaderLibrary/Particle/Module/TextureSheetAnimation.glsl";
import ForceOverLifetime from "../ShaderLibrary/Particle/Module/ForceOverLifetime.glsl";
import LimitVelocityOverLifetime from "../ShaderLibrary/Particle/Module/LimitVelocityOverLifetime.glsl";
import NoiseModule from "../ShaderLibrary/Particle/Module/NoiseModule.glsl";

// Noise
import NoiseCommon from "../ShaderLibrary/Noise/NoiseCommon.glsl";
import NoiseSimplexGrad from "../ShaderLibrary/Noise/NoiseSimplexGrad.glsl";

// Post-process
import PostCommon from "../ShaderLibrary/PostProcess/PostCommon.glsl";
import Filtering from "../ShaderLibrary/PostProcess/Filtering.glsl";
import UberPost from "../ShaderLibrary/PostProcess/UberPost.glsl";
import BloomPrefilter from "../ShaderLibrary/PostProcess/Bloom/BloomPrefilter.glsl";
import BloomBlurH from "../ShaderLibrary/PostProcess/Bloom/BloomBlurH.glsl";
import BloomBlurV from "../ShaderLibrary/PostProcess/Bloom/BloomBlurV.glsl";
import BloomUpsample from "../ShaderLibrary/PostProcess/Bloom/BloomUpsample.glsl";
import FXAA3_11 from "../ShaderLibrary/PostProcess/FXAA/FXAA3_11.glsl";
import ACESTonemapping from "../ShaderLibrary/PostProcess/Tonemapping/ACESTonemapping.glsl";
import NeutralTonemapping from "../ShaderLibrary/PostProcess/Tonemapping/NeutralTonemapping.glsl";
import ColorTransform from "../ShaderLibrary/PostProcess/Tonemapping/ACES/ColorTransform.glsl";
import ODT from "../ShaderLibrary/PostProcess/Tonemapping/ACES/ODT.glsl";
import RRT from "../ShaderLibrary/PostProcess/Tonemapping/ACES/RRT.glsl";
import Tonescale from "../ShaderLibrary/PostProcess/Tonemapping/ACES/Tonescale.glsl";
import FinalAntiAliasing from "../ShaderLibrary/PostProcess/FinalAntiAliasing.glsl";
import FinalSRGB from "../ShaderLibrary/PostProcess/FinalSRGB.glsl";

// AO
import ScalableAmbientOcclusion from "../ShaderLibrary/AO/ScalableAmbientOcclusion.glsl";
import BilateralBlur from "../ShaderLibrary/AO/BilateralBlur.glsl";

// ========================
// Shaders — complete .shader files
// ========================

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

// ========================
// Fragment list for ShaderFactory.registerInclude()
// ========================

interface IShaderFragment {
  includeKey: string;
  source: string;
}

const fragmentList: IShaderFragment[] = [
  // Common
  { source: BlendShape, includeKey: "Skin/BlendShape.glsl" },
  { source: Common, includeKey: "Common/Common.glsl" },
  { source: Color, includeKey: "Common/Color.glsl" },
  { source: Fog, includeKey: "Common/Fog.glsl" },
  { source: Light, includeKey: "Common/Light.glsl" },
  { source: MobileBlinnPhong, includeKey: "Common/MobileBlinnPhong.glsl" },
  { source: Normal, includeKey: "Common/Normal.glsl" },
  { source: Position, includeKey: "Common/Position.glsl" },
  { source: PositionClipSpace, includeKey: "Common/PositionClipSpace.glsl" },
  { source: Transform, includeKey: "Common/Transform.glsl" },
  { source: UV, includeKey: "Common/UV.glsl" },
  { source: ViewDirection, includeKey: "Common/ViewDirection.glsl" },
  { source: WorldPosition, includeKey: "Common/WorldPosition.glsl" },
  { source: BlitVertex, includeKey: "Common/BlitVertex.glsl" },
  { source: Shadow, includeKey: "Shadow/Shadow.glsl" },
  { source: ShadowSampleTent, includeKey: "Shadow/ShadowSampleTent.glsl" },
  { source: Skin, includeKey: "Skin/Skin.glsl" },

  // PBR shading
  { source: ForwardPassPBR, includeKey: "PBR/ForwardPassPBR.glsl" },
  { source: AttributesPBR, includeKey: "PBR/AttributesPBR.glsl" },
  { source: VaryingsPBR, includeKey: "PBR/VaryingsPBR.glsl" },
  { source: FragmentPBR, includeKey: "PBR/FragmentPBR.glsl" },
  { source: LightDirectPBR, includeKey: "PBR/LightDirectPBR.glsl" },
  { source: LightIndirectPBR, includeKey: "PBR/LightIndirectPBR.glsl" },
  { source: VertexPBR, includeKey: "PBR/VertexPBR.glsl" },
  { source: LightIndirectFunctions, includeKey: "PBR/LightIndirectFunctions.glsl" },
  { source: ReflectionLobe, includeKey: "PBR/ReflectionLobe.glsl" },
  { source: Refraction, includeKey: "PBR/Refraction.glsl" },
  { source: BSDF, includeKey: "PBR/BSDF.glsl" },

  // BlinnPhong
  { source: ForwardPassBlinnPhong, includeKey: "BlinnPhong/ForwardPassBlinnPhong.glsl" },

  // Particle
  { source: ParticleCommon, includeKey: "Particle/ParticleCommon.glsl" },
  { source: ParticleMesh, includeKey: "Particle/ParticleMesh.glsl" },
  { source: ParticleFeedback, includeKey: "Particle/ParticleFeedback.glsl" },
  { source: SphereBillboard, includeKey: "Particle/Billboard/SphereBillboard.glsl" },
  { source: StretchedBillboard, includeKey: "Particle/Billboard/StretchedBillboard.glsl" },
  { source: VerticalBillboard, includeKey: "Particle/Billboard/VerticalBillboard.glsl" },
  { source: HorizontalBillboard, includeKey: "Particle/Billboard/HorizontalBillboard.glsl" },
  { source: VelocityOverLifetime, includeKey: "Particle/Module/VelocityOverLifetime.glsl" },
  { source: RotationOverLifetime, includeKey: "Particle/Module/RotationOverLifetime.glsl" },
  { source: SizeOverLifetime, includeKey: "Particle/Module/SizeOverLifetime.glsl" },
  { source: ColorOverLifetime, includeKey: "Particle/Module/ColorOverLifetime.glsl" },
  { source: TextureSheetAnimation, includeKey: "Particle/Module/TextureSheetAnimation.glsl" },
  { source: ForceOverLifetime, includeKey: "Particle/Module/ForceOverLifetime.glsl" },
  { source: LimitVelocityOverLifetime, includeKey: "Particle/Module/LimitVelocityOverLifetime.glsl" },
  { source: NoiseModule, includeKey: "Particle/Module/NoiseModule.glsl" },

  // Noise
  { source: NoiseCommon, includeKey: "Noise/NoiseCommon.glsl" },
  { source: NoiseSimplexGrad, includeKey: "Noise/NoiseSimplexGrad.glsl" },

  // Post-process
  { source: PostCommon, includeKey: "PostProcess/PostCommon.glsl" },
  { source: Filtering, includeKey: "PostProcess/Filtering.glsl" },
  { source: UberPost, includeKey: "PostProcess/UberPost.glsl" },
  { source: BloomPrefilter, includeKey: "PostProcess/Bloom/BloomPrefilter.glsl" },
  { source: BloomBlurH, includeKey: "PostProcess/Bloom/BloomBlurH.glsl" },
  { source: BloomBlurV, includeKey: "PostProcess/Bloom/BloomBlurV.glsl" },
  { source: BloomUpsample, includeKey: "PostProcess/Bloom/BloomUpsample.glsl" },
  { source: FXAA3_11, includeKey: "PostProcess/FXAA/FXAA3_11.glsl" },
  { source: ACESTonemapping, includeKey: "PostProcess/Tonemapping/ACESTonemapping.glsl" },
  { source: NeutralTonemapping, includeKey: "PostProcess/Tonemapping/NeutralTonemapping.glsl" },
  { source: ColorTransform, includeKey: "PostProcess/Tonemapping/ACES/ColorTransform.glsl" },
  { source: ODT, includeKey: "PostProcess/Tonemapping/ACES/ODT.glsl" },
  { source: RRT, includeKey: "PostProcess/Tonemapping/ACES/RRT.glsl" },
  { source: Tonescale, includeKey: "PostProcess/Tonemapping/ACES/Tonescale.glsl" },
  { source: FinalAntiAliasing, includeKey: "PostProcess/FinalAntiAliasing.glsl" },
  { source: FinalSRGB, includeKey: "PostProcess/FinalSRGB.glsl" },

  // AO
  { source: ScalableAmbientOcclusion, includeKey: "AO/ScalableAmbientOcclusion.glsl" },
  { source: BilateralBlur, includeKey: "AO/BilateralBlur.glsl" }
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
  ParticleSource,
  // PostProcess shaders
  UberShaderSource,
  FinalSRGBShaderSource,
  FinalAntiAliasingShaderSource,
  BloomShaderSource,
  // AO shader
  SAOShaderSource
};
