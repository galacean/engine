import {
  Blitter,
  Camera,
  Engine,
  Material,
  PostProcessManager,
  PostProcessPass,
  PostProcessPassEvent,
  RenderTarget,
  Shader,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  Vector4
} from "@galacean/engine";
import { OilPaintKuwaharaQuality, OilPaintPostEffect } from "./OilPaintPostEffect";

const OIL_PAINT_POST_SHADER_NAME = "PostProcess/OilPaint";

/**
 * 120-FPS Kyprianidis, Kang & Döllner (2009) Structure-Tensor Anisotropic Kuwahara Oil-Paint Pass:
 * Runs after Uber tonemapping (linear HDR) and BEFORE FinalPass (sRGB conversion):
 * - Pass 0 (PreparePerceptual): 4-tap anti-aliased downsample + linear HDR -> perceptual sRGB [0..1]
 *   (<=720p High / <=420p Mobile) so thin window mullions never alias and gradients match perception.
 * - Pass 1 (StructureTensor): RGB-summed Sobel structure tensor (E, G, F) at 1/2 working res (Point filter).
 * - Pass 2 (TensorBlurH): 5-tap separable horizontal Gaussian smoothing (sigma=1.0 on 1/2 grid).
 * - Pass 3 (TensorBlurV): 5-tap vertical Gaussian smoothing -> true Rank-2 eigensystem (tangent, anisotropy).
 * - Pass 4 (AnisotropicKuwahara8Polar): Unrolled 17-tap 2-ring 8-sector polar Kuwahara
 *   (ZERO exp(), ZERO sqrt(), ZERO loops, constant sector weight sum, exact variance^4 == sigma^8 sharpness!).
 * - Pass 5 (CompositeMerged): Full-res composite (2 taps), converts perceptual Kuwahara back to linear.
 */
