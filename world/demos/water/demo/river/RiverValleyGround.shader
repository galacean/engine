Shader "Demo/RiverValleyGround" {
  SubShader "Default" {
    UsePass "Pipeline/ShadowCaster/Default/ShadowCaster"
    UsePass "Pipeline/DepthOnly/Default/DepthOnly"
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }
      DepthState = { WriteEnabled = true; }
      RasterState = { CullMode = CullMode.Back; }
      RenderQueueType = Opaque;
      VertexShader = PBRVertex;
      FragmentShader = RiverValleyGroundFragment;
      #include "ShaderLibrary/PBR/ForwardPassPBR.glsl"
      sampler2D material_ValleyWeights;
      sampler2D material_ValleyLayer0;
      sampler2D material_ValleyLayer1;
      sampler2D material_ValleyLayer2;
      sampler2D material_ValleyLayer3;
      sampler2D material_ValleyNormal0;
      sampler2D material_ValleyNormal2;
      sampler2D material_ValleyNormal3;
      void RiverValleyGroundFragment(Varyings v) {
        SurfaceData surface = getSurfaceData(v, v.uv, gl_FrontFacing);
        vec2 p = vec2(v.positionWS.x + 128.0, 128.0 - v.positionWS.z);
        vec4 weights = texture2D(material_ValleyWeights, p / 256.0);
        weights /= max(dot(weights,vec4(1.0)),0.001);
        surface.albedoColor = texture2DSRGB(material_ValleyLayer0,p / 25.0).rgb * weights.x
          + texture2DSRGB(material_ValleyLayer1,p / 2.0).rgb * weights.y
          + texture2DSRGB(material_ValleyLayer2,p / 3.0).rgb * weights.z
          + texture2DSRGB(material_ValleyLayer3,p).rgb * weights.w;
        vec3 normalTS = (texture2D(material_ValleyNormal0,p/25.0).xyz*2.0-1.0)*weights.x
          + vec3(0.0,0.0,1.0)*weights.y
          + (texture2D(material_ValleyNormal2,p/3.0).xyz*2.0-1.0)*weights.z
          + (texture2D(material_ValleyNormal3,p).xyz*2.0-1.0)*weights.w;
        mat3 tbn = getTBNByDerivatives(p, normalize(v.normalWS), v.positionWS, gl_FrontFacing);
        surface.normal = normalize(tbn * normalize(normalTS));
        surface.dotNV = saturate(dot(surface.normal,surface.viewDir));
        surface.roughness = 0.95;
        BSDFData bsdf;
        initBSDFData(surface, bsdf);
        vec3 diffuse = vec3(0.0), specular = vec3(0.0);
        float shadow = 1.0;
        #if defined(SCENE_DIRECT_LIGHT_COUNT) && defined(NEED_CALCULATE_SHADOWS)
          #if SCENE_SHADOW_CASCADED_COUNT == 1
            vec3 shadowCoord = v.shadowCoord;
          #else
            vec3 shadowCoord = getShadowCoord(v.positionWS);
          #endif
          shadow = sampleShadowMap(v.positionWS, shadowCoord);
        #endif
        evaluateDirectRadiance(v,surface,bsdf,shadow,diffuse,specular);
        evaluateIBL(v,surface,bsdf,diffuse,specular);
        vec4 color = vec4(diffuse+specular,1.0);
        #if SCENE_FOG_MODE != 0
          color=fog(color,v.positionVS);
        #endif
        gl_FragColor=color;
      }
    }
  }
}
