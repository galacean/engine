import { Engine } from "../Engine";
import { GeometryShape } from "./GeometryShape";

/**
 * 长方体
 */
export class CuboidGeometry extends GeometryShape {
  /**
   * 创建长方体。
   * @param width - 宽
   * @param height - 高
   * @param depth - 深
   * @param engine - 引擎
   */
  constructor(width: number = 1, height: number = 1, depth: number = 1, engine?: Engine) {
    super();
    const halfDepth: number = depth / 2;
    const halfHeight: number = height / 2;
    const halfWidth: number = width / 2;

    // prettier-ignore
    const vertices: Float32Array = new Float32Array([
    	// up
    	-halfDepth, halfHeight, -halfWidth, 0, 1, 0, 0, 0, halfDepth, halfHeight, -halfWidth, 0, 1, 0, 1, 0, halfDepth, halfHeight, halfWidth, 0, 1, 0, 1, 1, -halfDepth, halfHeight, halfWidth, 0, 1, 0, 0, 1,
    	// down
    	-halfDepth, -halfHeight, -halfWidth, 0, -1, 0, 0, 1, halfDepth, -halfHeight, -halfWidth, 0, -1, 0, 1, 1, halfDepth, -halfHeight, halfWidth, 0, -1, 0, 1, 0, -halfDepth, -halfHeight, halfWidth, 0, -1, 0, 0, 0,
    	// left
    	-halfDepth, halfHeight, -halfWidth, -1, 0, 0, 0, 0, -halfDepth, halfHeight, halfWidth, -1, 0, 0, 1, 0, -halfDepth, -halfHeight, halfWidth, -1, 0, 0, 1, 1, -halfDepth, -halfHeight, -halfWidth, -1, 0, 0, 0, 1,
    	// right
    	halfDepth, halfHeight, -halfWidth, 1, 0, 0, 1, 0, halfDepth, halfHeight, halfWidth, 1, 0, 0, 0, 0, halfDepth, -halfHeight, halfWidth, 1, 0, 0, 0, 1, halfDepth, -halfHeight, -halfWidth, 1, 0, 0, 1, 1,
    	// fornt
    	-halfDepth, halfHeight, halfWidth, 0, 0, 1, 0, 0, halfDepth, halfHeight, halfWidth, 0, 0, 1, 1, 0, halfDepth, -halfHeight, halfWidth, 0, 0, 1, 1, 1, -halfDepth, -halfHeight, halfWidth, 0, 0, 1, 0, 1,
    	// back
    	-halfDepth, halfHeight, -halfWidth, 0, 0, -1, 1, 0, halfDepth, halfHeight, -halfWidth, 0, 0, -1, 0, 0, halfDepth, -halfHeight, -halfWidth, 0, 0, -1, 0, 1, -halfDepth, -halfHeight, -halfWidth, 0, 0, -1, 1, 1]);

    // prettier-ignore
    const indices: Uint16Array = new Uint16Array([
    	// up
    	0, 1, 2, 2, 3, 0,
    	// donw
    	4, 7, 6, 6, 5, 4,
    	// left
    	8, 9, 10, 10, 11, 8,
    	// right
    	12, 15, 14, 14, 13, 12,
    	// fornt
    	16, 17, 18, 18, 19, 16,
    	// back
    	20, 23, 22, 22, 21, 20]);
    this._initialize(engine, vertices, indices);
  }
}
