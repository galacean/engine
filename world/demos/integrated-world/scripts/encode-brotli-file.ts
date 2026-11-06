import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadOfficialBrotliEncoder } from "./compression/OfficialBrotliEncoder.ts";
import { loadOfficialBrotliDecoder } from "@galacean/engine-terrain/terrain/compression/OfficialBrotliDecoder";

const args = parseArgs(process.argv.slice(2).filter((value) => value !== "--"));
const inputPath = resolve(args.input);
const outputPath = resolve(args.output ?? `${args.input}.br`);
const source = new Uint8Array(readFileSync(inputPath));
const decoderWasm = new Uint8Array(
  readFileSync(new URL("../../../../packages/terrain/src/terrain/compression/generated/decoder-only.wasm", import.meta.url))
);
const [encoder, decoder] = await Promise.all([loadOfficialBrotliEncoder(), loadOfficialBrotliDecoder(decoderWasm)]);
const encoded = encoder.compress(source, { quality: args.quality, lgwin: args.lgwin });
const decoded = decoder.decompress(encoded, source.byteLength);
const sourceSha256 = sha256(source);
const decodedSha256 = sha256(decoded);
if (sourceSha256 !== decodedSha256) throw new Error("Official Brotli roundtrip SHA-256 mismatch");
writeFileSync(outputPath, encoded);
console.log(
  JSON.stringify(
    {
      input: inputPath,
      output: outputPath,
      rawBytes: source.byteLength,
      brotliBytes: encoded.byteLength,
      ratio: source.byteLength / encoded.byteLength,
      savingsRatio: 1 - encoded.byteLength / source.byteLength,
      sourceSha256,
      decodedSha256,
      verified: true
    },
    null,
    2
  )
);

interface CliArgs {
  input: string;
  output?: string;
  quality?: number;
  lgwin?: number;
}

function parseArgs(values: string[]): CliArgs {
  const parsed: Partial<CliArgs> = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!value) throw new Error(`Missing value for ${key}`);
    if (key === "--input") parsed.input = value;
    else if (key === "--output") parsed.output = value;
    else if (key === "--quality") parsed.quality = Number(value);
    else if (key === "--lgwin") parsed.lgwin = Number(value);
    else throw new Error(`Unknown argument ${key}`);
  }
  if (!parsed.input) {
    throw new Error("Usage: encode-brotli-file --input <file> [--output <file.br>] [--quality 0..11] [--lgwin 10..24]");
  }
  return parsed as CliArgs;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
