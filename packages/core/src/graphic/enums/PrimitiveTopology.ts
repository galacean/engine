/**
 * 绘制基元拓扑。
 */
export enum PrimitiveTopology {
  /** 绘制一系列点。*/
  Points = 0,
  /** 绘制一系列单独线段，每两个点作为一条线段的端点。*/
  Lines = 1,
  /** 绘制一系列线段，上一点连接下一点，并且最后一点与第一个点相连。*/
  LineLoop = 2,
  /** 绘制一系列线段，上一点连接下一点。*/
  LineStrip = 3,
  /** 绘制一系列三角形, 每三个点绘制一个三角形。*/
  Triangles = 4,
  /** 绘制一个三角带。*/
  TriangleStrip = 5,
  /** 绘制一个三角扇。*/
  TriangleFan = 6
}
