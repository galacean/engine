import AttributesPBR from "./AttributesPBR.glsl";
import BRDF from "./BRDF.glsl";
import ForwardPassPBR from "./ForwardPassPBR.glsl";
import FragmentPBR from "./FragmentPBR.glsl";
import LightDirectPBR from "./LightDirectPBR.glsl";
import LightIndirectFunctions from "./LightIndirectFunctions.glsl";
import LightIndirectPBR from "./LightIndirectPBR.glsl";
import ReflectionLobe from "./ReflectionLobe.glsl";
import VaryingsPBR from "./VaryingsPBR.glsl";
import VertexPBR from "./VertexPBR.glsl";

export default [
  { source: ForwardPassPBR, includeKey: "ForwardPassPBR.glsl" },
  { source: AttributesPBR, includeKey: "AttributesPBR.glsl" },
  { source: VaryingsPBR, includeKey: "VaryingsPBR.glsl" },
  { source: FragmentPBR, includeKey: "FragmentPBR.glsl" },
  { source: LightDirectPBR, includeKey: "LightDirectPBR.glsl" },
  { source: LightIndirectPBR, includeKey: "LightIndirectPBR.glsl" },
  { source: VertexPBR, includeKey: "VertexPBR.glsl" },
  { source: BRDF, includeKey: "BRDF.glsl" },
  { source: LightIndirectFunctions, includeKey: "LightIndirectFunctions.glsl" },
  { source: ReflectionLobe, includeKey: "ReflectionLobe.glsl" }
];
