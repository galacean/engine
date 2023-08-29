export interface IXRHitTest {
  hitTest(x: number, y: number): Promise<any>;
}
