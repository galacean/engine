import { Oasis } from "../Oasis";
import { PluginHook } from "./PluginManager";
import * as o3 from "@alipay/o3";

export abstract class Plugin implements PluginHook {
  constructor() {}

  abstract resourceAdded?(resouce: any): any;
}