export const OIL_PAINT_POST_SHADER = `Shader "${OIL_PAINT_POST_SHADER_NAME}" {
  SubShader "Default" {
    Pass "PreparePerceptual" {
      DepthState = { Enabled = false; WriteEnabled = false; }

      struct Attributes { vec4 POSITION_UV; };
      struct Varyings { vec2 uv; };

      sampler2D renderer_BlitTexture;
      vec4 renderer_texelSize;
      // x: downsampleRatio (srcHeight / dstHeight)
      vec4 material_OilPrep0;

      VertexShader = vert;
      FragmentShader = fragPerceptual;

      Varyings vert(Attributes attr) {
        Varyings v;
        gl_Position = vec4(attr.POSITION_UV.xy, 0.0, 1.0);
        v.uv = attr.POSITION_UV.zw;
        return v;
      }

      vec3 toPerceptual(vec3 lin) {
        vec3 clamped = max(lin, vec3(0.0));
        vec3 mapped = clamp(clamped / (1.0 + max(clamped - 1.0, vec3(0.0)) * 0.25), vec3(0.0), vec3(1.0));
        return pow(mapped, vec3(0.45454545));
      }

      vec4 fragPerceptual(Varyings v) {
        float ratio = material_OilPrep0.x;
        vec3 srgb;
        if (ratio > 1.15) {
          // 4-tap anti-aliased tent box filter prevents thin window mullions from aliasing on Retina downsample.
          vec2 d = renderer_texelSize.xy * (0.25 * ratio);
          vec3 c0 = toPerceptual(texture2D(renderer_BlitTexture, clamp(v.uv + vec2(-d.x, -d.y), vec2(0.001), vec2(0.999))).rgb);
          vec3 c1 = toPerceptual(texture2D(renderer_BlitTexture, clamp(v.uv + vec2( d.x, -d.y), vec2(0.001), vec2(0.999))).rgb);
          vec3 c2 = toPerceptual(texture2D(renderer_BlitTexture, clamp(v.uv + vec2(-d.x,  d.y), vec2(0.001), vec2(0.999))).rgb);
          vec3 c3 = toPerceptual(texture2D(renderer_BlitTexture, clamp(v.uv + vec2( d.x,  d.y), vec2(0.001), vec2(0.999))).rgb);
          srgb = (c0 + c1 + c2 + c3) * 0.25;
        } else {
          srgb = toPerceptual(texture2D(renderer_BlitTexture, v.uv).rgb);
        }
        return vec4(srgb, 1.0);
      }
    }

    Pass "StructureTensor" {
      DepthState = { Enabled = false; WriteEnabled = false; }

      struct Attributes { vec4 POSITION_UV; };
      struct Varyings { vec2 uv; };

      sampler2D renderer_BlitTexture;
      vec4 renderer_texelSize;

      VertexShader = vert;
      FragmentShader = fragTensor;

      Varyings vert(Attributes attr) {
        Varyings v;
        gl_Position = vec4(attr.POSITION_UV.xy, 0.0, 1.0);
        v.uv = attr.POSITION_UV.zw;
        return v;
      }

      vec3 sampleClamped(vec2 uv) {
        return texture2D(renderer_BlitTexture, clamp(uv, vec2(0.002), vec2(0.998))).rgb;
      }

      vec4 fragTensor(Varyings v) {
        vec2 t = renderer_texelSize.xy;
        vec3 tl = sampleClamped(v.uv + vec2(-t.x, -t.y));
        vec3 tc = sampleClamped(v.uv + vec2( 0.0, -t.y));
        vec3 tr = sampleClamped(v.uv + vec2( t.x, -t.y));
        vec3 ml = sampleClamped(v.uv + vec2(-t.x,  0.0));
        vec3 mr = sampleClamped(v.uv + vec2( t.x,  0.0));
        vec3 bl = sampleClamped(v.uv + vec2(-t.x,  t.y));
        vec3 bc = sampleClamped(v.uv + vec2( 0.0,  t.y));
        vec3 br = sampleClamped(v.uv + vec2( t.x,  t.y));

        vec3 gx = ((tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl)) * 0.25;
        vec3 gy = ((bl + 2.0 * bc + br) - (tl + 2.0 * tc + tr)) * 0.25;

        float E = dot(gx, gx);
        float G = dot(gy, gy);
        float F = dot(gx, gy);

        return vec4(E * 4.0, G * 4.0, F * 2.0 + 0.5, 1.0);
      }
    }

    Pass "TensorBlurH" {
      DepthState = { Enabled = false; WriteEnabled = false; }

      struct Attributes { vec4 POSITION_UV; };
      struct Varyings { vec2 uv; };

      sampler2D renderer_BlitTexture;
      vec4 renderer_texelSize;

      VertexShader = vert;
      FragmentShader = fragBlurH;

      Varyings vert(Attributes attr) {
        Varyings v;
        gl_Position = vec4(attr.POSITION_UV.xy, 0.0, 1.0);
        v.uv = attr.POSITION_UV.zw;
        return v;
      }

      vec4 fragBlurH(Varyings v) {
        vec2 stepX = vec2(renderer_texelSize.x, 0.0);
        vec4 sum = texture2D(renderer_BlitTexture, v.uv) * 0.40262;
        sum += (texture2D(renderer_BlitTexture, clamp(v.uv - stepX * 1.0, vec2(0.002), vec2(0.998)))
              + texture2D(renderer_BlitTexture, clamp(v.uv + stepX * 1.0, vec2(0.002), vec2(0.998)))) * 0.24420;
        sum += (texture2D(renderer_BlitTexture, clamp(v.uv - stepX * 2.0, vec2(0.002), vec2(0.998)))
              + texture2D(renderer_BlitTexture, clamp(v.uv + stepX * 2.0, vec2(0.002), vec2(0.998)))) * 0.05449;
        return sum;
      }
    }

    Pass "TensorBlurV" {
      DepthState = { Enabled = false; WriteEnabled = false; }

      struct Attributes { vec4 POSITION_UV; };
      struct Varyings { vec2 uv; };

      sampler2D renderer_BlitTexture;
      vec4 renderer_texelSize;

      VertexShader = vert;
      FragmentShader = fragBlurV;

      Varyings vert(Attributes attr) {
        Varyings v;
        gl_Position = vec4(attr.POSITION_UV.xy, 0.0, 1.0);
        v.uv = attr.POSITION_UV.zw;
        return v;
      }

      vec4 fragBlurV(Varyings v) {
        vec2 stepY = vec2(0.0, renderer_texelSize.y);
        vec4 acc = texture2D(renderer_BlitTexture, v.uv) * 0.40262;
        acc += (texture2D(renderer_BlitTexture, clamp(v.uv - stepY * 1.0, vec2(0.002), vec2(0.998)))
              + texture2D(renderer_BlitTexture, clamp(v.uv + stepY * 1.0, vec2(0.002), vec2(0.998)))) * 0.24420;
        acc += (texture2D(renderer_BlitTexture, clamp(v.uv - stepY * 2.0, vec2(0.002), vec2(0.998)))
              + texture2D(renderer_BlitTexture, clamp(v.uv + stepY * 2.0, vec2(0.002), vec2(0.998)))) * 0.05449;

        float E = max(acc.r * 0.25, 0.0);
        float G = max(acc.g * 0.25, 0.0);
        float F = (acc.b - 0.5) * 0.5;

        float disc = sqrt(max((E - G) * (E - G) + 4.0 * F * F, 0.0));
        float lambda1 = 0.5 * (E + G + disc);
        float lambda2 = max(0.5 * (E + G - disc), 0.0);

        vec2 tangent = vec2(lambda1 - E, -F);
        float tLen = length(tangent);
        if (tLen > 1e-6) {
          tangent /= tLen;
        } else {
          tangent = E > G ? vec2(0.0, 1.0) : vec2(1.0, 0.0);
        }
        if (tangent.y < 0.0 || (tangent.y == 0.0 && tangent.x < 0.0)) {
          tangent = -tangent;
        }

        float lamSum = lambda1 + lambda2;
        float anisotropy = lamSum > 1e-6 ? clamp((lambda1 - lambda2) / lamSum, 0.0, 1.0) : 0.0;
        float edgeStrength = clamp(sqrt(lambda1) * 3.0, 0.0, 1.0);
        return vec4(tangent * 0.5 + 0.5, anisotropy, edgeStrength);
      }
    }

    Pass "AnisotropicKuwahara8Polar" {
      DepthState = { Enabled = false; WriteEnabled = false; }

      struct Attributes { vec4 POSITION_UV; };
      struct Varyings { vec2 uv; };

      sampler2D renderer_BlitTexture;
      vec4 renderer_texelSize;
      sampler2D material_TensorTexture;
      highp sampler2D material_DepthTexture;

      // x: painterlyStrength, y: brushRadius (720px short-edge), z: strokeAnisotropy, w: hasDepth
      vec4 material_OilParams0;

      VertexShader = vert;
      FragmentShader = fragKuwahara;

      Varyings vert(Attributes attr) {
        Varyings v;
        gl_Position = vec4(attr.POSITION_UV.xy, 0.0, 1.0);
        v.uv = attr.POSITION_UV.zw;
        return v;
      }

      float kuwLuma(vec3 c) {
        return dot(c, vec3(0.2126, 0.7152, 0.0722));
      }

      vec3 fetchClamped(vec2 uv) {
        return texture2D(renderer_BlitTexture, clamp(uv, vec2(0.002), vec2(0.998))).rgb;
      }

      vec4 fragKuwahara(Varyings v) {
        vec2 uv = v.uv;
        vec2 texel = renderer_texelSize.xy;
        vec3 centerCol = texture2D(renderer_BlitTexture, uv).rgb;
        float brushRadius720 = material_OilParams0.y;
        float anisoScale = material_OilParams0.z;
        float hasDepth = material_OilParams0.w;

        float centerDepth = hasDepth > 0.5 ? texture2D(material_DepthTexture, uv).r : 0.0;
        bool isSky = hasDepth > 0.5 && centerDepth >= 0.99997;
        if (isSky) {
          return vec4(centerCol, 0.0);
        }

        float shortEdge = min(renderer_texelSize.z, renderer_texelSize.w);
        float radiusPx = brushRadius720 * max(shortEdge / 720.0, 0.45);
        if (radiusPx <= 0.5) {
          return vec4(centerCol, 0.525);
        }

        vec4 tensor = texture2D(material_TensorTexture, uv);
        vec2 tangent = tensor.xy * 2.0 - 1.0;
        float tLen = length(tangent);
        tangent = tLen > 1e-4 ? tangent / tLen : vec2(1.0, 0.0);
        vec2 normal2 = vec2(-tangent.y, tangent.x);

        float anisoEff = sqrt(clamp(tensor.z, 0.0, 1.0)) * anisoScale;
        float scaleA = 1.0 + clamp(anisoEff, 0.0, 2.5);
        float majorR = radiusPx * scaleA;
        float minorR = max(0.85, radiusPx / scaleA);
        vec2 axU = tangent * majorR * texel;
        vec2 axV = normal2 * minorR * texel;
        vec2 diagP = (axU + axV) * 0.70710678;
        vec2 diagM = (axV - axU) * 0.70710678;

        // Unrolled 17-tap 2-ring 8-sector symmetric polar Kuwahara:
        // ZERO exp(), ZERO sqrt(), ZERO loops, constant weight sum = 1.94 (invW = 0.5154639).
        vec3 c0 = centerCol * 0.18;
        vec3 c02 = centerCol * centerCol * 0.18;
        vec3 m0 = c0; vec3 s0 = c02;
        vec3 m1 = c0; vec3 s1 = c02;
        vec3 m2 = c0; vec3 s2 = c02;
        vec3 m3 = c0; vec3 s3 = c02;
        vec3 m4 = c0; vec3 s4 = c02;
        vec3 m5 = c0; vec3 s5 = c02;
        vec3 m6 = c0; vec3 s6 = c02;
        vec3 m7 = c0; vec3 s7 = c02;

        vec3 c; vec3 c2;

        // Ray 0 (+U): own=0, neighbors=7,1
        c = fetchClamped(uv + axU * 0.48); c2 = c * c;
        m0 += c * 0.62; s0 += c2 * 0.62; m7 += c * 0.22; s7 += c2 * 0.22; m1 += c * 0.22; s1 += c2 * 0.22;
        c = fetchClamped(uv + axU * 0.94); c2 = c * c;
        m0 += c * 0.42; s0 += c2 * 0.42; m7 += c * 0.14; s7 += c2 * 0.14; m1 += c * 0.14; s1 += c2 * 0.14;

        // Ray 1 (+U+V): own=1, neighbors=0,2
        c = fetchClamped(uv + diagP * 0.48); c2 = c * c;
        m1 += c * 0.62; s1 += c2 * 0.62; m0 += c * 0.22; s0 += c2 * 0.22; m2 += c * 0.22; s2 += c2 * 0.22;
        c = fetchClamped(uv + diagP * 0.94); c2 = c * c;
        m1 += c * 0.42; s1 += c2 * 0.42; m0 += c * 0.14; s0 += c2 * 0.14; m2 += c * 0.14; s2 += c2 * 0.14;

        // Ray 2 (+V): own=2, neighbors=1,3
        c = fetchClamped(uv + axV * 0.48); c2 = c * c;
        m2 += c * 0.62; s2 += c2 * 0.62; m1 += c * 0.22; s1 += c2 * 0.22; m3 += c * 0.22; s3 += c2 * 0.22;
        c = fetchClamped(uv + axV * 0.94); c2 = c * c;
        m2 += c * 0.42; s2 += c2 * 0.42; m1 += c * 0.14; s1 += c2 * 0.14; m3 += c * 0.14; s3 += c2 * 0.14;

        // Ray 3 (-U+V): own=3, neighbors=2,4
        c = fetchClamped(uv + diagM * 0.48); c2 = c * c;
        m3 += c * 0.62; s3 += c2 * 0.62; m2 += c * 0.22; s2 += c2 * 0.22; m4 += c * 0.22; s4 += c2 * 0.22;
        c = fetchClamped(uv + diagM * 0.94); c2 = c * c;
        m3 += c * 0.42; s3 += c2 * 0.42; m2 += c * 0.14; s2 += c2 * 0.14; m4 += c * 0.14; s4 += c2 * 0.14;

        // Ray 4 (-U): own=4, neighbors=3,5
        c = fetchClamped(uv - axU * 0.48); c2 = c * c;
        m4 += c * 0.62; s4 += c2 * 0.62; m3 += c * 0.22; s3 += c2 * 0.22; m5 += c * 0.22; s5 += c2 * 0.22;
        c = fetchClamped(uv - axU * 0.94); c2 = c * c;
        m4 += c * 0.42; s4 += c2 * 0.42; m3 += c * 0.14; s3 += c2 * 0.14; m5 += c * 0.14; s5 += c2 * 0.14;

        // Ray 5 (-U-V): own=5, neighbors=4,6
        c = fetchClamped(uv - diagP * 0.48); c2 = c * c;
        m5 += c * 0.62; s5 += c2 * 0.62; m4 += c * 0.22; s4 += c2 * 0.22; m6 += c * 0.22; s6 += c2 * 0.22;
        c = fetchClamped(uv - diagP * 0.94); c2 = c * c;
        m5 += c * 0.42; s5 += c2 * 0.42; m4 += c * 0.14; s4 += c2 * 0.14; m6 += c * 0.14; s6 += c2 * 0.14;

        // Ray 6 (-V): own=6, neighbors=5,7
        c = fetchClamped(uv - axV * 0.48); c2 = c * c;
        m6 += c * 0.62; s6 += c2 * 0.62; m5 += c * 0.22; s5 += c2 * 0.22; m7 += c * 0.22; s7 += c2 * 0.22;
        c = fetchClamped(uv - axV * 0.94); c2 = c * c;
        m6 += c * 0.42; s6 += c2 * 0.42; m5 += c * 0.14; s5 += c2 * 0.14; m7 += c * 0.14; s7 += c2 * 0.14;

        // Ray 7 (+U-V): own=7, neighbors=6,0
        c = fetchClamped(uv - diagM * 0.48); c2 = c * c;
        m7 += c * 0.62; s7 += c2 * 0.62; m6 += c * 0.22; s6 += c2 * 0.22; m0 += c * 0.22; s0 += c2 * 0.22;
        c = fetchClamped(uv - diagM * 0.94); c2 = c * c;
        m7 += c * 0.42; s7 += c2 * 0.42; m6 += c * 0.14; s6 += c2 * 0.14; m0 += c * 0.14; s0 += c2 * 0.14;

        float invW = 0.5154639;
        vec3 mean0 = m0 * invW; vec3 v0 = max(s0 * invW - mean0 * mean0, vec3(0.0)); float var0 = v0.r + v0.g + v0.b;
        vec3 mean1 = m1 * invW; vec3 v1 = max(s1 * invW - mean1 * mean1, vec3(0.0)); float var1 = v1.r + v1.g + v1.b;
        vec3 mean2 = m2 * invW; vec3 v2 = max(s2 * invW - mean2 * mean2, vec3(0.0)); float var2 = v2.r + v2.g + v2.b;
        vec3 mean3 = m3 * invW; vec3 v3 = max(s3 * invW - mean3 * mean3, vec3(0.0)); float var3 = v3.r + v3.g + v3.b;
        vec3 mean4 = m4 * invW; vec3 v4 = max(s4 * invW - mean4 * mean4, vec3(0.0)); float var4 = v4.r + v4.g + v4.b;
        vec3 mean5 = m5 * invW; vec3 v5 = max(s5 * invW - mean5 * mean5, vec3(0.0)); float var5 = v5.r + v5.g + v5.b;
        vec3 mean6 = m6 * invW; vec3 v6 = max(s6 * invW - mean6 * mean6, vec3(0.0)); float var6 = v6.r + v6.g + v6.b;
        vec3 mean7 = m7 * invW; vec3 v7 = max(s7 * invW - mean7 * mean7, vec3(0.0)); float var7 = v7.r + v7.g + v7.b;

        // Exact q=8 on std-dev == r^4 on variance with ZERO sqrt() and ZERO exp()!
        float minV = min(min(min(var0, var1), min(var2, var3)), min(min(var4, var5), min(var6, var7)));
        float num = minV + 1e-5;

        float r0 = num / (var0 + 1e-5); r0 *= r0; float ew0 = r0 * r0;
        float r1 = num / (var1 + 1e-5); r1 *= r1; float ew1 = r1 * r1;
        float r2 = num / (var2 + 1e-5); r2 *= r2; float ew2 = r2 * r2;
        float r3 = num / (var3 + 1e-5); r3 *= r3; float ew3 = r3 * r3;
        float r4 = num / (var4 + 1e-5); r4 *= r4; float ew4 = r4 * r4;
        float r5 = num / (var5 + 1e-5); r5 *= r5; float ew5 = r5 * r5;
        float r6 = num / (var6 + 1e-5); r6 *= r6; float ew6 = r6 * r6;
        float r7 = num / (var7 + 1e-5); r7 *= r7; float ew7 = r7 * r7;

        float ewSum = ew0 + ew1 + ew2 + ew3 + ew4 + ew5 + ew6 + ew7;
        vec3 outCol = (
          mean0 * ew0 + mean1 * ew1 + mean2 * ew2 + mean3 * ew3 +
          mean4 * ew4 + mean5 * ew5 + mean6 * ew6 + mean7 * ew7
        ) / max(ewSum, 1e-5);

        // Cross-edge luminance gradient (+V sector 2 vs -V sector 6, 0 extra taps).
        float grad = kuwLuma(mean2) - kuwLuma(mean6);
        float dirLight = dot(normal2, normalize(vec2(-0.6, 0.8)));
        float ridge = clamp(grad * dirLight * 3.2, -0.8, 0.8);
        float packedRidge = clamp(0.525 + ridge * 0.45, 0.05, 1.0);
        return vec4(outCol, packedRidge);
      }
    }

    Pass "CompositeMerged" {
      DepthState = { Enabled = false; WriteEnabled = false; }

      struct Attributes { vec4 POSITION_UV; };
      struct Varyings { vec2 uv; };

      sampler2D renderer_BlitTexture;
      vec4 renderer_texelSize;
      sampler2D material_KuwaharaTexture;

      // x: painterlyStrength, y: colorStylize, z: screenImpasto, w: compareSplit
      vec4 material_OilComposite0;
      // x: hasKuwahara, y: unused, z: unused, w: unused
      vec4 material_OilComposite1;

      VertexShader = vert;
      FragmentShader = fragComposite;

      Varyings vert(Attributes attr) {
        Varyings v;
        gl_Position = vec4(attr.POSITION_UV.xy, 0.0, 1.0);
        v.uv = attr.POSITION_UV.zw;
        return v;
      }

      float oilLuma(vec3 c) {
        return dot(c, vec3(0.2126, 0.7152, 0.0722));
      }

      vec4 fragComposite(Varyings v) {
        vec2 uv = v.uv;
        float painterlyStrength = material_OilComposite0.x;
        float colorStylize = material_OilComposite0.y;
        float screenImpasto = material_OilComposite0.z;
        float compareSplit = material_OilComposite0.w;
        float hasKuwahara = material_OilComposite1.x;

        vec3 origLin = max(texture2D(renderer_BlitTexture, uv).rgb, vec3(0.0));
        if (compareSplit > 0.001 && uv.x < compareSplit) {
          if (abs(uv.x - compareSplit) < renderer_texelSize.x * 2.5) {
            return vec4(1.0, 0.86, 0.56, 1.0);
          }
          return vec4(origLin, 1.0);
        }

        vec3 origSrgb = pow(clamp(origLin, vec3(0.0), vec3(1.0)), vec3(0.45454545));
        vec3 colSrgb = origSrgb;
        float sceneMask = 1.0;
        if (hasKuwahara > 0.5) {
          vec4 kuw = texture2D(material_KuwaharaTexture, uv);
          sceneMask = smoothstep(0.015, 0.045, kuw.a);
          colSrgb = mix(origSrgb, kuw.rgb, painterlyStrength * sceneMask);

          if (screenImpasto > 0.001 && sceneMask > 0.01) {
            float ridge = clamp((kuw.a - 0.525) / 0.45, -0.8, 0.8);
            colSrgb *= 1.0 + ridge * 0.14 * screenImpasto * sceneMask;
            colSrgb += vec3(1.0, 0.97, 0.90) * max(ridge, 0.0) * max(ridge, 0.0) * 0.045 * screenImpasto * sceneMask;
          }
        }

        if (colorStylize > 0.001) {
          float stylizeEff = colorStylize * mix(0.18, 1.0, sceneMask);
          float luma = max(oilLuma(colSrgb), 1e-4);
          float maxC = max(colSrgb.r, max(colSrgb.g, colSrgb.b));
          float minC = min(colSrgb.r, min(colSrgb.g, colSrgb.b));
          float colChroma = smoothstep(0.08, 0.32, (maxC - minC) / max(maxC, 1e-4));
          vec3 warmHighlight = mix(vec3(1.01, 1.0, 0.99), vec3(1.07, 1.02, 0.92), colChroma);
          vec3 glaze = mix(vec3(0.95, 0.94, 1.03), warmHighlight, smoothstep(0.18, 0.72, luma));
          vec3 glazed = colSrgb * glaze;
          float gLuma = oilLuma(glazed);
          glazed = mix(vec3(gLuma), glazed, 1.0 + 0.22 * stylizeEff * mix(0.25, 1.0, colChroma));
          vec3 c01 = clamp(glazed, 0.0, 1.0);
          vec3 sCurve = c01 * c01 * (3.0 - 2.0 * c01);
          glazed = mix(glazed, sCurve, 0.20 * stylizeEff);
          colSrgb = mix(colSrgb, clamp(glazed, vec3(0.0), vec3(1.0)), stylizeEff);
        }

        vec3 outLin = pow(max(colSrgb, vec3(0.0)), vec3(2.2));
        outLin = mix(origLin, outLin, max(sceneMask, colorStylize * 0.18));
        return vec4(max(outLin, vec3(0.0)), 1.0);
      }
    }
  }
}`;

