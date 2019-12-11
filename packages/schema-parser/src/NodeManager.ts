import * as o3 from "@alipay/o3";
import { Oasis } from "./Oasis";

export class NodeManager {
  private nodeMap: { [id: string]: o3.Node } = {};

  constructor(private oasis: Oasis) {}
  public add(nodeConfig: NodeConfig) {}

  public update(id: string, key: string, value: any) {
    this.get(id)[key] = value;
  }

  public get(id: string): o3.Node {
    return this.nodeMap[id];
  }

  public delete(id: string) {}
}
