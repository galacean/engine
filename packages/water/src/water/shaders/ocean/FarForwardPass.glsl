      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"

      vec4 scene_SunlightColor;
      vec3 scene_SunlightDirection;
      samplerCube material_ReflectionCubeTexture;
{{SHARED_ENVIRONMENT_UNIFORMS}}
{{SHARED_SURFACE_UNIFORMS}}
{{VALUE_003_WATER_SURFACE_AMBIENT_LIGHTING_UNIFORM_DECLARATIONS}}
      sampler2D material_NearshoreTexture;
      vec4 material_NearshoreWorldToUv;
      vec4 material_NearshoreDecode;
      vec4 material_NearshoreOutsidePolicy;
      vec2 material_NearshoreCellSize;
      float material_WaterLevel;
      vec4 material_OceanFarProjection;
      vec4 material_OceanDeepColor;
      vec4 material_OceanHorizonColor;
      vec2 material_OceanFarReflectionFilter;
{{VALUE_005_CREATEOCEANSCENEFOGDECLARATIONS}}

      struct Attributes { vec4 POSITION; vec2 TEXCOORD_0; };
      struct Varyings {
        vec3 worldPosition;
        vec3 positionVS;
      };

{{VALUE_006_WATER_SURFACE_AMBIENT_LIGHTING_SHADER_FUNCTIONS}}
{{VALUE_007_CREATEWATERSPATIALFIELDSHADERDECODEFUNCTIONS}}
{{SHARED_ENVIRONMENT_FUNCTIONS}}
{{SHARED_SURFACE_FUNCTIONS}}
{{VALUE_008_OCEAN_FAR_FIELD_SHADER_FUNCTIONS}}

      Varyings vert(Attributes attributes) {
        Varyings output;
        vec4 localWorldPosition = renderer_ModelMat * attributes.POSITION;
        localWorldPosition.y += material_WaterLevel;
        float outerVertex = step(0.5, attributes.TEXCOORD_0.x);
        float viewportHeight = max(material_OceanFarProjection.x, 1.0);
        float projectionScaleY = max(abs(camera_ProjMat[1][1]), 0.0001);
        float cameraHeight = max(camera_Position.y - localWorldPosition.y, 0.0);
        float projectionDistance = cameraHeight * viewportHeight * projectionScaleY
          / {{VALUE_009_GLSL_2_OCEAN_RENDER_BUDGET_FARFIELDMAXIMUMPROJECTIONERRO}};
        projectionDistance = clamp(
          projectionDistance,
          material_OceanFarProjection.y,
          {{VALUE_010_GLSL_OCEAN_RENDER_BUDGET_FARFIELDMAXIMUMPROJECTIONDISTAN}}
        );
        vec2 outerDirection = normalize(attributes.POSITION.xz);
        vec2 projectedWorldXZ = camera_Position.xz + outerDirection * projectionDistance;
        vec4 projectedWorldPosition = vec4(projectedWorldXZ.x, localWorldPosition.y, projectedWorldXZ.y, 1.0);
        vec4 surfaceWorldPosition = mix(localWorldPosition, projectedWorldPosition, outerVertex);
        vec4 clipPosition = camera_VPMat * surfaceWorldPosition;
        clipPosition.z = mix(clipPosition.z, clipPosition.w * 0.99999, outerVertex);
        output.worldPosition = surfaceWorldPosition.xyz;
        output.positionVS = (camera_ViewMat * surfaceWorldPosition).xyz;
        gl_Position = clipPosition;
        return output;
      }

      void frag(Varyings input) {
        if (waterConnectionFacts(input.worldPosition.xz).w < 0.5) discard;
        vec2 nearshoreUv = input.worldPosition.xz * material_NearshoreWorldToUv.xy
          + material_NearshoreWorldToUv.zw;
        vec4 outsideEdges = vec4(
          1.0 - step(0.0, nearshoreUv.x),
          step(1.000001, nearshoreUv.x),
          1.0 - step(0.0, nearshoreUv.y),
          step(1.000001, nearshoreUv.y)
        );
        float outsideAtlas = max(max(outsideEdges.x, outsideEdges.y), max(outsideEdges.z, outsideEdges.w));
        float outsideWet = mix(1.0, material_NearshoreOutsidePolicy.x, outsideEdges.x)
          * mix(1.0, material_NearshoreOutsidePolicy.y, outsideEdges.y)
          * mix(1.0, material_NearshoreOutsidePolicy.z, outsideEdges.z)
          * mix(1.0, material_NearshoreOutsidePolicy.w, outsideEdges.w);
        vec4 nearshoreSample = texture2D(material_NearshoreTexture, clamp(nearshoreUv, vec2(0.0), vec2(1.0)));
        float sampledShoreDistance = waterSpatialFieldDecodeSignedDistance(
          nearshoreSample.a,
          2.0078740157480315,
          -1.0078740157480315,
          material_NearshoreDecode.y
        );
        float shoreDistance = mix(
          sampledShoreDistance,
          mix(-material_NearshoreDecode.y, material_NearshoreDecode.y, outsideWet),
          outsideAtlas
        );
        float shoreAntialias = max(
          max(material_NearshoreCellSize.x, material_NearshoreCellSize.y) * 0.42,
          max(fwidth(shoreDistance) * 1.25, material_NearshoreDecode.y * (2.0 / 255.0))
        );
        shoreDistance = waterConnectionShore(input.worldPosition.xz, shoreDistance);
        float atlasCoverage = smoothstep(-shoreAntialias, shoreAntialias, shoreDistance);
        float coverage = mix(atlasCoverage, outsideWet, outsideAtlas);
        if (coverage <= 0.001) discard;

        vec3 finalColor;

          finalColor = oceanFarFieldRadiance(input.worldPosition);

{{VALUE_011_CREATEOCEANSCENEFOGAPPLICATION_FINALCOLOR}}
        vec4 resolvedWaterClosure = vec4(finalColor, coverage);
{{SHARED_RESOLVED_OUTPUT}}
      }
