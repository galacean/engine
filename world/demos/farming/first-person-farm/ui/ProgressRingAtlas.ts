import { Rect, Sprite, Texture2D, TextureFormat, WebGLEngine } from "@galacean/engine";

/** Shared antialiased circle geometry baked once; simulation ticks only select a sprite. */
export class ProgressRingAtlas {
  private readonly texture: Texture2D;
  readonly sprites: readonly Sprite[];
  constructor(engine: WebGLEngine) {
    const size = 72,
      columns = 11,
      width = columns * size,
      height = 10 * size;
    const pixels = new Uint8Array(width * height * 4);
    for (let percent = 0; percent <= 100; percent++) {
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const dx = x + 0.5 - size / 2,
            dy = y + 0.5 - size / 2;
          const radius = Math.hypot(dx, dy);
          const angle = (Math.atan2(dx, -dy) + Math.PI * 2) % (Math.PI * 2);
          const alpha = Math.max(0, Math.min(1, 3 - Math.abs(radius - 30)));
          if (!alpha || angle > (percent / 100) * Math.PI * 2) continue;
          const i = ((Math.floor(percent / columns) * size + y) * width + (percent % columns) * size + x) * 4;
          pixels[i] = pixels[i + 1] = pixels[i + 2] = 255;
          pixels[i + 3] = Math.round(alpha * 255);
        }
    }
    this.texture = new Texture2D(engine, width, height, TextureFormat.R8G8B8A8, false);
    this.texture.setPixelBuffer(pixels);
    this.sprites = Array.from(
      { length: 101 },
      (_, percent) =>
        new Sprite(
          engine,
          this.texture,
          new Rect(
            ((percent % columns) * size) / width,
            1 - ((Math.floor(percent / columns) + 1) * size) / height,
            size / width,
            size / height
          )
        )
    );
  }
  dispose(): void {
    for (const sprite of this.sprites) sprite.destroy();
    this.texture.destroy();
  }
}
