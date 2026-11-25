import { gzipWorldBytes } from "./gzipWorldBytes";

self.onmessage = async ({ data }: MessageEvent<{ id: number; input: Uint8Array }>) => {
  try {
    const gzip = await gzipWorldBytes(data.input);
    self.postMessage({ id: data.id, gzip }, { transfer: [gzip.buffer] });
  } catch {
    self.postMessage({ id: data.id, failed: true });
  }
};
