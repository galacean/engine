import { freezeImmutableData, isImmutableData } from "@galacean/engine-terrain/terrain/ImmutableData";
import type { ProceduralTreeStructureParameters } from "./ProceduralTreeGenerator";

interface NumericColumn {
  /** IEEE-754 doubles in little-endian order, without quantization. */
  readonly f64: string;
  /** Zero represents scalars; a positive width represents fixed-size vectors. */
  readonly width: number;
}

interface StructureColumn {
  readonly values: readonly unknown[] | NumericColumn;
  /** Present only when a dictionary is smaller than the literal column. */
  readonly indices?: readonly number[];
  /** Present only for an optional field missing from some records. */
  readonly rows?: readonly number[];
}

interface StructureTable {
  readonly count: number;
  readonly fields: readonly string[];
  readonly columns: readonly StructureColumn[];
}

/** Lossless storage of final structure values; this is an encoding, not a second generation model. */
export interface EncodedTreeStructure
  extends Omit<ProceduralTreeStructureParameters, "stems" | "leaves" | "leafIdsByLod"> {
  readonly encoding: "columns-v1";
  readonly stems: StructureTable;
  readonly leaves: StructureTable;
  readonly leafIndicesByLod: readonly (readonly number[])[];
}

const encodedStructures = new WeakMap<ProceduralTreeStructureParameters, EncodedTreeStructure>();
const decodedStructures = new WeakMap<EncodedTreeStructure, ProceduralTreeStructureParameters>();

export function encodeTreeStructure(parameters: ProceduralTreeStructureParameters): EncodedTreeStructure {
  const cached = isImmutableData(parameters) ? encodedStructures.get(parameters) : undefined;
  if (cached) return cached;
  const { stems, leaves, leafIdsByLod, ...metadata } = parameters;
  const indexById = new Map(leaves.map((leaf, index) => [leaf.id, index]));
  const encoded = freezeImmutableData({
    ...metadata,
    encoding: "columns-v1" as const,
    stems: encodeTable(stems),
    leaves: encodeTable(leaves),
    leafIndicesByLod: leafIdsByLod.map((ids) =>
      ids.map((id) => {
        const index = indexById.get(id);
        if (index === undefined) throw new Error(`Tree LOD references missing leaf ${id}`);
        return index;
      })
    )
  });
  if (isImmutableData(parameters)) {
    encodedStructures.set(parameters, encoded);
    decodedStructures.set(encoded, parameters);
  }
  return encoded;
}

/** Decodes once at the asset/Token boundary and shares immutable dictionaries in memory. */
export function decodeTreeStructure(encoded: EncodedTreeStructure): ProceduralTreeStructureParameters {
  const cached = isImmutableData(encoded) ? decodedStructures.get(encoded) : undefined;
  if (cached) return cached;
  if (!encoded || encoded.encoding !== "columns-v1") throw new Error("Unsupported tree structure encoding");
  const { encoding: _encoding, stems, leaves, leafIndicesByLod, ...metadata } = encoded;
  const decodedLeaves = decodeTable(leaves) as unknown as ProceduralTreeStructureParameters["leaves"];
  if (!Array.isArray(leafIndicesByLod) || leafIndicesByLod.length !== 4) throw new Error("Invalid tree LOD columns");
  const parameters = freezeImmutableData({
    ...metadata,
    stems: decodeTable(stems),
    leaves: decodedLeaves,
    leafIdsByLod: leafIndicesByLod.map((indices: readonly number[]) =>
      indices.map((index) => {
        requireIndex(index, decodedLeaves.length);
        return decodedLeaves[index].id;
      })
    )
  } as unknown as ProceduralTreeStructureParameters);
  freezeImmutableData(encoded);
  decodedStructures.set(encoded, parameters);
  encodedStructures.set(parameters, encoded);
  return parameters;
}

