// EWA splatting: each gaussian is a camera-facing quad whose screen-space ellipse comes from projecting the
// 3D covariance through the perspective Jacobian, shaded with a 2D gaussian falloff and composited back-to-
// front with straight-alpha "over". Follows the standard EWA / 3DGS formulation.
Shader "GaussianSplat" {
  SubShader "Default" {
    Pass "Forward" {
      DepthState = {
        WriteEnabled = false;
      }
      BlendState = {
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.SourceAlpha;
        DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
        SourceAlphaBlendFactor = BlendFactor.One;
        DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
      }
      RasterState = {
        CullMode = CullMode.Off;
      }
      RenderQueueType = Transparent;

      #include "ShaderLibrary/Common/Common.glsl"

      struct Attributes {
        vec2 CORNER;
        float SPLAT_INDEX;
      };

      struct Varyings {
        vec4 color;
        vec2 position;
      };

      mat4 renderer_ModelMat;
      mat4 camera_ViewMat;
      mat4 camera_ProjMat;

      sampler2D material_CenterTexture;
      sampler2D material_CovATexture;
      sampler2D material_CovBTexture;
      sampler2D material_ColorTexture;
      vec2 material_DataTextureSize;
      vec2 material_InvViewport;
      float material_KernelSize;

      #ifdef RENDERER_GS_SH
        sampler2D material_ShTexture;
        vec2 material_ShTextureSize;
        float material_ShTexelsPerSplat;
        vec3 material_CameraPosition;
      #endif

      #ifdef RENDERER_GS_MAGIC
        vec4 scene_ElapsedTime;
        float material_MagicStartTime;
        vec3 material_MagicCenter;
        float material_MagicRadius;
      #endif

      VertexShader = vert;
      FragmentShader = frag;

      mat3 gsTranspose(mat3 m) {
        return mat3(m[0][0], m[1][0], m[2][0], m[0][1], m[1][1], m[2][1], m[0][2], m[1][2], m[2][2]);
      }

      vec2 getDataUV(float index) {
        float w = material_DataTextureSize.x;
        float y = floor(index / w);
        float x = index - y * w;
        return vec2((x + 0.5) / w, (y + 0.5) / material_DataTextureSize.y);
      }

      #ifdef RENDERER_GS_MAGIC
        vec3 gsHash(vec3 p) {
          p = fract(p * 0.3183099 + 0.1);
          p *= 17.0;
          return fract(vec3(p.x * p.y * p.z, p.x + p.y * p.z, p.x * p.y + p.z));
        }

        // 3D value noise; per-splat continuous field used to add point-cloud wave motion during the reveal.
        vec3 gsNoise(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          vec3 n000 = gsHash(i + vec3(0.0, 0.0, 0.0));
          vec3 n100 = gsHash(i + vec3(1.0, 0.0, 0.0));
          vec3 n010 = gsHash(i + vec3(0.0, 1.0, 0.0));
          vec3 n110 = gsHash(i + vec3(1.0, 1.0, 0.0));
          vec3 n001 = gsHash(i + vec3(0.0, 0.0, 1.0));
          vec3 n101 = gsHash(i + vec3(1.0, 0.0, 1.0));
          vec3 n011 = gsHash(i + vec3(0.0, 1.0, 1.0));
          vec3 n111 = gsHash(i + vec3(1.0, 1.0, 1.0));
          vec3 x0 = mix(n000, n100, f.x);
          vec3 x1 = mix(n010, n110, f.x);
          vec3 x2 = mix(n001, n101, f.x);
          vec3 x3 = mix(n011, n111, f.x);
          vec3 y0 = mix(x0, x1, f.y);
          vec3 y1 = mix(x2, x3, f.y);
          return mix(y0, y1, f.z);
        }
      #endif

      #ifdef RENDERER_GS_SH
        #define SH_C1 0.4886025119029199
        #define SH_C2_0 1.0925484305920792
        #define SH_C2_1 -1.0925484305920792
        #define SH_C2_2 0.31539156525252005
        #define SH_C2_3 -1.0925484305920792
        #define SH_C2_4 0.5462742152960396
        #define SH_C3_0 -0.5900435899266435
        #define SH_C3_1 2.890611442640554
        #define SH_C3_2 -0.4570457994644658
        #define SH_C3_3 0.3731763325901154
        #define SH_C3_4 -0.4570457994644658
        #define SH_C3_5 1.445305721320277
        #define SH_C3_6 -0.5900435899266435
        const float SH_C0 = 0.28209479177387814;

        mat3 gsInverse(mat3 m) {
          float a00 = m[0][0], a01 = m[0][1], a02 = m[0][2];
          float a10 = m[1][0], a11 = m[1][1], a12 = m[1][2];
          float a20 = m[2][0], a21 = m[2][1], a22 = m[2][2];
          float b01 = a22 * a11 - a12 * a21;
          float b11 = -a22 * a10 + a12 * a20;
          float b21 = a21 * a10 - a11 * a20;
          float det = a00 * b01 + a01 * b11 + a02 * b21;
          return mat3(
            b01, -a22 * a01 + a02 * a21, a12 * a01 - a02 * a11,
            b11, a22 * a00 - a02 * a20, -a12 * a00 + a02 * a10,
            b21, -a21 * a00 + a01 * a20, a11 * a00 - a01 * a10
          ) / det;
        }

        vec3 gsShCoeff(float splatIndex, float k) {
          float index = splatIndex * material_ShTexelsPerSplat + k;
          float w = material_ShTextureSize.x;
          float y = floor(index / w);
          float x = index - y * w;
          return texture2D(material_ShTexture, vec2((x + 0.5) / w, (y + 0.5) / material_ShTextureSize.y)).rgb;
        }

        // Rebuild full 3DGS color from raw SH (coefficient 0 = DC) evaluated at a splat-local view direction.
        vec3 gsEvalSH(float splatIndex, vec3 dir) {
          vec3 sh[16];
          int n = int(material_ShTexelsPerSplat);
          for (int k = 0; k < 16; k++) {
            sh[k] = k < n ? gsShCoeff(splatIndex, float(k)) : vec3(0.0);
          }
          float x = dir.x, y = dir.y, z = dir.z;
          vec3 result = SH_C0 * sh[0];
          result += SH_C1 * (-y * sh[1] + z * sh[2] - x * sh[3]);
          float xx = x * x, yy = y * y, zz = z * z, xy = x * y, yz = y * z, xz = x * z;
          result += SH_C2_0 * xy * sh[4] + SH_C2_1 * yz * sh[5] + SH_C2_2 * (2.0 * zz - xx - yy) * sh[6] +
            SH_C2_3 * xz * sh[7] + SH_C2_4 * (xx - yy) * sh[8];
          result += SH_C3_0 * y * (3.0 * xx - yy) * sh[9] + SH_C3_1 * xy * z * sh[10] +
            SH_C3_2 * y * (4.0 * zz - xx - yy) * sh[11] + SH_C3_3 * z * (2.0 * zz - 3.0 * xx - 3.0 * yy) * sh[12] +
            SH_C3_4 * x * (4.0 * zz - xx - yy) * sh[13] + SH_C3_5 * z * (xx - yy) * sh[14] +
            SH_C3_6 * x * (xx - 3.0 * yy) * sh[15];
          return max(result + 0.5, vec3(0.0));
        }
      #endif

      Varyings vert(Attributes attr) {
        Varyings v;
        v.color = vec4(0.0);
        v.position = attr.CORNER;

        vec2 uv = getDataUV(attr.SPLAT_INDEX);
        vec4 center = texture2D(material_CenterTexture, uv);
        vec4 covA = texture2D(material_CovATexture, uv);
        vec4 covB = texture2D(material_CovBTexture, uv);
        v.color = texture2DSRGB(material_ColorTexture, uv);
        #ifdef RENDERER_GS_SH
          // dir in splat-local space so SH stays correct under node rotation.
          vec3 worldCenter = (renderer_ModelMat * vec4(center.xyz, 1.0)).xyz;
          vec3 dir = normalize(gsInverse(mat3(renderer_ModelMat)) * (worldCenter - material_CameraPosition));
          vec3 shColor = min(gsEvalSH(attr.SPLAT_INDEX, dir), 1.0);
          v.color.rgb = sRGBToLinear(vec4(shColor, 1.0)).rgb;
        #endif

        float magicShrink = 0.0;
        #ifdef RENDERER_GS_MAGIC
          // Spark's radial reveal — ported from Spark's shader capture. Sweep hand completes at t=2s
          // (revealFactor 0→1 over t ∈ [at, at+1] for each splat's angle); ring grows via smoothstep from 0
          // over animDuration=5s, then a 0.5s tail lets the ring pinch/glow fade. Constants that Spark hard-
          // codes for its 5-unit models (0.5 world border, 20/50 exp steepness) are re-expressed in radius-
          // normalized form so any asset scale gets the same look. Spark disables the whole reveal block by
          // regenerating its shader when the JS animation controller stops; our shader is static, so we
          // skip the block under a uniform-branch time gate for the same effect at ~zero GPU cost.
          float t = scene_ElapsedTime.x - material_MagicStartTime;
          float animDuration = 5.0;
          if (t < animDuration + 0.5) {
            vec3 localPos = center.xyz - material_MagicCenter;
            float distNorm = length(localPos.xz) / material_MagicRadius;
            // Spark hard-codes modelRad ≥ 5 so its ring (max = 5) always overshoots real splat distances.
            // Our modelRad = actual asset half-diagonal, so `l` can reach ~1 in normalized units. Multiply
            // by 1.2 so ring visibly overshoots by borderOffset+extra — otherwise outer splats keep gate
            // ~1 after animation ends and never stop rippling.
            float ring = smoothstep(0.0, animDuration, t) * 1.2;
            float borderOffset = 0.1;                                  // Spark 0.5 world at modelRad=5
            float b = abs(ring - distNorm - borderOffset);
            float sweep = atan(localPos.x, localPos.z) / 3.14159;
            float sweepAlpha = smoothstep(-0.5, 0.5, t - sweep - 0.5); // clockwise sweep hand
            float gate = smoothstep(ring - borderOffset, ring, distNorm + borderOffset);
            localPos *= 1.0 - 0.2 * exp(-100.0 * b);                   // Spark's ring-front pinch
            // gsNoise returns [0,1] (fract-based), which biases wave in +xyz and drifts the model centroid.
            // Spark's simpleNoise3 is Perlin-signed; centering by -0.5 restores zero-mean so displacements
            // cancel and the model stays put — only individual splats wobble.
            vec3 wave = gsNoise(localPos * (2.0 / material_MagicRadius) + t * 0.5) - vec3(0.5);
            center.xyz = material_MagicCenter + localPos + (0.2 * material_MagicRadius) * wave * gate;
            v.color.a *= sweepAlpha;
            float glow = exp(-100.0 * b) + exp(-50.0 * abs(t - sweep - 0.5)) * 0.5;
            v.color.rgb += vec3(glow);
            v.color.a += glow;
            magicShrink = gate;
          }
        #endif

        mat4 modelView = camera_ViewMat * renderer_ModelMat;
        vec4 camspace = modelView * vec4(center.xyz, 1.0);
        vec4 pos2d = camera_ProjMat * camspace;

        float bounds = 1.2 * pos2d.w;
        if (pos2d.z < -pos2d.w || pos2d.x < -bounds || pos2d.x > bounds || pos2d.y < -bounds || pos2d.y > bounds) {
          gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
          return v;
        }

        mat3 Vrk = mat3(
          covA.x, covA.y, covA.z,
          covA.y, covA.w, covB.x,
          covA.z, covB.x, covB.y
        );

        // Positive focal on our side; the projection matrix flips Y and we mirror the offset later.
        vec2 focal = 0.5 * abs(vec2(camera_ProjMat[0][0], camera_ProjMat[1][1])) / material_InvViewport;
        mat3 J = mat3(
          focal.x / camspace.z, 0.0, -(focal.x * camspace.x) / (camspace.z * camspace.z),
          0.0, focal.y / camspace.z, -(focal.y * camspace.y) / (camspace.z * camspace.z),
          0.0, 0.0, 0.0
        );
        mat3 T = gsTranspose(mat3(modelView)) * J;
        mat3 cov2d = gsTranspose(T) * Vrk * T;

        // Mip-Splatting (Yu et al. 2024): kernel dilation + alpha *= sqrt(detOrig/detBlur) preserves the
        // integrated energy of near-degenerate splats and kills their otherwise-visible streaks.
        float detOrig = cov2d[0][0] * cov2d[1][1] - cov2d[0][1] * cov2d[0][1];
        cov2d[0][0] += material_KernelSize;
        cov2d[1][1] += material_KernelSize;
        float detBlur = cov2d[0][0] * cov2d[1][1] - cov2d[0][1] * cov2d[0][1];
        v.color.a *= sqrt(max(0.0, detOrig / detBlur));

        // Hard cull post-compensation: linear HDR blend accumulates even 0.02*hundreds into visible haze.
        if (v.color.a < 0.02) {
          gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
          return v;
        }

        float mid = 0.5 * (cov2d[0][0] + cov2d[1][1]);
        float radius = length(vec2(0.5 * (cov2d[0][0] - cov2d[1][1]), cov2d[0][1]));
        float lambda1 = mid + radius + 0.0001;
        float lambda2 = mid - radius + 0.0001;
        if (lambda2 < 0.0) {
          gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
          return v;
        }
        vec2 diag = normalize(vec2(cov2d[0][1], lambda1 - cov2d[0][0]));
        float majorLen = min(sqrt(2.0 * lambda1), 512.0);
        float minorLen = min(sqrt(2.0 * lambda2), 512.0);
        // Post-projection version of Spark's mix(scales, 0.002, gate) — off-ring splats become ~2.5px dots.
        majorLen = mix(majorLen, 2.5, magicShrink);
        minorLen = mix(minorLen, 2.5, magicShrink);
        if (majorLen < 1.0 && minorLen < 1.0) {
          gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
          return v;
        }
        vec2 majorAxis = majorLen * diag;
        vec2 minorAxis = minorLen * vec2(diag.y, -diag.x);

        vec2 offset = (attr.CORNER.x * majorAxis + attr.CORNER.y * minorAxis) * material_InvViewport * pos2d.w;
        float ySign = camera_ProjMat[1][1] < 0.0 ? -1.0 : 1.0;
        gl_Position = vec4(pos2d.x + offset.x, pos2d.y + ySign * offset.y, pos2d.zw);
        return v;
      }

      void frag(Varyings v) {
        float A = -dot(v.position, v.position);
        if (A < -4.0) discard;
        float B = exp(A) * v.color.a;
        gl_FragColor = outputSRGBCorrection(vec4(v.color.rgb, B));
      }
    }
  }
}
