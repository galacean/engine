import type { Primitive } from "../../graphic/Primitive";
import type { ShaderData } from "../../shader/ShaderData";
import type { Engine } from "../../Engine";
import type { Material } from "../../material/Material";
import type { RenderContextSSRState } from "../../RenderPipeline/RenderContext";
import { ShaderMacro } from "../../shader/ShaderMacro";
import type { ShaderMacroCollection } from "../../shader/ShaderMacroCollection";
import type { ShaderPass } from "../../shader/ShaderPass";
import type { ShaderProgram } from "../../shader/ShaderProgram";

/**
 * @internal
 * Resolves SSR shader macros and fragment texture-unit fallbacks for `RenderQueue`.
 */
export class SSRProgramResolver {
  private static readonly _ssrEnableMacro = ShaderMacro.getByName("CAMERA_ENABLE_SSR");
  private static readonly _ssrVerifyDepthMacro = ShaderMacro.getByName("CAMERA_SSR_VERIFY_RECEIVER_DEPTH");
  private static readonly _ssrBilateralMacro = ShaderMacro.getByName("CAMERA_SSR_BILATERAL_SAMPLE");
  private static readonly _ssrPackedDepthMacro = ShaderMacro.getByName("SSR_PACKED_DEPTH_RG8");
  private static readonly _ssrPackedNormalMacro = ShaderMacro.getByName("SSR_PACKED_NORMAL_OCT8");
  private static readonly _ssrPackedHDRMacro = ShaderMacro.getByName("SSR_PACKED_HDR_REINHARD");

  /**
   * Synchronize packed depth/normal macros for the `SSRReceiver` pipeline stage.
   */
  static applyReceiverStageMacros(compileMacros: ShaderMacroCollection, ssrState: RenderContextSSRState): void {
    SSRProgramResolver._syncMacro(compileMacros, SSRProgramResolver._ssrPackedDepthMacro, ssrState.packedDepthRG8);
    SSRProgramResolver._syncMacro(compileMacros, SSRProgramResolver._ssrPackedNormalMacro, ssrState.packedNormalOct8);
  }

  /**
   * Apply Forward SSR sampling macros and resolve a valid `ShaderProgram` within
   * `maxFragmentTextureUnits` using the 2-level fallback cache.
   */
  static resolveForwardProgram(
    engine: Engine,
    shaderPass: ShaderPass,
    material: Material,
    ssrState: RenderContextSSRState,
    compileMacros: ShaderMacroCollection,
    primitive: Primitive,
    rendererData: ShaderData,
    renderElementData?: ShaderData
  ): ShaderProgram {
    const camSSRVerifyDepth = ssrState.verifyReceiverDepth;
    const camSSRBilateral = ssrState.bilateralSample;
    const camSSRPackedDepth = ssrState.packedDepthRG8;
    const camSSRPackedNormal = ssrState.packedNormalOct8;
    const camSSRPackedHDR = ssrState.packedHDRReinhard;

    const allowBilateral = material.screenSpaceReflectionBilateral !== false;
    const useBilateral = camSSRBilateral && allowBilateral;
    const useVerifyDepth = !useBilateral && (camSSRVerifyDepth || (camSSRBilateral && !allowBilateral));

    SSRProgramResolver._syncMacro(compileMacros, SSRProgramResolver._ssrEnableMacro, true);
    SSRProgramResolver._syncMacro(compileMacros, SSRProgramResolver._ssrVerifyDepthMacro, useVerifyDepth);
    SSRProgramResolver._syncMacro(compileMacros, SSRProgramResolver._ssrBilateralMacro, useBilateral);
    SSRProgramResolver._syncMacro(
      compileMacros,
      SSRProgramResolver._ssrPackedDepthMacro,
      camSSRPackedDepth && (useVerifyDepth || useBilateral)
    );
    SSRProgramResolver._syncMacro(
      compileMacros,
      SSRProgramResolver._ssrPackedNormalMacro,
      camSSRPackedNormal && useBilateral
    );
    SSRProgramResolver._syncMacro(compileMacros, SSRProgramResolver._ssrPackedHDRMacro, camSSRPackedHDR);

    let program = shaderPass._getShaderProgram(
      engine,
      compileMacros,
      undefined,
      primitive,
      rendererData,
      material.shaderData,
      renderElementData
    );
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
        compileMacros.disable(SSRProgramResolver._ssrBilateralMacro);
        compileMacros.disable(SSRProgramResolver._ssrPackedNormalMacro);
        SSRProgramResolver._syncMacro(compileMacros, SSRProgramResolver._ssrVerifyDepthMacro, camSSRVerifyDepth);
        SSRProgramResolver._syncMacro(
          compileMacros,
          SSRProgramResolver._ssrPackedDepthMacro,
          camSSRPackedDepth && camSSRVerifyDepth
        );
        program = shaderPass._getShaderProgram(
          engine,
          compileMacros,
          undefined,
          primitive,
          rendererData,
          material.shaderData,
          renderElementData
        );
      } else if (canTryDropVerify) {
        compileMacros.disable(SSRProgramResolver._ssrVerifyDepthMacro);
        compileMacros.disable(SSRProgramResolver._ssrPackedDepthMacro);
        program = shaderPass._getShaderProgram(
          engine,
          compileMacros,
          undefined,
          primitive,
          rendererData,
          material.shaderData,
          renderElementData
        );
      }

      if (!program.isValid || program.activeTextureCount > maxUnits) {
        compileMacros.disable(SSRProgramResolver._ssrEnableMacro);
        compileMacros.disable(SSRProgramResolver._ssrVerifyDepthMacro);
        compileMacros.disable(SSRProgramResolver._ssrBilateralMacro);
        compileMacros.disable(SSRProgramResolver._ssrPackedDepthMacro);
        compileMacros.disable(SSRProgramResolver._ssrPackedNormalMacro);
        compileMacros.disable(SSRProgramResolver._ssrPackedHDRMacro);
        program = shaderPass._getShaderProgram(
          engine,
          compileMacros,
          undefined,
          primitive,
          rendererData,
          material.shaderData,
          renderElementData
        );
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
