// No-op stand-in for engine-core's Logger (which is disabled by default too), so the parser carries
// no engine-core dependency.
export const Logger = {
  warn(..._args: unknown[]): void {}
};
