Shader "Planning/TemplateTranslucent" {
  SubShader "Default" {
    UsePass "Pipeline/ShadowCaster/Default/ShadowCaster"
    UsePass "Pipeline/DepthOnly/Default/DepthOnly"
    UsePass "Pipeline/ScreenSpaceReflectionSurface/Default/ScreenSpaceReflectionSurface"
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }
      DepthState = { WriteEnabled = true; }
      CullMode rasterStateCullMode;
      RasterState = { CullMode = rasterStateCullMode; }

      #include "ShaderLibrary/PBR/ForwardPassPBR.glsl"

      vec4 material_PigmentShade;
      vec4 material_PigmentHighlight;
      float material_PigmentExposure;
      float material_DiffuseTransmission;

      VertexShader = PBRVertex;
      FragmentShader = templateTranslucentFragment;
      void templateTranslucentFragment(Varyings v) {
        vec2 aoUV = v.uv;
        #if defined(MATERIAL_HAS_OCCLUSION_TEXTURE) && defined(RENDERER_HAS_UV1)
          if (material_OcclusionTextureCoord == 1.0) aoUV = v.uv1;
        #endif
        SurfaceData surface = getSurfaceData(v, aoUV, gl_FrontFacing);
        // Re-dye the authored texture in linear space. A bounded exposure curve
        // retains its mottling while removing the original dark red pigment.
        float luminance = dot(surface.albedoColor, vec3(0.2126, 0.7152, 0.0722));
        float exposed = luminance * exp2(material_PigmentExposure);
        float detail = exposed / (1.0 + exposed);
        surface.albedoColor = mix(material_PigmentShade.rgb, material_PigmentHighlight.rgb, detail);

        BSDFData bsdf;
        initBSDFData(surface, bsdf);
        float visibility = 1.0;
        #if defined(SCENE_DIRECT_LIGHT_COUNT) && defined(NEED_CALCULATE_SHADOWS)
          #if SCENE_SHADOW_CASCADED_COUNT == 1
            vec3 shadowCoord = v.shadowCoord;
          #else
            vec3 shadowCoord = getShadowCoord(v.positionWS);
          #endif
          visibility *= sampleShadowMap(v.positionWS, shadowCoord);
        #endif
        visibility *= sampleVolumetricCloudShadow(v.positionWS);
        vec3 diffuse = vec3(0.0);
        vec3 specular = vec3(0.0);
        evaluateDirectRadiance(v, surface, bsdf, visibility, diffuse, specular);
        evaluateIBL(v, surface, bsdf, diffuse, specular);

        // Diffuse transmission is the opposite Lambert hemisphere. Its convex
        // mixture with reflection preserves incident energy and all native light
        // types, shadow maps, SH, probe volumes and AO. Specular stays on the front.
        SurfaceData reverse = surface;
        reverse.normal = -surface.normal;
        vec3 transmitted = vec3(0.0);
        vec3 unusedSpecular = vec3(0.0);
        evaluateDirectRadiance(v, reverse, bsdf, visibility, transmitted, unusedSpecular);
        Varyings backVaryings = v;
        #if defined(SCENE_USE_PROBE_VOLUME) && defined(SCENE_PROBE_VOLUME_PER_VERTEX)
          // The vertex sample was evaluated with the front normal; resample the back.
          backVaryings.probeWeight = 0.0;
        #endif
        evaluateDiffuseIBL(backVaryings, reverse, bsdf, transmitted);
        diffuse = mix(diffuse, transmitted, material_DiffuseTransmission);
        // Only the source RGB emissive texture contributes emission.
        vec4 color = vec4(diffuse + specular + surface.emissiveColor, surface.opacity);
        #if SCENE_FOG_MODE != 0
          color = fog(color, v.positionVS);
        #endif
        #ifdef SCENE_PROBE_BAKE_CAPTURE
          color.a = length(v.positionWS - camera_Position) + 1.0;
        #endif
        gl_FragColor = color;
      }
    }
  }
}
