/**
 * Raw .shader source strings for editor use (contains Editor properties, preserves formatting).
 * Import from "@galacean/engine-shader/sources".
 */
import PBRSource from "./Shaders/PBR.shader";

import BlinnPhongSource from "./Shaders/BlinnPhong.shader";
import UnlitSource from "./Shaders/Unlit.shader";
import ParticleSource from "./Shaders/Effect/Particle.shader";
import TrailSource from "./Shaders/Effect/Trail.shader";
import SpriteSource from "./Shaders/2D/Sprite.shader";
import SkyboxSource from "./Shaders/Sky/Skybox.shader";
import SkyProceduralSource from "./Shaders/Sky/SkyProcedural.shader";

export {
  PBRSource,
  BlinnPhongSource,
  UnlitSource,
  ParticleSource,
  TrailSource,
  SpriteSource,
  SkyboxSource,
  SkyProceduralSource
};
