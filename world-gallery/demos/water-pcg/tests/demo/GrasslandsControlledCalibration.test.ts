import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GrasslandsControlledCalibration,
  type GrasslandsControlledCalibrationOptions
} from "../../demo/grasslands/GrasslandsControlledCalibration";
import type { GrasslandsAcceptanceRuntimeReadback } from "../../demo/grasslands/GrasslandsShowcaseAcceptance";
import type { WaterSurfaceOpticsBindingReadback } from "../../runtime/optics/WaterSurfaceOpticsTypes";
import type {
  WaterSurfaceAppearanceGpuCalibrationInput,
  WaterSurfaceAppearanceGpuCalibrationReadback
} from "../../runtime/surface/WaterSurfaceAppearanceGpuCalibration";

const { readGpuCalibrationMock } = vi.hoisted(() => ({
  readGpuCalibrationMock: vi.fn()
}));

vi.mock("../../runtime/surface/WaterSurfaceAppearanceGpuCalibration", () => ({
  readWaterSurfaceAppearanceGpuCalibration: readGpuCalibrationMock
}));

const NORMAL_BYTES = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const NORMAL_CONTENT_HASH = createHash("sha256").update(NORMAL_BYTES).digest("hex");
const NORMAL_SOURCE_URL = "/grasslands-water-normal-1024.png";

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

interface FakeImageBitmap {
  readonly width: number;
  readonly height: number;
  close(): void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createRuntime(
  overrides: {
    readonly contentHash?: string;
    readonly expectedContentHash?: string;
    readonly width?: number;
    readonly height?: number;
  } = {}
): GrasslandsAcceptanceRuntimeReadback {
  return {
    strictMaterialReady: true,
    surfaceTime: 12.5,
    normal: {
      active: true,
      assetId: "grasslands-water-normal-1024",
      contentHash: overrides.contentHash ?? NORMAL_CONTENT_HASH,
      expectedContentHash: overrides.expectedContentHash ?? NORMAL_CONTENT_HASH,
      width: overrides.width ?? 1024,
      height: overrides.height ?? 1024,
      tiling: 0.05,
      scrollUvPerSecond: 0.02,
      strength: 0.2,
      flipGreen: false
    },
    appearance: {
      active: true,
      assetId: "grasslands-surface-appearance-v1",
      appearanceHash: "appearance-hash",
      depthTint: {
        distance: 10,
        exponent: 0.5
      },
      coastalAlpha: {
        distance: 0.5
      },
      contactFoam: {
        contactDistance: 0.1791
      }
    }
  } as unknown as GrasslandsAcceptanceRuntimeReadback;
}

function createOptics(): Readonly<WaterSurfaceOpticsBindingReadback> {
  return {
    requestedTier: "high",
    resolvedTier: "high",
    opticalProfile: {
      indexOfRefraction: 1.333,
      refractionStrength: 0.1,
      roughness: 0
    }
  } as unknown as Readonly<WaterSurfaceOpticsBindingReadback>;
}

function createGpuReadback(label: string): WaterSurfaceAppearanceGpuCalibrationReadback {
  return Object.freeze({ label }) as unknown as WaterSurfaceAppearanceGpuCalibrationReadback;
}

function createResponse(bytes: Uint8Array = NORMAL_BYTES): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    arrayBuffer: vi.fn(async () => bytes.slice().buffer)
  } as unknown as Response;
}

function createImageBitmap(
  width = 1024,
  height = 1024
): {
  readonly image: ImageBitmap;
  readonly close: ReturnType<typeof vi.fn>;
} {
  const close = vi.fn();
  const image: FakeImageBitmap = { width, height, close };
  return {
    image: image as unknown as ImageBitmap,
    close
  };
}

function createOptions(runtime = createRuntime()): GrasslandsControlledCalibrationOptions {
  return {
    readRuntime: () => runtime,
    readOptics: () => createOptics(),
    readNormalSourceUrl: () => NORMAL_SOURCE_URL
  };
}

function installBrowserMocks(
  image: ImageBitmap,
  response: Response = createResponse()
): {
  readonly fetchMock: ReturnType<typeof vi.fn>;
  readonly createImageBitmapMock: ReturnType<typeof vi.fn>;
} {
  const fetchMock = vi.fn(async () => response);
  const createImageBitmapMock = vi.fn(async () => image);
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("createImageBitmap", createImageBitmapMock);
  return { fetchMock, createImageBitmapMock };
}

