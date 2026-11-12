Shader "Planning/MetreWhitebox" {
 SubShader "Default" {
  UsePass "Pipeline/ShadowCaster/Default/ShadowCaster"
  UsePass "Pipeline/DepthOnly/Default/DepthOnly"
  Pass "Forward" {
   Tags { pipelineStage = "Forward" }
   CompareFunction material_WorldPickDepthCompare;
   DepthState = { WriteEnabled = true; CompareFunction = material_WorldPickDepthCompare; }
   #ifdef RENDERER_WORLD_PICK
     float renderer_WorldPickBase;
   #endif
   CullMode rasterStateCullMode;
   RasterState = { CullMode = rasterStateCullMode; }
   #include "ShaderLibrary/PBR/ForwardPassPBR.glsl"
   sampler2D planning_Surface;
   vec2 planning_WorldSize;
   float planning_Textured;
   float planning_SurfaceGrid;
   float planning_Unlit;
   float planning_SurfaceResolution;
   vec3 planning_Grass;
   vec3 planning_Soil;
   vec3 planning_Water;
   VertexShader = PBRVertex;
   FragmentShader = PlanningFragment;
   void PlanningFragment(Varyings v) {
    float objectIndex = 0.;
    #ifdef RENDERER_HAS_UV1
      objectIndex = v.uv1.x;
    #endif
    #ifdef RENDERER_WORLD_PICK
      float id = floor(renderer_WorldPickBase + objectIndex + 0.5);
      #ifdef RENDERER_WORLD_PICK_DEPTH
        id = floor(gl_FragCoord.z * 16777215.0 + 0.5);
      #endif
      gl_FragColor = vec4(mod(id, 256.0), mod(floor(id / 256.0), 256.0), floor(id / 65536.0), 255.0) / 255.0;
    #else
    vec3 n=normalize(v.normalWS);
    vec3 tangent=abs(n.y)>.95?normalize(cross(vec3(0.,0.,1.),n)):normalize(cross(vec3(0.,1.,0.),n));
    vec3 bitangent=normalize(cross(n,tangent));
    vec2 q=vec2(dot(v.positionWS,tangent),dot(v.positionWS,bitangent));
    if(planning_SurfaceGrid>.5)q=v.positionWS.xz;
    vec2 footprint=max(fwidth(q),vec2(.0001));
    vec2 edge=abs(fract(q+.5)-.5);
    vec2 lines=1.-smoothstep(vec2(0.),footprint*1.2,edge);
    float fade=1.-smoothstep(.12,.7,max(footprint.x,footprint.y));
    float grid=max(lines.x,lines.y)*fade;
    vec2 majorFootprint=footprint/10.;
    vec2 majorEdge=abs(fract(q/10.+.5)-.5);
    vec2 majorLines=1.-smoothstep(vec2(0.),majorFootprint*1.2,majorEdge);
    float major=max(majorLines.x,majorLines.y)*(1.-smoothstep(.12,.7,max(majorFootprint.x,majorFootprint.y)));
    grid=max(grid*.65,major*.9);
    vec3 color=material_BaseColor.rgb;
    if(planning_Textured>.5){
     vec2 distance=(texture2D(planning_Surface,(v.positionWS.xz/planning_WorldSize*(planning_SurfaceResolution-1.)+.5)/planning_SurfaceResolution).rg*2.-1.)*16.;
     vec2 aa=max(vec2(1.),fwidth(distance));
     vec2 t=clamp((distance+aa)/(2.*aa),0.,1.);
     vec2 coverage=1.-t*t*t*(t*(t*6.-15.)+10.);
     color=mix(mix(planning_Grass,planning_Soil,coverage.x),planning_Water,coverage.y);
    }

    // Water in the planning whitebox is a flat metric surface, independent of sun/shadows.
    if(planning_Unlit>.5){
     gl_FragColor=vec4(mix(color,color*.32,grid),1.);
    }else{
    SurfaceData surface=getSurfaceData(v,v.uv,gl_FrontFacing);
    surface.albedoColor=mix(color,color*.32,grid);
    BSDFData bsdf;
    initBSDFData(surface,bsdf);
    float shadow=1.;
    #if defined(SCENE_DIRECT_LIGHT_COUNT) && defined(NEED_CALCULATE_SHADOWS)
      shadow=sampleShadowMap(v.positionWS,getShadowCoord(v.positionWS));
    #endif
    vec3 diffuse=vec3(0.),specular=vec3(0.);
    evaluateDirectRadiance(v,surface,bsdf,shadow,diffuse,specular);
    evaluateIBL(v,surface,bsdf,diffuse,specular);
    vec4 finalColor=vec4(diffuse+specular,1.);
    #if SCENE_FOG_MODE != 0
      finalColor=fog(finalColor,v.positionVS);
    #endif
    gl_FragColor=finalColor;
    }
    #endif
   }
  }
 }
}