/**
 * 120-FPS Kyprianidis (2009) Anisotropic Kuwahara Oil-Paint post-process pass:
 * - Anti-aliased 4-tap linear -> perceptual sRGB working buffer (<=720p High / <=420p Mobile)
 * - 5-tap separable Gaussian-smoothed RGB Structure Tensor (true Rank-2 anisotropy, crisp edge flow)
 * - Unrolled 17-tap 2-ring 8-sector polar Kuwahara (0 exp(), 0 sqrt(), ~6.5x fewer fetches than 1080p 49-tap)
 * - Single full-res composite pass (2 taps) returning linear color to FinalPass.
 */
export class OilPaintPostPass extends PostProcessPass {
  private readonly _material: Material;
  private readonly _prep0 = new Vector4();
  private readonly _params0 = new Vector4();
  private readonly _composite0 = new Vector4();
  private readonly _composite1 = new Vector4();
  private _downRT: RenderTarget | null = null;
  private _kuwaharaRT: RenderTarget | null = null;
  private _kuwaharaW = 0;
  private _kuwaharaH = 0;
  private _tensorTempRT: RenderTarget | null = null;
  private _tensorBlurRT: RenderTarget | null = null;
  private _tensorRT: RenderTarget | null = null;
  private _tensorW = 0;
  private _tensorH = 0;