beforeEach(() => {
  readGpuCalibrationMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GrasslandsControlledCalibration", () => {
  it("uses one in-flight operation and forwards the successful GPU readback unchanged", async () => {
    const { image, close } = createImageBitmap();
    const { fetchMock, createImageBitmapMock } = installBrowserMocks(image);
    const deferred = createDeferred<WaterSurfaceAppearanceGpuCalibrationReadback>();
    const gpuReadback = createGpuReadback("single-flight");
    readGpuCalibrationMock.mockImplementation(() => deferred.promise);
    const calibration = new GrasslandsControlledCalibration(createOptions());

    const first = calibration.read();
    const second = calibration.read();

    expect(second).toBe(first);
    await vi.waitFor(() => expect(readGpuCalibrationMock).toHaveBeenCalledTimes(1));
    deferred.resolve(gpuReadback);
    const result = await first;

    expect(result.gpu).toBe(gpuReadback);
    expect(result.runtimeInput).toEqual({
      appearanceAssetId: "grasslands-surface-appearance-v1",
      appearanceHash: "appearance-hash",
      normalAssetId: "grasslands-water-normal-1024",
      normalContentHash: NORMAL_CONTENT_HASH,
      normalSourceUrl: NORMAL_SOURCE_URL,
      normalByteLength: NORMAL_BYTES.byteLength,
      opticsRequestedTier: "high",
      opticsResolvedTier: "high"
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(NORMAL_SOURCE_URL, {
      cache: "no-cache",
      credentials: "same-origin"
    });
    expect(createImageBitmapMock).toHaveBeenCalledTimes(1);
    const [blob, bitmapOptions] = createImageBitmapMock.mock.calls[0] as [Blob, ImageBitmapOptions];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBe(NORMAL_BYTES.byteLength);
    expect(bitmapOptions).toEqual({
      colorSpaceConversion: "none",
      imageOrientation: "none",
      premultiplyAlpha: "none"
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("passes the verified image and frozen runtime calibration spec to the GPU executor", async () => {
    const { image, close } = createImageBitmap();
    installBrowserMocks(image);
    readGpuCalibrationMock.mockResolvedValue(createGpuReadback("spec"));
    const calibration = new GrasslandsControlledCalibration(createOptions());

    await calibration.read();

    expect(readGpuCalibrationMock).toHaveBeenCalledTimes(1);
    const input = readGpuCalibrationMock.mock.calls[0][0] as WaterSurfaceAppearanceGpuCalibrationInput;
    const fresnelRatio = (1 - 1.333) / (1 + 1.333);
    expect(input).toEqual({
      normalImage: image,
      normalWidth: 1024,
      normalHeight: 1024,
      normalTiling: 0.05,
      normalScrollUvPerSecond: 0.02,
      normalStrength: 0.2,
      normalFlipGreen: false,
      surfaceTime: 12.5,
      depthTintDistanceMeters: 10,
      depthTintExponent: 0.5,
      depthTintSampleMeters: [0, 0.5, 2, 5, 10],
      contactDistanceMeters: 0.1791,
      coastalDistanceMeters: 0.5,
      refractionStrength: 0.1,
      roughness: 0,
      fresnelF0: fresnelRatio * fresnelRatio
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("rejects reads after disposal without starting fetch, decode, or GPU work", async () => {
    const { image } = createImageBitmap();
    const { fetchMock, createImageBitmapMock } = installBrowserMocks(image);
    const calibration = new GrasslandsControlledCalibration(createOptions());

    calibration.dispose();

    await expect(calibration.read()).rejects.toThrow("Grasslands controlled calibration is disposed.");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createImageBitmapMock).not.toHaveBeenCalled();
    expect(readGpuCalibrationMock).not.toHaveBeenCalled();
  });

  it("fails closed on a normal hash mismatch before decode or GPU execution", async () => {
    const { image, close } = createImageBitmap();
    const { createImageBitmapMock } = installBrowserMocks(image);
    const calibration = new GrasslandsControlledCalibration(
      createOptions(createRuntime({ contentHash: "0".repeat(64), expectedContentHash: "0".repeat(64) }))
    );

    await expect(calibration.read()).rejects.toThrow(
      `Grasslands controlled calibration normal hash mismatch: ${NORMAL_CONTENT_HASH} != ${"0".repeat(64)}.`
    );
    expect(createImageBitmapMock).not.toHaveBeenCalled();
    expect(readGpuCalibrationMock).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it("closes a decoded bitmap when its dimensions do not match the active runtime spec", async () => {
    const { image, close } = createImageBitmap(512, 1024);
    installBrowserMocks(image);
    const calibration = new GrasslandsControlledCalibration(createOptions());

    await expect(calibration.read()).rejects.toThrow(
      "Grasslands controlled calibration normal dimensions mismatch: 512x1024."
    );
    expect(readGpuCalibrationMock).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("propagates the exact executor error, closes the bitmap, and permits a later retry", async () => {
    const firstBitmap = createImageBitmap();
    const secondBitmap = createImageBitmap();
    const createImageBitmapMock = vi
      .fn()
      .mockResolvedValueOnce(firstBitmap.image)
      .mockResolvedValueOnce(secondBitmap.image);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => createResponse())
    );
    vi.stubGlobal("createImageBitmap", createImageBitmapMock);
    const executorError = new Error("controlled GPU executor failed");
    const retryReadback = createGpuReadback("retry");
    readGpuCalibrationMock.mockRejectedValueOnce(executorError).mockResolvedValueOnce(retryReadback);
    const calibration = new GrasslandsControlledCalibration(createOptions());

    await expect(calibration.read()).rejects.toBe(executorError);
    expect(firstBitmap.close).toHaveBeenCalledTimes(1);

    await expect(calibration.read()).resolves.toMatchObject({ gpu: retryReadback });
    expect(readGpuCalibrationMock).toHaveBeenCalledTimes(2);
    expect(secondBitmap.close).toHaveBeenCalledTimes(1);
  });

  it("closes the bitmap and rejects when disposed during GPU readback", async () => {
    const { image, close } = createImageBitmap();
    installBrowserMocks(image);
    const deferred = createDeferred<WaterSurfaceAppearanceGpuCalibrationReadback>();
    readGpuCalibrationMock.mockImplementation(() => deferred.promise);
    const calibration = new GrasslandsControlledCalibration(createOptions());

    const pending = calibration.read();
    await vi.waitFor(() => expect(readGpuCalibrationMock).toHaveBeenCalledTimes(1));
    calibration.dispose();
    deferred.resolve(createGpuReadback("disposed"));

    await expect(pending).rejects.toThrow("Grasslands controlled calibration was disposed during GPU readback.");
    expect(close).toHaveBeenCalledTimes(1);
    await expect(calibration.read()).rejects.toThrow("Grasslands controlled calibration is disposed.");
  });
});
