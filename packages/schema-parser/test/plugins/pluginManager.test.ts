import { PluginManager } from "../../src/plugins/PluginManager";
import * as o3 from "@alipay/o3";

describe("plugin manager test", () => {
  let pluginManager: PluginManager;
  beforeEach(() => {
    pluginManager = new PluginManager();
  });

  it("plugin boot", () => {
    const ability = new o3.NodeAbility(null, {});
    // pluginManager.abilityAdded(ability);
  });
});
