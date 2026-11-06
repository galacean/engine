Shader "Demo/LakeGround" {
  SubShader "Default" {
    UsePass "Pipeline/ShadowCaster/Default/ShadowCaster"
    UsePass "Pipeline/DepthOnly/Default/DepthOnly"
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }
      DepthState = { WriteEnabled = true; }
      RasterState = { CullMode = CullMode.Back; }
      RenderQueueType = Opaque;
      VertexShader = PBRVertex;
      FragmentShader = LakeGroundFragment;

      #include "ShaderLibrary/PBR/ForwardPassPBR.glsl"
      sampler2D material_LakeSand;
      sampler2D material_LakeGrass;
      float material_LakeWaterLevel;
      float material_LakeCalibration;

      float lakeGroundHash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float lakeGroundNoise(vec2 p) {
        vec2 cell = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(lakeGroundHash(cell), lakeGroundHash(cell + vec2(1.0, 0.0)), f.x),
          mix(lakeGroundHash(cell + vec2(0.0, 1.0)), lakeGroundHash(cell + vec2(1.0)), f.x), f.y);
      }

      // Material coverage follows real bed height/slope. Noise never shifts geometry.
      void LakeGroundFragment(Varyings v) {
        SurfaceData surface = getSurfaceData(v, v.uv, gl_FrontFacing);
        vec2 p = v.positionWS.xz;
        float elevation = v.positionWS.y - material_LakeWaterLevel;
        float slope = 1.0 - abs(normalize(v.normalWS).y);
        float patches = lakeGroundNoise(p * 0.17);
        float detail = lakeGroundNoise(p * 0.7);
        float grassWeight = smoothstep(0.04, 0.7, elevation + (patches - 0.5) * 1.1)
          * (1.0 - smoothstep(0.15, 0.4, slope));
        float sandWeight = smoothstep(0.35, 0.72, patches) * (1.0 - smoothstep(0.18, 0.45, slope));
        float wetness = 1.0 - smoothstep(-0.15, 0.12 + patches * 0.3, elevation);
        vec3 dirt = surface.albedoColor * vec3(0.40, 0.32, 0.23);
        vec3 sand = texture2DSRGB(material_LakeSand, v.uv).rgb * vec3(0.46, 0.39, 0.28);
        vec3 grass = texture2DSRGB(material_LakeGrass, v.uv).rgb * vec3(0.43, 0.53, 0.32);
        vec3 bed = mix(dirt, sand, sandWeight) * mix(1.0, 0.72, wetness);
        bed *= mix(1.0, 0.84, smoothstep(0.5, 3.0, -elevation));
        surface.albedoColor = mix(bed, grass, grassWeight) * mix(0.90, 1.08, detail);
        float checker = mod(floor(p.x * 0.5) + floor(p.y * 0.5), 2.0);
        if (v.positionWS.y < material_LakeWaterLevel)
          surface.albedoColor = mix(surface.albedoColor, mix(vec3(0.035), vec3(0.35), checker), material_LakeCalibration);
        surface.roughness = mix(0.94, 0.72, wetness * (1.0 - grassWeight));
        BSDFData bsdf;
        initBSDFData(surface, bsdf);
        vec3 diffuse = vec3(0.0);
        vec3 specular = vec3(0.0);
        float shadow = 1.0;
        #if defined(SCENE_DIRECT_LIGHT_COUNT) && defined(NEED_CALCULATE_SHADOWS)
          #if SCENE_SHADOW_CASCADED_COUNT == 1
            vec3 shadowCoord = v.shadowCoord;
          #else
            vec3 shadowCoord = getShadowCoord(v.positionWS);
          #endif
          shadow = sampleShadowMap(v.positionWS, shadowCoord);
        #endif
        shadow *= sampleVolumetricCloudShadow(v.positionWS);
        evaluateDirectRadiance(v, surface, bsdf, shadow, diffuse, specular);
        evaluateIBL(v, surface, bsdf, diffuse, specular);
        vec4 color = vec4(diffuse + specular, 1.0);
        #if SCENE_FOG_MODE != 0
          color = fog(color, v.positionVS);
        #endif
        gl_FragColor = color;
      }
    }
  }
}
