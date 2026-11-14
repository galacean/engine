/** Saved progress needs its original resources or an explicit fresh-start choice. */
export class FarmSnapshotCompatibilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FarmSnapshotCompatibilityError";
  }
}