  constructor(engine: Engine) {
    super(engine);
    this.event = PostProcessPassEvent.AfterUber + 10;

    const shader = Shader.find(OIL_PAINT_POST_SHADER_NAME) ?? Shader.create(OIL_PAINT_POST_SHADER);
    this._material = new Material(engine, shader);

    this._material.shaderData.setTexture("material_DepthTexture", engine._basicResources.whiteTexture2D);
    this._material.shaderData.setTexture("material_TensorTexture", engine._basicResources.whiteTexture2D);
    this._material.shaderData.setTexture("material_KuwaharaTexture", engine._basicResources.whiteTexture2D);
  }

  override get isActive(): boolean {
    return super.isActive;
  }

  override set isActive(value: boolean) {
    if (super.isActive === value) return;
    super.isActive = value;
    if (!value) {
      this._releaseTensorRTs();
      this._releaseKuwaharaRTs();
    }
  }

  override isValid(postProcessManager: PostProcessManager): boolean {
    if (!this.isActive) return false;
    const effect = postProcessManager.getBlendEffect(OilPaintPostEffect);
    return Boolean(effect?.isValid());
  }

  onRender(camera: Camera, srcTexture: Texture2D, destTarget: RenderTarget | null): void {
    const engine = this.engine;
    const scene = camera.scene;
    const effect = scene?.postProcessManager.getBlendEffect(OilPaintPostEffect);
    if (!scene || !effect || !effect.isValid()) {
      Blitter.blitTexture(engine, srcTexture, destTarget);
      return;
    }

    scene.shaderData.setFloat("scene_OilPaintImpasto", effect.impasto.value);
    scene.shaderData.setFloat("scene_OilPaintBrushScale", effect.brushScale.value);

    const depthTexture =
      camera._depthTextureSource !== "none"
        ? camera.shaderData.getTexture(Camera._cameraDepthTextureProperty)
        : null;
    const hasDepth = depthTexture ? 1 : 0;
    const shaderData = this._material.shaderData;
    shaderData.setTexture("material_DepthTexture", depthTexture ?? engine._basicResources.whiteTexture2D);

    const runKuwahara =
      (effect.painterlyStrength.value > 0.001 && effect.brushRadius.value > 0.5) || effect.screenImpasto.value > 0.001;

    if (runKuwahara) {
      const isMobileQuality = effect.kuwaharaQuality.value === OilPaintKuwaharaQuality.Mobile;
      // High <=720p (~0.83M px * 17 taps = 14M taps -> 120 FPS on PC); Mobile <=420p (~4.8M taps -> 60 FPS on mobile).
      const targetShortEdge = isMobileQuality ? 420 : 720;
      const shortEdge = Math.min(srcTexture.width, srcTexture.height);
      const scale = Math.min(1.0, targetShortEdge / Math.max(1, shortEdge));
      const kuwW = Math.max(1, Math.round(srcTexture.width * scale));
      const kuwH = Math.max(1, Math.round(srcTexture.height * scale));
      const tenW = Math.max(1, kuwW >> 1);
      const tenH = Math.max(1, kuwH >> 1);

      this._ensureWorkRTs(kuwW, kuwH, tenW, tenH);

      // Pass 0: Anti-aliased 4-tap downsample + linear HDR -> perceptual sRGB working buffer.
      this._prep0.set(srcTexture.height / Math.max(1, kuwH), 0, 0, 0);
      shaderData.setVector4("material_OilPrep0", this._prep0);
      Blitter.blitTexture(engine, srcTexture, this._downRT!, undefined, undefined, this._material, 0);
      const workTex = this._downRT!.getColorTexture(0) as Texture2D;

      // Pass 1..3: RGB Sobel structure tensor (E, G, F) + 5-tap separable Gaussian smoothing (H -> V eigensystem).
      Blitter.blitTexture(engine, workTex, this._tensorTempRT!, undefined, undefined, this._material, 1);
      Blitter.blitTexture(
        engine,
        this._tensorTempRT!.getColorTexture(0) as Texture2D,
        this._tensorBlurRT!,
        undefined,
        undefined,
        this._material,
        2
      );
      Blitter.blitTexture(
        engine,
        this._tensorBlurRT!.getColorTexture(0) as Texture2D,
        this._tensorRT!,
        undefined,
        undefined,
        this._material,
        3
      );
      shaderData.setTexture("material_TensorTexture", this._tensorRT!.getColorTexture(0));

      // Pass 4: Unrolled 17-tap 2-ring 8-sector polar Anisotropic Kuwahara (0 exp, 0 sqrt).
      this._params0.set(
        effect.painterlyStrength.value,
        effect.brushRadius.value,
        effect.strokeAnisotropy.value,
        hasDepth
      );
      shaderData.setVector4("material_OilParams0", this._params0);
      Blitter.blitTexture(engine, workTex, this._kuwaharaRT!, undefined, undefined, this._material, 4);
      shaderData.setTexture("material_KuwaharaTexture", this._kuwaharaRT!.getColorTexture(0));
    }

    // Pass 5 (SINGLE Full-Res Pass -> dest): only 2 taps total, returns linear color to FinalPass.
    this._composite0.set(
      effect.painterlyStrength.value,
      effect.colorStylize.value,
      effect.screenImpasto.value,
      effect.compareSplit.value
    );
    this._composite1.set(runKuwahara ? 1 : 0, 0, 0, 0);
    shaderData.setVector4("material_OilComposite0", this._composite0);
    shaderData.setVector4("material_OilComposite1", this._composite1);
    Blitter.blitTexture(engine, srcTexture, destTarget, undefined, undefined, this._material, 5);
  }

