import { Vector4, type ShaderData } from "@galacean/engine";
import type { ConstructionEntranceState } from "./ConstructionEntrance";

export const entranceMacro = "RENDERER_MASONRY_ENTRANCE";
/** Tiny Glade roof easing: smoothstep(.8*t,t,pow(animation_t,.8)).
 * Height scheduling and whole-unit ordered coverage are host presentation policy.
 * Coverage leaves the recovered deformation, SDF intersection and UVs untouched. */
export const constructionEntranceGLSL = `
#ifdef RENDERER_MASONRY_ENTRANCE
vec4 renderer_MasonryEntrance;
float masonryEntranceAmount(vec3 center, float delay, float stagger) {
  float progress=renderer_MasonryEntrance.x;
  if(progress>=1.0) return 1.0;
  if(progress<=0.0) return 0.0;
  float height=clamp((center.y+renderer_MasonryEntrance.w-renderer_MasonryEntrance.y)/renderer_MasonryEntrance.z,0.0,1.0);
  float jitter=fract(sin(dot(center.xz,vec2(12.9898,78.233)))*43758.5453)*stagger;
  float threshold=min(.98,.16+.70*height+delay+jitter);
  return smoothstep(.8*threshold,threshold,pow(progress,.8));
}
#endif
`;
export const constructionEntranceCoverageGLSL = `
#ifdef RENDERER_MASONRY_ENTRANCE
void masonryEntranceCoverage(float amount) {
  // A decorrelated ordered mask avoids coupling entrance to the 4x4 LOD mask.
  float threshold=fract(52.9829189*fract(dot(floor(gl_FragCoord.xy),vec2(.06711056,.00583715))));
  if(amount<=threshold) discard;
}
#endif
`;
/** Retained vector: no per-frame instance upload or temporary vector allocation. */
export function entranceBinding(data: ShaderData, localY = 0) {
  const value = new Vector4();
  let enabled = false;
  return (state?: ConstructionEntranceState, originY = localY) => {
    const active = state !== undefined && state.progress < 1;
    if (active) {
      value.set(state.progress, state.minimumY, state.height, originY);
      data.setVector4("renderer_MasonryEntrance", value);
    }
    if (active !== enabled) {
      if (active) data.enableMacro(entranceMacro);
      else data.disableMacro(entranceMacro);
      enabled = active;
    }
  };
}
/** Read centers through the same original indirection as the renderer. Never use
 * compacted gl_InstanceID as a stable identity across material and LOD changes. */
