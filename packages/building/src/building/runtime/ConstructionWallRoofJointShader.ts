/** Building-only finish clipping. Evaluate in the producer's pre-spatial-warp
 * domain; a material's bevel, gable skew or SDF hit is retained. Every unit LOD
 * reads the same roof section. No per-instance state or per-frame recomputation. */
export function injectWallRoofJoint(vertex: string, fragment: string, enabled: boolean) {
  if (!enabled) return { vertex, fragment };
  const variants = [
    { projection: "_2839", rest: "vec3(_551.x,_2839.y,_551.z)", world: "v2" },
    { projection: "_2787", rest: "vec3(_591.x,_2787.y,_591.z)", world: "v2" },
    { projection: "_2289", rest: "_425.xyz", world: "v0" },
    { projection: "_1918", rest: "_264.xyz", world: "v0" },
    { projection: "vec4(_1185, 1.0)", rest: "_3776", world: "v0" }
  ];
  const matches = variants.filter((v) =>
    vertex.includes(`gl_Position = ${v.projection} * current_view.world_to_sample;`)
  );
  if (matches.length !== 1) throw Error("Unknown wall/roof joint vertex producer");
  const variant = matches[0];
  vertex = vertex.replace("void original_main()", "out vec3 masonryWallJointRest;\nvoid original_main()");
  vertex = vertex.replace(
    `gl_Position = ${variant.projection} * current_view.world_to_sample;`,
    `masonryWallJointRest=${variant.rest};\ngl_Position = ${variant.projection} * current_view.world_to_sample;`
  );
  fragment = fragment.replace(
    "void original_main()",
    `
in vec3 masonryWallJointRest;
uniform vec4 material_WallJointAxis;
uniform vec4 material_WallJointSection;
uniform float material_WallJointHeights[20];
float wallJointCeiling(vec3 p) {
 float distance=abs(dot(p.xz,material_WallJointAxis.xy)-material_WallJointAxis.z);
 float t=clamp((material_WallJointAxis.w-distance)/material_WallJointSection.x,0.0,1.0)*19.0;
 int i=min(18,int(floor(t)));
 return mix(material_WallJointHeights[i],material_WallJointHeights[i+1],t-float(i));
}
void original_main()`
  );
  // Run after the original fragment producer: wood/brick SDFs must be clipped
  // at the actual ray hit, never at the six-face proxy's rasterized position.
  const point = fragment.includes("vec3 masonrySdfHitLocal;")
    ? `masonryWallJointRest+masonrySdfHitLocal-${variant.world}`
    : "masonryWallJointRest";
  if (!fragment.includes("void main(){original_main();")) throw Error("Unknown wall/roof joint fragment wrapper");
  fragment = fragment.replace(
    "void main(){original_main();",
    `void main(){original_main();vec3 wallJointPoint=${point};if(wallJointPoint.y>wallJointCeiling(wallJointPoint))discard;`
  );
  return { vertex, fragment };
}