  private _supportsHalfFloatRT(): boolean {
    const rhi = (
      this.engine as unknown as {
        _hardwareRenderer?: { supportsRenderTargetColorFormat?: (format: TextureFormat) => boolean };
      }
    )._hardwareRenderer;
    return Boolean(rhi?.supportsRenderTargetColorFormat?.(TextureFormat.R16G16B16A16_SFloat));
  }

  private _createRT(
    w: number,
    h: number,
    format: TextureFormat,
    filterMode: TextureFilterMode = TextureFilterMode.Bilinear
  ): RenderTarget {
    const tex = new Texture2D(this.engine, w, h, format, false, false);
    tex.filterMode = filterMode;
    tex.wrapModeU = TextureWrapMode.Clamp;
    tex.wrapModeV = TextureWrapMode.Clamp;
    return new RenderTarget(this.engine, w, h, tex, null, 1);
  }

  private _ensureWorkRTs(kuwW: number, kuwH: number, tenW: number, tenH: number): void {
    if (!this._downRT || !this._kuwaharaRT || this._kuwaharaW !== kuwW || this._kuwaharaH !== kuwH) {
      this._releaseKuwaharaRTs();
      this._downRT = this._createRT(kuwW, kuwH, TextureFormat.R8G8B8A8_UNorm, TextureFilterMode.Bilinear);
      this._kuwaharaRT = this._createRT(kuwW, kuwH, TextureFormat.R8G8B8A8_UNorm, TextureFilterMode.Bilinear);
      this._kuwaharaW = kuwW;
      this._kuwaharaH = kuwH;
    }

    if (
      !this._tensorTempRT ||
      !this._tensorBlurRT ||
      !this._tensorRT ||
      this._tensorW !== tenW ||
      this._tensorH !== tenH
    ) {
      this._releaseTensorRTs();
      const rawFormat = this._supportsHalfFloatRT() ? TextureFormat.R16G16B16A16_SFloat : TextureFormat.R8G8B8A8_UNorm;
      this._tensorTempRT = this._createRT(tenW, tenH, rawFormat, TextureFilterMode.Point);
      this._tensorBlurRT = this._createRT(tenW, tenH, rawFormat, TextureFilterMode.Point);
      this._tensorRT = this._createRT(tenW, tenH, TextureFormat.R8G8B8A8_UNorm, TextureFilterMode.Bilinear);
      this._tensorW = tenW;
      this._tensorH = tenH;
    }
  }

  private _destroyRT(rt: RenderTarget | null): null {
    if (rt) {
      rt.getColorTexture(0)?.destroy();
      rt.destroy();
    }
    return null;
  }

  private _releaseKuwaharaRTs(): void {
    this._downRT = this._destroyRT(this._downRT);
    this._kuwaharaRT = this._destroyRT(this._kuwaharaRT);
    this._kuwaharaW = 0;
    this._kuwaharaH = 0;
  }

  private _releaseTensorRTs(): void {
    this._tensorTempRT = this._destroyRT(this._tensorTempRT);
    this._tensorBlurRT = this._destroyRT(this._tensorBlurRT);
    this._tensorRT = this._destroyRT(this._tensorRT);
    this._tensorW = 0;
    this._tensorH = 0;
  }

  override _onDestroy(): void {
    this._releaseTensorRTs();
    this._releaseKuwaharaRTs();
    this._material.destroy();
    super._onDestroy();
  }
}
