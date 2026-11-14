/** Native JSON dependencies retain virtual identities when passed to pure domain compilers. */
export function resolvePlantJSONReferences(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if ("$ref" in value && typeof value.$ref === "string" && Object.keys(value).length === 1) return value.$ref;
  if (Array.isArray(value)) return value.map(resolvePlantJSONReferences);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolvePlantJSONReferences(item)]));
}

/** Storage only: shared parameter records decode to the existing final plant schema. */
export interface EncodedPlantParameters {
  readonly encoding: "plant-shared-tables";
  readonly version: 1;
  readonly strings: readonly string[];
  /** Field names, as string-table references, shared by records with the same fields. */
  readonly layouts: readonly (readonly number[])[];
  readonly count: number;
  /** Postorder parameter table; its last entry is the document root. */
  readonly data: string;
}

// Wire tags are part of version 1. References/counts use unsigned LEB128, numbers
// use IEEE-754 float64 little endian. No rounding, default removal or geometry baking.
const Null = 0,
  False = 1,
  True = 2,
  NumberValue = 3,
  StringValue = 4,
  ArrayValue = 5,
  RecordValue = 6,
  NumberArray = 7;
const format = "plant-shared-tables";

export function encodePlantParameters(value: unknown): EncodedPlantParameters {
  const strings: string[] = [],
    layouts: number[][] = [],
    bytes: number[] = [];
  const stringIds = new Map<string, number>(),
    layoutIds = new Map<string, number>();
  const records = new Map<string, number>(),
    visiting = new Set<object>();
  const float = new DataView(new ArrayBuffer(8));
  const stringId = (text: string): number => {
    let id = stringIds.get(text);
    if (id === undefined) {
      id = strings.length;
      strings.push(text);
      stringIds.set(text, id);
    }
    return id;
  };
  const uint = (n: number): void => {
    if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) throw new Error("Plant parameter table exceeds uint32");
    do {
      const low = n % 128;
      n = Math.floor(n / 128);
      bytes.push(low + (n ? 128 : 0));
    } while (n);
  };
  const number = (n: number): void => {
    float.setFloat64(0, n, true);
    for (let i = 0; i < 8; i++) bytes.push(float.getUint8(i));
  };
  const numericKey = (n: number): string => {
    if (!Number.isFinite(n)) throw new Error("Plant parameters must contain finite numbers");
    return Object.is(n, -0) ? "-0" : String(n);
  };
  const intern = (key: string, write: () => void): number => {
    const previous = records.get(key);
    if (previous !== undefined) return previous;
    const id = records.size;
    write();
    records.set(key, id);
    return id;
  };
  const visit = (v: unknown): number => {
    if (v === null) return intern("null", () => bytes.push(Null));
    if (typeof v === "boolean") return intern(String(v), () => bytes.push(v ? True : False));
    if (typeof v === "number")
      return intern(`n:${numericKey(v)}`, () => {
        bytes.push(NumberValue);
        number(v);
      });
    if (typeof v === "string") {
      const id = stringId(v);
      return intern(`s:${id}`, () => {
        bytes.push(StringValue);
        uint(id);
      });
    }
    if (!v || typeof v !== "object" || (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype))
      throw new Error("Plant parameters must be plain JSON values");
    if (visiting.has(v)) throw new Error("Cyclic plant parameters");
    visiting.add(v);
    let result: number;
    if (Array.isArray(v) && v.every((n) => typeof n === "number")) {
      // Numeric vectors keep their exact doubles in one entry, without a reference per scalar.
      result = intern(`v:${v.map(numericKey).join(",")}`, () => {
        bytes.push(NumberArray);
        uint(v.length);
        v.forEach(number);
      });
    } else if (Array.isArray(v)) {
      const refs = v.map(visit);
      result = intern(`a:${refs.join(",")}`, () => {
        bytes.push(ArrayValue);
        uint(refs.length);
        refs.forEach(uint);
      });
    } else {
      // Preserve iteration order as well as values: material/shape maps may be enumerated.
      const keys = Object.keys(v),
        fields = keys.map(stringId);
      const layoutKey = fields.join(",");
      let layout = layoutIds.get(layoutKey);
      if (layout === undefined) {
        layout = layouts.length;
        layouts.push(fields);
        layoutIds.set(layoutKey, layout);
      }
      const refs = keys.map((key) => visit((v as Record<string, unknown>)[key]));
      result = intern(`o:${layout}:${refs.join(",")}`, () => {
        bytes.push(RecordValue);
        uint(layout);
        refs.forEach(uint);
      });
    }
    visiting.delete(v);
    return result;
  };
  visit(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { encoding: format, version: 1, strings, layouts, count: records.size, data: btoa(binary) };
}

