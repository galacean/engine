Shader "Water/RiverDropPresentation" {
 SubShader "Default" {
  Pass "Forward" {
   Tags { pipelineStage = "Forward" }
   BlendState = { Enabled = true; SourceColorBlendFactor = BlendFactor.SourceAlpha; DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha; SourceAlphaBlendFactor = BlendFactor.One; DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha; }
   DepthState = { WriteEnabled = false; CompareFunction = CompareFunction.LessEqual; }
   RasterState = { CullMode = CullMode.Off; }
   RenderQueueType = Transparent;
   VertexShader = vert;
   FragmentShader = frag;
   #include "ShaderLibrary/Common/Common.glsl"
   mat4 renderer_MVPMat;
   mat4 renderer_ModelMat;
   mat4 renderer_NormalMat;
   mat4 camera_VPMat;
   mat4 camera_ViewInvMat;
   vec3 camera_Position;
   vec4 scene_ElapsedTime;
   vec4 scene_SunlightColor;
   vec3 scene_SunlightDirection;
   {{AMBIENT_UNIFORMS}}
   {{AMBIENT_FUNCTIONS}}
   #ifdef SCENE_USE_SPECULAR_ENV
    samplerCube scene_EnvSpecularSampler;
   #endif
   sampler2D material_DropDirectional;
   sampler2D material_DropCloud;
   sampler2D material_DropLinesTexture;
   sampler2D material_DropEdge;
   sampler2D material_DropVoronoi;
   sampler2D material_DropFoam;
   vec4 material_DropLayerDirectional;
   vec4 material_DropLayerCloud;
   vec4 material_DropLayerLines;
   vec4 material_DropLayerEdge;
   vec4 material_DropLayerVoronoi;
   vec4 material_DropLayerFoam;
   vec4 material_DropColor0;
   vec4 material_DropColor1;
   vec4 material_DropColor2;
   vec4 material_DropColor3;
   vec4 material_DropResponse;
   vec4 material_DropEffects;
   vec4 material_DropLines;
   vec4 material_DropMasks;
   vec4 material_DropEntry;
   vec4 material_DropImpact;
   vec4 material_DropImpactFlow;
   float material_DropTime;
   struct Attributes { vec3 POSITION; vec3 NORMAL; vec2 TEXCOORD_0; vec2 TEXCOORD_1; vec2 TEXCOORD_2; };
   struct Varyings { vec2 uv; vec2 part; vec3 worldPosition; vec3 normalWS; vec2 direction; };
   float dropTime() { return mod(material_DropTime >= 0.0 ? material_DropTime : scene_ElapsedTime.x, {{TIME_PERIOD}}) * material_DropEffects.x; }
   Varyings vert(Attributes a) {
    Varyings v; v.uv=a.TEXCOORD_0; v.part=a.TEXCOORD_1; v.direction=a.TEXCOORD_2;
    vec3 position=a.POSITION;
    v.worldPosition=(renderer_ModelMat*vec4(position,1.0)).xyz;
    v.normalWS=normalize((renderer_NormalMat*vec4(a.NORMAL,0.0)).xyz);
    gl_Position=renderer_MVPMat*vec4(position,1.0);
    return v;
   }
   vec2 layerUV(vec2 uv,vec4 layer,float t) { return uv*layer.xy+t*layer.zw; }
   void frag(Varyings v) {
    float t=dropTime(); vec2 dropUV=v.uv;
    vec3 normal=normalize(v.normalWS);
    vec3 view=normalize(camera_Position-v.worldPosition);
    if(dot(normal,view)<0.0) normal=-normal;
    vec2 cloud=texture2D(material_DropCloud,layerUV(dropUV,material_DropLayerCloud,t)).rg;
    vec3 color=material_DropColor3.rgb;
    float alpha=1.0;
    float edgeFade=smoothstep(0.0,0.04,dropUV.x)*smoothstep(0.0,0.04,1.0-dropUV.x);
    if(v.part.x<0.5) {
      vec2 flowUV=layerUV(dropUV,material_DropLayerDirectional,t);
      float noise=texture2D(material_DropDirectional,flowUV).g;
      vec3 tangent=normalize((renderer_ModelMat*vec4(-v.direction.y,0.0,v.direction.x,0.0)).xyz);
      vec3 vertical=vec3(0.0,-1.0,0.0);
      vec2 parallax=(noise-0.5)*material_DropResponse.w*vec2(dot(view,tangent),dot(view,vertical))/(abs(dot(view,normal))+0.42);
      float variation=texture2D(material_DropDirectional,flowUV+parallax).g;
      color=mix(material_DropColor1.rgb,material_DropColor0.rgb,pow(max(variation,0.0001),material_DropResponse.z));
      float lines=texture2D(material_DropLinesTexture,layerUV(dropUV,material_DropLayerLines,t)+cloud*material_DropLines.x).g;
      color=mix(color,material_DropColor2.rgb,clamp(lines*material_DropLines.y*pow(max(noise,0.0001),material_DropLines.z),0.0,1.0));
      float edge=texture2D(material_DropEdge,layerUV(dropUV,material_DropLayerEdge,t)).r;
      float dots=step(material_DropEntry.y,texture2D(material_DropVoronoi,layerUV(dropUV,material_DropLayerVoronoi,t)+(cloud-0.5)*0.03).g)*material_DropEntry.z;
      float bottom=step(material_DropMasks.x,noise*smoothstep(material_DropLines.w,1.0,dropUV.y));
      float foam=max(bottom,max(dots,step(material_DropMasks.z,edge)*material_DropMasks.w));
      color=mix(color,material_DropColor3.rgb,clamp(foam*material_DropEffects.y,0.0,1.0));
      float nx=texture2D(material_DropDirectional,flowUV+vec2(0.002,0.0)).g-noise;
      float ny=texture2D(material_DropDirectional,flowUV+vec2(0.0,0.002)).g-noise;
      normal=normalize(normal+material_DropResponse.y*(tangent*nx+vertical*ny)*10.0);
      alpha=step(material_DropMasks.y,edge)*clamp(dropUV.y*material_DropEntry.x,0.0,1.0)*edgeFade*material_DropResponse.x;
    } else if(v.part.x<3.5) {
      vec2 foamUV=layerUV(dropUV,material_DropLayerFoam,t)+(cloud-0.5)*0.08;
      float foam=texture2D(material_DropFoam,foamUV).g;
      float cells=texture2D(material_DropVoronoi,dropUV*material_DropImpactFlow.xy+vec2(0.0,t*material_DropImpactFlow.z)+(cloud-0.5)*material_DropImpact.x).g;
      float lengthMask=v.part.x<1.5 ? dropUV.y : 1.0-dropUV.y;
      float widthMask=pow(max(0.0,1.0-abs(dropUV.x*2.0-1.0)),material_DropImpact.w);
      float mask=pow(clamp(lengthMask*material_DropImpact.y,0.0,1.0),material_DropImpact.z)*widthMask;
      float threshold=material_DropImpactFlow.w;
      alpha=smoothstep(threshold-0.03,threshold+0.03,mix(cells,foam, v.part.x<2.5 ? 0.55 : 0.0)*mask)*edgeFade*material_DropEffects.y;
      color=mix(material_DropColor2.rgb,material_DropColor3.rgb,0.6+0.4*foam);
    }
    if(alpha<0.005) discard;
    vec3 light=waterSurfaceAmbientDiffuseRadiance(normal)+scene_SunlightColor.rgb*max(0.0,dot(normal,-scene_SunlightDirection));
    color*=max(light,vec3(0.02));
    #ifdef SCENE_USE_SPECULAR_ENV
      if(v.part.x<0.5) color+=textureCube(scene_EnvSpecularSampler,reflect(-view,normal)).rgb*scene_EnvMapLight.specularIntensity*(0.02+0.1*pow(1.0-max(dot(normal,view),0.0),5.0));
    #endif
    gl_FragColor=outputSRGBCorrection(vec4(color,alpha));
   }
  }
 }
}
