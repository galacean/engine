import BlendShape from "./BlendShape.glsl";
import Common from "./Common.glsl";
import Fog from "./Fog.glsl";
import Light from "./Light.glsl";
import Normal from "./Normal.glsl";
import PBRSource from "./PBR.gs";
import Shadow from "./Shadow.glsl";
import ShadowSampleTent from "./ShadowSampleTent.glsl";
import Skin from "./Skin.glsl";
import Transform from "./Transform.glsl";
import shadingPBR from "./shadingPBR";

interface IShaderFragment {
  includeKey: string;
  source: string;
}

const fragmentList: IShaderFragment[] = [
  { source: BlendShape, includeKey: "BlendShape.glsl" },
  { source: Common, includeKey: "Common.glsl" },
  { source: Fog, includeKey: "Fog.glsl" },
  { source: Light, includeKey: "Light.glsl" },
  { source: Normal, includeKey: "Normal.glsl" },
  { source: ShadowSampleTent, includeKey: "ShadowSampleTent.glsl" },
  { source: Shadow, includeKey: "Shadow.glsl" },
  { source: Transform, includeKey: "Transform.glsl" },
  { source: Skin, includeKey: "Skin.glsl" },

  ...shadingPBR
];
export { PBRSource, fragmentList };
