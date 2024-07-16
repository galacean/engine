/**
 * @internal
 */
export enum RendererType {
  Mesh = 0x1,
  Sprite = 0x2,
  Text = 0x4,
  UI = 0x8,
  SpriteAndText = RendererType.Sprite | RendererType.Text
}
