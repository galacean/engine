import type { CropContent } from "./CropContent";

// Self-contained 64px placeholder shared by HTML and Texture2D. PNG decoding does not
// depend on MIME metadata surviving the engine's ArrayBuffer -> Blob image path.
export const CROP_ICON_PLACEHOLDER_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAABbklEQVR42u2bsQ6CMBCGoelbwcBm4ujm6DMQFxfDwmJ8Bkc3RxM3BngunSCEQAv2Atfr/4+2JPxfz/6eyUURBEEhK7ZteD5uX58NHk9no0cl2fwcD7Htwd3+4DWAz/tlrAQl2Xzfw1QlKMnm50BQoacAAAAAAIQtzfXFLvfr6OdlXsgGMGV8uE4FQnM1n6XJ6J6qbrq9FBAUN/NZmkyaH67bqsUbAH3zc0UFATHo4+lTVoH2OcLYpcDaEcYKwBYRxuYOcImwFkQLZ4naZ1xg6q0irKobkhwX1QwtqQKK03cGQBFhw4So6sYIor9OcY+w6gXKvOig2qpBZDPUNxZsO7z2jyZF8ZIuEYYU8B3AP1XA5fTJKmCrCGN1CW4RYexSYO0IYxuDHI0iBQAAAAAAAAAAAAAAAAAAAAAAALj8Kcqha8RXAAAAAACisRmbdtJCgkxTI8o0aCQBgm1kJpY+NGWbHFMuI2cSxuYgCApbPzknvN/SXk5gAAAAAElFTkSuQmCC";

export const cropIconPath = (cropId: string): string => `./icons/${cropId}.png`;

/** One resolution rule for the browser and admission CLI. Missing artwork is local to its crop. */
export function createCropIconCatalog(
  crops: readonly Pick<CropContent, "id" | "name">[],
  availableUrls: Readonly<Record<string, string>>
) {
  const issues: { cropId: string; path: string; message: string }[] = [];
  const urls: Record<string, string> = {};
  for (const crop of crops) {
    const path = cropIconPath(crop.id);
    const url = availableUrls[path];
    urls[crop.id] = url || CROP_ICON_PLACEHOLDER_URL;
    if (!url) issues.push({ cropId: crop.id, path: `content/${path.slice(2)}`, message: `${crop.name}：缺少作物图标` });
  }
  return { urls: Object.freeze(urls), issues: Object.freeze(issues) };
}
