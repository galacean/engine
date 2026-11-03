const URI_SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

/**
 * Requires one portable path relative to the exported artifact root.
 * @param value Candidate Project path or resource reference.
 * @param label Human-readable owner used in validation failures.
 * @returns The unchanged path after validation.
 * @throws If the value is empty, absolute, encoded, traversing, or otherwise URL-ambiguous.
 */
export function requireTerrainArtifactRelativePath(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a nonempty artifact-relative path`);
  }
  if (
    value.startsWith("/") ||
    value.startsWith("~/") ||
    URI_SCHEME_PATTERN.test(value) ||
    value.includes("\\") ||
    value.includes("%") ||
    value.includes("?") ||
    value.includes("#") ||
    CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    throw new Error(`${label} "${value}" is not a portable artifact-relative path`);
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw new Error(`${label} "${value}" is not a portable artifact-relative path`);
  }
  return value;
}
