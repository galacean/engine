import { describe, expect, it } from "vitest";

describe("Polyfill", () => {
  it("TextMetrics", async () => {
    if (window.TextMetrics) {
      // @ts-ignore
      delete TextMetrics.prototype.actualBoundingBoxLeft;
      // @ts-ignore
      delete TextMetrics.prototype.actualBoundingBoxRight;

      expect("actualBoundingBoxLeft" in TextMetrics.prototype).to.be.false;
      expect("actualBoundingBoxRight" in TextMetrics.prototype).to.be.false;

      // Polyfill registration moved out of `engine-core` (which is now
      // flavor-agnostic with no top-level browser side effects) into the
      // umbrella `@galacean/engine` package. Importing the umbrella triggers it.
      await import("@galacean/engine");

      expect("actualBoundingBoxLeft" in TextMetrics.prototype).to.be.true;
      expect("actualBoundingBoxRight" in TextMetrics.prototype).to.be.true;

      const mockTextMetrics = Object.create(TextMetrics.prototype, {
        width: {
          value: 100,
          writable: true,
          configurable: true,
          enumerable: true
        }
      });

      expect(mockTextMetrics.actualBoundingBoxLeft).to.equal(0);
      expect(mockTextMetrics.actualBoundingBoxRight).to.equal(100);
    }
  });
});
