import type { Engine } from "../../Engine";
import type { Material } from "../../material/Material";
import type { RenderContext } from "../../RenderPipeline/RenderContext";
import type { BuiltinShaders } from "../../shader/BuiltinShaders";
import { ShaderMacro } from "../../shader/ShaderMacro";
import type { ShaderMacroCollection } from "../../shader/ShaderMacroCollection";
import type { ShaderPass } from "../../shader/ShaderPass";
import type { ShaderProgram } from "../../shader/ShaderProgram";
import { ShaderProperty } from "../../shader/ShaderProperty";

/**
 * Resolves SSR-specific Forward/Receiver shader variants and caches texture-unit fallbacks.
 * Isolates SSR macro and PBR scalar-roughness pruning rules from generic `RenderQueue`.
 * @internal
 */
export class SSRForwardProgramResolver {
  private static readonly _ssrEnableMacro = ShaderMacro.getByName("CAMERA_ENABLE_SSR");
  private static readonly _ssrVerifyDepthMacro = ShaderMacro.getByName("CAMERA_SSR_VERIFY_RECEIVER_DEPTH");
  private static readonly _ssrBilateralMacro = ShaderMacro.getByName("CAMERA_SSR_BILATERAL_SAMPLE");
  private static readonly _ssrPackedDepthMacro = ShaderMacro.getByName("SSR_PACKED_DEPTH_RG8");
  private static readonly _ssrPackedNormalMacro = ShaderMacro.getByName("SSR_PACKED_NORMAL_OCT8");
  private static readonly _ssrPackedHDRMacro = ShaderMacro.getByName("SSR_PACKED_HDR_REINHARD");
  private static readonly _roughnessProp = ShaderProperty.getByName("material_Roughness");
  private static readonly _hasRoughnessTexMacro = ShaderMacro.getByName("MATERIAL_HAS_ROUGHNESS_METALLIC_TEXTURE");
  private static readonly _enableClearCoatMacro = ShaderMacro.getByName("MATERIAL_ENABLE_CLEAR_COAT");

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

  static resolveProgram(
    engine: Engine,
    context: RenderContext,
    shaderPass: ShaderPass,
    material: Material,
    compileMacros: ShaderMacroCollection,
    isForwardStage: boolean,
    isSSRReceiverStage: boolean
  ): ShaderProgram {
    const camSSRVerifyDepth = context.ssrVerifyReceiverDepth;
    const camSSRBilateral = context.ssrBilateralSample;
    const camSSRPackedDepth = context.ssrPackedDepthRG8;
    const camSSRPackedNormal = context.ssrPackedNormalOct8;
    const camSSRPackedHDR = context.ssrPackedHDRReinhard;

    let allowSSRForElement = false;
    let useBilateral = false;
    let useVerifyDepth = false;

    if (isForwardStage) {
      allowSSRForElement =
        context.ssrForwardEnabled && SSRForwardProgramResolver.isReceiverEligible(material, context.ssrMaxRoughness);
      const allowBilateral = material.screenSpaceReflectionBilateral !== false;
      useBilateral = allowSSRForElement && camSSRBilateral && allowBilateral;
      useVerifyDepth =
        allowSSRForElement && !useBilateral && (camSSRVerifyDepth || (camSSRBilateral && !allowBilateral));
      SSRForwardProgramResolver._syncMacro(
        compileMacros,
        SSRForwardProgramResolver._ssrEnableMacro,
        allowSSRForElement
      );
      SSRForwardProgramResolver._syncMacro(
        compileMacros,
        SSRForwardProgramResolver._ssrVerifyDepthMacro,
        useVerifyDepth
      );
      SSRForwardProgramResolver._syncMacro(compileMacros, SSRForwardProgramResolver._ssrBilateralMacro, useBilateral);
      SSRForwardProgramResolver._syncMacro(
        compileMacros,
        SSRForwardProgramResolver._ssrPackedDepthMacro,
        allowSSRForElement && camSSRPackedDepth && (useVerifyDepth || useBilateral)
      );
      SSRForwardProgramResolver._syncMacro(
        compileMacros,
        SSRForwardProgramResolver._ssrPackedNormalMacro,
        allowSSRForElement && camSSRPackedNormal && useBilateral
      );
      SSRForwardProgramResolver._syncMacro(
        compileMacros,
        SSRForwardProgramResolver._ssrPackedHDRMacro,
        allowSSRForElement && camSSRPackedHDR
      );
    } else if (isSSRReceiverStage) {
      SSRForwardProgramResolver._syncMacro(
        compileMacros,
        SSRForwardProgramResolver._ssrPackedDepthMacro,
        camSSRPackedDepth
      );
      SSRForwardProgramResolver._syncMacro(
        compileMacros,
        SSRForwardProgramResolver._ssrPackedNormalMacro,
        camSSRPackedNormal
      );
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
          SSRForwardProgramResolver._syncMacro(
            compileMacros,
            SSRForwardProgramResolver._ssrVerifyDepthMacro,
            camSSRVerifyDepth
          );
          SSRForwardProgramResolver._syncMacro(
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

  private static _syncMacro(collection: ShaderMacroCollection, macro: ShaderMacro, enabled: boolean): void {
    if (enabled) {
      collection.enable(macro);
    } else {
      collection.disable(macro);
    }
  }
}
