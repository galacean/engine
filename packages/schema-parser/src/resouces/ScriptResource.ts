import { SchemaResource } from "./SchemaResource";
import * as o3 from "@alipay/o3-plus";

export class ScriptResource extends SchemaResource {
  load(resourceLoader: o3.ResourceLoader): Promise<ScriptResource> {
    // todo
    return new Promise(resolve => {
      this._resource = null;
      resolve(this);
    });
  }
}
