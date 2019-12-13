import { Oasis } from "../Oasis";
import { PluginHook } from "./PluginManager";
import * as o3 from "@alipay/o3";

export abstract class Plugin implements Partial<PluginHook> {
  constructor(private oasis: Oasis) {}

  abstract nodeAdded?(node: o3.Node): any;
  abstract abilityAdded?(ability: o3.NodeAbility): any;
  abstract resourceAdded?(resouce: any): any;
}