function encodeTable(records: readonly object[]): StructureTable {
  const fields = [...new Set(records.flatMap((record) => Object.keys(record)))];
  const columns = fields.map((field): StructureColumn => {
    const values: unknown[] = [];
    const rows: number[] = [];
    records.forEach((record, index) => {
      const value = (record as Record<string, unknown>)[field];
      if (value !== undefined) {
        values.push(value);
        rows.push(index);
      }
    });
    const optionalRows = rows.length === records.length ? {} : { rows };
    const literal = { values: encodeColumnValues(values), ...optionalRows };
    const dictionary: unknown[] = [];
    const lookup = new Map<string, number>();
    const indices = values.map((value) => {
      const key = JSON.stringify(value);
      let index = lookup.get(key);
      if (index === undefined) {
        index = dictionary.length;
        lookup.set(key, index);
        dictionary.push(value);
      }
      return index;
    });
    const indexed = { values: encodeColumnValues(dictionary), indices, ...optionalRows };
    return JSON.stringify(indexed).length < JSON.stringify(literal).length ? indexed : literal;
  });
  return { count: records.length, fields, columns };
}

function decodeTable(table: StructureTable): readonly Record<string, unknown>[] {
  if (
    !table ||
    !Number.isSafeInteger(table.count) ||
    table.count < 0 ||
    !Array.isArray(table.fields) ||
    !Array.isArray(table.columns) ||
    table.fields.length !== table.columns.length ||
    new Set(table.fields).size !== table.fields.length ||
    table.fields.some((field) => typeof field !== "string" || ["__proto__", "constructor", "prototype"].includes(field))
  ) {
    throw new Error("Invalid tree structure table");
  }
  const records: Record<string, unknown>[] = Array.from({ length: table.count }, () => ({}));
  table.columns.forEach((column, fieldIndex) => {
    if (
      !column ||
      (column.indices !== undefined && !Array.isArray(column.indices)) ||
      (column.rows !== undefined && !Array.isArray(column.rows))
    )
      throw new Error("Invalid tree structure column");
    const values = decodeColumnValues(column.values);
    const count = column.indices?.length ?? values.length;
    if (count !== (column.rows?.length ?? table.count)) throw new Error("Tree structure column length mismatch");
    for (let index = 0; index < count; index++) {
      const row = column.rows?.[index] ?? index;
      requireIndex(row, table.count);
      if (column.rows && index > 0 && row <= column.rows[index - 1])
        throw new Error("Tree structure rows must be ordered");
      const valueIndex = column.indices?.[index] ?? index;
      requireIndex(valueIndex, values.length);
      records[row][table.fields[fieldIndex]] = values[valueIndex];
    }
  });
  return records;
}

function requireIndex(index: number, count: number): void {
  if (!Number.isSafeInteger(index) || index < 0 || index >= count) throw new Error("Tree structure index out of range");
}

function encodeColumnValues(values: readonly unknown[]): readonly unknown[] | NumericColumn {
  if (values.length === 0) return values;
  const width = Array.isArray(values[0]) ? values[0].length : 0;
  const numeric =
    width > 0
      ? values.every((value) => Array.isArray(value) && value.length === width && value.every(Number.isFinite))
      : values.every((value) => typeof value === "number" && Number.isFinite(value));
  if (!numeric) return values;
  const numbers = (width ? values.flat() : values) as number[];
  const bytes = new Uint8Array(numbers.length * Float64Array.BYTES_PER_ELEMENT);
  const view = new DataView(bytes.buffer);
  numbers.forEach((value, index) => view.setFloat64(index * Float64Array.BYTES_PER_ELEMENT, value, true));
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  const packed = { f64: btoa(binary), width };
  return JSON.stringify(packed).length < JSON.stringify(values).length ? packed : values;
}

function decodeColumnValues(values: StructureColumn["values"]): readonly unknown[] {
  if (Array.isArray(values)) return values;
  const packed = values as NumericColumn;
  if (!packed || typeof packed.f64 !== "string" || !Number.isSafeInteger(packed.width) || packed.width < 0) {
    throw new Error("Invalid numeric tree column");
  }
  const binary = atob(packed.f64);
  const stride = (packed.width || 1) * Float64Array.BYTES_PER_ELEMENT;
  if (binary.length % stride !== 0) throw new Error("Invalid numeric tree column length");
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  return Array.from({ length: binary.length / stride }, (_, row) =>
    packed.width
      ? Array.from({ length: packed.width }, (_, axis) =>
          view.getFloat64(row * stride + axis * Float64Array.BYTES_PER_ELEMENT, true)
        )
      : view.getFloat64(row * stride, true)
  );
}
