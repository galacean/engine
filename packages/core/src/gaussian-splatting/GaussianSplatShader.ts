import { Engine } from "../Engine";
import { Shader } from "../shader/Shader";

const name = "GaussianSplat";

// EWA splatting: each gaussian is drawn as a camera-facing quad whose screen-space ellipse comes from
// projecting the 3D covariance through the perspective Jacobian, shaded with a 2D gaussian falloff and
// composited back-to-front with straight-alpha "over". Math mirrors BabylonJS's gaussianSplatting include.
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

      Varyings vert(Attributes attr) {
        Varyings v;
        v.color = vec4(0.0);
        v.position = attr.CORNER;

        vec2 uv = getDataUV(attr.SPLAT_INDEX);
        vec4 center = texture2D(material_CenterTexture, uv);
        // Covariance is stored half-float, normalized by center.w; restore it here.
        vec4 covA = texture2D(material_CovATexture, uv) * center.w;
        vec4 covB = texture2D(material_CovBTexture, uv) * center.w;
        v.color = texture2D(material_ColorTexture, uv);

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

        // Derive pixel focal length from the same projection the framebuffer renders with, so its Y sign
        // matches (Galacean flips projection Y when rendering to a texture). A mismatched focal Y sign mirrors
        // rotated splats' screen-space ellipse, producing spikes at certain view angles.
        vec2 focal = 0.5 * vec2(camera_ProjMat[0][0], camera_ProjMat[1][1]) / material_InvViewport;

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

        gl_Position = vec4(
          pos2d.xy + (attr.CORNER.x * majorAxis + attr.CORNER.y * minorAxis) * material_InvViewport * pos2d.w,
          pos2d.zw
        );
        return v;
      }

      void frag(Varyings v) {
        float A = -dot(v.position, v.position);
        if (A < -4.0) discard;
        float B = exp(A) * v.color.a;
        gl_FragColor = vec4(v.color.rgb, B);
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
