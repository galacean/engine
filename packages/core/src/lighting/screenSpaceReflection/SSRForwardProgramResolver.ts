import type { Engine } from "../../Engine";
import type { Material } from "../../material/Material";
import type { IShaderProgramResolver } from "../../RenderPipeline/RenderContext";
import { PipelineStage } from "../../RenderPipeline/enums/PipelineStage";
import type { BuiltinShaders } from "../../shader/BuiltinShaders";
import { ShaderMacro } from "../../shader/ShaderMacro";
import type { ShaderMacroCollection } from "../../shader/ShaderMacroCollection";
import type { ShaderPass } from "../../shader/ShaderPass";
import type { ShaderProgram } from "../../shader/ShaderProgram";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { SSRUtils } from "./SSRUtils";

/**
 * Resolves SSR-specific Forward/Receiver shader variants and caches texture-unit fallbacks.
 * Isolates SSR macro, packed-encoding, and PBR scalar-roughness pruning rules from generic `RenderQueue` and `RenderContext`.
 * @internal
 */
export class SSRForwardProgramResolver implements IShaderProgramResolver {
  private static readonly _ssrEnableMacro = ShaderMacro.getByName("CAMERA_ENABLE_SSR");
  private static readonly _ssrVerifyDepthMacro = ShaderMacro.getByName("CAMERA_SSR_VERIFY_RECEIVER_DEPTH");
  private static readonly _ssrBilateralMacro = ShaderMacro.getByName("CAMERA_SSR_BILATERAL_SAMPLE");
  private static readonly _ssrPackedDepthMacro = ShaderMacro.getByName("SSR_PACKED_DEPTH_RG8");
  private static readonly _ssrPackedNormalMacro = ShaderMacro.getByName("SSR_PACKED_NORMAL_OCT8");
  private static readonly _ssrPackedHDRMacro = ShaderMacro.getByName("SSR_PACKED_HDR_REINHARD");
  private static readonly _roughnessProp = ShaderProperty.getByName("material_Roughness");
  private static readonly _hasRoughnessTexMacro = ShaderMacro.getByName("MATERIAL_HAS_ROUGHNESS_METALLIC_TEXTURE");
  private static readonly _enableClearCoatMacro = ShaderMacro.getByName("MATERIAL_ENABLE_CLEAR_COAT");

  /** Whether Forward-stage SSR variant injection is active for the current camera. */
  forwardEnabled: boolean = false;
  /** Whether Forward sampling verifies receiver depth (e.g. when transparent receivers are present). */
  verifyReceiverDepth: boolean = false;
  /** Whether Forward sampling uses 4-tap bilateral reconstruction. */
  bilateralSample: boolean = false;
  /** Whether receiver depth uses packed RG8 encoding. */
  packedDepthRG8: boolean = false;
  /** Whether receiver normal+roughness uses packed Oct8 encoding. */
  packedNormalOct8: boolean = false;
  /** Whether SSR color output uses packed reversible Reinhard HDR encoding. */
  packedHDRReinhard: boolean = false;
  /** Active maximum roughness threshold for PBR receiver pruning. */
  maxRoughness: number = 0;

