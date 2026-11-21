import reveal from "./SoilWorkReveal.glsl?raw";
import pbr from "../../procedural/runtime/PlantOrganTint.shader?raw";

/** Standard PBR lighting with wetness and a world-aligned reverse dissolve over the host ground. */
export const SOIL_MOISTURE_SHADER = pbr
  .replace('Shader "Farming/PlantOrganTint"', 'Shader "Farming/SoilMoisture"')
  .replace('UsePass "Pipeline/SSRReceiver/Default/SSRReceiver"', "")
  .replace('UsePass "Pipeline/SSRContributionDepth/Default/SSRContributionDepth"', "")
  .replace(
    "vec4 renderer_OrganTint;",
    `
    vec3 soil_Row0;
    vec3 soil_Row1;
    vec3 soil_Row2;
    vec4 soil_DryColor;
    vec4 soil_WetColor;
    vec2 soil_Roughness;
    float soil_BoundaryProgress;
    float soil_CultivationProgress;
    #ifdef FARM_SOIL_BATCH
      sampler2D soil_BatchCoverage;
      sampler2D soil_BatchStates;
      vec4 soil_BatchLayout;
    #else
      #ifdef FARM_SOIL_COVERAGE
        sampler2D soil_CoverageTexture;
      #endif
    #endif
    ${reveal}
    float soilSample(vec2 uv, vec3 row0, vec3 row1, vec3 row2) {
      vec2 p = clamp(uv, 0.0, 1.0) * 2.0;
      vec3 low = p.y <= 1.0 ? row0 : row1;
      vec3 high = p.y <= 1.0 ? row1 : row2;
      float x = p.x <= 1.0 ? p.x : p.x - 1.0;
      float y = p.y <= 1.0 ? p.y : p.y - 1.0;
      float a = p.x <= 1.0 ? mix(low.x, low.y, x) : mix(low.y, low.z, x);
      float b = p.x <= 1.0 ? mix(high.x, high.y, x) : mix(high.y, high.z, x);
      return mix(a, b, y);
    }
  `
  )
  .replace(
    "float organMask;",
    `#ifdef FARM_SOIL_BATCH
      vec4 soilMeta;
      vec3 soilRow0;
      vec3 soilRow1;
      vec3 soilRow2;
    #else
      float soilCoverage;
    #endif`
  )
  .replace(
    /varyings\.vertexColor = vec4\(1\.0\);\s*varyings\.organMask = attributes\.COLOR_0\.a;/,
    `varyings.vertexColor = vec4(attributes.COLOR_0.ggg, 1.0);
    #ifdef FARM_SOIL_BATCH
      float slot = floor(attributes.COLOR_0.r + 0.5);
      vec2 tile = vec2(mod(slot, soil_BatchLayout.x), floor(slot / soil_BatchLayout.x));
      vec2 stateUV = (tile * vec2(3.0, 1.0) + vec2(0.5)) / (soil_BatchLayout.xy * vec2(3.0, 1.0));
      vec4 state0 = texture2D(soil_BatchStates, stateUV);
      vec4 state1 = texture2D(soil_BatchStates, stateUV + vec2(1.0 / (soil_BatchLayout.x * 3.0), 0.0));
      vec4 state2 = texture2D(soil_BatchStates, stateUV + vec2(2.0 / (soil_BatchLayout.x * 3.0), 0.0));
      varyings.soilMeta = vec4(tile, state0.w, state1.w);
      varyings.soilRow0 = state0.xyz;
      varyings.soilRow1 = state1.xyz;
      varyings.soilRow2 = state2.xyz;
      float soilVisible = state2.w;
    #else
      varyings.soilCoverage = attributes.COLOR_0.a;
    #endif`
  )
  .replace(
    /gl_Position = renderer_MVPMat \* vertexInputs\.positionOS;\s*varyings\.positionCS = gl_Position;/,
    `gl_Position = renderer_MVPMat * vertexInputs.positionOS;
  #if defined(FARM_SOIL_BATCH) && defined(RENDERER_ENABLE_VERTEXCOLOR)
    if (soilVisible <= 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    }
  #endif
  varyings.positionCS = gl_Position;`
  )
  .replace(
    /float organMembership = 0\.0;\s*#ifdef RENDERER_ENABLE_VERTEXCOLOR\s*organMembership = varyings\.organMask;[\s\S]*?#endif\s*SurfaceData surfaceData = getSurfaceData/,
    `
    vec3 row0 = soil_Row0;
    vec3 row1 = soil_Row1;
    vec3 row2 = soil_Row2;
    float cultivationProgress = soil_CultivationProgress;
    float boundaryProgress = soil_BoundaryProgress;
    #if defined(FARM_SOIL_BATCH) && defined(RENDERER_ENABLE_VERTEXCOLOR)
      row0 = varyings.soilRow0;
      row1 = varyings.soilRow1;
      row2 = varyings.soilRow2;
      boundaryProgress = varyings.soilMeta.z;
      cultivationProgress = varyings.soilMeta.w;
    #endif
  #ifdef RENDERER_ENABLE_VERTEXCOLOR
    float opening = soilWorkReveal(varyings.positionWS.xz, cultivationProgress);
    float joining = soilWorkReveal(varyings.positionWS.xz, boundaryProgress);
    #ifdef FARM_SOIL_BATCH
      float coverage = 1.0;
    #else
      float coverage = varyings.soilCoverage;
    #endif
    #ifdef FARM_SOIL_COVERAGE
      #ifdef FARM_SOIL_BATCH
        vec2 tile = floor(varyings.soilMeta.xy + 0.5);
        // Sampling from the same normalized coordinates, clamped to texel centres, preserves the original 65x65 bilinear mask.
        vec2 coverageUV = (tile * 65.0 + clamp(varyings.uv * 65.0, vec2(0.5), vec2(64.5))) / soil_BatchLayout.zw;
        vec2 contours = texture2D(soil_BatchCoverage, coverageUV).rg;
      #else
        vec2 contours = texture2D(soil_CoverageTexture, varyings.uv).rg;
      #endif
      // The shared patch reveal already supplies local coverage. Multiplying the raw
      // progress again lets the old edge lag the new bed once the curve saturates.
      float joined = joining;
      float contour = mix(contours.r, contours.g, joined);
      coverage *= contour;
    #endif
    // Both the new bed and the joining contour use this local coverage exactly once.
    // Material alpha stays at one; only patch edges and the outer contour blend.
    coverage *= opening;
    if (coverage <= 0.0) discard;
  #endif
  SurfaceData surfaceData = getSurfaceData`
  )
  .replace(
    / {2}float value = max\(surfaceData\.albedoColor[\s\S]*?\/\/ Can modify surfaceData here/,
    `
    #ifdef RENDERER_ENABLE_VERTEXCOLOR
      surfaceData.opacity *= coverage;
    #endif
    float wetness = soilSample(varyings.uv, row0, row1, row2);
    surfaceData.albedoColor *= mix(soil_DryColor.rgb, soil_WetColor.rgb, wetness);
    surfaceData.roughness = mix(soil_Roughness.x, soil_Roughness.y, wetness);
  `
  );
