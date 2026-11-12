Shader "Masonry/SupportSurface" {
 SubShader "Default" {
  UsePass "Pipeline/ShadowCaster/Default/ShadowCaster"
  Pass "DepthOnly" {
   Tags { pipelineStage = "DepthOnly" }
   #include "ShaderLibrary/Common/Common.glsl"
   #include "ShaderLibrary/Common/Transform.glsl"
   #include "ShaderLibrary/Common/Attributes.glsl"
   #include "Masonry/LodDither.glsl"
   #include "Masonry/Entrance.glsl"
   #include "Masonry/EntranceCoverage.glsl"
   VertexShader = MasonryDepthVertex;
   FragmentShader = MasonryDepthFragment;
   #include "Masonry/Plaster.glsl"
   float material_MasonryPattern;
   vec4 material_MasonryPlaster;
   struct MasonryDepthVaryings { vec2 uv; vec3 localPosition; float entranceDelay; float plasterDistance; };
   MasonryDepthVaryings MasonryDepthVertex(Attributes a) {
     MasonryDepthVaryings v; v.uv=a.TEXCOORD_0; v.localPosition=a.POSITION; v.entranceDelay=material_MasonryPattern < -1.5 ? .12 : 0.0;
     v.plasterDistance=1.0;
     #ifdef RENDERER_ENABLE_VERTEXCOLOR
       v.plasterDistance=a.COLOR_0.a;
     #endif
     bool warp=material_MasonryPattern < -1.5;
     #ifdef RENDERER_HAS_TANGENT
       warp=warp || (material_MasonryPattern < -.5 && ((mod(a.TANGENT.w,16.0)>.5 && mod(a.TANGENT.w,16.0)<5.5) || mod(a.TANGENT.w,16.0)>7.5));
     #endif
     vec3 position = warp ? masonryPlasterWarp(a.POSITION.xyz) : a.POSITION.xyz;
     #if defined(RENDERER_MASONRY_ENTRANCE) && defined(RENDERER_HAS_TANGENT)
       if(material_MasonryPattern < -.5 && material_MasonryPattern >= -1.5 && mod(a.TANGENT.w,16.0)>.5) {
         v.localPosition=a.TANGENT.xyz; v.entranceDelay=.08;
         position=mix(a.TANGENT.xyz,position,max(.001,masonryEntranceAmount(a.TANGENT.xyz,.08,0.0)));
       }
     #endif
     gl_Position = camera_VPMat * renderer_ModelMat * vec4(position,1.0); return v;
   }
   void MasonryDepthFragment(MasonryDepthVaryings v) {
     #ifdef RENDERER_MASONRY_ENTRANCE
       masonryEntranceCoverage(masonryEntranceAmount(v.localPosition,v.entranceDelay,0.0));
     #endif
     masonryLodDither(); if(material_MasonryPattern < -1.5 && plasterSurface(v.uv,material_MasonryPlaster.x,material_MasonryPlaster.y,v.plasterDistance).x < .5) discard; }
  }
  Pass "Forward" {
   Tags { pipelineStage = "Forward" }
   CompareFunction material_WorldPickDepthCompare;
   DepthState = { WriteEnabled = true; CompareFunction = material_WorldPickDepthCompare; }
   #ifdef RENDERER_WORLD_PICK
     float renderer_WorldPickBase;
   #endif
   CullMode rasterStateCullMode;
   RasterState = { CullMode = rasterStateCullMode; }
   #include "ShaderLibrary/Common/Attributes.glsl"
   #include "ShaderLibrary/Common/Transform.glsl"
   vec4 material_BaseColor;
   float material_Roughness;
   struct MasonrySurfaceVaryings { vec3 localPosition; vec2 uv; vec2 uv1; vec3 positionWS; vec3 normalWS; vec4 color; vec4 decorationData; };
   #include "Masonry/LodDither.glsl"
   #include "Masonry/Entrance.glsl"
   #include "Masonry/EntranceCoverage.glsl"
   #include "Masonry/SceneLighting.glsl"
   #include "Masonry/Tint.glsl"
   float material_MasonryPattern;
   #include "Masonry/Plaster.glsl"
   #include "Masonry/PlasterFinish.glsl"
   #include "Masonry/Decoration.glsl"
   #ifdef MASONRY_STONE_FLOOR
     #include "Masonry/StoneFloor.glsl"
     vec4 material_StoneFloorMapping;
     float material_StoneFloorColor;
   #endif
   vec4 material_MasonryPlaster;
   float material_MasonryEmission;
   float material_MasonryUnit;
   #ifdef MASONRY_LAYOUT_APPEARANCE
     sampler2D material_MasonryLayout;
     vec4 material_MasonryLayoutUV;
   #endif
   // Published unit footprints own the placement pattern at every distance.
   vec2 masonrySurfaceDetail(vec2 uv) {
     if (material_MasonryPattern < 0.0) return vec2(1.0,0.0);
     // The retained geometry already defines this unit's boundary. Reapplying
     // a wall/deck grid here creates extra bricks inside the original brick.
     if (material_MasonryUnit > .5) return vec2(1.0,0.0);
     #ifdef MASONRY_LAYOUT_APPEARANCE
       vec2 layoutUV=(uv-material_MasonryLayoutUV.xy)*material_MasonryLayoutUV.zw;
       vec2 appearanceSample=texture2D(material_MasonryLayout,layoutUV).rg;
       return vec2(appearanceSample.r*1.08,appearanceSample.g*.012);
     #endif
     // Untextured support/cap, never an independently invented placement grid.
     return vec2(1.0,0.0);
   }
   VertexShader = MasonrySurfaceVertex;
   MasonrySurfaceVaryings MasonrySurfaceVertex(Attributes a) {
     MasonrySurfaceVaryings v;
     vec3 positionOS=a.POSITION;
     v.localPosition=a.POSITION;
     bool warp=material_MasonryPattern < -1.5;
     v.decorationData=vec4(0.0);
     #ifdef RENDERER_HAS_TANGENT
       v.decorationData=vec4((renderer_ModelMat*vec4(a.TANGENT.xyz,1.0)).xyz,a.TANGENT.w);
       warp=warp || (material_MasonryPattern < -.5 && ((mod(a.TANGENT.w,16.0)>.5 && mod(a.TANGENT.w,16.0)<5.5) || mod(a.TANGENT.w,16.0)>7.5));
     #endif
     if(warp) positionOS=masonryPlasterWarp(positionOS);
     #if defined(RENDERER_MASONRY_ENTRANCE) && defined(RENDERER_HAS_TANGENT)
       if(material_MasonryPattern < -.5 && material_MasonryPattern >= -1.5 && mod(a.TANGENT.w,16.0)>.5) {
         v.localPosition=a.TANGENT.xyz;
         positionOS=mix(a.TANGENT.xyz,positionOS,max(.001,masonryEntranceAmount(a.TANGENT.xyz,.08,0.0)));
       }
     #endif
     v.positionWS=(renderer_ModelMat*vec4(positionOS,1.0)).xyz;
     v.normalWS=normalize(mat3(renderer_NormalMat)*a.NORMAL);
     v.uv=a.TEXCOORD_0;
     #ifdef RENDERER_HAS_UV1
       v.uv1=a.TEXCOORD_1;
     #else
       v.uv1=vec2(0.0);
     #endif
     #ifdef RENDERER_ENABLE_VERTEXCOLOR
       v.color=a.COLOR_0;
     #else
       v.color=vec4(1.0);
     #endif
     gl_Position=camera_VPMat*vec4(v.positionWS,1.0);
     return v;
   }
   FragmentShader = MasonrySurfaceFragment;
   void MasonrySurfaceFragment(MasonrySurfaceVaryings v) {
    #ifdef RENDERER_MASONRY_ENTRANCE
      masonryEntranceCoverage(masonryEntranceAmount(v.localPosition,material_MasonryPattern < -1.5 ? .12 : material_MasonryPattern < -.5 && mod(v.decorationData.w,16.0)>.5 ? .08 : 0.0,0.0));
    #endif
    masonryLodDither();
    vec3 plasterDetail=vec3(1.0);
    if(material_MasonryPattern < -1.5){plasterDetail=plasterSurface(v.uv,material_MasonryPlaster.x,material_MasonryPlaster.y,v.color.a);}
    #ifdef RENDERER_WORLD_PICK
      if(material_MasonryPattern < -1.5 && plasterDetail.x<.5)discard;
      float id = floor(renderer_WorldPickBase + v.uv1.x + 0.5);
      #ifdef RENDERER_WORLD_PICK_DEPTH
        id = floor(gl_FragCoord.z * 16777215.0 + 0.5);
      #endif
      gl_FragColor = vec4(mod(id, 256.0), mod(floor(id / 256.0), 256.0), floor(id / 65536.0), 255.0) / 255.0;
    #else
    vec3 surfaceNormal=normalize(v.normalWS)*((material_MasonryPattern < -1.5 || gl_FrontFacing)?1.0:-1.0);
    vec3 surfaceAlbedo=material_BaseColor.rgb*v.color.rgb;
    if(material_MasonryPattern < 0.0){
      #ifdef RENDERER_ENABLE_VERTEXCOLOR
        vec4 tint=masonryMaterialOverride(floor(v.color.a)-1.0);
        float fraction=fract(v.color.a);
        if(material_MasonryPattern > -1.5 && tint.a > 0.5 && fraction > 0.0){
          float gray=fraction > 0.0 ? dot(surfaceAlbedo,vec3(.2126,.7152,.0722))*(1.0-fraction)/fraction : 0.0;
          surfaceAlbedo=gray*tint.rgb;
        }
      #endif
      vec3 n=normalize(surfaceNormal);
      vec3 albedo=surfaceAlbedo;
      if(material_MasonryPattern < -1.5){
        albedo=plasterFinish(v.uv,vec4(material_MasonryPlaster.xyz,v.color.a),albedo,plasterDetail,v.positionWS,n);
        if(plasterDetail.x<.5)discard;
        vec4 plasterTint=masonryMaterialOverride(0.0);
        if(plasterTint.a>.5)albedo=vec3(dot(albedo,vec3(.2126,.7152,.0722)))*plasterTint.rgb;
      }
      vec3 emission=vec3(1.0,.57,.18)*v.uv1.y;float roughness=.9;
      if(material_MasonryPattern > -1.5) albedo=masonryDecorationFinish(v.uv,v.decorationData.w,v.decorationData.xyz,v.positionWS,albedo,v.uv1.y,camera_Position,n,emission,roughness);
      vec4 decorationColor=vec4(masonrySceneFog(masonryResidentSceneLight(albedo,n,v.positionWS,roughness)+emission,v.positionWS),1.0);
      gl_FragColor=decorationColor;
    } else {
    float surfaceRoughness=material_Roughness;
    #ifdef MASONRY_STONE_FLOOR
      surfaceAlbedo=stoneFloorFinish(v.uv,material_StoneFloorMapping,material_StoneFloorColor,v.positionWS,camera_Position,surfaceNormal,surfaceRoughness);
    #else
    vec2 detail = masonrySurfaceDetail(v.uv);
    surfaceAlbedo *= detail.x;
    vec3 dx = dFdx(v.positionWS), dy = dFdy(v.positionWS);
    vec3 r1 = cross(dy,surfaceNormal), r2 = cross(surfaceNormal,dx);
    float det = dot(dx,r1);
    vec3 gradient = sign(det)*(dFdx(detail.y)*r1+dFdy(detail.y)*r2);
    surfaceNormal = normalize(abs(det)*surfaceNormal-gradient+surfaceNormal*0.00000001);
    #endif
    vec3 color=masonryResidentSceneLight(surfaceAlbedo,surfaceNormal,v.positionWS,surfaceRoughness);
    color+=vec3(1.0,.57,.18)*material_MasonryEmission;
    vec4 finalColor=vec4(masonrySceneFog(color,v.positionWS),1.0);
    gl_FragColor=finalColor;
    }
    #endif
   }
  }
 }
}
