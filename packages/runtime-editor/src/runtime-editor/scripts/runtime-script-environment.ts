/** Host modules are fixed for one project session. Values are the running Engine's
 * actual classes/functions; declarations describe Script assets, never execute permissions. */
export interface RuntimeScriptModule {
  readonly name: string;
  readonly exports: Readonly<Record<string, unknown>>;
  /** Package-relative declaration files, including index.d.ts. */
  readonly declarations: Readonly<Record<string, string>>;
}

export function createRuntimeScriptEnvironment(
  base: Readonly<Record<string, unknown>>,
  modules: readonly RuntimeScriptModule[] = []
) {
  const externals: Record<string, unknown> = { ...base };
  const declarations: Record<string, string> = {};
  for (const module of modules) {
    if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(module.name))
      throw new Error(`Invalid runtime module name '${module.name}'`);
    if (Object.hasOwn(externals, module.name)) throw new Error(`Duplicate runtime module '${module.name}'`);
    if (!Object.hasOwn(module.declarations, "index.d.ts"))
      throw new Error(`Missing runtime declaration entry for '${module.name}'`);
    const prefix = `engine/node_modules/${module.name}/`;
    declarations[prefix + "package.json"] = JSON.stringify({ name: module.name, types: "index.d.ts" });
    for (const [path, text] of Object.entries(module.declarations)) {
      if (
        !path.endsWith(".d.ts") ||
        path.includes("\\") ||
        path.split("/").some((part) => !part || part === "." || part === "..")
      )
        throw new Error(`Invalid runtime declaration path '${path}'`);
      declarations[prefix + path] = text;
    }
    externals[module.name] = Object.freeze({ ...module.exports });
  }
  return Object.freeze({ externals: Object.freeze(externals), declarations: Object.freeze(declarations) });
}
