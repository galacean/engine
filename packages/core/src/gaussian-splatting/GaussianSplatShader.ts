import { Engine } from "../Engine";
import { Shader } from "../shader/Shader";

const name = "GaussianSplat";

// EWA splatting: each gaussian is drawn as a camera-facing quad whose screen-space ellipse comes from
// projecting the 3D covariance through the perspective Jacobian, shaded with a 2D gaussian falloff and
// composited back-to-front with straight-alpha "over". Follows the standard EWA / 3DGS formulation.
const source = `Shader "${name}" {
  SubShader "Default" {
    Pass "Forward" {
      RenderQueueType renderQueueType;
      BlendFactor sourceColorBlendFactor;
      BlendFactor destinationColorBlendFactor;
      BlendFactor sourceAlphaBlendFactor;
      BlendFactor destinationAlphaBlendFactor;
      CullMode rasterStateCullMode;
      Bool blendEnabled;
      Bool depthWriteEnabled;

      DepthState = {
        WriteEnabled = depthWriteEnabled;
      }
      BlendState = {
        Enabled = blendEnabled;
        SourceColorBlendFactor = sourceColorBlendFactor;
        DestinationColorBlendFactor = destinationColorBlendFactor;
        SourceAlphaBlendFactor = sourceAlphaBlendFactor;
        DestinationAlphaBlendFactor = destinationAlphaBlendFactor;
      }
      RasterState = {
        CullMode = rasterStateCullMode;
      }
      RenderQueueType = renderQueueType;

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

      VertexShader = vert;
      FragmentShader = frag;

      mat3 gsTranspose(mat3 m) {
        return mat3(m[0][0], m[1][0], m[2][0], m[0][1], m[1][1], m[2][1], m[0][2], m[1][2], m[2][2]);
      }

      // Mirror the engine's color management (ShaderLibrary/Common/Common.glsl) so splats blend in the same
      // space as every other material instead of floating outside it.
      float gsSRGBToLinear(float c) {
        return (c <= 0.04045) ? (c / 12.92) : pow((c + 0.055) / 1.055, 2.4);
      }
      float gsLinearToSRGB(float c) {
        c = max(c, 0.0);
        return (c <= 0.0031308) ? (c * 12.9232102) : (1.055 * pow(c, 1.0 / 2.4) - 0.055);
      }

      vec2 getDataUV(float index) {
        float w = material_DataTextureSize.x;
        float y = floor(index / w);
        float x = index - y * w;
        return vec2((x + 0.5) / w, (y + 0.5) / material_DataTextureSize.y);
      }

      #ifdef RENDERER_GS_SH
        // Standard 3DGS spherical-harmonic basis.
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

        // Rebuild the full 3DGS color from raw SH coefficients (coefficient 0 is the DC term) and view direction.
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
        // Covariance is stored half-float, normalized by center.w; restore it here.
        vec4 covA = texture2D(material_CovATexture, uv) * center.w;
        vec4 covB = texture2D(material_CovBTexture, uv) * center.w;
        // Color is an sRGB texture; the hardware linearizes it on read, except where sRGB textures are
        // unsupported (ENGINE_NO_SRGB) and we must do it ourselves. Covariance below stays linear.
        v.color = texture2D(material_ColorTexture, uv);
        #ifdef ENGINE_NO_SRGB
          v.color.rgb = vec3(gsSRGBToLinear(v.color.r), gsSRGBToLinear(v.color.g), gsSRGBToLinear(v.color.b));
        #endif
        #ifdef RENDERER_GS_SH
          // View direction in the splat's local frame (un-rotate by the model transform so SH stays correct under
          // node rotation), then rebuild the full color and match the DC path's sRGB->linear; opacity is kept.
          vec3 worldCenter = (renderer_ModelMat * vec4(center.xyz, 1.0)).xyz;
          vec3 dir = normalize(gsInverse(mat3(renderer_ModelMat)) * (worldCenter - material_CameraPosition));
          vec3 shColor = min(gsEvalSH(attr.SPLAT_INDEX, dir), 1.0);
          v.color.rgb = vec3(gsSRGBToLinear(shColor.r), gsSRGBToLinear(shColor.g), gsSRGBToLinear(shColor.b));
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

        // Positive focal: build the screen-space ellipse in the standard (Y-up) frame, then reflect Y at the end
        // to land in Galacean's Y-flipped offscreen target (the projection flips Y so camera_ProjMat[1][1] < 0).
        vec2 focal = 0.5 * abs(vec2(camera_ProjMat[0][0], camera_ProjMat[1][1])) / material_InvViewport;

        mat3 J = mat3(
          focal.x / camspace.z, 0.0, -(focal.x * camspace.x) / (camspace.z * camspace.z),
          0.0, focal.y / camspace.z, -(focal.y * camspace.y) / (camspace.z * camspace.z),
          0.0, 0.0, 0.0
        );
        mat3 T = gsTranspose(mat3(modelView)) * J;
        mat3 cov2d = gsTranspose(T) * Vrk * T;

        cov2d[0][0] += material_KernelSize;
        cov2d[1][1] += material_KernelSize;

        float mid = 0.5 * (cov2d[0][0] + cov2d[1][1]);
        float radius = length(vec2(0.5 * (cov2d[0][0] - cov2d[1][1]), cov2d[0][1]));
        float lambda1 = mid + radius + 0.0001;
        float lambda2 = mid - radius + 0.0001;
        if (lambda2 < 0.0) {
          gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
          return v;
        }

        vec2 diag = normalize(vec2(cov2d[0][1], lambda1 - cov2d[0][0]));
        vec2 majorAxis = min(sqrt(2.0 * lambda1), 1024.0) * diag;
        vec2 minorAxis = min(sqrt(2.0 * lambda2), 1024.0) * vec2(diag.y, -diag.x);

        vec2 offset = (attr.CORNER.x * majorAxis + attr.CORNER.y * minorAxis) * material_InvViewport * pos2d.w;
        // Reflect the offset's Y to match the already-flipped center in Galacean's Y-flipped offscreen target.
        float ySign = camera_ProjMat[1][1] < 0.0 ? -1.0 : 1.0;
        gl_Position = vec4(pos2d.x + offset.x, pos2d.y + ySign * offset.y, pos2d.zw);
        return v;
      }

      void frag(Varyings v) {
        float A = -dot(v.position, v.position);
        if (A < -4.0) discard;
        float B = exp(A) * v.color.a;
        vec3 rgb = v.color.rgb;
        // When the camera renders straight to the gamma screen, encode linear->sRGB so splats composite in the
        // same space as other materials; rendering to the linear internal target leaves the macro off (no-op).
        #ifdef ENGINE_OUTPUT_SRGB_CORRECT
          rgb = vec3(gsLinearToSRGB(rgb.r), gsLinearToSRGB(rgb.g), gsLinearToSRGB(rgb.b));
        #endif
        gl_FragColor = vec4(rgb, B);
      }
    }
  }
}`;

/**
 * Returns the shared `GaussianSplat` shader, compiling it from ShaderLab source on first use.
 * Requires the ShaderLab compiler to be enabled (`WebGLEngine.create({ shaderCompiler })`).
 */
export function getGaussianSplatShader(engine: Engine): Shader {
  return Shader.find(name) ?? Shader.create(source);
}
