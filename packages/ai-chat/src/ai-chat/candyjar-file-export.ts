import type { CandyJarApi } from "./candyjar-bridge";

const CANDYJAR_FILE_TIMEOUT_MILLISECONDS = 20_000;
const CANDYJAR_INTERACTIVE_FILE_TIMEOUT_MILLISECONDS = 10 * 60_000;
const CANDYJAR_CAPABILITY_TIMEOUT_MILLISECONDS = 3_000;

export class CandyJarFileSaveCancelledError extends Error {
  constructor() {
    super("File save was cancelled");
    this.name = "CandyJarFileSaveCancelledError";
  }
}

/**
 * Saves an in-memory UTF-8 file through the host container.
 *
 * Newer hosts accept inline content on FSManager.saveTextFile so the native save
 * picker can be opened while the click still owns transient user activation.
 * Older hosts keep working through the downloadFile -> saveFile path.
 */
export async function saveUtf8FileThroughCandyJar(
  candyJar: CandyJarApi,
  content: string,
  fileName: string,
  mimeType = "text/plain"
): Promise<void> {
  const supportsInteractiveSave = await canUseCandyJarApi(candyJar, "FSManager.saveTextFile");
  if (supportsInteractiveSave) {
    try {
      await callCandyJar(
        candyJar,
        "FSManager",
        "saveTextFile",
        {
          content,
          encoding: "utf8",
          fileName,
          mimeType
        },
        CANDYJAR_INTERACTIVE_FILE_TIMEOUT_MILLISECONDS
      );
      return;
    } catch (error) {
      if (isUserCancellation(error)) throw new CandyJarFileSaveCancelledError();
      throw error;
    }
  }

  const downloaded = await callCandyJar(candyJar, "FSManager", "downloadFile", {
    url: utf8DataUrl(content, mimeType),
    fileName
  });
  if (!isRecord(downloaded) || typeof downloaded.apFilePath !== "string" || !downloaded.apFilePath) {
    throw new Error("CandyJar FSManager.downloadFile returned no apFilePath");
  }
  try {
    await callCandyJar(candyJar, "FSManager", "saveFile", {
      apFilePath: downloaded.apFilePath,
      fileName
    });
  } catch (error) {
    if (isUserCancellation(error)) throw new CandyJarFileSaveCancelledError();
    throw error;
  }
}

async function canUseCandyJarApi(candyJar: CandyJarApi, api: string): Promise<boolean> {
  try {
    const capability = await callCandyJar(
      candyJar,
      "Env",
      "canIUse",
      { api },
      CANDYJAR_CAPABILITY_TIMEOUT_MILLISECONDS
    );
    return isRecord(capability) && capability.available === true;
  } catch {
    return false;
  }
}

function callCandyJar(
  candyJar: CandyJarApi,
  method: string,
  action: string,
  params: Record<string, unknown>,
  timeoutMilliseconds = CANDYJAR_FILE_TIMEOUT_MILLISECONDS
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    candyJar.call(method, action, params, resolve, reject, timeoutMilliseconds);
  });
}

function utf8DataUrl(value: string, mimeType: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

function isUserCancellation(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return value.name === "AbortError" || value.code === "USER_CANCELLED";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
