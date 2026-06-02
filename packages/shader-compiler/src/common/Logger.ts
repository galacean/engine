// No-op stand-in for engine-core's Logger (which is also disabled by default), so the parser carries
// no engine-core dependency. Diagnostic warnings move to shader-analyzer.
export const Logger = {
  warn(..._args: unknown[]): void {}
};
