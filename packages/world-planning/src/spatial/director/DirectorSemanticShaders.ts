import terrainHeight from "@galacean/engine-terrain/shaders/terrain/TerrainHeight.glsl?raw";
import { DIRECTOR_CATEGORIES } from "./DirectorSemantic";

/** Replacement geometry shader preserves the production terrain displacement path. */
export const semanticGeometryShader = `Shader "Planning/DirectorSemanticGeometry" {
 SubShader "Default" { Pass "Forward" {
 Tags { pipelineStage = "Forward" }
 DepthState = { WriteEnabled = true; }
 BlendState = { Enabled = false; }
 RasterState = { CullMode = CullMode.Off; }
 RenderQueueType = Opaque;
 #include "ShaderLibrary/Common/Common.glsl"
 #include "ShaderLibrary/Common/Transform.glsl"
 #include "ShaderLibrary/Common/Attributes.glsl"
 #ifdef PLANNING_DIAGNOSTIC_TERRAIN
 ${terrainHeight}
 #endif
 vec4 material_DirectorIdentity;
 float camera_DirectorTargetOnly;
 struct SemanticVaryings { vec2 sourceXZ; float valid; };
 VertexShader = semanticVertex;
 FragmentShader = semanticFragment;
 SemanticVaryings semanticVertex(Attributes a) {
  SemanticVaryings v;
  v.sourceXZ = vec2(0.); v.valid = 1.;
  #ifdef PLANNING_DIAGNOSTIC_TERRAIN
   TerrainProjectClipmapVertex vertex = terrainProjectClipmapVertexAt(a.POSITION);
   v.sourceXZ = vertex.sourceXZ; v.valid = vertex.valid;
   gl_Position = camera_VPMat * vec4(vertex.positionWS, 1.);
  #else
   gl_Position = camera_VPMat * renderer_ModelMat * vec4(a.POSITION, 1.);
  #endif
  return v;
 }
 void semanticFragment(SemanticVaryings v) {
  if(material_DirectorIdentity.b < .5/255.) discard;
  if(camera_DirectorTargetOnly > .5 && material_DirectorIdentity.a < 1.5/255.) discard;
  #ifdef PLANNING_DIAGNOSTIC_TERRAIN
   if(v.valid < .999 || terrainProjectSolidAt(v.sourceXZ) < .5) discard;
  #endif
  gl_FragColor = material_DirectorIdentity;
 }
 } }
}`;
const colors = DIRECTOR_CATEGORIES.map((c) => {
  const rgb = [1, 3, 5].map((i) => parseInt(c.color.slice(i, i + 2), 16) / 255);
  return `if(category < ${(c.id + 0.5).toFixed(1)}) return vec3(${rgb.map((n) => n.toFixed(6)).join(",")});`;
}).join("\n");
/** Both statistics and display use the same category/relationship/depth textures. */
export const semanticCompositeShader = `Shader "Planning/DirectorSemanticComposite" {
 SubShader "Default" { Pass "Composite" {
 DepthState = { Enabled = false; WriteEnabled = false; }
 BlendState = { Enabled = false; }
 RasterState = { CullMode = CullMode.Off; }
 #include "ShaderLibrary/Common/Common.glsl"
 #include "ShaderLibrary/Blit/BlitVertex.glsl"
 sampler2D renderer_BlitTexture;
 sampler2D material_DirectorTarget;
 sampler2D material_DirectorDepth;
 vec2 material_DirectorTexel;
 vec2 material_DirectorClip;
 float material_DirectorStatistics;
 VertexShader = vert;
 FragmentShader = semanticComposite;
 vec3 categoryColor(float category) { ${colors} return vec3(1.,0.,1.); }
 float roleAt(vec2 uv) { return floor(texture2D(renderer_BlitTexture,uv).a*255.+.5); }
 void semanticComposite(Varyings v) {
  vec4 identity=texture2D(renderer_BlitTexture,v.v_uv);
  float category=floor(identity.b*255.+.5), role=floor(identity.a*255.+.5);
  float projected=step(.5/255.,texture2D(material_DirectorTarget,v.v_uv).b);
  float target=step(1.5,role), origin=step(.5,role)*(1.-target);
  float blocked=projected*(1.-target);
  if(material_DirectorStatistics>.5) {
   float depth=texture2D(material_DirectorDepth,v.v_uv).r;
   float n=material_DirectorClip.x,f=material_DirectorClip.y;
   float metres=2.*n*f/(f+n-(2.*depth-1.)*(f-n));
   float packed=floor(clamp(metres/12000.,0.,1.)*65535.+.5);
   gl_FragColor=vec4(category,projected+blocked*2.+target*4.+origin*8.,mod(packed,256.),floor(packed/256.))/255.;
  } else {
  vec3 color=categoryColor(category);
  vec2 dx=vec2(material_DirectorTexel.x,0.),dy=vec2(0.,material_DirectorTexel.y);
  vec2 owner=identity.rg;
  float objectEdge=max(max(length(owner-texture2D(renderer_BlitTexture,v.v_uv+dx).rg),length(owner-texture2D(renderer_BlitTexture,v.v_uv-dx).rg)),max(length(owner-texture2D(renderer_BlitTexture,v.v_uv+dy).rg),length(owner-texture2D(renderer_BlitTexture,v.v_uv-dy).rg)));
  if(category>.5 && objectEdge>.5/255.) color*=.7;
  vec2 d=material_DirectorTexel*2.;
  float edge=max(max(abs(role-roleAt(v.v_uv+vec2(d.x,0.))),abs(role-roleAt(v.v_uv-vec2(d.x,0.)))),max(abs(role-roleAt(v.v_uv+vec2(0.,d.y))),abs(role-roleAt(v.v_uv-vec2(0.,d.y)))));
  // Relationship patterns do not replace the underlying semantic identity.
  if(blocked>.5 && mod(gl_FragCoord.x+gl_FragCoord.y,14.)<2.) color=vec3(.92,.05,.08);
  if(edge>.5 && role>.5) color=target>.5?vec3(.7,1.,0.):vec3(.02,.15,1.);
  // Final engine pass performs linear-to-sRGB conversion after this diagnostic pass.
  color=mix(color/12.92,pow((color+.055)/1.055,vec3(2.4)),step(vec3(.04045),color));
  gl_FragColor=vec4(color,1.);
  }
 }
 } }
}`;
