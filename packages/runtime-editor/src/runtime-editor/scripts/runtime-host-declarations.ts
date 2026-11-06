import declarations from "../generated/host-runtime-files.json";

/** Publish only declarations for host modules actually available to this project. */
export function runtimeHostDeclarations(moduleNames: readonly string[]) {
  const enabled = new Set(moduleNames);
  return Object.fromEntries(
    Object.entries(declarations).filter(([path]) => {
      const name = /^engine\/node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(path)?.[1];
      return name !== undefined && enabled.has(name);
    })
  );
}
