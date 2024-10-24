/**
 * @internal
 */
export enum ComponentType {
  // Base components
  Component = 0x1,
  Script = 0x2,

  // Renderers
  Renderer = 0x4,
  MeshRenderer = 0x8,
  SkinnedMeshRenderer = 0x10,
  SpriteRenderer = 0x20,
  TextRenderer = 0x40,

  // UI components
  UICanvas = 0x80,
  UIRenderer = 0x100,
  UIGroup = 0x200,
  UIElement = UICanvas | UIRenderer
}
