import { Ticker, TickerCallback } from "../../../../packages/core/src/base/Ticker";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

describe("Ticker", function () {
  let ticker: Ticker;

  afterEach(() => {
    ticker?.destroy();
  });

  describe("Constructor", () => {
    it("should create with default options", () => {
      ticker = new Ticker();
      
      expect(ticker.targetFrameRate).toBe(60);
      expect(ticker.vSyncCount).toBe(1);
      expect(ticker.isPaused).toBe(true);
      expect(ticker.destroyed).toBe(false);
      expect(ticker.time).toBeDefined();
    });

    it("should create with custom options", () => {
      ticker = new Ticker({
        targetFrameRate: 30,
        vSyncCount: 2,
        autoStart: false
      });
      
      expect(ticker.targetFrameRate).toBe(30);
      expect(ticker.vSyncCount).toBe(2);
      expect(ticker.isPaused).toBe(true);
    });
  });

  describe("Properties", () => {
    beforeEach(() => {
      ticker = new Ticker();
    });

    it("should get and set targetFrameRate", () => {
      expect(ticker.targetFrameRate).toBe(60);
      
      ticker.targetFrameRate = 120;
      expect(ticker.targetFrameRate).toBe(120);
      
      // Should handle edge cases
      ticker.targetFrameRate = 0;
      expect(ticker.targetFrameRate).toBe(0.000001);
      
      ticker.targetFrameRate = -10;
      expect(ticker.targetFrameRate).toBe(0.000001);
    });

    it("should get and set vSyncCount", () => {
      expect(ticker.vSyncCount).toBe(1);
      
      ticker.vSyncCount = 0;
      expect(ticker.vSyncCount).toBe(0);
      
      ticker.vSyncCount = 2;
      expect(ticker.vSyncCount).toBe(2);
      
      // Should handle negative values
      ticker.vSyncCount = -1;
      expect(ticker.vSyncCount).toBe(0);
      
      // Should floor decimal values
      ticker.vSyncCount = 2.7;
      expect(ticker.vSyncCount).toBe(2);
    });

    it("should have time property", () => {
      expect(ticker.time).toBeDefined();
      expect(ticker.time.frameCount).toBe(0);
    });
  });

  describe("Lifecycle", () => {
    beforeEach(() => {
      ticker = new Ticker();
    });

    it("should start ticker", () => {
      expect(ticker.isPaused).toBe(true);
      
      ticker.start();
      
      expect(ticker.isPaused).toBe(false);
    });

    it("should pause ticker", () => {
      ticker.start();
      expect(ticker.isPaused).toBe(false);
      
      ticker.pause();
      
      expect(ticker.isPaused).toBe(true);
    });

    it("should destroy ticker", () => {
      ticker.start();
      expect(ticker.destroyed).toBe(false);
      
      ticker.destroy();
      
      expect(ticker.destroyed).toBe(true);
      expect(ticker.isPaused).toBe(true);
    });

    it("should not start when already running", () => {
      ticker.start();
      const wasPaused = ticker.isPaused;
      
      ticker.start(); // Second start should have no effect
      
      expect(ticker.isPaused).toBe(wasPaused);
    });

    it("should not pause when already paused", () => {
      const wasPaused = ticker.isPaused;
      
      ticker.pause(); // Should not throw
      
      expect(ticker.isPaused).toBe(wasPaused);
    });

    it("should not operate when destroyed", () => {
      ticker.destroy();
      
      ticker.start();
      expect(ticker.isPaused).toBe(true);
      
      ticker.pause();
      // Should not throw errors
    });
  });

  describe("Callbacks", () => {
    beforeEach(() => {
      ticker = new Ticker();
    });

    it("should add and remove callbacks", () => {
      let callCount = 0;
      const callback = () => callCount++;
      
      ticker.addCallback(callback);
      ticker.removeCallback(callback);
      
      // If we could trigger an update, callCount should remain 0
      // This is a basic test for add/remove functionality
      expect(callCount).toBe(0);
    });

    it("should clear all callbacks on destroy", () => {
      const callback = () => {};
      ticker.addCallback(callback);
      
      ticker.destroy();
      
      // Callbacks should be cleared, but we can't directly test the Set
      // This is more of a memory leak prevention test
      expect(ticker.destroyed).toBe(true);
    });
  });

  describe("Custom Animation Frame Provider", () => {
    beforeEach(() => {
      ticker = new Ticker();
    });

    it("should set custom RAF provider without errors", () => {
      const customRAF = () => requestAnimationFrame;
      const customCAF = () => cancelAnimationFrame;
      
      expect(() => {
        ticker.setAnimationFrameProvider(customRAF, customCAF);
      }).not.toThrow();
    });
  });

  describe("Edge Cases", () => {
    it("should handle multiple add/remove of same callback", () => {
      ticker = new Ticker();
      const callback = () => {};
      
      // Add same callback multiple times
      ticker.addCallback(callback);
      ticker.addCallback(callback);
      ticker.addCallback(callback);
      
      // Remove once should remove all instances (Set behavior)
      ticker.removeCallback(callback);
      ticker.removeCallback(callback); // Should not throw
      
      // Should not throw
      expect(() => ticker.start()).not.toThrow();
    });

    it("should handle rapid start/pause cycles", () => {
      ticker = new Ticker();
      
      expect(() => {
        ticker.start();
        ticker.pause();
        ticker.start();
        ticker.pause();
        ticker.start();
      }).not.toThrow();
      
      expect(ticker.isPaused).toBe(false);
    });

    it("should handle operations after destroy", () => {
      ticker = new Ticker();
      const callback = () => {};
      
      ticker.destroy();
      
      // These should not throw but also should not have effect
      expect(() => {
        ticker.addCallback(callback);
        ticker.removeCallback(callback);
        ticker.start();
        ticker.pause();
        ticker.targetFrameRate = 120;
        ticker.vSyncCount = 2;
      }).not.toThrow();
      
      expect(ticker.isPaused).toBe(true);
      expect(ticker.destroyed).toBe(true);
    });
  });
}); 