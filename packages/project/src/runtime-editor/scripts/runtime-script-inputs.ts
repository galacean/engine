import type { RuntimeProjectPackage } from "../project/runtime-project";

/** Project-authored declarations participate in Script checking and cache invalidation. */
export function projectScriptInputs(pack: RuntimeProjectPackage) {
  const declarations = Object.fromEntries(
    Object.entries(pack.documents ?? {})
      .filter(([path]) => path.endsWith(".d.ts"))
      .map(([path, text]) => [`declare/runtime/assets/${path}`, text])
  );
  return { declarations };
}
