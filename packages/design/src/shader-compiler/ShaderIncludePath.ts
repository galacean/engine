const SHADER_ROOT_URL = "shaders://root/";
const ABSOLUTE_URL_PATTERN = /^[A-Za-z][A-Za-z\d+.-]*:/;

/**
 * Converts a registered shader-include key to its canonical lookup form.
 * @param includeKey - Logical project path, project-root path, or absolute URL.
 * @returns Canonical registry key without the virtual shader-root prefix.
 * @throws Error when the key is empty or an absolute URL is malformed.
 */
export function normalizeShaderIncludeKey(includeKey: string): string {
  const normalized = includeKey.trim().replace(/\\/g, "/");
  if (!normalized) throw new Error("Shader include key cannot be empty.");
  if (normalized.startsWith(SHADER_ROOT_URL)) {
    const key = new URL(normalized).href.slice(SHADER_ROOT_URL.length);
    if (!key) throw new Error("Shader include key cannot be the virtual shader root.");
    return key;
  }
  if (ABSOLUTE_URL_PATTERN.test(normalized)) {
    return new URL(normalized).href;
  }
  return new URL(normalized.replace(/^\/+/, ""), SHADER_ROOT_URL).href.slice(SHADER_ROOT_URL.length);
}
