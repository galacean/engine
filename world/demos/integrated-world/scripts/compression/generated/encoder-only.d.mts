interface OfficialBrotliEncoderModuleFactoryOptions {
  readonly wasmBinary?: Uint8Array;
}

declare function createOfficialBrotliEncoderModule(
  options?: OfficialBrotliEncoderModuleFactoryOptions
): Promise<unknown>;

export default createOfficialBrotliEncoderModule;
