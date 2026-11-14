/**
 * @internal
 */
export class SubdivisionUtils {
  static subdivideQuads(
    positions: ArrayLike<number>,
    quads: ArrayLike<number>,
    iterations: number
  ): { positions: Float32Array; quads: Uint32Array } {
    let vertexCount = positions.length / 3;
    let faceCount = quads.length / 4;
    const growth = Math.pow(4, iterations);
    // Each pass adds one face point and two shared edge points per quad on a closed surface
    const resultPositions = new Float32Array((vertexCount + faceCount * (growth - 1)) * 3);
    const resultQuads = new Uint32Array(quads.length * growth);
    resultPositions.set(positions);
    resultQuads.set(quads);
    const maxFaceCount = iterations > 0 ? (faceCount * growth) / 4 : 0;
    const facePoints = new Float64Array(maxFaceCount * 3);
    const faceEdges = new Uint32Array(maxFaceCount * 4);
    const edgePoints = new Float64Array(maxFaceCount * 6);
    const edgeIndices = new Uint32Array(maxFaceCount * 2);
    const edges = new Map<number, number>();
    const edgeOrder = [0, 3, 1, 2];

    for (let iteration = 0; iteration < iterations; iteration++) {
      edges.clear();
      let edgeCount = 0;
      for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
        const faceOffset = faceIndex * 4;
        const pointOffset = faceIndex * 3;
        let x = 0;
        let y = 0;
        let z = 0;
        for (let corner = 0; corner < 4; corner++) {
          const offset = 3 * resultQuads[faceOffset + corner];
          x += 0.25 * resultPositions[offset];
          y += 0.25 * resultPositions[offset + 1];
          z += 0.25 * resultPositions[offset + 2];
        }
        facePoints[pointOffset] = x;
        facePoints[pointOffset + 1] = y;
        facePoints[pointOffset + 2] = z;
        for (let corner = 0; corner < 4; corner++) {
          const a = resultQuads[faceOffset + corner];
          const b = resultQuads[faceOffset + ((corner + 1) % 4)];
          const key = Math.min(a, b) * vertexCount + Math.max(a, b);
          let edge = edges.get(key);
          if (edge === undefined) {
            edge = edgeCount++;
            edges.set(key, edge);
            edgeIndices[edge] = 0;
            edgePoints[edge * 3] = 0.25 * (resultPositions[3 * a] + resultPositions[3 * b]);
            edgePoints[edge * 3 + 1] = 0.25 * (resultPositions[3 * a + 1] + resultPositions[3 * b + 1]);
            edgePoints[edge * 3 + 2] = 0.25 * (resultPositions[3 * a + 2] + resultPositions[3 * b + 2]);
          }
          faceEdges[faceOffset + corner] = edge;
          edgePoints[edge * 3] += 0.25 * x;
          edgePoints[edge * 3 + 1] += 0.25 * y;
          edgePoints[edge * 3 + 2] += 0.25 * z;
        }
      }

      let nextVertexIndex = vertexCount + faceCount;
      for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
        const facePointIndex = vertexCount + faceIndex;
        resultPositions[3 * facePointIndex] = facePoints[3 * faceIndex];
        resultPositions[3 * facePointIndex + 1] = facePoints[3 * faceIndex + 1];
        resultPositions[3 * facePointIndex + 2] = facePoints[3 * faceIndex + 2];
        for (let corner = 0; corner < 4; corner++) {
          const edge = faceEdges[faceIndex * 4 + edgeOrder[corner]];
          if (edgeIndices[edge] === 0) {
            const index = nextVertexIndex++;
            edgeIndices[edge] = index;
            resultPositions[3 * index] = edgePoints[3 * edge];
            resultPositions[3 * index + 1] = edgePoints[3 * edge + 1];
            resultPositions[3 * index + 2] = edgePoints[3 * edge + 2];
          }
        }
      }
      // Expand backward so the output cannot overwrite an unread input quad
      for (let faceIndex = faceCount - 1; faceIndex >= 0; faceIndex--) {
        for (let corner = 3; corner >= 0; corner--) {
          const offset = 4 * (4 * faceIndex + corner);
          resultQuads[offset] = resultQuads[4 * faceIndex + corner];
          resultQuads[offset + 1] = edgeIndices[faceEdges[4 * faceIndex + corner]];
          resultQuads[offset + 2] = vertexCount + faceIndex;
          resultQuads[offset + 3] = edgeIndices[faceEdges[4 * faceIndex + ((corner + 3) % 4)]];
        }
      }
      vertexCount = nextVertexIndex;
      faceCount *= 4;
    }
    return { positions: resultPositions, quads: resultQuads };
  }
}
