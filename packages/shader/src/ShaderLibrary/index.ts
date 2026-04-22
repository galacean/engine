// Common
import BlendShape from "./Skin/BlendShape.glsl";
import Common from "./Common/Common.glsl";
import Color from "./Common/Color.glsl";
import Fog from "./Common/Fog.glsl";
import Light from "./Common/Light.glsl";
import MobileBlinnPhong from "./Common/MobileBlinnPhong.glsl";
import Normal from "./Common/Normal.glsl";
import Position from "./Common/Position.glsl";
import PositionClipSpace from "./Common/PositionClipSpace.glsl";
import Transform from "./Common/Transform.glsl";
import UV from "./Common/UV.glsl";
import ViewDirection from "./Common/ViewDirection.glsl";
import WorldPosition from "./Common/WorldPosition.glsl";
import BlitVertex from "./Common/BlitVertex.glsl";
import Attributes from "./Common/Attributes.glsl";
import Shadow from "./Shadow/Shadow.glsl";
import ShadowSampleTent from "./Shadow/ShadowSampleTent.glsl";
import Skin from "./Skin/Skin.glsl";

// PBR shading
import ForwardPassPBR from "./PBR/ForwardPassPBR.glsl";
import VaryingsPBR from "./PBR/VaryingsPBR.glsl";
import FragmentPBR from "./PBR/FragmentPBR.glsl";
import LightDirectPBR from "./PBR/LightDirectPBR.glsl";
import LightIndirectPBR from "./PBR/LightIndirectPBR.glsl";
import VertexPBR from "./PBR/VertexPBR.glsl";
import LightIndirectFunctions from "./PBR/LightIndirectFunctions.glsl";
import ReflectionLobe from "./PBR/ReflectionLobe.glsl";
import Refraction from "./PBR/Refraction.glsl";
import BSDF from "./PBR/BSDF.glsl";

// BlinnPhong
import ForwardPassBlinnPhong from "./BlinnPhong/ForwardPassBlinnPhong.glsl";

// Particle
import ParticleCommon from "./Particle/ParticleCommon.glsl";
import ParticleMesh from "./Particle/ParticleMesh.glsl";
import SphereBillboard from "./Particle/Billboard/SphereBillboard.glsl";
import StretchedBillboard from "./Particle/Billboard/StretchedBillboard.glsl";
import VerticalBillboard from "./Particle/Billboard/VerticalBillboard.glsl";
import HorizontalBillboard from "./Particle/Billboard/HorizontalBillboard.glsl";
import VelocityOverLifetime from "./Particle/Module/VelocityOverLifetime.glsl";
import RotationOverLifetime from "./Particle/Module/RotationOverLifetime.glsl";
import SizeOverLifetime from "./Particle/Module/SizeOverLifetime.glsl";
import ColorOverLifetime from "./Particle/Module/ColorOverLifetime.glsl";
import TextureSheetAnimation from "./Particle/Module/TextureSheetAnimation.glsl";
import ForceOverLifetime from "./Particle/Module/ForceOverLifetime.glsl";
import LimitVelocityOverLifetime from "./Particle/Module/LimitVelocityOverLifetime.glsl";
import NoiseModule from "./Particle/Module/NoiseModule.glsl";

// Noise
import NoiseCommon from "./Noise/NoiseCommon.glsl";
import NoiseSimplexGrad from "./Noise/NoiseSimplexGrad.glsl";

// Post-process
import PostCommon from "./PostProcess/PostCommon.glsl";
import Filtering from "./PostProcess/Filtering.glsl";
import UberPost from "./PostProcess/UberPost.glsl";
import BloomPrefilter from "./PostProcess/Bloom/BloomPrefilter.glsl";
import BloomBlurH from "./PostProcess/Bloom/BloomBlurH.glsl";
import BloomBlurV from "./PostProcess/Bloom/BloomBlurV.glsl";
import BloomUpsample from "./PostProcess/Bloom/BloomUpsample.glsl";
import FXAA3_11 from "./PostProcess/FXAA/FXAA3_11.glsl";
import ACESTonemapping from "./PostProcess/Tonemapping/ACESTonemapping.glsl";
import NeutralTonemapping from "./PostProcess/Tonemapping/NeutralTonemapping.glsl";
import ColorTransform from "./PostProcess/Tonemapping/ACES/ColorTransform.glsl";
import ODT from "./PostProcess/Tonemapping/ACES/ODT.glsl";
import RRT from "./PostProcess/Tonemapping/ACES/RRT.glsl";
import Tonescale from "./PostProcess/Tonemapping/ACES/Tonescale.glsl";
import FinalAntiAliasing from "./PostProcess/FinalAntiAliasing.glsl";
import FinalSRGB from "./PostProcess/FinalSRGB.glsl";

// AO
import ScalableAmbientOcclusion from "./AO/ScalableAmbientOcclusion.glsl";
import BilateralBlur from "./AO/BilateralBlur.glsl";

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
  { source: Attributes, includeKey: "Common/Attributes.glsl" },
  { source: Shadow, includeKey: "Shadow/Shadow.glsl" },
  { source: ShadowSampleTent, includeKey: "Shadow/ShadowSampleTent.glsl" },
  { source: Skin, includeKey: "Skin/Skin.glsl" },

  // PBR shading
  { source: ForwardPassPBR, includeKey: "PBR/ForwardPassPBR.glsl" },
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

export { fragmentList };
