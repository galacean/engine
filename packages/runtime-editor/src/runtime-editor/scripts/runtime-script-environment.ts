/** Host modules are fixed for one project session. Values are the running Engine's
 * actual classes/functions; declarations describe Script assets, never execute permissions. */
export interface RuntimeScriptModule {
  readonly name: string;
  readonly exports: Readonly<Record<string, unknown>>;
  /** Package-relative declaration files, including index.d.ts. */
  readonly declarations?: Readonly<Record<string, string>>;
  /** Package-relative declaration paths when declarations are loaded lazily. */
  readonly declarationPaths?: readonly string[];
  /** Lazy loader for package-relative declaration files, including index.d.ts. */
  readonly loadDeclarations?: () => Promise<Readonly<Record<string, string>>>;
}

function validateDeclarationPath(path: string): void {
  if (
    !path.endsWith(".d.ts") ||
    path.includes("\\") ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error(`Invalid runtime declaration path '${path}'`);
}

export function createRuntimeScriptEnvironment(
  base: Readonly<Record<string, unknown>>,
  modules: readonly RuntimeScriptModule[] = []
) {
  const externals: Record<string, unknown> = { ...base };
  const declarations: Record<string, string> = {};
  const declarationPathSet = new Set<string>();
  const lazyModules: {
    readonly name: string;
    readonly prefix: string;
    readonly load: () => Promise<Readonly<Record<string, string>>>;
  }[] = [];

  for (const module of modules) {
    if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(module.name))
      throw new Error(`Invalid runtime module name '${module.name}'`);
    if (Object.hasOwn(externals, module.name)) throw new Error(`Duplicate runtime module '${module.name}'`);
    const prefix = `declare/engine/node_modules/${module.name}/`;
    const packageJsonPath = prefix + "package.json";
    declarations[packageJsonPath] = JSON.stringify({ name: module.name, types: "index.d.ts" });
    declarationPathSet.add(packageJsonPath);

    if (module.declarations) {
      if (!Object.hasOwn(module.declarations, "index.d.ts"))
        throw new Error(`Missing runtime declaration entry for '${module.name}'`);
      for (const [path, text] of Object.entries(module.declarations)) {
        validateDeclarationPath(path);
        const fullPath = prefix + path;
        declarations[fullPath] = text;
        declarationPathSet.add(fullPath);
      }
    } else if (module.loadDeclarations) {
      const paths = module.declarationPaths ?? ["index.d.ts"];
      if (!paths.includes("index.d.ts")) throw new Error(`Missing runtime declaration entry for '${module.name}'`);
      for (const path of paths) {
        validateDeclarationPath(path);
        declarationPathSet.add(prefix + path);
      }
      lazyModules.push({ name: module.name, prefix, load: module.loadDeclarations });
    } else {
      throw new Error(`Missing runtime declaration entry for '${module.name}'`);
    }
    externals[module.name] = Object.freeze({ ...module.exports });
  }

  const frozenEagerDeclarations = Object.freeze(declarations);
  const frozenPaths = Object.freeze([...declarationPathSet]);
  let resolvedDeclarations: Readonly<Record<string, string>> | undefined =
    lazyModules.length === 0 ? frozenEagerDeclarations : undefined;
  let loadingDeclarations: Promise<Readonly<Record<string, string>>> | undefined;

  const loadDeclarations = async (): Promise<Readonly<Record<string, string>>> => {
    if (resolvedDeclarations) return resolvedDeclarations;
    loadingDeclarations ??= Promise.all(
      lazyModules.map(async (entry) => {
        const files = await entry.load();
        if (!Object.hasOwn(files, "index.d.ts"))
          throw new Error(`Missing runtime declaration entry for '${entry.name}'`);
        const prefixed: Record<string, string> = {};
        for (const [path, text] of Object.entries(files)) {
          validateDeclarationPath(path);
          prefixed[entry.prefix + path] = text;
        }
        return prefixed;
      })
    )
      .then((chunks) => {
        const merged: Record<string, string> = { ...frozenEagerDeclarations };
        for (const chunk of chunks) Object.assign(merged, chunk);
        resolvedDeclarations = Object.freeze(merged);
        return resolvedDeclarations;
      })
      .catch((error) => {
        loadingDeclarations = undefined;
        throw error;
      });
    return loadingDeclarations;
  };

  return Object.freeze({
    externals: Object.freeze(externals),
    declarations: frozenEagerDeclarations,
    declarationPaths: frozenPaths,
    loadDeclarations
  });
}
