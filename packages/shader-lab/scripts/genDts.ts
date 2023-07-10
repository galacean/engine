import { generateCstDts } from "chevrotain";
import path from "path";
import { ShaderParser } from "../src";
import fs from "fs";

function genDts(opts?: { outDir?: string }) {
  const parser = new ShaderParser();
  const productions = parser.getGAstProductions();
  const dtsContent = generateCstDts(productions);
  const out = opts?.outDir ?? path.resolve(__dirname, "../src");
  const dtsPath = path.resolve(out, "./types.ts");
  fs.writeFileSync(dtsPath, dtsContent, { flag: "w" });
  console.log("dst written to file ", dtsPath);
}

genDts();
