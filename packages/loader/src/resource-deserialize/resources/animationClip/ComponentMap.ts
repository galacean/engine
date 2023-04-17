import {
  Animator,
  Camera,
  Component,
  DirectLight,
  Entity,
  MeshRenderer,
  ParticleRenderer,
  Transform,
  PointLight,
  SpotLight,
  Script,
  SpriteMask,
  SpriteRenderer,
  TextRenderer
} from "@galacean/engine-core";

export const ComponentMap: Record<string, new (entity: Entity) => Component> = {
  Transform,
  Animator,
  DirectLight,
  Camera,
  MeshRenderer,
  ParticleRenderer,
  PointLight,
  SpotLight,
  Script,
  SpriteMask,
  SpriteRenderer,
  TextRenderer
};
