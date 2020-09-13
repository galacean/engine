/**
 * 绘制基元拓扑。
 */
export enum PrimitiveTopology {
  /** 绘制一系列点 */
  POINTS = 0, // gl.POINTS
  /** 绘制一系列单独线段，每两个点作为一条线段的端点。 */
  LINES = 1, // gl.LINES
  /** 绘制一系列线段，上一点连接下一点，并且最后一点与第一个点相连。  */
  LINE_LOOP = 2, // gl.LINE_LOOP
  /** 绘制一系列线段，上一点连接下一点。 */
  LINE_STRIP = 3, // gl.LINE_STRIP
  /** 绘制一系列三角形, 每三个点作为顶点。 */
  TRIANGLES = 4, // gl.TRIANGLES
  /** 绘制一个三角带。 */
  TRIANGLE_STRIP = 5, // gl.TRIANGLE_STRIP
  /** 绘制一个三角扇。 */
  TRIANGLE_FAN = 6 // gl.TRIANGLE_FAN
}
