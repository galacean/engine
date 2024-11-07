export interface IUICanvas {
  entity: any;
  sortOrder: number;
  _canvasIndex: number;
  _renderElement: any;
  _prepareRender(renderContext: any): void;
}
