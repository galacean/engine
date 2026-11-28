Shader "Masonry/GlobalProxyShadowOnly" {
 SubShader "Default" {
  Pass "ShadowCaster" {
   Tags { pipelineStage = "ShadowCaster" }
   #include "ShaderLibrary/Common/Common.glsl"
   #include "ShaderLibrary/Common/Transform.glsl"
   struct Attributes {
    vec3 POSITION;
    vec4 NORMAL;
    #ifdef GLOBAL_PROXY_INSTANCED
     vec4 TEXCOORD_1;
     vec4 TEXCOORD_2;
     vec4 TEXCOORD_3;
     vec4 TEXCOORD_4;
    #endif
   };
   vec4 material_ProxyState[64];
   vec2 scene_ShadowBias;
   vec3 scene_LightDirection;
   struct Varyings { float unused; };
   VertexShader = MasonryGlobalProxyShadowVertex;
   FragmentShader = MasonryGlobalProxyShadowFragment;
   #include "Masonry/GlobalProxyShadowCaster.glsl"
  }
 }
}
