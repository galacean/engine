import { Platform, SystemInfo } from "@galacean/engine-core";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

// Cast to access internal methods
const SystemInfoInternal = SystemInfo as typeof SystemInfo & {
  _initialize(): void;
};

describe("SystemInfo", () => {
  let originalUserAgent: string;

  beforeEach(() => {
    originalUserAgent = navigator.userAgent;
  });

  afterEach(() => {
    // Restore original userAgent
    Object.defineProperty(navigator, "userAgent", {
      value: originalUserAgent,
      configurable: true
    });
    // Reset SystemInfo state
    SystemInfo.platform = Platform.Unknown;
    SystemInfo.operatingSystem = "";
  });

  const mockUserAgent = (ua: string) => {
    Object.defineProperty(navigator, "userAgent", {
      value: ua,
      configurable: true
    });
  };

  describe("_parseAppleMobileOSVersion for iPhone", () => {
    // iOS 26+ Safari: UA freezes OS version at 18.6, use Version/xx to infer real iOS version
    it("Safari on iOS 26 (UA frozen at 18.6)", () => {
      mockUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1"
      );
      SystemInfoInternal._initialize();
      expect(SystemInfo.platform).to.eq(Platform.IPhone);
      expect(SystemInfo.operatingSystem).to.eq("iPhone OS 26.0.0");
    });

    it("Safari on iOS 26.1.2 (UA frozen at 18.6)", () => {
      mockUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1.2 Mobile/15E148 Safari/604.1"
      );
      SystemInfoInternal._initialize();
      expect(SystemInfo.platform).to.eq(Platform.IPhone);
      expect(SystemInfo.operatingSystem).to.eq("iPhone OS 26.1.2");
    });

    // Chrome on iOS: OS version is accurate
    it("Chrome on iOS 26", () => {
      mockUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.119 Mobile/15E148 Safari/604.1"
      );
      SystemInfoInternal._initialize();
      expect(SystemInfo.platform).to.eq(Platform.IPhone);
      expect(SystemInfo.operatingSystem).to.eq("iPhone OS 26.0.0");
    });

    // Firefox on iOS: OS version is accurate
    it("Firefox on iOS 26", () => {
      mockUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/140.2 Mobile/15E148 Safari/605.1.15"
      );
      SystemInfoInternal._initialize();
      expect(SystemInfo.platform).to.eq(Platform.IPhone);
      expect(SystemInfo.operatingSystem).to.eq("iPhone OS 26.0.0");
    });

    // Edge on iOS: Use Version/ (may lose patch version, but acceptable)
    it("Edge on iOS 26", () => {
      mockUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 EdgiOS/46.3.30 Mobile/15E148 Safari/605.1.15"
      );
      SystemInfoInternal._initialize();
      expect(SystemInfo.platform).to.eq(Platform.IPhone);
      expect(SystemInfo.operatingSystem).to.eq("iPhone OS 26.0.0");
    });

    // Opera on iOS: OS version is accurate
    it("Opera on iOS 26", () => {
      mockUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 OPiOS/16.0.14 Mobile/15E148 Safari/604.1"
      );
      SystemInfoInternal._initialize();
      expect(SystemInfo.platform).to.eq(Platform.IPhone);
      expect(SystemInfo.operatingSystem).to.eq("iPhone OS 26.0.0");
    });

    // Legacy Safari (before iOS 26): OS version is accurate
    it("Safari on iOS 18.4", () => {
      mockUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1"
      );
      SystemInfoInternal._initialize();
      expect(SystemInfo.platform).to.eq(Platform.IPhone);
      expect(SystemInfo.operatingSystem).to.eq("iPhone OS 18.4.0");
    });

    // WebView or in-app browser: No Version/, fallback to OS version
    it("WebView on iOS (no Version/)", () => {
      mockUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
      );
      SystemInfoInternal._initialize();
      expect(SystemInfo.platform).to.eq(Platform.IPhone);
      expect(SystemInfo.operatingSystem).to.eq("iPhone OS 18.6.0");
    });
  });

  describe("_parseAppleMobileOSVersion for iPad", () => {
    // iPad Safari with frozen UA
    it("Safari on iPadOS 26 (UA frozen at 18.6)", () => {
      mockUserAgent(
        "Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1"
      );
      SystemInfoInternal._initialize();
      expect(SystemInfo.platform).to.eq(Platform.IPad);
      expect(SystemInfo.operatingSystem).to.eq("iPad OS 26.0.0");
    });

    // Chrome on iPad
    it("Chrome on iPadOS 26", () => {
      mockUserAgent(
        "Mozilla/5.0 (iPad; CPU OS 26_0_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1"
      );
      SystemInfoInternal._initialize();
      expect(SystemInfo.platform).to.eq(Platform.IPad);
      expect(SystemInfo.operatingSystem).to.eq("iPad OS 26.0.0");
    });
  });
});
