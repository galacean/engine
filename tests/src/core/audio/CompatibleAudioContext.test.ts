import { CompatibleAudioContext } from "@galacean/engine-core";
import { describe, expect, it, beforeAll, afterAll, vi, beforeEach } from "vitest";

describe("CompatibleAudioContext", () => {
  let originalAudioContext: typeof window.AudioContext;
  let originalWebkitAudioContext: any;
  
  beforeAll(() => {
    originalAudioContext = window.AudioContext;
    originalWebkitAudioContext = (window as any).webkitAudioContext;
  });
  
  afterAll(() => {
    window.AudioContext = originalAudioContext;
    (window as any).webkitAudioContext = originalWebkitAudioContext;
  });
  
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should create instance using AudioContext when available", () => {
    const mockAudioContext = vi.fn();
    window.AudioContext = mockAudioContext as any;
    (window as any).webkitAudioContext = undefined;
    
    new CompatibleAudioContext();
    
    expect(mockAudioContext).toHaveBeenCalled();
  });
  
  it("should create instance using webkitAudioContext when AudioContext is not available", () => {
    window.AudioContext = undefined as any;
    const mockWebkitAudioContext = vi.fn();
    (window as any).webkitAudioContext = mockWebkitAudioContext;
    
    new CompatibleAudioContext();
    
    expect(mockWebkitAudioContext).toHaveBeenCalled();
  });
  
  it("should throw error when neither AudioContext nor webkitAudioContext is available", () => {
    window.AudioContext = undefined as any;
    (window as any).webkitAudioContext = undefined;
    
    expect(() => new CompatibleAudioContext()).toThrow("Web Audio API not supported.");
  });
  
  it("decodeAudioData should return a Promise", async () => {
    const mockBuffer = {} as AudioBuffer;
    const mockDecodeAudioData = vi.fn((buffer, success) => {
      success(mockBuffer);
      return Promise.resolve(mockBuffer);
    });
    
    const mockAudioContext = {
      decodeAudioData: mockDecodeAudioData,
      state: "running",
      resume: vi.fn().mockResolvedValue(undefined)
    } as any;
    
    window.AudioContext = vi.fn(() => mockAudioContext) as any;
    
    const context = new CompatibleAudioContext();
    const arrayBuffer = new ArrayBuffer(0);
    
    const result = await context.decodeAudioData(arrayBuffer);
    
    expect(result).to.equal(mockBuffer);
    expect(mockDecodeAudioData).toHaveBeenCalledWith(
      arrayBuffer,
      expect.any(Function),
      expect.any(Function)
    );
  });
  
  it("decodeAudioData should support callback pattern", async () => {
    const mockBuffer = {} as AudioBuffer;
    const mockDecodeAudioData = vi.fn((buffer, success) => {
      success(mockBuffer);
      return Promise.resolve(mockBuffer);
    });
    
    const mockAudioContext = {
      decodeAudioData: mockDecodeAudioData,
      state: "running",
      resume: vi.fn().mockResolvedValue(undefined)
    } as any;
    
    window.AudioContext = vi.fn(() => mockAudioContext) as any;
    
    const context = new CompatibleAudioContext();
    const arrayBuffer = new ArrayBuffer(0);
    
    let callbackCalled = false;
    
    await new Promise<void>((resolve) => {
      context.decodeAudioData(
        arrayBuffer,
        buffer => {
          callbackCalled = true;
          expect(buffer).to.equal(mockBuffer);
          resolve();
        }
      );
    });
    
    expect(callbackCalled).to.be.true;
  });
  
  it("decodeAudioData should handle errors", async () => {
    const mockError = new Error("Decoding failed");
    const mockDecodeAudioData = vi.fn((buffer, success, error) => {
      error(mockError);
      return Promise.reject(mockError);
    });
    
    const mockAudioContext = {
      decodeAudioData: mockDecodeAudioData,
      state: "running",
      resume: vi.fn().mockResolvedValue(undefined)
    } as any;
    
    window.AudioContext = vi.fn(() => mockAudioContext) as any;
    
    const context = new CompatibleAudioContext();
    const arrayBuffer = new ArrayBuffer(0);
    
    try {
      await context.decodeAudioData(arrayBuffer);
      expect(true).to.be.false;
    } catch (error) {
      expect(error).to.equal(mockError);
    }
  });
  
  it("should try to resume AudioContext when state is not running", async () => {
    const mockResume = vi.fn().mockResolvedValue(undefined);
    const mockAudioContext = {
      state: "suspended",
      resume: mockResume
    } as any;
    
    window.AudioContext = vi.fn(() => mockAudioContext) as any;
    
    const context = new CompatibleAudioContext();
    
    (context as any)._tryResume();
    
    expect(mockResume).toHaveBeenCalled();
  });
  
  it("should forward method calls to the underlying AudioContext", () => {
    const mockGainNode = {} as GainNode;
    const mockCreateGain = vi.fn().mockReturnValue(mockGainNode);
    
    const mockBuffer = {} as AudioBuffer;
    const mockCreateBuffer = vi.fn().mockReturnValue(mockBuffer);
    
    const mockAudioContext = {
      state: "running",
      resume: vi.fn().mockResolvedValue(undefined),
      createGain: mockCreateGain,
      createBuffer: mockCreateBuffer
    } as any;
    
    window.AudioContext = vi.fn(() => mockAudioContext) as any;
    
    const context = new CompatibleAudioContext();
    
    const gainNode = context.createGain();
    expect(gainNode).to.equal(mockGainNode);
    expect(mockCreateGain).toHaveBeenCalled();
    
    const buffer = context.createBuffer(2, 1024, 44100);
    expect(buffer).to.equal(mockBuffer);
    expect(mockCreateBuffer).toHaveBeenCalledWith(2, 1024, 44100);
  });
  
  it("should forward property access to the underlying AudioContext", () => {
    const mockDestination = {} as AudioDestinationNode;
    const mockListener = {} as AudioListener;
    
    const mockAudioContext = {
      state: "running",
      currentTime: 123.456,
      sampleRate: 44100,
      destination: mockDestination,
      listener: mockListener,
      resume: vi.fn().mockResolvedValue(undefined)
    } as any;
    
    window.AudioContext = vi.fn(() => mockAudioContext) as any;
    
    const context = new CompatibleAudioContext();
    
    expect(context.state).to.equal("running");
    expect(context.currentTime).to.equal(123.456);
    expect(context.sampleRate).to.equal(44100);
    expect(context.destination).to.equal(mockDestination);
    expect(context.listener).to.equal(mockListener);
  });
});
