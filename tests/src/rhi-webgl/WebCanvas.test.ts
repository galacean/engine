import { WebCanvas } from "@galacean/engine";
import { describe, expect, it } from "vitest";

describe("WebCanvas", () => {
  describe("_isOffscreenCanvas", () => {
    it("should return false when _webCanvas is an HTMLCanvasElement", () => {
      const canvas = document.createElement("canvas");
      const webCanvas = new WebCanvas(canvas);
      expect((webCanvas as any)._isOffscreenCanvas()).toBe(false);
    });

    it("should return true when _webCanvas is an OffscreenCanvas", () => {
      const offscreen = new OffscreenCanvas(300, 150);
      const webCanvas = new WebCanvas(offscreen);
      expect((webCanvas as any)._isOffscreenCanvas()).toBe(true);
    });

    it("should return false when _webCanvas is replaced with an HTMLCanvasElement after construction", () => {
      const canvas = document.createElement("canvas");
      const webCanvas = new WebCanvas(canvas);

      // Replace the internal canvas with an HTMLCanvasElement
      const anotherCanvas = document.createElement("canvas");
      webCanvas._webCanvas = anotherCanvas;
      expect((webCanvas as any)._isOffscreenCanvas()).toBe(false);
    });

    it("should return true when _webCanvas is replaced with an OffscreenCanvas after construction", () => {
      const canvas = document.createElement("canvas");
      const webCanvas = new WebCanvas(canvas);

      // Replace the internal canvas with an OffscreenCanvas
      const offscreen = new OffscreenCanvas(300, 150);
      webCanvas._webCanvas = offscreen;
      expect((webCanvas as any)._isOffscreenCanvas()).toBe(true);
    });
  });
});
