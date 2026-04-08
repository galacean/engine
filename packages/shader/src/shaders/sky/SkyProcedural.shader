// This code uses the Unity skybox-Procedural shader algorithm, developed by Unity and licensed under the Unity Companion License.
// The original implementation can be found at unity build-in shader(DefaultResourcesExtra/Skybox-Procedural.shader)

Shader "SkyProcedural" {
  SubShader "Default" {
    Pass "Forward Pass" {
      Tags { pipelineStage = "Forward" }

      VertexShader = SkyProceduralVertex;
      FragmentShader = SkyProceduralFragment;

      #include "Common.glsl"

      #define OUTER_RADIUS 1.025
      #define RAYLEIGH (mix(0.0, 0.0025, pow(material_AtmosphereThickness, 2.5)))
      #define MIE 0.0010
      #define SUN_BRIGHTNESS 20.0
      #define MAX_SCATTER 50.0

      const float SKY_GROUND_THRESHOLD = 0.02;
      const float outerRadius = OUTER_RADIUS;
      const float outerRadius2 = OUTER_RADIUS * OUTER_RADIUS;
      const float innerRadius = 1.0;
      const float innerRadius2 = 1.0;
      const float cameraHeight = 0.0001;

      const float HDSundiskIntensityFactor = 15.0;
      const float simpleSundiskIntensityFactor = 27.0;

      const float sunScale = 400.0 * SUN_BRIGHTNESS;
      const float kmESun = MIE * SUN_BRIGHTNESS;
      const float km4PI = MIE * 4.0 * 3.14159265;
      const float scale = 1.0 / (OUTER_RADIUS - 1.0);
      const float scaleDepth = 0.25;
      const float scaleOverScaleDepth = (1.0 / (OUTER_RADIUS - 1.0)) / 0.25;
      const float samples = 2.0;

      const vec3 c_DefaultScatteringWavelength = vec3(0.65, 0.57, 0.475);
      const vec3 c_VariableRangeForScatteringWavelength = vec3(0.15, 0.15, 0.15);

      const float MIE_G = -0.990;
      const float MIE_G2 = 0.9801;

      struct Attributes {
        vec4 POSITION;
      };

      struct Varyings {
        vec3 v_GroundColor;
        vec3 v_SkyColor;
        #ifdef MATERIAL_SUN_HIGH_QUALITY
          vec3 v_Vertex;
        #elif defined(MATERIAL_SUN_SIMPLE)
          vec3 v_RayDir;
        #else
          float v_SkyGroundFactor;
        #endif
        #if defined(MATERIAL_SUN_HIGH_QUALITY) || defined(MATERIAL_SUN_SIMPLE)
          vec3 v_SunColor;
        #endif
      };

      mat4 camera_VPMat;
      vec3 material_SkyTint;
      vec3 material_GroundTint;
      float material_Exposure;
      float material_AtmosphereThickness;
      vec4 scene_SunlightColor;
      vec3 scene_SunlightDirection;
      float material_SunSize;
      float material_SunSizeConvergence;

      #define GAMMA 2.2
      #define COLOR_2_GAMMA(color) pow(color, vec3(1.0 / GAMMA))
      #define COLOR_2_LINEAR(color) color

      float getRayleighPhase(vec3 light, vec3 ray) {
        float eyeCos = dot(light, ray);
        return 0.75 + 0.75 * eyeCos * eyeCos;
      }

      float scaleAngle(float inCos) {
        float x = 1.0 - inCos;
        return 0.25 * exp(-0.00287 + x * (0.459 + x * (3.83 + x * (-6.80 + x * 5.25))));
      }

      float getMiePhase(float eyeCos, float eyeCos2) {
        float temp = 1.0 + MIE_G2 - 2.0 * MIE_G * eyeCos;
        temp = pow(temp, pow(material_SunSize, 0.65) * 10.0);
        temp = max(temp, 1.0e-4);
        temp = 1.5 * ((1.0 - MIE_G2) / (2.0 + MIE_G2)) * (1.0 + eyeCos2) / temp;
        return temp;
      }

      float calcSunAttenuation(vec3 lightPos, vec3 ray) {
        #ifdef MATERIAL_SUN_HIGH_QUALITY
          float focusedEyeCos = pow(clamp(dot(lightPos, ray), 0.0, 1.0), material_SunSizeConvergence);
          return getMiePhase(-focusedEyeCos, focusedEyeCos * focusedEyeCos);
        #else //MATERIAL_SUN_SIMPLE
          vec3 delta = lightPos - ray;
          float dist = length(delta);
          float spot = 1.0 - smoothstep(0.0, material_SunSize, dist);
          return spot * spot;
        #endif
      }

      Varyings SkyProceduralVertex(Attributes attributes) {
        Varyings varyings;

        gl_Position = camera_VPMat * vec4(attributes.POSITION.xyz, 1.0);

        vec3 skyTintInGammaSpace = COLOR_2_GAMMA(material_SkyTint);
        vec3 scatteringWavelength = mix(
          c_DefaultScatteringWavelength - c_VariableRangeForScatteringWavelength,
          c_DefaultScatteringWavelength + c_VariableRangeForScatteringWavelength,
          vec3(1.0) - skyTintInGammaSpace
        );
        vec3 invWavelength = 1.0 / pow(scatteringWavelength, vec3(4.0));

        float krESun = RAYLEIGH * SUN_BRIGHTNESS;
        float kr4PI = RAYLEIGH * 4.0 * 3.14159265;

        vec3 cameraPos = vec3(0.0, innerRadius + cameraHeight, 0.0);

        vec3 eyeRay = normalize(attributes.POSITION.xyz);

        float far = 0.0;
        vec3 cIn, cOut;
        if (eyeRay.y >= 0.0) {
          // Sky
          far = sqrt(outerRadius2 + innerRadius2 * eyeRay.y * eyeRay.y - innerRadius2) - innerRadius * eyeRay.y;

          float height = innerRadius + cameraHeight;
          float depth = exp(scaleOverScaleDepth * -cameraHeight);
          float startAngle = dot(eyeRay, cameraPos) / height;
          float startOffset = depth * scaleAngle(startAngle);

          float sampleLength = far / samples;
          float scaledLength = sampleLength * scale;
          vec3 sampleRay = eyeRay * sampleLength;
          vec3 samplePoint = cameraPos + sampleRay * 0.5;

          vec3 frontColor = vec3(0.0);
          // Unrolled loop - iteration 1
          {
            float height = length(samplePoint);
            float depth = exp(scaleOverScaleDepth * (innerRadius - height));
            float lightAngle = dot(-scene_SunlightDirection, samplePoint) / height;
            float cameraAngle = dot(eyeRay, samplePoint) / height;
            float scatter = (startOffset + depth * (scaleAngle(lightAngle) - scaleAngle(cameraAngle)));
            vec3 attenuate = exp(-clamp(scatter, 0.0, MAX_SCATTER) * (invWavelength * kr4PI + km4PI));

            frontColor += attenuate * (depth * scaledLength);
            samplePoint += sampleRay;
          }
          // Unrolled loop - iteration 2
          {
            float height = length(samplePoint);
            float depth = exp(scaleOverScaleDepth * (innerRadius - height));
            float lightAngle = dot(-scene_SunlightDirection, samplePoint) / height;
            float cameraAngle = dot(eyeRay, samplePoint) / height;
            float scatter = (startOffset + depth * (scaleAngle(lightAngle) - scaleAngle(cameraAngle)));
            vec3 attenuate = exp(-clamp(scatter, 0.0, MAX_SCATTER) * (invWavelength * kr4PI + km4PI));

            frontColor += attenuate * (depth * scaledLength);
            samplePoint += sampleRay;
          }

          cIn = frontColor * (invWavelength * krESun);
          cOut = frontColor * kmESun;
        } else {
          // Ground
          far = (-cameraHeight) / (min(-0.001, eyeRay.y));
          vec3 pos = cameraPos + far * eyeRay;

          float depth = exp((-cameraHeight) * (1.0 / scaleDepth));
          float cameraAngle = dot(-eyeRay, pos);
          float lightAngle = dot(-scene_SunlightDirection, pos);
          float cameraScale = scaleAngle(cameraAngle);
          float lightScale = scaleAngle(lightAngle);
          float cameraOffset = depth * cameraScale;
          float temp = lightScale + cameraScale;

          float sampleLength = far / samples;
          float scaledLength = sampleLength * scale;
          vec3 sampleRay = eyeRay * sampleLength;
          vec3 samplePoint = cameraPos + sampleRay * 0.5;

          vec3 frontColor = vec3(0.0, 0.0, 0.0);
          vec3 attenuate;

          {
            float height = length(samplePoint);
            float depth = exp(scaleOverScaleDepth * (innerRadius - height));
            float scatter = depth * temp - cameraOffset;
            attenuate = exp(-clamp(scatter, 0.0, MAX_SCATTER) * (invWavelength * kr4PI + km4PI));
            frontColor += attenuate * (depth * scaledLength);
            samplePoint += sampleRay;
          }

          cIn = frontColor * (invWavelength * krESun + kmESun);
          cOut = clamp(attenuate, 0.0, 1.0);
        }

        #ifdef MATERIAL_SUN_HIGH_QUALITY
          varyings.v_Vertex = -attributes.POSITION.xyz;
        #elif defined(MATERIAL_SUN_SIMPLE)
          varyings.v_RayDir = -eyeRay;
        #else
          varyings.v_SkyGroundFactor = -eyeRay.y / SKY_GROUND_THRESHOLD;
        #endif

        varyings.v_GroundColor = material_Exposure * (cIn + COLOR_2_LINEAR(material_GroundTint) * cOut);
        varyings.v_SkyColor = material_Exposure * (cIn * getRayleighPhase(-scene_SunlightDirection, -eyeRay));

        float lightColorIntensity = clamp(length(scene_SunlightColor.xyz), 0.25, 1.0);

        #ifdef MATERIAL_SUN_HIGH_QUALITY
          varyings.v_SunColor = HDSundiskIntensityFactor * clamp(cOut, 0.0, 1.0) * scene_SunlightColor.xyz / lightColorIntensity;
        #elif defined(MATERIAL_SUN_SIMPLE)
          varyings.v_SunColor = simpleSundiskIntensityFactor * clamp(cOut * sunScale, 0.0, 1.0) * scene_SunlightColor.xyz / lightColorIntensity;
        #endif

        return varyings;
      }

      void SkyProceduralFragment(Varyings varyings) {
        vec3 col = vec3(0.0, 0.0, 0.0);

        #ifdef MATERIAL_SUN_HIGH_QUALITY
          vec3 ray = normalize(varyings.v_Vertex);
          float y = ray.y / SKY_GROUND_THRESHOLD;
        #elif defined(MATERIAL_SUN_SIMPLE)
          vec3 ray = varyings.v_RayDir;
          float y = ray.y / SKY_GROUND_THRESHOLD;
        #else
          float y = varyings.v_SkyGroundFactor;
        #endif

        col = mix(varyings.v_SkyColor, varyings.v_GroundColor, clamp(y, 0.0, 1.0));

        #if defined(MATERIAL_SUN_HIGH_QUALITY) || defined(MATERIAL_SUN_SIMPLE)
          if (y < 0.0)
            col += varyings.v_SunColor * calcSunAttenuation(-scene_SunlightDirection, -ray);
        #endif

        gl_FragColor = vec4(col, 1.0);
      }
    }
  }
}
