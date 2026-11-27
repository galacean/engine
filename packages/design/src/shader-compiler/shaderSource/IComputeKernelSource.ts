import { IShaderPosition } from "./IShaderPosition";
import { IStatement } from "./IStatement";

/** Parsed ShaderLab compute kernel structure before backend generation. */
export interface IComputeKernelSource {
  /** Kernel name (`"Default"` when declared directly in `ComputeShader`). */
  name: string;
  /** Compute entry-point function name. */
  entry: string;
  /** Source range of the compute entry-point name. */
  entryLocation?: { start: IShaderPosition; end: IShaderPosition };
  /** Workgroup dimensions `[x, y, z]`, defaulting to `[1, 1, 1]`. */
  workgroupSize: readonly [number, number, number];
  /** User-defined kernel tags. */
  tags?: Record<string, number | string | boolean>;
  /** ShaderLab statements inherited by or declared on the kernel. */
  pendingContents: IStatement[];
  /** Composed shader body source code. */
  contents: string;
  /** Start offsets of ComputeShader and Kernel content layers in `contents`. */
  contentScopeStarts: readonly number[];
}
