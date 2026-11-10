/** Backend names for externally addressable shader interfaces. */
export interface IShaderInterfaceBindings {
  /** Original vertex output names mapped to the names emitted by codegen. */
  readonly vertexOutputs: Readonly<Record<string, string>>;
}
