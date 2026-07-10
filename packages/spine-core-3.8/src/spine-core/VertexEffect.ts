import { Skeleton } from "./Skeleton";
import { Color, Vector2 } from "./Utils";

export interface VertexEffect {
  begin(skeleton: Skeleton): void;
  transform(position: Vector2, uv: Vector2, light: Color, dark: Color): void;
  end(): void;
}
