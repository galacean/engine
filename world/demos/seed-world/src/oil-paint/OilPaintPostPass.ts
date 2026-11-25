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
  Vector4
} from "@galacean/engine";
import { OilPaintPostEffect } from "./OilPaintPostEffect";

const OIL_PAINT_POST_SHADER_NAME = "PostProcess/OilPaint";

/**
 * Ultra-Lean 120-FPS Single-Pass, Zero-Extra-RT, Zero-DepthPrePass 5-Tap Oil Paint Post-Process Pass:
 * Runs 1:1 at native display resolution directly from `srcTexture` -> `destTarget` (+1 draw call total!):
 * - Paints ALL pixels including sky & clouds harmoniously (zero DepthPrePass overhead, zero sky/forest mismatch)
 * - 5 taps total (center + 20-deg rotated orthogonal arms leveraging HW bilinear filtering)
 * - ZERO sqrt() / pow() / exp() / divisions (0 SFU bottlenecks!)
 * - Scalar L1 4-quadrant spread + single winning-quadrant vec3 mean (~20 live registers -> max SIMD occupancy!)
 * - Zero-extra-tap scalar Laplacian thin-detail guard keeps 1-2px animal eyes, antlers & window mullions crisp.
 */
export const OIL_PAINT_POST_SHADER = `Shader "${OIL_PAINT_POST_SHADER_NAME}" {
  SubShader "Default" {
    Pass "OilPaintSinglePass" {
      DepthState = { Enabled = false; WriteEnabled = false; }

      struct Attributes { vec4 POSITION_UV; };
      struct Varyings { vec2 uv; };

      sampler2D renderer_BlitTexture;
      vec4 renderer_texelSize;

      // x: painterlyStrength, y: brushRadius (720px short-edge), z..w: unused
      vec4 material_OilParams0;

      VertexShader = vert;
      FragmentShader = fragOilPaint;

      Varyings vert(Attributes attr) {
        Varyings v;
        gl_Position = vec4(attr.POSITION_UV.xy, 0.0, 1.0);
        v.uv = attr.POSITION_UV.zw;
        return v;
      }

      vec4 fragOilPaint(Varyings v) {
        vec2 uv = v.uv;
        vec2 texel = renderer_texelSize.xy;
        float painterlyStrength = material_OilParams0.x;
        float brushRadius720 = material_OilParams0.y;

        vec3 c0 = texture2D(renderer_BlitTexture, uv).rgb;
        float shortEdge = min(renderer_texelSize.z, renderer_texelSize.w);
        vec2 r = texel * max(1.2, brushRadius720 * max(shortEdge * 0.0013889, 0.5) * 0.72);
        vec2 d0 = vec2( r.x * 0.94, -r.y * 0.34);
        vec2 d1 = vec2(-r.x * 0.34, -r.y * 0.94);

        vec3 c1 = texture2D(renderer_BlitTexture, uv + d0).rgb;
        vec3 c2 = texture2D(renderer_BlitTexture, uv + d1).rgb;
        vec3 c3 = texture2D(renderer_BlitTexture, uv - d0).rgb;
        vec3 c4 = texture2D(renderer_BlitTexture, uv - d1).rgb;

        // Scalar luma (0 sqrt, 0 divisions, 5 dots total)
        vec3 lumaW = vec3(0.2126, 0.7152, 0.0722);
        float l0 = dot(c0, lumaW);
        float l1 = dot(c1, lumaW);
        float l2 = dot(c2, lumaW);
        float l3 = dot(c3, lumaW);
        float l4 = dot(c4, lumaW);

        // 4-quadrant L1 spread (16 scalar ALU, 0 squares, 0 divisions, linear dark/bright fairness)
        float a1 = abs(l0 - l1);
        float a2 = abs(l0 - l2);
        float a3 = abs(l0 - l3);
        float a4 = abs(l0 - l4);

        float v0 = a1 + a2 + abs(l1 - l2);
        float v1 = a2 + a3 + abs(l2 - l3);
        float v2 = a3 + a4 + abs(l3 - l4);
        float v3 = a4 + a1 + abs(l4 - l1);

        // Zero-division winner selection: compute only ONE quadrant vec3 mean instead of four!
        float bestV = v0;
        vec3 wA = c1;
        vec3 wB = c2;
        if (v1 < bestV) { bestV = v1; wA = c2; wB = c3; }
        if (v2 < bestV) { bestV = v2; wA = c3; wB = c4; }
        if (v3 < bestV) { wA = c4; wB = c1; }

        vec3 kuw = (c0 * 0.5 + wA + wB) * 0.4;

        // Zero-extra-tap scalar Laplacian micro-detail guard (preserves 1-2px animal eyes & window mullions)
        float avgL = (l1 + l2 + l3 + l4) * 0.25;
        float thinGuard = 1.0 - clamp((abs(l0 - avgL) - 0.08) * 5.0, 0.0, 1.0);
        vec3 col = mix(c0, kuw, painterlyStrength * thinGuard);

        return vec4(col, 1.0);
      }
    }
  }
}`;

/**
 * Ultra-Lean 120-FPS Single-Pass, Zero-Extra-RT, Zero-DepthPrePass Oil-Paint post-process pass:
 * - Zero intermediate RenderTargets and zero DepthPrePass (paints sky & clouds seamlessly alongside 3D scene)
 * - 5-tap rotated 4-quadrant L1 Kuwahara with zero sqrt/divisions and low register footprint
 * - Scalar Laplacian thin-detail guard preserves animal eyes, antlers & diamond window mullions at native resolution.
 */
export class OilPaintPostPass extends PostProcessPass {
  private readonly _material: Material;
  private readonly _params0 = new Vector4();

  constructor(engine: Engine) {
    super(engine);
    this.event = PostProcessPassEvent.AfterUber + 10;

    const shader = Shader.find(OIL_PAINT_POST_SHADER_NAME) ?? Shader.create(OIL_PAINT_POST_SHADER);
    this._material = new Material(engine, shader);
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

    this._params0.set(effect.painterlyStrength.value, effect.brushRadius.value, 0, 0);

    this._material.shaderData.setVector4("material_OilParams0", this._params0);

    // Single direct native-res pass (0 extra RTs, +1 draw call total!).
    Blitter.blitTexture(engine, srcTexture, destTarget, undefined, undefined, this._material, 0);
  }

  override _onDestroy(): void {
    this._material.destroy();
    super._onDestroy();
  }
}
