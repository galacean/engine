Shader "SeedWorld/RockSurface" {
 SubShader "Default" {
  UsePass "Pipeline/ShadowCaster/Default/ShadowCaster"
  UsePass "Pipeline/DepthOnly/Default/DepthOnly"
  Pass "Forward" {
   Tags { pipelineStage = "Forward" }
   CompareFunction material_WorldPickDepthCompare;
   DepthState = { WriteEnabled = true; CompareFunction = material_WorldPickDepthCompare; }
   CullMode rasterStateCullMode;
   RasterState = { CullMode = rasterStateCullMode; }
   #ifdef RENDERER_WORLD_PICK
    float renderer_WorldPickBase;
   #endif
   #define TERRAIN_PROJECT_FORWARD_PASS
   #include "ShaderLibrary/Common/Common.glsl"
   #include "ShaderLibrary/Common/Transform.glsl"
   #include "shared/RockTerrainContact.glsl"
   #include "SeedWorld/RockSurface/Forward.glsl"
   #include "SeedWorld/RockSurface/ShadowReceiver.glsl"
   #include "SeedWorld/RockSurface/Projection.glsl"
   #include "SeedWorld/RockSurface/ColorBlend.glsl"
   #ifdef MATERIAL_GRASS_SHARED_COLOR_FIELD
    #include "shared/RockGrassGround.glsl"
    #include "shared/SurfaceClimate.glsl"
   #endif
   float material_RockGrassCoveragePreview;
   VertexShader = PBRVertex;
   FragmentShader = SlabFragment;
   void SlabFragment(Varyings v) {
    #ifdef RENDERER_WORLD_PICK
     float id = floor(renderer_WorldPickBase + v.uv1.x + 0.5);
     #ifdef RENDERER_WORLD_PICK_DEPTH
      id = floor(gl_FragCoord.z * 16777215.0 + 0.5);
     #endif
     gl_FragColor = vec4(mod(id, 256.0), mod(floor(id / 256.0), 256.0), floor(id / 65536.0), 255.0) / 255.0;
    #else
    if (material_RockGrassCoveragePreview > 0.5) {
      gl_FragColor = vec4(mix(vec3(0.22, 0.08, 0.04), vec3(0.1, 0.85, 0.15), clamp(v.uv1.y, 0.0, 1.0)), 1.0);
    } else {
    SurfaceData surface = getSurfaceData(v, v.uv, gl_FrontFacing);
    originalRockSurface(surface, v);
    surface.albedoColor = rockPaletteStone(surface.albedoColor);
    vec3 climateNormal = normalize(v.normalWS);
    float grassCoverage = 0.0;
    #ifdef MATERIAL_GRASS_SHARED_COLOR_FIELD
     float slopeCoverage = smoothstep(material_WorldGrassSlope, min(1.0, material_WorldGrassSlope + 0.06), climateNormal.y);
     grassCoverage = material_WorldGrassEnable * mix(slopeCoverage, clamp(v.uv1.y, 0.0, 1.0), material_WorldGrassCoverageFromMesh);
     if (grassCoverage > 0.0) {
      vec4 ground = terrainProjectRockGrassGround(v.positionWS, climateNormal, vec3(1.0, rockLocalTextureScale(), 1.0),
        terrainProjectGrassSurfaceColor(v.positionWS));
      surface.albedoColor = mix(surface.albedoColor, ground.rgb, grassCoverage);
      surface.roughness = mix(surface.roughness, ground.a, grassCoverage);
      surface.normal = normalize(mix(surface.normal,
        terrainProjectAttachedReliefNormal(v.positionWS, climateNormal, grassCoverage), grassCoverage));
      surface.dotNV = saturate(dot(surface.normal, surface.viewDir));
     }
    #endif
    float snowResponse = 0.72;
    float contact = 0.0;
    #ifdef MATERIAL_TERRAIN_HEIGHT_FIELD
      vec4 contactGround = vec4(surface.albedoColor, surface.roughness);
      contact = terrainProjectBlendRockContact(v.positionWS, v.rockGroundClearance,
        contactGround, surface.normal, snowResponse);
      surface.albedoColor = contactGround.rgb;
      surface.roughness = contactGround.a;
      surface.ambientOcclusion = mix(surface.ambientOcclusion, 1.0, contact);
      climateNormal = normalize(mix(climateNormal, surface.normal, contact));
      surface.dotNV = saturate(dot(surface.normal, surface.viewDir));
    #endif
    #ifdef MATERIAL_GRASS_SHARED_COLOR_FIELD
      if (grassCoverage > 0.0 || contact > 0.0)
        terrainProjectApplySurfaceClimate(surface, climateNormal, vec3(max(grassCoverage, contact), 0.0, snowResponse));
    #endif
    float shadow = 1.;
    #if defined(SCENE_DIRECT_LIGHT_COUNT) && defined(NEED_CALCULATE_SHADOWS)
     shadow = sampleRockShadow(v.positionWS);
    #endif
    shadow *= sampleVolumetricCloudShadow(v.positionWS);
    vec4 color = vec4(terrainProjectFinalLighting(evaluateTerrainProjectLightingWithShadow(v, surface, shadow)), 1.);
    #if SCENE_FOG_MODE != 0
     color = fog(color, v.positionVS);
    #endif
    gl_FragColor = color;
    }
    #endif
   }
  }
 }
}
