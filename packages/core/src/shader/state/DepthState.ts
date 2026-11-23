import { DataObject } from "../../base/DataObject";
import { ShaderData } from "../ShaderData";
import { ShaderProperty } from "../ShaderProperty";
import { CompareFunction } from "../enums/CompareFunction";
import { RenderStateElementKey } from "../enums/RenderStateElementKey";

/**
 * Depth state.
 */
export class DepthState extends DataObject {
  /** Whether to enable the depth test. */
  enabled: boolean = true;
  /** Depth comparison function. */
  compareFunction: CompareFunction = CompareFunction.Less;
  /** Whether the depth value can be written.*/
  writeEnabled: boolean = true;

  /**
   * @internal
   */
  _applyShaderDataValue(renderStateDataMap: Record<number, ShaderProperty>, shaderData: ShaderData): void {
    const enabledProp = renderStateDataMap[RenderStateElementKey.DepthStateEnabled];
    if (enabledProp !== undefined) {
      const enabled = shaderData.getFloat(enabledProp);
      this.enabled = enabled !== undefined ? !!enabled : true;
    }
    const writeEnabledProp = renderStateDataMap[RenderStateElementKey.DepthStateWriteEnabled];
    if (writeEnabledProp !== undefined) {
      const writeEnabled = shaderData.getFloat(writeEnabledProp);
      this.writeEnabled = writeEnabled !== undefined ? !!writeEnabled : true;
    }
    const compareFunctionProp = renderStateDataMap[RenderStateElementKey.DepthStateCompareFunction];
    if (compareFunctionProp !== undefined) {
      this.compareFunction = shaderData.getFloat(compareFunctionProp) ?? CompareFunction.Less;
    }
  }
}
