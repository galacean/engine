export function requireStableId(value: string, label: string): void {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9/_-]*$/i.test(value))
    throw new Error(`Invalid ${label} id: ${value}`);
}

export function requirePositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer.`);
}

export function requireNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer.`);
}

export function requireSystemTime(value: number): void {
  if (!Number.isFinite(value) || value < 0) throw new Error("System time must be a non-negative finite number.");
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertNever(value: never): never {
  throw new Error(`Unsupported farm command: ${JSON.stringify(value)}`);
}
