import {
  BoundingBox,
  BoundingFrustum,
  BoundingSphere,
  Color,
  Matrix,
  Matrix3x3,
  Plane,
  Quaternion,
  Ray,
  Rect,
  SphericalHarmonics3,
  Vector2,
  Vector3,
  Vector4
} from "@galacean/engine-math";
import { CloneMode, registerDefaultCloneMode } from "./CloneDecorators";

registerDefaultCloneMode(BoundingBox, CloneMode.CopyFrom);
registerDefaultCloneMode(BoundingFrustum, CloneMode.CopyFrom);
registerDefaultCloneMode(BoundingSphere, CloneMode.CopyFrom);
registerDefaultCloneMode(Color, CloneMode.CopyFrom);
registerDefaultCloneMode(Matrix, CloneMode.CopyFrom);
registerDefaultCloneMode(Matrix3x3, CloneMode.CopyFrom);
registerDefaultCloneMode(Plane, CloneMode.CopyFrom);
registerDefaultCloneMode(Quaternion, CloneMode.CopyFrom);
registerDefaultCloneMode(Ray, CloneMode.CopyFrom);
registerDefaultCloneMode(Rect, CloneMode.CopyFrom);
registerDefaultCloneMode(SphericalHarmonics3, CloneMode.CopyFrom);
registerDefaultCloneMode(Vector2, CloneMode.CopyFrom);
registerDefaultCloneMode(Vector3, CloneMode.CopyFrom);
registerDefaultCloneMode(Vector4, CloneMode.CopyFrom);