export function injectConstructionEntrance(vertex: string, fragment: string, family: string) {
  let center: string;
  let declaration = "";
  let continuous = false;
  if (family === "brick") {
    declaration =
      "InstancedWallData_natural u=read_material_data_instanced_wall_data_1(int(read_material_data_instance_list(gl_InstanceID)));";
    center =
      "vec3(uintBitsToFloat(u.transform_translation.data[0]),uintBitsToFloat(u.transform_translation.data[1]),uintBitsToFloat(u.transform_translation.data[2]))";
  } else if (family === "roof") {
    declaration =
      "RoofShingle_natural u=read_material_data_nani_instance_data_1(int(read_nani_instance_indirection_buffer(gl_InstanceID)));";
    center = "u.base_position+vec3(0.0,u.current_height,0.0)";
  } else if (["wood", "wood-gable", "frame", "stone-decoration", "glass"].includes(family)) {
    const wood = family === "wood" || family === "wood-gable";
    const field = wood ? "transform" : "xform";
    const type =
      family === "wood-gable" ? "WoodenGablePlank_natural" : wood ? "WoodenPlank_natural" : "InstanceData_natural";
    declaration = `${type} u=read_material_data_nani_instance_data_1(int(read_nani_instance_indirection_buffer(gl_InstanceID)));`;
    center = `vec3(u.${field}.data.data[9],u.${field}.data.data[10],u.${field}.data.data[11])`;
  } else if (family === "wood-arch") {
    declaration =
      "WoodenArchFrameInstanceData_natural u=read_material_data_nani_instance_data(int(read_nani_instance_indirection_buffer(gl_InstanceID)));";
    center = "u.bounding_sphere.xyz";
  } else if (family === "decoration") {
    // Support backing has no attachment center; it follows the height sweep.
    center = "mod(decorationKind,16.0)>.5 ? decorationCenter : decorationPosition";
    continuous = true;
  } else if (family === "plaster" && vertex.includes("plasterPosition")) {
    center = "plasterPosition";
    continuous = true;
  } else if (family === "stone-floor" && vertex.includes("floorPosition")) {
    center = "floorPosition";
    continuous = true;
  } else throw Error("Unsupported construction entrance shader: " + family);
  const delay =
    family === "plaster"
      ? ".12"
      : family === "decoration"
        ? "(mod(decorationKind,16.0)>.5 ? .08 : 0.0)"
        : family === "frame" || family === "stone-decoration" || family === "glass"
          ? ".08"
          : "0.0";
  // Roof scale is the recovered producer's final scale before clipping/deformation.
  // Multiply there, rather than moving projected positions (which breaks SDF/UVs).
  if (family === "roof") {
    const scale = /vec3 _535 = ([^;]+);/;
    if (!scale.test(vertex)) throw Error("Unknown roof entrance scale ABI");
    vertex = vertex.replace(scale, `$&\n#ifdef ${entranceMacro}\n_535*=max(.001,masonryEntranceWeight);\n#endif`);
  }
  if (family === "decoration") {
    const marker = "decorationPositionWS=(renderer_ModelMat*vec4(p,1.0)).xyz;";
    if (!vertex.includes(marker)) throw Error("Unknown decoration entrance position ABI");
    vertex = vertex.replace(
      marker,
      `#ifdef ${entranceMacro}\nif(mod(decorationKind,16.0)>.5) p=mix(decorationCenter,p,max(.001,masonryEntranceWeight));\n#endif\n${marker}`
    );
  }
  const header = constructionEntranceGLSL.replace(
    "vec4 renderer_MasonryEntrance;",
    "uniform vec4 renderer_MasonryEntrance;"
  );
  // Continuous surfaces must evaluate the height curve per fragment. Interpolating
  // vertex weights across a tall wall makes its entire upper half appear early.
  const vertexVaryings = continuous
    ? "out vec3 masonryEntrancePosition; out float masonryEntranceDelay; float masonryEntranceWeight;"
    : "flat out float masonryEntranceWeight;";
  vertex = vertex.replace(
    "void original_main()",
    `${header}\n#ifdef ${entranceMacro}\n${vertexVaryings}\n#endif\nvoid original_main()`
  );
  vertex = vertex.replace(
    /void main\(\)\s*\{/,
    `void main(){\n#ifdef ${entranceMacro}\n${declaration}\n${continuous ? `masonryEntrancePosition=(${center}); masonryEntranceDelay=${delay};` : ""}\nmasonryEntranceWeight=masonryEntranceAmount((${center}),${delay},${continuous ? "0.0" : ".035"});\n#endif\n`
  );
  const fragmentVaryings = continuous
    ? `${header}\nin vec3 masonryEntrancePosition; in float masonryEntranceDelay;`
    : "flat in float masonryEntranceWeight;";
  fragment = `#ifdef ${entranceMacro}\n${fragmentVaryings}\n#endif\n${constructionEntranceCoverageGLSL}\n` + fragment;
  const amount = continuous
    ? "masonryEntranceAmount(masonryEntrancePosition,masonryEntranceDelay,0.0)"
    : "masonryEntranceWeight";
  fragment = fragment.replace(
    /void main\(\)\s*\{/,
    `void main(){\n#ifdef ${entranceMacro}\nmasonryEntranceCoverage(${amount});\n#endif\n`
  );
  return { vertex, fragment };
}
