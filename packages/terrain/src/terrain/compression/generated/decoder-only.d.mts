interface OfficialBrotliDecoderModuleFactoryOptions {
  readonly wasmBinary?: Uint8Array;
}

declare function createOfficialBrotliDecoderModule(
  options?: OfficialBrotliDecoderModuleFactoryOptions
): Promise<unknown>;

export default createOfficialBrotliDecoderModule;
