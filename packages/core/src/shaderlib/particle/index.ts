import particle_common from "./particle_common.glsl";
import velocity_over_lifetime_module from "./velocity_over_lifetime_module.glsl";
import rotation_over_lifetime_module from "./rotation_over_lifetime_module.glsl";
import size_over_lifetime_module from "./size_over_lifetime_module.glsl";
import color_over_lifetime_module from "./color_over_lifetime_module.glsl";
import texture_sheet_animation_module from "./texture_sheet_animation_module.glsl";
import force_over_lifetime_module from "./force_over_lifetime_module.glsl";

import sphere_billboard from "./sphere_billboard.glsl";
import stretched_billboard from "./stretched_billboard.glsl";
import vertical_billboard from "./vertical_billboard.glsl";
import horizontal_billboard from "./horizontal_billboard.glsl";
import particle_mesh from "./particle_mesh.glsl";

export default {
  particle_common,
  velocity_over_lifetime_module,
  rotation_over_lifetime_module,
  size_over_lifetime_module,
  color_over_lifetime_module,
  texture_sheet_animation_module,
  force_over_lifetime_module,

  sphere_billboard,
  stretched_billboard,
  vertical_billboard,
  horizontal_billboard,
  particle_mesh
};
