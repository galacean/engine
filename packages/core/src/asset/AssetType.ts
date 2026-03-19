/**
 * Asset Type.
 */
export enum AssetType {
  /** Plain text. */
  Text = "Text",
  /** JSON. */
  JSON = "JSON",
  /** ArrayBuffer. */
  Buffer = "Buffer",
  /** 2D Texture. */
  Texture2D = "Texture2D",
  /** Cube Texture. */
  TextureCube = "TextureCube",
  /** Material. */
  Material = "Material",
  /** Shader. */
  Shader = "Shader",
  /** Precompiled Shader (.gsp). */
  ShaderPrecompiled = "ShaderPrecompiled",
  /** Mesh. */
  Mesh = "Mesh",
  /** AnimationClip. */
  AnimationClip = "AnimationClip",
  /** AnimatorController. */
  AnimatorController = "AnimatorController",
  /** Prefab.*/
  Prefab = "Prefab",
  /** GLTF.*/
  GLTF = "GLTF",
  /** Compress Texture. */
  KTX = "KTX",
  /** Cube Compress Texture. */
  KTXCube = "KTXCube",
  /** KTX2 Compress Texture */
  KTX2 = "KTX2",
  /** Sprite. */
  Sprite = "Sprite",
  /** PrimitiveMesh. */
  PrimitiveMesh = "PrimitiveMesh",
  /** Sprite Atlas. */
  SpriteAtlas = "SpriteAtlas",
  /** Ambient light. */
  AmbientLight = "AmbientLight",
  /** Scene. */
  Scene = "Scene",
  /** Font. */
  Font = "Font",
  /** Source Font, include ttf, otf and woff. */
  SourceFont = "SourceFont",
  /** AudioClip, include ogg, wav and mp3. */
  Audio = "Audio",
  /** Project asset. */
  Project = "project",
  /** PhysicsMaterial. */
  PhysicsMaterial = "PhysicsMaterial",
  /** RenderTarget. */
  RenderTarget = "RenderTarget"
}
