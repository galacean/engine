/**
 * Allocates stable internal names while preserving names owned by source code or external bindings.
 * @internal
 */
export class NameAllocator {
  private readonly _used = new Set<string>();
  private readonly _names = new Map<object | string, string>();
  private readonly _suffixes = new Map<string, string>();
  private readonly _reserved = new Set<string>();

  /** Source and external identifiers reserved before generation. */
  get reservedNames(): readonly string[] {
    return Array.from(this._reserved);
  }

  /** Allocated identifiers in deterministic allocation order. */
  get generatedNames(): readonly string[] {
    return Array.from(this._names.values());
  }

  /**
   * Reserves an existing identifier before allocating generated names.
   * @param name - Identifier that generated names must not shadow.
   */
  reserve(name: string): void {
    this._reserved.add(name);
    this._occupy(name);
  }

  private _occupy(name: string): void {
    this._used.add(name);
    const match = /^(.*)_([1-9][0-9]*)$/.exec(name);
    if (match) {
      const suffix = match[2];
      const previous = this._suffixes.get(match[1]) ?? "0";
      if (suffix.length > previous.length || (suffix.length === previous.length && suffix > previous))
        this._suffixes.set(match[1], suffix);
    }
  }

  /**
   * Returns the same unique identifier for every use of an identity.
   * @param key - Declaration or logical interface identity, independent of its spelling.
   * @param preferred - Legal, non-reserved identifier carrying the original semantic name.
   * @returns Identifier unique among reserved and allocated names.
   */
  allocate(key: object | string, preferred: string): string {
    const existing = this._names.get(key);
    if (existing !== undefined) return existing;
    let name = preferred;
    if (this._used.has(name)) {
      // Reservation records suffix families, avoiding repeated searches through colliding names.
      name = `${preferred}_${this._increment(this._suffixes.get(preferred) ?? "0")}`;
    }
    this._occupy(name);
    this._names.set(key, name);
    return name;
  }

  private _increment(decimal: string): string {
    // Source identifiers can contain suffixes longer than JavaScript's exact integer range.
    for (let i = decimal.length - 1; i >= 0; i--) {
      if (decimal[i] !== "9") {
        return decimal.slice(0, i) + String(Number(decimal[i]) + 1) + "0".repeat(decimal.length - i - 1);
      }
    }
    return "1" + "0".repeat(decimal.length);
  }

  /** Releases all identities and reservations between compilation requests. */
  reset(): void {
    this._used.clear();
    this._names.clear();
    this._suffixes.clear();
    this._reserved.clear();
  }
}
