import { ContentRestorer, Texture2D, TextureFormat } from "@galacean/engine";

const normalizedTextures = new WeakMap<Texture2D, Texture2D>();

/** @internal Convert gamma-premultiplied atlas pixels before filtering and sRGB decoding. */
export function normalizeSpineTexture(source: Texture2D): Texture2D {
  const cached = normalizedTextures.get(source);
  if (cached && !cached.destroyed && !cached.pendingDestroy) return cached;
  if (source.format !== TextureFormat.R8G8B8A8) {
    throw new Error(
      `Spine PMA page "${source.name}" requires an RGBA8 texture. Convert to straight alpha before texture compression.`
    );
  }

  const { width, height, engine } = source;
  const pixels = new Uint8Array(width * height * 4);
  source.getPixelBuffer(pixels);
  let hasTransparentPixels = false;
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3];
    if (alpha) {
      for (let c = 0; c < 3; c++) pixels[i + c] = Math.min(255, Math.round((pixels[i + c] * 255) / alpha));
    } else {
      hasTransparentPixels = true;
    }
  }
  if (hasTransparentPixels) bleedTransparentPixels(pixels, width, height);

  // ResourceManager caches source textures by URL. Never change their pixels or alpha representation.
  const texture = new Texture2D(engine, width, height, TextureFormat.R8G8B8A8, source.mipmapCount > 1, true);
  texture.name = source.name;
  texture.filterMode = source.filterMode;
  texture.wrapModeU = source.wrapModeU;
  texture.wrapModeV = source.wrapModeV;
  texture.anisoLevel = source.anisoLevel;
  const restorer = new SpineTextureContentRestorer(texture, pixels);
  restorer.restoreContent();
  engine.resourceManager.addContentRestorer(restorer);
  normalizedTextures.set(source, texture);
  return texture;
}

// PMA discards RGB at alpha zero. Extend the nearest visible color into these pixels so that
// bilinear filtering and mip generation do not introduce black borders in the straight texture.
function bleedTransparentPixels(pixels: Uint8Array, width: number, height: number): void {
  const count = width * height;
  const visited = new Uint8Array(count);
  const queue = new Uint32Array(count);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < count; i++) {
    if (pixels[i * 4 + 3]) {
      visited[i] = 1;
      queue[tail++] = i;
    }
  }
  const visit = (from: number, to: number) => {
    if (visited[to]) return;
    visited[to] = 1;
    queue[tail++] = to;
    for (let c = 0; c < 3; c++) pixels[to * 4 + c] = pixels[from * 4 + c];
  };
  while (head < tail) {
    const i = queue[head++];
    const x = i % width;
    if (x > 0) visit(i, i - 1);
    if (x + 1 < width) visit(i, i + 1);
    if (i >= width) visit(i, i - width);
    if (i + width < count) visit(i, i + width);
  }
}

class SpineTextureContentRestorer extends ContentRestorer<Texture2D> {
  constructor(
    texture: Texture2D,
    private readonly _pixels: Uint8Array
  ) {
    super(texture);
  }

  override restoreContent(): void {
    const texture = this.resource;
    texture.setPixelBuffer(this._pixels);
    if (texture.mipmapCount > 1) texture.generateMipmaps();
  }
}
