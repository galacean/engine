/** Preserve a roof unit's native half-float clipping plane when its template
 * is replaced by brick/wood. The original roof vertex shader compensates plane.w
 * by dot(preWarp - renderedPosition, plane.xyz); the fragment keeps dot >= 0.
 * Use each replacement's own pre-warp position, including the SDF proxy producer.
 * This runs once during shader creation, never per-frame or via GPU readback.
 */
export function injectConstructionRoofClip(vertex: string, fragment: string): { vertex: string; fragment: string } {
  if (!fragment.includes("bool domainContains(uint instance,vec3 world)")) return { vertex, fragment };
  if (vertex.includes("masonryRoofClipPlane")) {
    if (!fragment.includes("in vec4 masonryRoofClipPlane;")) throw Error("Incomplete roof clip shader pair");
    return { vertex, fragment };
  }
  const variants = [
    { projection: "_2839", rest: "_551", instance: "v13", position: "v2" },
    { projection: "_2787", rest: "_591", instance: "v13", position: "masonrySdfHitLocal" },
    { projection: "_2289", rest: "_425", instance: "v2", position: "v0" }
  ];
  const matches = variants.filter((v) =>
    vertex.includes(`gl_Position = ${v.projection} * current_view.world_to_sample;`)
  );
  if (matches.length !== 1) throw Error("Unknown original replacement roof vertex producer");
  const variant = matches[0];
  const boundary = `gl_Position = ${variant.projection} * current_view.world_to_sample;`;
  const assignedInstance = `${variant.instance} = `;
  const instanceLine = vertex.split("\n").filter((line) => line.trimStart().startsWith(assignedInstance));
  if (instanceLine.length !== 1) throw Error("Ambiguous original roof replacement indirection");
  const instance = instanceLine[0].trim().slice(assignedInstance.length, -1);
  const fragmentBoundary = `if(domainContains(${variant.instance},${variant.position}))discard;`;
  if (!vertex.includes(`vec4 ${variant.rest} = `) || fragment.split(fragmentBoundary).length !== 2)
    throw Error("Unknown original roof replacement clipping boundary");
  const helper = `
uniform highp usampler2D domain_roof;
out vec4 masonryRoofClipPlane;
vec4 masonryRoofPlane(uint instance){
 ivec2 size=textureSize(domain_roof,0);
 uint p=instance*4u+1u;
 uvec4 words=texelFetch(domain_roof,ivec2(int(p%uint(size.x)),int(p/uint(size.x))),0);
 return vec4(unpackHalf2x16(words.x),unpackHalf2x16(words.y));
}
`;
  vertex = vertex.replace("void original_main()", helper + "void original_main()");
  vertex = vertex.replace(
    boundary,
    `masonryRoofClipPlane=masonryRoofPlane(${instance});\n` +
      `masonryRoofClipPlane.w+=dot(${variant.rest}.xyz-${variant.projection}.xyz,masonryRoofClipPlane.xyz);\n` +
      boundary
  );
  fragment = fragment.replace("void original_main()", "in vec4 masonryRoofClipPlane;\nvoid original_main()");
  fragment = fragment.replace(
    fragmentBoundary,
    `if(dot(vec4(${variant.position},1.0),masonryRoofClipPlane)<0.0)discard;` + fragmentBoundary
  );
  return { vertex, fragment };
}
