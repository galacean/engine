import { DataObject } from "../../base/DataObject";
import { ShaderData } from "../ShaderData";
import { ShaderProperty } from "../ShaderProperty";
import { CompareFunction } from "../enums/CompareFunction";
import { RenderStateElementKey } from "../enums/RenderStateElementKey";
import { StencilOperation } from "../enums/StencilOperation";

/**
 * Stencil state.
 */
export class StencilState extends DataObject {
  /** Whether to enable stencil test. */
  enabled: boolean = false;
  /** Write the reference value of the stencil buffer. */
  referenceValue: number = 0;
  /** Specifying a bit-wise mask that is used to AND the reference value and the stored stencil value when the test is done. */
  mask: number = 0xff;
  /** Specifying a bit mask to enable or disable writing of individual bits in the stencil planes. */
  writeMask: number = 0xff;
  /** The comparison function of the reference value of the front face of the geometry and the current buffer storage value. */
  compareFunctionFront: CompareFunction = CompareFunction.Always;
  /** The comparison function of the reference value of the back of the geometry and the current buffer storage value. */
  compareFunctionBack: CompareFunction = CompareFunction.Always;
  /** specifying the function to use for front face when both the stencil test and the depth test pass. */
  passOperationFront: StencilOperation = StencilOperation.Keep;
  /** specifying the function to use for back face when both the stencil test and the depth test pass. */
  passOperationBack: StencilOperation = StencilOperation.Keep;
  /** specifying the function to use for front face when the stencil test fails. */
  failOperationFront: StencilOperation = StencilOperation.Keep;
  /** specifying the function to use for back face when the stencil test fails. */
  failOperationBack: StencilOperation = StencilOperation.Keep;
  /** specifying the function to use for front face when the stencil test passes, but the depth test fails. */
  zFailOperationFront: StencilOperation = StencilOperation.Keep;
  /** specifying the function to use for back face when the stencil test passes, but the depth test fails. */
  zFailOperationBack: StencilOperation = StencilOperation.Keep;

  /**
   * @internal
   */
  _applyShaderDataValue(renderStateDataMap: Record<number, ShaderProperty>, shaderData: ShaderData): void {
    const enabledProp = renderStateDataMap[RenderStateElementKey.StencilStateEnabled];
    if (enabledProp !== undefined) {
      const enabled = shaderData.getFloat(enabledProp);
      this.enabled = enabled !== undefined ? !!enabled : false;
    }
    const referenceValueProp = renderStateDataMap[RenderStateElementKey.StencilStateReferenceValue];
    if (referenceValueProp !== undefined) {
      this.referenceValue = shaderData.getFloat(referenceValueProp) ?? 0;
    }
    const maskProp = renderStateDataMap[RenderStateElementKey.StencilStateMask];
    if (maskProp !== undefined) {
      this.mask = shaderData.getFloat(maskProp) ?? 0xff;
    }
    const writeMaskProp = renderStateDataMap[RenderStateElementKey.StencilStateWriteMask];
    if (writeMaskProp !== undefined) {
      this.writeMask = shaderData.getFloat(writeMaskProp) ?? 0xff;
    }
    const compareFunctionFrontProp = renderStateDataMap[RenderStateElementKey.StencilStateCompareFunctionFront];
    if (compareFunctionFrontProp !== undefined) {
      this.compareFunctionFront = shaderData.getFloat(compareFunctionFrontProp) ?? CompareFunction.Always;
    }
    const compareFunctionBackProp = renderStateDataMap[RenderStateElementKey.StencilStateCompareFunctionBack];
    if (compareFunctionBackProp !== undefined) {
      this.compareFunctionBack = shaderData.getFloat(compareFunctionBackProp) ?? CompareFunction.Always;
    }
    const passOperationFrontProp = renderStateDataMap[RenderStateElementKey.StencilStatePassOperationFront];
    if (passOperationFrontProp !== undefined) {
      this.passOperationFront = shaderData.getFloat(passOperationFrontProp) ?? StencilOperation.Keep;
    }
    const passOperationBackProp = renderStateDataMap[RenderStateElementKey.StencilStatePassOperationBack];
    if (passOperationBackProp !== undefined) {
      this.passOperationBack = shaderData.getFloat(passOperationBackProp) ?? StencilOperation.Keep;
    }
    const failOperationFrontProp = renderStateDataMap[RenderStateElementKey.StencilStateFailOperationFront];
    if (failOperationFrontProp !== undefined) {
      this.failOperationFront = shaderData.getFloat(failOperationFrontProp) ?? StencilOperation.Keep;
    }
    const failOperationBackProp = renderStateDataMap[RenderStateElementKey.StencilStateFailOperationBack];
    if (failOperationBackProp !== undefined) {
      this.failOperationBack = shaderData.getFloat(failOperationBackProp) ?? StencilOperation.Keep;
    }
    const zFailOperationFrontProp = renderStateDataMap[RenderStateElementKey.StencilStateZFailOperationFront];
    if (zFailOperationFrontProp !== undefined) {
      this.zFailOperationFront = shaderData.getFloat(zFailOperationFrontProp) ?? StencilOperation.Keep;
    }
    const zFailOperationBackProp = renderStateDataMap[RenderStateElementKey.StencilStateZFailOperationBack];
    if (zFailOperationBackProp !== undefined) {
      this.zFailOperationBack = shaderData.getFloat(zFailOperationBackProp) ?? StencilOperation.Keep;
    }
  }
}
