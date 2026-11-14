import { Vector3 } from "@galacean/engine-math";

/**
 * @internal
 */
export class MeshPathUtils {
  static sample(path: readonly Vector3[], divisions: number, closed: boolean, tangents?: Vector3[]): Vector3[] {
    const result = new Array<Vector3>(divisions + 1);
    if (path.length < 2) {
      throw new Error("A mesh path needs at least two points.");
    }
    const points: Vector3[] = [];
    for (const point of path) {
      if (points.length === 0 || Vector3.distance(points[points.length - 1], point) > 0) {
        points.push(point);
      }
    }
    if (closed && Vector3.distance(points[0], points[points.length - 1]) > 0) {
      points.push(points[0]);
    }
    const lengths = new Float64Array(points.length);
    for (let i = 1; i < points.length; i++) {
      lengths[i] = lengths[i - 1] + Vector3.distance(points[i], points[i - 1]);
    }
    const length = lengths[lengths.length - 1];
    if (length === 0) {
      throw new Error("A mesh path must have nonzero length.");
    }
    if (tangents) {
      tangents.length = divisions + 1;
    }
    const adjacent = new Vector3();
    const direction = new Vector3();
    let tangent: Vector3;
    let tangentEdge = 0;
    let edge = 1;
    for (let i = 0; i <= divisions; i++) {
      const distance = (i / divisions) * length;
      while (edge < lengths.length - 1 && lengths[edge] < distance) {
        edge++;
      }
      const edgeLength = lengths[edge] - lengths[edge - 1];
      const t = edgeLength > 0 ? (distance - lengths[edge - 1]) / edgeLength : 0;
      const point = new Vector3();
      Vector3.lerp(points[edge - 1], points[edge], t, point);
      result[i] = point;
      if (tangents) {
        if (tangentEdge !== edge) {
          Vector3.subtract(points[edge], points[edge - 1], direction);
          MeshPathUtils._normalize(direction);
          tangent = MeshPathUtils._normalize(direction.clone());
          tangentEdge = edge;
        }
        if (t === 0 && (edge > 1 || closed)) {
          const previous = points[edge > 1 ? edge - 2 : points.length - 2];
          Vector3.subtract(points[edge - 1], previous, adjacent);
        } else if (t === 1 && (edge + 1 < points.length || closed)) {
          const next = points[edge + 1 < points.length ? edge + 1 : 1];
          Vector3.subtract(next, points[edge], adjacent);
        } else {
          tangents[i] = tangent!;
          continue;
        }
        MeshPathUtils._normalize(adjacent).add(direction);
        tangents[i] = Vector3.dot(adjacent, adjacent) > 0 ? MeshPathUtils._normalize(adjacent.clone()) : tangent!;
      }
    }
    return result;
  }

  static computeFrames(
    points: readonly Vector3[],
    closed: boolean,
    fallbackTangents?: readonly Vector3[]
  ): { normals: Vector3[]; binormals: Vector3[] } {
    const last = points.length - 1;
    const tangents = new Array<Vector3>(points.length);
    for (let i = 0; i <= last; i++) {
      const before = points[i === 0 ? (closed ? last - 1 : 0) : i - 1];
      const after = points[i === last ? (closed ? 1 : last) : i + 1];
      const tangent = new Vector3();
      Vector3.subtract(after, before, tangent);
      if (Vector3.dot(tangent, tangent) === 0 && fallbackTangents) {
        tangent.copyFrom(fallbackTangents[i]);
      }
      tangents[i] = MeshPathUtils._normalize(tangent);
    }
    const tangent = tangents[0];
    const axis =
      Math.abs(tangent.x) <= Math.abs(tangent.y) && Math.abs(tangent.x) <= Math.abs(tangent.z)
        ? new Vector3(1, 0, 0)
        : Math.abs(tangent.y) <= Math.abs(tangent.z)
          ? new Vector3(0, 1, 0)
          : new Vector3(0, 0, 1);
    const normal = new Vector3();
    const binormal = new Vector3();
    Vector3.cross(tangent, axis, normal);
    MeshPathUtils._normalize(normal);
    Vector3.cross(tangent, normal, binormal);
    MeshPathUtils._normalize(binormal);
    const normals = [normal];
    const binormals = [binormal];
    const rotationAxis = new Vector3();
    for (let i = 1; i <= last; i++) {
      Vector3.cross(tangents[i - 1], tangents[i], rotationAxis);
      const sine = Math.hypot(rotationAxis.x, rotationAxis.y, rotationAxis.z);
      let normal = normals[i - 1];
      if (sine > 1e-10) {
        normal = MeshPathUtils._rotate(
          normal,
          MeshPathUtils._normalize(rotationAxis),
          Math.atan2(sine, Vector3.dot(tangents[i - 1], tangents[i])),
          new Vector3()
        );
      }
      normals.push(normal);
      const binormal = new Vector3();
      Vector3.cross(tangents[i], normal, binormal);
      binormals.push(MeshPathUtils._normalize(binormal));
    }
    if (closed) {
      Vector3.cross(normals[last], normals[0], rotationAxis);
      const angle = Math.atan2(Vector3.dot(tangents[0], rotationAxis), Vector3.dot(normals[last], normals[0]));
      for (let i = 1; i <= last; i++) {
        normals[i] = MeshPathUtils._rotate(normals[i], tangents[i], (angle * i) / last, new Vector3());
        Vector3.cross(tangents[i], normals[i], binormals[i]);
        MeshPathUtils._normalize(binormals[i]);
      }
    }
    return { normals, binormals };
  }

  private static _normalize(vector: Vector3): Vector3 {
    const length = Math.hypot(vector.x, vector.y, vector.z);
    return vector.scale(length > 0 ? 1 / length : 0);
  }

  private static _rotate(point: Vector3, axis: Vector3, angle: number, out: Vector3): Vector3 {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const px = axis.y * point.z - axis.z * point.y;
    const py = axis.z * point.x - axis.x * point.z;
    const pz = axis.x * point.y - axis.y * point.x;
    const parallel = Vector3.dot(axis, point) * (1 - c);
    return out.set(
      point.x * c + px * s + axis.x * parallel,
      point.y * c + py * s + axis.y * parallel,
      point.z * c + pz * s + axis.z * parallel
    );
  }
}
