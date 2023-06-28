export interface TranscodeResult {
  width: number;
  height: number;
  hasAlpha: boolean;
  mipmaps: Array<{ data: Uint8Array; width: number; height: number }>;
}