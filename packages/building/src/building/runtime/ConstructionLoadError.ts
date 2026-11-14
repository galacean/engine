/** Loading failures can recover without changing author geometry. Compilation
 * errors are deliberately not classified here, so bad geometry is not retried. */
export class ConstructionLoadError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "ConstructionLoadError";
  }
}
