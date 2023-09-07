#! /usr/bin/env ts-node

import { createSyntaxDiagramsCode } from "chevrotain";
import { ShaderParser } from "../src";
import { exec } from "child_process";
import path from "path";
import fs from "fs";

function generateDiagram(opts?: { outDir?: string; pattern?: RegExp }) {
  const out = opts?.outDir ?? path.join(__dirname, "../doc");
  if (!fs.existsSync(out)) {
    fs.mkdirSync(out);
  }
  const parser = new ShaderParser();

  const serializeGrammar = parser.getSerializedGastProductions();
  const html = createSyntaxDiagramsCode(
    serializeGrammar.filter((grammer) =>
      (opts?.pattern ?? /^(?<!(Tuple|Assignment))/).test((grammer as any).name as string)
    )
  );
  const outFile = path.join(out, "diagrams.html");
  fs.writeFileSync(outFile, html, { flag: "w" });
  console.log("diagram written to", outFile);

  exec(`open ${outFile}`);
}

generateDiagram();