/** Legacy JSON stays valid for authoring and old resources; decoded tables are read-only data. */
export function decodePlantParameters<T>(value: unknown): T {
  if (!value || typeof value !== "object" || !("encoding" in value)) return value as T;
  const p = value as EncodedPlantParameters;
  const invalid = (): never => {
    throw new Error("Invalid shared plant parameter encoding");
  };
  if (
    p.encoding !== format ||
    p.version !== 1 ||
    !Array.isArray(p.strings) ||
    !p.strings.every((s) => typeof s === "string") ||
    !Array.isArray(p.layouts) ||
    typeof p.data !== "string" ||
    !Number.isInteger(p.count) ||
    p.count < 1
  )
    return invalid();
  const index = (n: number, length: number): number => {
    if (!Number.isInteger(n) || n < 0 || n >= length) return invalid();
    return n;
  };
  const layouts = p.layouts.map((fields) => {
    if (!Array.isArray(fields)) return invalid();
    const keys = fields.map((ref) => p.strings[index(ref, p.strings.length)]);
    if (new Set(keys).size !== keys.length) return invalid();
    return keys;
  });
  let binary: string;
  try {
    binary = atob(p.data);
  } catch {
    return invalid();
  }
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0)),
    view = new DataView(bytes.buffer);
  if (p.count > bytes.length) return invalid();
  let offset = 0;
  const byte = (): number => (offset < bytes.length ? bytes[offset++] : invalid());
  const uint = (): number => {
    let n = 0,
      place = 1;
    for (;;) {
      const b = byte();
      n += (b % 128) * place;
      if (n > 0xffffffff) return invalid();
      if (b < 128) return n;
      place *= 128;
      if (place > 0xffffffff) return invalid();
    }
  };
  const number = (): number => {
    if (offset + 8 > bytes.length) return invalid();
    const n = view.getFloat64(offset, true);
    offset += 8;
    return Number.isFinite(n) ? n : invalid();
  };
  const table: unknown[] = [];
  const reference = (): unknown => table[index(uint(), table.length)];
  for (let i = 0; i < p.count; i++) {
    const tag = byte();
    switch (tag) {
      case Null:
        table.push(null);
        break;
      case False:
        table.push(false);
        break;
      case True:
        table.push(true);
        break;
      case NumberValue:
        table.push(number());
        break;
      case StringValue:
        table.push(p.strings[index(uint(), p.strings.length)]);
        break;
      case ArrayValue:
      case NumberArray: {
        const length = uint(),
          width = tag === NumberArray ? 8 : 1;
        if (length > Math.floor((bytes.length - offset) / width)) return invalid();
        const values = Array.from({ length }, tag === NumberArray ? number : reference);
        table.push(values);
        break;
      }
      case RecordValue: {
        const fields = layouts[index(uint(), layouts.length)];
        table.push(Object.fromEntries(fields.map((field) => [field, reference()])));
        break;
      }
      default:
        return invalid();
    }
  }
  if (offset !== bytes.length) return invalid();
  return table[table.length - 1] as T;
}
