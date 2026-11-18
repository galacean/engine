/**
 * Loads immutable binary input shared by browser, Worker, and Node terrain compilers.
 * @param url Absolute binary asset URL resolved by the importing module.
 * @returns Exact bytes of the compiler input.
 * @throws {Error} When a browser request fails.
 */
export async function loadTerrainCompilerBinary(url: URL): Promise<Uint8Array> {
  if (url.protocol === "file:") {
    const nodeFileSystemModule = "node:fs/promises";
    const { readFile } = (await import(/* @vite-ignore */ nodeFileSystemModule)) as {
      readFile(path: URL): Promise<Uint8Array>;
    };
    return readFile(url);
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Terrain compiler binary request failed with HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}
