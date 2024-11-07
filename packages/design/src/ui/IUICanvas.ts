export interface IUICanvas {
  entity: any;
  sortOrder: number;
  renderMode: number;
  renderCamera: any;
  _canvasIndex: number;
  _renderElement: any;
  _prepareRender(renderContext: any): void;
}
