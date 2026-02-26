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

      await import("@galacean/engine-core");

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