  static isReceiverEligible(material: Material, maxRoughness: number): boolean {
    if (material.screenSpaceReflectionIntensity <= 0) {
      return false;
    }
    const pbrShader = (material.engine.constructor as { _builtinShaders?: BuiltinShaders })._builtinShaders?.pbr;
    if (material.shader === pbrShader) {
      const shaderData = material.shaderData;
      const macros = shaderData._macroCollection;
      if (
        !macros.isEnable(SSRForwardProgramResolver._hasRoughnessTexMacro) &&
        !macros.isEnable(SSRForwardProgramResolver._enableClearCoatMacro)
      ) {
        const roughness = shaderData.getFloat(SSRForwardProgramResolver._roughnessProp);
        if (roughness !== undefined && roughness >= maxRoughness) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Reset all per-frame SSR variant flags.
   */
  reset(): void {
    this.forwardEnabled = false;
    this.verifyReceiverDepth = false;
    this.bilateralSample = false;
    this.packedDepthRG8 = false;
    this.packedNormalOct8 = false;
    this.packedHDRReinhard = false;
    this.maxRoughness = 0;
  }

  /**
   * Configure encoding flags for the pre-forward `SSRReceiver` pass (Forward SSR remains disabled until trace finishes).
   */
  configureReceiverEncoding(packedDepthRG8: boolean, packedNormalOct8: boolean, packedHDRReinhard: boolean): void {
    this.forwardEnabled = false;
    this.packedDepthRG8 = packedDepthRG8;
    this.packedNormalOct8 = packedNormalOct8;
    this.packedHDRReinhard = packedHDRReinhard;
  }

  /**
   * Configure all Forward-stage SSR variant flags atomically before the scene Forward pass.
   */
  configureForward(
    maxRoughness: number,
    bilateralSample: boolean,
    verifyReceiverDepth: boolean,
    packedDepthRG8: boolean,
    packedNormalOct8: boolean,
    packedHDRReinhard: boolean
  ): void {
    this.forwardEnabled = true;
    this.maxRoughness = maxRoughness;
    this.bilateralSample = bilateralSample;
    this.verifyReceiverDepth = verifyReceiverDepth;
    this.packedDepthRG8 = packedDepthRG8;
    this.packedNormalOct8 = packedNormalOct8;
    this.packedHDRReinhard = packedHDRReinhard;
  }

  resolveProgram(
    engine: Engine,
    shaderPass: ShaderPass,
    material: Material,
    compileMacros: ShaderMacroCollection,
    pipelineStageTagValue: string
  ): ShaderProgram {
    const isForwardStage = pipelineStageTagValue === PipelineStage.Forward;
    const isSSRReceiverStage = !isForwardStage && pipelineStageTagValue === PipelineStage.SSRReceiver;
    if ((!isForwardStage || !this.forwardEnabled) && !isSSRReceiverStage) {
      return shaderPass._getShaderProgram(engine, compileMacros);
    }

    const camSSRVerifyDepth = this.verifyReceiverDepth;
    const camSSRBilateral = this.bilateralSample;
    const camSSRPackedDepth = this.packedDepthRG8;
    const camSSRPackedNormal = this.packedNormalOct8;
    const camSSRPackedHDR = this.packedHDRReinhard;

    let allowSSRForElement = false;
    let useBilateral = false;
    let useVerifyDepth = false;

    if (isForwardStage) {
      allowSSRForElement = SSRForwardProgramResolver.isReceiverEligible(material, this.maxRoughness);
      const allowBilateral = material.screenSpaceReflectionBilateral !== false;
      useBilateral = allowSSRForElement && camSSRBilateral && allowBilateral;
      useVerifyDepth =
        allowSSRForElement && !useBilateral && (camSSRVerifyDepth || (camSSRBilateral && !allowBilateral));
      SSRUtils.setMacro(compileMacros, SSRForwardProgramResolver._ssrEnableMacro, allowSSRForElement);
      SSRUtils.setMacro(compileMacros, SSRForwardProgramResolver._ssrVerifyDepthMacro, useVerifyDepth);
      SSRUtils.setMacro(compileMacros, SSRForwardProgramResolver._ssrBilateralMacro, useBilateral);
      SSRUtils.setMacro(
        compileMacros,
        SSRForwardProgramResolver._ssrPackedDepthMacro,
        allowSSRForElement && camSSRPackedDepth && (useVerifyDepth || useBilateral)
      );
      SSRUtils.setMacro(
        compileMacros,
        SSRForwardProgramResolver._ssrPackedNormalMacro,
        allowSSRForElement && camSSRPackedNormal && useBilateral
      );
      SSRUtils.setMacro(
        compileMacros,
        SSRForwardProgramResolver._ssrPackedHDRMacro,
        allowSSRForElement && camSSRPackedHDR
      );
    } else {
      SSRUtils.setMacro(compileMacros, SSRForwardProgramResolver._ssrPackedDepthMacro, camSSRPackedDepth);
      SSRUtils.setMacro(compileMacros, SSRForwardProgramResolver._ssrPackedNormalMacro, camSSRPackedNormal);
    }

    let program = shaderPass._getShaderProgram(engine, compileMacros);
    if (allowSSRForElement) {
      const maxUnits = engine._hardwareRenderer.capability.maxFragmentTextureUnits;
      const cachedFallback =
        program._ssrFallbackMaxUnits === maxUnits
          ? camSSRVerifyDepth
            ? program._ssrFallbackVerify
            : program._ssrFallbackNoVerify
          : null;
      if (cachedFallback) {
        return cachedFallback;
      }
      if (!program.isValid || program.activeTextureCount > maxUnits) {
        const rejectedProgram = program;
        const level1Delta = camSSRVerifyDepth ? 1 : 2;
        const canTryLevel1 = useBilateral && (!program.isValid || program.activeTextureCount - level1Delta <= maxUnits);
        const canTryDropVerify =
          !useBilateral &&
          useVerifyDepth &&
          !camSSRVerifyDepth &&
          (!program.isValid || program.activeTextureCount - 1 <= maxUnits);
        if (canTryLevel1) {
          compileMacros.disable(SSRForwardProgramResolver._ssrBilateralMacro);
          compileMacros.disable(SSRForwardProgramResolver._ssrPackedNormalMacro);
          SSRUtils.setMacro(compileMacros, SSRForwardProgramResolver._ssrVerifyDepthMacro, camSSRVerifyDepth);
          SSRUtils.setMacro(
            compileMacros,
            SSRForwardProgramResolver._ssrPackedDepthMacro,
            camSSRPackedDepth && camSSRVerifyDepth
          );
          program = shaderPass._getShaderProgram(engine, compileMacros);
        } else if (canTryDropVerify) {
          compileMacros.disable(SSRForwardProgramResolver._ssrVerifyDepthMacro);
          compileMacros.disable(SSRForwardProgramResolver._ssrPackedDepthMacro);
          program = shaderPass._getShaderProgram(engine, compileMacros);
        }
        if (!program.isValid || program.activeTextureCount > maxUnits) {
          compileMacros.disable(SSRForwardProgramResolver._ssrEnableMacro);
          compileMacros.disable(SSRForwardProgramResolver._ssrVerifyDepthMacro);
          compileMacros.disable(SSRForwardProgramResolver._ssrBilateralMacro);
          compileMacros.disable(SSRForwardProgramResolver._ssrPackedDepthMacro);
          compileMacros.disable(SSRForwardProgramResolver._ssrPackedNormalMacro);
          compileMacros.disable(SSRForwardProgramResolver._ssrPackedHDRMacro);
          program = shaderPass._getShaderProgram(engine, compileMacros);
        }
        if (program.isValid && program !== rejectedProgram) {
          if (rejectedProgram._ssrFallbackMaxUnits !== maxUnits) {
            rejectedProgram._ssrFallbackVerify = null;
            rejectedProgram._ssrFallbackNoVerify = null;
            rejectedProgram._ssrFallbackMaxUnits = maxUnits;
          }
          if (camSSRVerifyDepth) {
            rejectedProgram._ssrFallbackVerify = program;
          } else {
            rejectedProgram._ssrFallbackNoVerify = program;
          }
        }
      }
    }

    return program;
  }
}
