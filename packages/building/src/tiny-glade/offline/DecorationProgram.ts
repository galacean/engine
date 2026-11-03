import { constructionDecorationGLSL } from "../runtime/ConstructionDecorationShader";
import { constructionPlasterWarpGLSL } from "../runtime/ConstructionPlasterWarp";
import { decorationMaterialStride } from "../runtime/ConstructionDecorationMaterial";
import { masonryTintGLSL } from "../runtime/MasonryAppearance";
export const decorationProgram = (whiteBase: boolean, rigid: boolean) => ({
  vert: {
    source: `#version 300 es
precision highp float;
layout(location=0) in vec3 decorationPosition;
layout(location=1) in vec3 decorationNormal;
layout(location=2) in vec3 decorationColor;
layout(location=3) in float decorationEmission;
layout(location=4) in vec2 decorationUV;
layout(location=5) in float decorationKind;
layout(location=6) in vec3 decorationCenter;
layout(location=9) in float decorationPickIndex;
flat out float masonryPickIndex;
${whiteBase ? "layout(location=7) in float decorationTintRole;\nout float vertexTintRole;" : ""}
${whiteBase ? "layout(location=8) in vec3 decorationSourceColor;\nout vec3 vertexSourceColor;" : ""}
${
  rigid
    ? `uniform highp sampler2D renderer_DecorationMatrices;
mat4 decorationMatrix(int slot, int start) {
 return mat4(texelFetch(renderer_DecorationMatrices,ivec2(start,slot),0),
 texelFetch(renderer_DecorationMatrices,ivec2(start+1,slot),0),
 texelFetch(renderer_DecorationMatrices,ivec2(start+2,slot),0),
 texelFetch(renderer_DecorationMatrices,ivec2(start+3,slot),0));
}`
    : ""
}
uniform mat4 renderer_ModelMat;
uniform mat4 renderer_NormalMat;
out vec3 decorationPositionWS;
out vec3 vertexNormal;
out vec3 vertexColor;
out float vertexEmission;
out vec2 vertexUV;
out float vertexKind;
out vec3 windowCenterWS;
${constructionPlasterWarpGLSL}
void original_main(){
 masonryPickIndex=decorationPickIndex;
 ${whiteBase ? "vertexTintRole=decorationTintRole;" : ""}
 ${whiteBase ? "vertexSourceColor=decorationSourceColor;" : ""}
 ${
   rigid
     ? `int slot=int(decorationPickIndex+.5);
 mat4 objectMatrix=decorationMatrix(slot,0), objectNormal=decorationMatrix(slot,4);
 if(objectNormal[3][3]<.5){gl_Position=vec4(2.0,2.0,2.0,1.0);return;}`
     : ""
 }
 vertexNormal=mat3(renderer_NormalMat)*${rigid ? "mat3(objectNormal)*" : ""}decorationNormal;vertexColor=decorationColor;vertexEmission=decorationEmission;
 vertexUV=decorationUV;vertexKind=decorationKind;windowCenterWS=(renderer_ModelMat*${rigid ? "objectMatrix*" : ""}vec4(decorationCenter,1)).xyz;
 float surfaceKind=mod(decorationKind,${decorationMaterialStride}.0);
 vec3 p=(surfaceKind>.5 && surfaceKind<5.5) || surfaceKind>7.5 ? masonryPlasterWarp(decorationPosition) : decorationPosition;
 ${rigid ? "p=(objectMatrix*vec4(p,1.0)).xyz;" : ""}
 decorationPositionWS=(renderer_ModelMat*vec4(p,1.0)).xyz;
 gl_Position=renderer_MVPMat*vec4(p,1.0);
}
void main(){original_main();}`
  },
  frag: {
    source: `#version 300 es
precision highp float;
in vec3 decorationPositionWS;
in vec3 vertexNormal;
in vec3 vertexColor;
in float vertexEmission;
in vec2 vertexUV;
in float vertexKind;
in vec3 windowCenterWS;
flat in float masonryPickIndex;
${constructionDecorationGLSL}
${whiteBase ? "in float vertexTintRole;\nin vec3 vertexSourceColor;\n" + masonryTintGLSL : ""}
layout(location=0) out vec4 residentColor;
vec3 decorationLitColor;
void original_main(){
 vec3 n=normalize(vertexNormal);
 vec3 emissive;float roughness;
 vec3 albedo=masonryDecorationFinish(vertexUV,vertexKind,windowCenterWS,decorationPositionWS,vertexColor${whiteBase ? "*masonryMaterialTint(vertexTintRole,vertexSourceColor)" : ""},vertexEmission,camera_Position,n,emissive,roughness);
 decorationLitColor=masonrySceneFog(masonryResidentSceneLight(albedo,n,decorationPositionWS,roughness)+emissive,decorationPositionWS);
}
void main(){original_main();vec3 v=decorationLitColor;
residentColor=vec4(mix(12.92*v,1.055*pow(v,vec3(1.0/2.4))-.055,greaterThan(v,vec3(.0031308))),1.0);
}`
  }
});
