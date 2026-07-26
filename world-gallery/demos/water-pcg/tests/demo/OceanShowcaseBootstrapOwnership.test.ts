import { describe, expect, it, vi } from "vitest";
import { OceanShowcaseBootstrapOwnership } from "../../demo/ocean/OceanShowcaseBootstrapOwnership";

describe("OceanShowcaseBootstrapOwnership", () => {
  it("rolls completed bootstrap steps back in reverse order", () => {
    const ownership = new OceanShowcaseBootstrapOwnership();
    const cleanupOrder: number[] = [];
    ownership.register(() => cleanupOrder.push(1));
    ownership.register(() => cleanupOrder.push(2));
    ownership.register(() => cleanupOrder.push(3));
    const primaryFailure = new Error("bootstrap failed");

    expect(() => ownership.rollback(primaryFailure)).toThrow(
      primaryFailure
    );
    expect(cleanupOrder).toEqual([3, 2, 1]);
  });

  it("continues rollback after cleanup failures and disarms after commit", () => {
    const ownership = new OceanShowcaseBootstrapOwnership();
    const completedCleanup = vi.fn();
    const cleanupFailure = new Error("cleanup failed");
    ownership.register(completedCleanup);
    ownership.register(() => {
      throw cleanupFailure;
    });

    try {
      ownership.rollback(new Error("bootstrap failed"));
      throw new Error("Expected rollback to throw.");
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);
      expect(
        (error as AggregateError).errors
      ).toContain(cleanupFailure);
    }
    expect(completedCleanup).toHaveBeenCalledOnce();

    const committed = new OceanShowcaseBootstrapOwnership();
    const committedCleanup = vi.fn();
    committed.register(committedCleanup);
    committed.commit();
    expect(() =>
      committed.rollback(new Error("ignored"))
    ).toThrow("ignored");
    expect(committedCleanup).not.toHaveBeenCalled();
  });
});
