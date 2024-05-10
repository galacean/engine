import { Component } from "../Component";
import { ignoreClone } from "../clone/CloneManager";

export class UICanvas extends Component {
  /** @internal */
  @ignoreClone
  _uiCanvasIndex: number = -1;
}
