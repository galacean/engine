Shader "Masonry/ShadowSurface" {
 SubShader "Default" {
  Pass "ShadowCaster" {
   Tags { pipelineStage = "ShadowCaster" }
   #include "ShaderLibrary/Common/Common.glsl"
   #include "ShaderLibrary/Common/Transform.glsl"
   #include "ShaderLibrary/Common/Attributes.glsl"
   #include "Masonry/Entrance.glsl"
   #include "Masonry/EntranceCoverage.glsl"
   float renderer_MasonryEntranceDecoration;
   vec2 scene_ShadowBias;
   vec3 scene_LightDirection;
   struct Varyings { vec3 localPosition; float entranceDelay; };
   VertexShader = vert;
   FragmentShader = frag;
   Varyings vert(Attributes a) {
     Varyings v; v.localPosition=a.POSITION; v.entranceDelay=0.0;
     vec3 position=a.POSITION;
     #if defined(RENDERER_MASONRY_ENTRANCE) && defined(RENDERER_HAS_TANGENT)
       if(renderer_MasonryEntranceDecoration>.5 && mod(a.TANGENT.w,16.0)>.5) {
         v.localPosition=a.TANGENT.xyz; v.entranceDelay=.08;
         position=mix(a.TANGENT.xyz,position,max(.001,masonryEntranceAmount(a.TANGENT.xyz,.08,0.0)));
       }
     #endif
     vec3 positionWS=(renderer_ModelMat*vec4(position,1.0)).xyz;
     positionWS-=scene_LightDirection*scene_ShadowBias.x;
     #ifdef RENDERER_HAS_NORMAL
       vec3 normalWS=normalize(mat3(renderer_NormalMat)*a.NORMAL);
       positionWS+=normalWS*((1.0-clamp(dot(-scene_LightDirection,normalWS),0.0,1.0))*scene_ShadowBias.y);
     #endif
     gl_Position=camera_VPMat*vec4(positionWS,1.0);
     gl_Position.z=max(gl_Position.z,-1.0);
     return v;
   }
   void frag(Varyings v) {
     #ifdef RENDERER_MASONRY_ENTRANCE
       masonryEntranceCoverage(masonryEntranceAmount(v.localPosition,v.entranceDelay,0.0));
     #endif
     #ifdef ENGINE_NO_DEPTH_TEXTURE
       vec4 rgba=fract(gl_FragCoord.z*vec4(1.0,256.0,65536.0,16777216.0));
       gl_FragColor=rgba-rgba.gbaa*vec4(1.0/256.0,1.0/256.0,1.0/256.0,0.0);
     #else
       gl_FragColor=vec4(0.0);
     #endif
   }
  }
 }
}
