import { assertProjectPath } from "../../project-files/virtual-project-files";

/** Resolve explicitly relative asset references once, at a package/module boundary. */
export function resolveAssetPath(reference: string, baseDirectory: string): string {
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(reference) || reference.includes("?") || reference.includes("#"))
    throw new Error(`Expected a virtual asset path: '${reference}'`);
  if (!reference.startsWith("./") && !reference.startsWith("../")) {
    assertProjectPath(reference);
    return reference;
  }
  const parts = baseDirectory ? baseDirectory.split("/") : [];
  for (const part of reference.split("/")) {
    if (part === ".") continue;
    if (part === "..") {
      if (!parts.length) throw new Error(`Asset path escapes the project: '${reference}'`);
      parts.pop();
    } else parts.push(part);
  }
  const result = parts.join("/");
  assertProjectPath(result);
  return result;
}
