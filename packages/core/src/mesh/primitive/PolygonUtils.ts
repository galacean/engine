import { Vector2 } from "@galacean/engine-math";
import type { PolygonShape } from "../PrimitiveMeshOptions";

/**
 * @internal
 */
export class PolygonUtils {
  static prepareContours(shape: PolygonShape): Vector2[][] {
    return [shape.points, ...(shape.holes ?? [])].map((points, index) => {
      const contour: Vector2[] = [];
      for (const point of points) {
        const previous = contour[contour.length - 1];
        if (!previous || previous.x !== point.x || previous.y !== point.y) {
          contour.push(point);
        }
      }
      const first = contour[0];
      const last = contour[contour.length - 1];
      if (contour.length > 1 && first.x === last.x && first.y === last.y) {
        contour.pop();
      }
      if (contour.length < 3) {
        throw new Error("A mesh contour needs at least three distinct points.");
      }
      let area = 0;
      for (let i = 0; i < contour.length; i++) {
        const next = contour[(i + 1) % contour.length];
        area += contour[i].x * next.y - next.x * contour[i].y;
      }
      if (area > 0 !== (index === 0)) {
        contour.reverse();
      }
      return contour;
    });
  }

  static triangulateContours(contours: Vector2[][]): { points: Vector2[]; indices: number[] } {
    const points: Vector2[] = [];
    const holes: number[] = [];
    for (let i = 0; i < contours.length; i++) {
      if (i > 0) {
        holes.push(points.length);
      }
      points.push(...contours[i]);
    }
    const coordinates = new Float64Array(points.length * 2);
    for (let i = 0; i < points.length; i++) {
      coordinates[2 * i] = points[i].x;
      coordinates[2 * i + 1] = points[i].y;
    }
    const indices = PolygonUtils.triangulate(coordinates, holes);
    for (let i = 0; i < indices.length; i += 3) {
      const a = points[indices[i]];
      const b = points[indices[i + 1]];
      const c = points[indices[i + 2]];
      if ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) < 0) {
        [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
      }
    }
    return { points, indices };
  }

  static triangulate(data: ArrayLike<number>, holeIndices: ArrayLike<number> = []): number[] {
    const hasHoles = holeIndices.length > 0;
    const outerLen = hasHoles ? holeIndices[0] * 2 : data.length;
    let outerNode = PolygonUtils._linkedList(data, 0, outerLen, true);
    const triangles: number[] = [];
    if (!outerNode || outerNode.next === outerNode.prev) {
      return triangles;
    }
    let minX = 0,
      minY = 0,
      invSize = 0;
    if (hasHoles) {
      outerNode = PolygonUtils._eliminateHoles(data, holeIndices, outerNode);
    }
    // Spatial indexing avoids testing every vertex against each ear in large polygons
    if (data.length > 160) {
      minX = data[0];
      minY = data[1];
      let maxX = minX;
      let maxY = minY;
      for (let i = 2; i < outerLen; i += 2) {
        const x = data[i];
        const y = data[i + 1];
        if (x < minX) {
          minX = x;
        }
        if (y < minY) {
          minY = y;
        }
        if (x > maxX) {
          maxX = x;
        }
        if (y > maxY) {
          maxY = y;
        }
      }
      // Morton codes use 15 bits per coordinate
      invSize = Math.max(maxX - minX, maxY - minY);
      invSize = invSize !== 0 ? 32767 / invSize : 0;
    }
    PolygonUtils._earcutLinked(outerNode, triangles, minX, minY, invSize, 0);
    return triangles;
  }

  private static _linkedList(
    data: ArrayLike<number>,
    start: number,
    end: number,
    clockwise: boolean
  ): TriangulationNode | null {
    let last: TriangulationNode | null = null;
    if (clockwise === PolygonUtils._signedArea(data, start, end) > 0) {
      for (let i = start; i < end; i += 2) {
        last = PolygonUtils._insertNode((i / 2) | 0, data[i], data[i + 1], last);
      }
    } else {
      for (let i = end - 2; i >= start; i -= 2) {
        last = PolygonUtils._insertNode((i / 2) | 0, data[i], data[i + 1], last);
      }
    }
    if (last && PolygonUtils._equals(last, last.next)) {
      PolygonUtils._removeNode(last);
      last = last.next;
    }
    return last;
  }

  private static _filterPoints(start: TriangulationNode, end: TriangulationNode = start): TriangulationNode {
    let p = start;
    let again: boolean;
    do {
      again = false;
      if (!p.steiner && (PolygonUtils._equals(p, p.next) || PolygonUtils._area(p.prev, p, p.next) === 0)) {
        PolygonUtils._removeNode(p);
        p = end = p.prev;
        if (p === p.next) {
          break;
        }
        again = true;
      } else {
        p = p.next;
      }
    } while (again || p !== end);
    return end;
  }

  private static _earcutLinked(
    ear: TriangulationNode,
    triangles: number[],
    minX: number,
    minY: number,
    invSize: number,
    pass: number
  ): void {
    if (!pass && invSize) {
      PolygonUtils._indexCurve(ear, minX, minY, invSize);
    }
    let stop = ear;
    while (ear.prev !== ear.next) {
      const prev = ear.prev;
      const next = ear.next;
      if (invSize ? PolygonUtils._isEarHashed(ear, minX, minY, invSize) : PolygonUtils._isEar(ear)) {
        triangles.push(prev.i, ear.i, next.i);
        PolygonUtils._removeNode(ear);
        // Skipping the adjacent vertex reduces narrow triangles
        ear = next.next;
        stop = next.next;
        continue;
      }
      ear = next;
      if (ear === stop) {
        // Retry after removing degeneracies, then heal intersections or split the ring
        if (!pass) {
          PolygonUtils._earcutLinked(PolygonUtils._filterPoints(ear), triangles, minX, minY, invSize, 1);
        } else if (pass === 1) {
          ear = PolygonUtils._cureLocalIntersections(PolygonUtils._filterPoints(ear), triangles);
          PolygonUtils._earcutLinked(ear, triangles, minX, minY, invSize, 2);
        } else if (pass === 2) {
          PolygonUtils._splitEarcut(ear, triangles, minX, minY, invSize);
        }
        break;
      }
    }
  }

  private static _isEar(ear: TriangulationNode): boolean {
    const a = ear.prev,
      b = ear,
      c = ear.next;
    if (PolygonUtils._area(a, b, c) >= 0) {
      return false;
    }
    const ax = a.x,
      bx = b.x,
      cx = c.x,
      ay = a.y,
      by = b.y,
      cy = c.y;
    const x0 = Math.min(ax, bx, cx),
      y0 = Math.min(ay, by, cy),
      x1 = Math.max(ax, bx, cx),
      y1 = Math.max(ay, by, cy);
    let p = c.next;
    while (p !== a) {
      if (
        p.x >= x0 &&
        p.x <= x1 &&
        p.y >= y0 &&
        p.y <= y1 &&
        PolygonUtils._pointInTriangleExceptFirst(ax, ay, bx, by, cx, cy, p.x, p.y) &&
        PolygonUtils._area(p.prev, p, p.next) >= 0
      ) {
        return false;
      }
      p = p.next;
    }
    return true;
  }

  private static _isEarHashed(ear: TriangulationNode, minX: number, minY: number, invSize: number): boolean {
    const a = ear.prev,
      b = ear,
      c = ear.next;
    if (PolygonUtils._area(a, b, c) >= 0) {
      return false;
    }
    const ax = a.x,
      bx = b.x,
      cx = c.x,
      ay = a.y,
      by = b.y,
      cy = c.y;
    const x0 = Math.min(ax, bx, cx),
      y0 = Math.min(ay, by, cy),
      x1 = Math.max(ax, bx, cx),
      y1 = Math.max(ay, by, cy);
    const minZ = PolygonUtils._zOrder(x0, y0, minX, minY, invSize),
      maxZ = PolygonUtils._zOrder(x1, y1, minX, minY, invSize);
    let p = ear.prevZ,
      n = ear.nextZ;
    while (p && p.z >= minZ && n && n.z <= maxZ) {
      if (
        p.x >= x0 &&
        p.x <= x1 &&
        p.y >= y0 &&
        p.y <= y1 &&
        p !== a &&
        p !== c &&
        PolygonUtils._pointInTriangleExceptFirst(ax, ay, bx, by, cx, cy, p.x, p.y) &&
        PolygonUtils._area(p.prev, p, p.next) >= 0
      ) {
        return false;
      }
      p = p.prevZ;
      if (
        n.x >= x0 &&
        n.x <= x1 &&
        n.y >= y0 &&
        n.y <= y1 &&
        n !== a &&
        n !== c &&
        PolygonUtils._pointInTriangleExceptFirst(ax, ay, bx, by, cx, cy, n.x, n.y) &&
        PolygonUtils._area(n.prev, n, n.next) >= 0
      ) {
        return false;
      }
      n = n.nextZ;
    }
    while (p && p.z >= minZ) {
      if (
        p.x >= x0 &&
        p.x <= x1 &&
        p.y >= y0 &&
        p.y <= y1 &&
        p !== a &&
        p !== c &&
        PolygonUtils._pointInTriangleExceptFirst(ax, ay, bx, by, cx, cy, p.x, p.y) &&
        PolygonUtils._area(p.prev, p, p.next) >= 0
      ) {
        return false;
      }
      p = p.prevZ;
    }
    while (n && n.z <= maxZ) {
      if (
        n.x >= x0 &&
        n.x <= x1 &&
        n.y >= y0 &&
        n.y <= y1 &&
        n !== a &&
        n !== c &&
        PolygonUtils._pointInTriangleExceptFirst(ax, ay, bx, by, cx, cy, n.x, n.y) &&
        PolygonUtils._area(n.prev, n, n.next) >= 0
      ) {
        return false;
      }
      n = n.nextZ;
    }
    return true;
  }

  private static _cureLocalIntersections(start: TriangulationNode, triangles: number[]): TriangulationNode {
    let p = start;
    do {
      const a = p.prev,
        b = p.next.next;
      if (
        !PolygonUtils._equals(a, b) &&
        PolygonUtils._intersects(a, p, p.next, b) &&
        PolygonUtils._locallyInside(a, b) &&
        PolygonUtils._locallyInside(b, a)
      ) {
        triangles.push(a.i, p.i, b.i);
        PolygonUtils._removeNode(p);
        PolygonUtils._removeNode(p.next);
        p = start = b;
      }
      p = p.next;
    } while (p !== start);
    return PolygonUtils._filterPoints(p);
  }

  private static _splitEarcut(
    start: TriangulationNode,
    triangles: number[],
    minX: number,
    minY: number,
    invSize: number
  ): void {
    let a = start;
    do {
      let b = a.next.next;
      while (b !== a.prev) {
        if (a.i !== b.i && PolygonUtils._isValidDiagonal(a, b)) {
          let c = PolygonUtils._splitPolygon(a, b);
          a = PolygonUtils._filterPoints(a, a.next);
          c = PolygonUtils._filterPoints(c, c.next);
          PolygonUtils._earcutLinked(a, triangles, minX, minY, invSize, 0);
          PolygonUtils._earcutLinked(c, triangles, minX, minY, invSize, 0);
          return;
        }
        b = b.next;
      }
      a = a.next;
    } while (a !== start);
  }

  private static _eliminateHoles(
    data: ArrayLike<number>,
    holeIndices: ArrayLike<number>,
    outerNode: TriangulationNode
  ): TriangulationNode {
    const queue: TriangulationNode[] = [];
    for (let i = 0, len = holeIndices.length; i < len; i++) {
      const start = holeIndices[i] * 2;
      const end = i < len - 1 ? holeIndices[i + 1] * 2 : data.length;
      const list = PolygonUtils._linkedList(data, start, end, false)!;
      if (list === list.next) {
        list.steiner = true;
      }
      queue.push(PolygonUtils._getLeftmost(list));
    }
    queue.sort(PolygonUtils._compareXYSlope);
    for (let i = 0; i < queue.length; i++) {
      outerNode = PolygonUtils._eliminateHole(queue[i], outerNode);
    }
    return outerNode;
  }

  private static _compareXYSlope(a: TriangulationNode, b: TriangulationNode): number {
    let result = a.x - b.x;
    // Touching holes must be bridged in counterclockwise order at their shared vertex
    if (result === 0) {
      result = a.y - b.y;
      if (result === 0) {
        const aSlope = (a.next.y - a.y) / (a.next.x - a.x);
        const bSlope = (b.next.y - b.y) / (b.next.x - b.x);
        result = aSlope - bSlope;
      }
    }
    return result;
  }

  private static _eliminateHole(hole: TriangulationNode, outerNode: TriangulationNode): TriangulationNode {
    const bridge = PolygonUtils._findHoleBridge(hole, outerNode);
    if (!bridge) {
      return outerNode;
    }
    const bridgeReverse = PolygonUtils._splitPolygon(bridge, hole);
    // Joining rings can introduce collinear vertices on either side of the bridge
    PolygonUtils._filterPoints(bridgeReverse, bridgeReverse.next);
    return PolygonUtils._filterPoints(bridge, bridge.next);
  }

  private static _findHoleBridge(hole: TriangulationNode, outerNode: TriangulationNode): TriangulationNode | null {
    let p = outerNode;
    const hx = hole.x;
    const hy = hole.y;
    let qx = -Infinity;
    let m: TriangulationNode | null = null;
    // Cast left from the hole and choose a visible endpoint on the nearest intersected edge
    if (PolygonUtils._equals(hole, p)) {
      return p;
    }
    do {
      if (PolygonUtils._equals(hole, p.next)) {
        return p.next;
      } else if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
        const x = p.x + ((hy - p.y) * (p.next.x - p.x)) / (p.next.y - p.y);
        if (x <= hx && x > qx) {
          qx = x;
          m = p.x < p.next.x ? p : p.next;
          if (x === hx) {
            return m;
          }
        }
      }
      p = p.next;
    } while (p !== outerNode);
    if (!m) {
      return null;
    }
    // A vertex inside the candidate triangle may provide a closer visible bridge
    const stop = m;
    const mx = m.x;
    const my = m.y;
    let tanMin = Infinity;
    p = m;
    do {
      if (
        hx >= p.x &&
        p.x >= mx &&
        hx !== p.x &&
        PolygonUtils._pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)
      ) {
        const tan = Math.abs(hy - p.y) / (hx - p.x);
        if (
          PolygonUtils._locallyInside(p, hole) &&
          (tan < tanMin || (tan === tanMin && (p.x > m.x || (p.x === m.x && PolygonUtils._sectorContainsSector(m, p)))))
        ) {
          m = p;
          tanMin = tan;
        }
      }
      p = p.next;
    } while (p !== stop);
    return m;
  }

  private static _sectorContainsSector(m: TriangulationNode, p: TriangulationNode): boolean {
    return PolygonUtils._area(m.prev, m, p.prev) < 0 && PolygonUtils._area(p.next, m, m.next) < 0;
  }

  private static _indexCurve(start: TriangulationNode, minX: number, minY: number, invSize: number): void {
    let p = start;
    do {
      if (p.z === 0) {
        p.z = PolygonUtils._zOrder(p.x, p.y, minX, minY, invSize);
      }
      p.prevZ = p.prev;
      p.nextZ = p.next;
      p = p.next;
    } while (p !== start);
    p.prevZ!.nextZ = null;
    p.prevZ = null;
    PolygonUtils._sortLinked(p);
  }

  private static _sortLinked(list: TriangulationNode | null): TriangulationNode | null {
    // Bottom-up merge sort keeps the Morton-code list linked without allocating an array
    let numMerges: number;
    let inSize = 1;
    do {
      let p = list;
      let e: TriangulationNode;
      list = null;
      let tail: TriangulationNode | null = null;
      numMerges = 0;
      while (p) {
        numMerges++;
        let q: TriangulationNode | null = p;
        let pSize = 0;
        for (let i = 0; i < inSize; i++) {
          pSize++;
          q = q!.nextZ;
          if (!q) {
            break;
          }
        }
        let qSize = inSize;
        while (pSize > 0 || (qSize > 0 && q)) {
          if (pSize !== 0 && (qSize === 0 || !q || p!.z <= q.z)) {
            e = p!;
            p = p!.nextZ;
            pSize--;
          } else {
            e = q!;
            q = q!.nextZ;
            qSize--;
          }
          if (tail) {
            tail.nextZ = e;
          } else {
            list = e;
          }
          e.prevZ = tail;
          tail = e;
        }
        p = q;
      }
      tail!.nextZ = null;
      inSize *= 2;
    } while (numMerges > 1);
    return list;
  }

  private static _zOrder(x: number, y: number, minX: number, minY: number, invSize: number): number {
    x = ((x - minX) * invSize) | 0;
    y = ((y - minY) * invSize) | 0;
    x = (x | (x << 8)) & 0x00ff00ff;
    x = (x | (x << 4)) & 0x0f0f0f0f;
    x = (x | (x << 2)) & 0x33333333;
    x = (x | (x << 1)) & 0x55555555;
    y = (y | (y << 8)) & 0x00ff00ff;
    y = (y | (y << 4)) & 0x0f0f0f0f;
    y = (y | (y << 2)) & 0x33333333;
    y = (y | (y << 1)) & 0x55555555;
    return x | (y << 1);
  }

  private static _getLeftmost(start: TriangulationNode): TriangulationNode {
    let p = start,
      leftmost = start;
    do {
      if (p.x < leftmost.x || (p.x === leftmost.x && p.y < leftmost.y)) {
        leftmost = p;
      }
      p = p.next;
    } while (p !== start);
    return leftmost;
  }

  private static _pointInTriangle(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cy: number,
    px: number,
    py: number
  ): boolean {
    return (
      (cx - px) * (ay - py) >= (ax - px) * (cy - py) &&
      (ax - px) * (by - py) >= (bx - px) * (ay - py) &&
      (bx - px) * (cy - py) >= (cx - px) * (by - py)
    );
  }

  private static _pointInTriangleExceptFirst(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cy: number,
    px: number,
    py: number
  ): boolean {
    return !(ax === px && ay === py) && PolygonUtils._pointInTriangle(ax, ay, bx, by, cx, cy, px, py);
  }

  private static _isValidDiagonal(a: TriangulationNode, b: TriangulationNode): boolean {
    return !!(
      a.next.i !== b.i &&
      a.prev.i !== b.i &&
      !PolygonUtils._intersectsPolygon(a, b) &&
      ((PolygonUtils._locallyInside(a, b) &&
        PolygonUtils._locallyInside(b, a) &&
        PolygonUtils._middleInside(a, b) &&
        (PolygonUtils._area(a.prev, a, b.prev) || PolygonUtils._area(a, b.prev, b))) ||
        (PolygonUtils._equals(a, b) &&
          PolygonUtils._area(a.prev, a, a.next) > 0 &&
          PolygonUtils._area(b.prev, b, b.next) > 0))
    );
  }

  private static _area(p: TriangulationNode, q: TriangulationNode, r: TriangulationNode): number {
    return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  }

  private static _equals(p1: TriangulationNode, p2: TriangulationNode): boolean {
    return p1.x === p2.x && p1.y === p2.y;
  }

  private static _intersects(
    p1: TriangulationNode,
    q1: TriangulationNode,
    p2: TriangulationNode,
    q2: TriangulationNode
  ): boolean {
    const o1 = PolygonUtils._sign(PolygonUtils._area(p1, q1, p2));
    const o2 = PolygonUtils._sign(PolygonUtils._area(p1, q1, q2));
    const o3 = PolygonUtils._sign(PolygonUtils._area(p2, q2, p1));
    const o4 = PolygonUtils._sign(PolygonUtils._area(p2, q2, q1));
    if (o1 !== o2 && o3 !== o4) {
      return true;
    }
    if (o1 === 0 && PolygonUtils._onSegment(p1, p2, q1)) {
      return true;
    }
    if (o2 === 0 && PolygonUtils._onSegment(p1, q2, q1)) {
      return true;
    }
    if (o3 === 0 && PolygonUtils._onSegment(p2, p1, q2)) {
      return true;
    }
    if (o4 === 0 && PolygonUtils._onSegment(p2, q1, q2)) {
      return true;
    }
    return false;
  }

  private static _onSegment(p: TriangulationNode, q: TriangulationNode, r: TriangulationNode): boolean {
    return (
      q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y)
    );
  }

  private static _sign(num: number): number {
    return num > 0 ? 1 : num < 0 ? -1 : 0;
  }

  private static _intersectsPolygon(a: TriangulationNode, b: TriangulationNode): boolean {
    let p = a;
    do {
      if (
        p.i !== a.i &&
        p.next.i !== a.i &&
        p.i !== b.i &&
        p.next.i !== b.i &&
        PolygonUtils._intersects(p, p.next, a, b)
      ) {
        return true;
      }
      p = p.next;
    } while (p !== a);
    return false;
  }

  private static _locallyInside(a: TriangulationNode, b: TriangulationNode): boolean {
    return PolygonUtils._area(a.prev, a, a.next) < 0
      ? PolygonUtils._area(a, b, a.next) >= 0 && PolygonUtils._area(a, a.prev, b) >= 0
      : PolygonUtils._area(a, b, a.prev) < 0 || PolygonUtils._area(a, a.next, b) < 0;
  }

  private static _middleInside(a: TriangulationNode, b: TriangulationNode): boolean {
    let p = a;
    let inside = false;
    const px = (a.x + b.x) / 2;
    const py = (a.y + b.y) / 2;
    do {
      if (
        p.y > py !== p.next.y > py &&
        p.next.y !== p.y &&
        px < ((p.next.x - p.x) * (py - p.y)) / (p.next.y - p.y) + p.x
      ) {
        inside = !inside;
      }
      p = p.next;
    } while (p !== a);
    return inside;
  }

  private static _splitPolygon(a: TriangulationNode, b: TriangulationNode): TriangulationNode {
    const a2 = new TriangulationNode(a.i, a.x, a.y),
      b2 = new TriangulationNode(b.i, b.x, b.y),
      an = a.next,
      bp = b.prev;
    a.next = b;
    b.prev = a;
    a2.next = an;
    an.prev = a2;
    b2.next = a2;
    a2.prev = b2;
    bp.next = b2;
    b2.prev = bp;
    return b2;
  }

  private static _insertNode(i: number, x: number, y: number, last: TriangulationNode | null): TriangulationNode {
    const p = new TriangulationNode(i, x, y);
    if (last) {
      p.next = last.next;
      p.prev = last;
      last.next.prev = p;
      last.next = p;
    }
    return p;
  }

  private static _removeNode(p: TriangulationNode): void {
    p.next.prev = p.prev;
    p.prev.next = p.next;
    if (p.prevZ) {
      p.prevZ.nextZ = p.nextZ;
    }
    if (p.nextZ) {
      p.nextZ.prevZ = p.prevZ;
    }
  }

  private static _signedArea(data: ArrayLike<number>, start: number, end: number): number {
    let sum = 0;
    for (let i = start, j = end - 2; i < end; i += 2) {
      sum += (data[j] - data[i]) * (data[i + 1] + data[j + 1]);
      j = i;
    }
    return sum;
  }
}

class TriangulationNode {
  readonly i: number;
  readonly x: number;
  readonly y: number;
  prev: TriangulationNode = this;
  next: TriangulationNode = this;
  z: number = 0;
  prevZ: TriangulationNode | null = null;
  nextZ: TriangulationNode | null = null;
  steiner: boolean = false;

  constructor(i: number, x: number, y: number) {
    this.i = i;
    this.x = x;
    this.y = y;
  }
}
