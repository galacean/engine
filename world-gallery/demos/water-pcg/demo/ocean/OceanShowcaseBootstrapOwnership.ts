export type OceanShowcaseBootstrapCleanup = () => void;

/**
 * Owns resources only while the Ocean Showcase is bootstrapping. Successful
 * startup transfers ownership to the runtime cleanup path; failure rolls every
 * completed step back in reverse construction order.
 */
export class OceanShowcaseBootstrapOwnership {
  private readonly _cleanups: OceanShowcaseBootstrapCleanup[] =
    [];
  private _settled = false;

  register(cleanup: OceanShowcaseBootstrapCleanup): void {
    if (this._settled) {
      throw new Error(
        "Ocean Showcase bootstrap ownership is already settled."
      );
    }
    this._cleanups.push(cleanup);
  }

  commit(): void {
    if (this._settled) {
      throw new Error(
        "Ocean Showcase bootstrap ownership is already settled."
      );
    }
    this._settled = true;
    this._cleanups.length = 0;
  }

  rollback(primaryFailure: unknown): never {
    if (this._settled) throw primaryFailure;
    this._settled = true;
    const cleanupFailures: unknown[] = [];
    for (
      let index = this._cleanups.length - 1;
      index >= 0;
      index--
    ) {
      try {
        this._cleanups[index]();
      } catch (error) {
        cleanupFailures.push(error);
      }
    }
    this._cleanups.length = 0;
    if (cleanupFailures.length > 0) {
      throw new AggregateError(
        [primaryFailure, ...cleanupFailures],
        "Ocean Showcase bootstrap and rollback failed."
      );
    }
    throw primaryFailure;
  }
}
