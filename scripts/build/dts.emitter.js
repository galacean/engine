import * as ts from "typescript";

function compile(fileNames, options) {
  // Create a Program with an in-memory emit
  const createdFiles = {};
  const host = ts.createCompilerHost(options);
  host.writeFile = (fileName, contents) => (createdFiles[fileName] = contents);

  // Prepare and emit the d.ts files
  const program = ts.createProgram(fileNames, options, host);
  program.emit();

  // Loop through all the input files
  fileNames.forEach(file => {
    console.log("### JavaScript\n");
    console.log(host.readFile(file));

    console.log("### Type Definition\n");
    const dts = file.replace(".js", ".d.ts");
    console.log(createdFiles[dts]);
  });
}

// Run the compiler
compile(process.argv.slice(2), {
  allowJs: true,
  declaration: true,
  emitDeclarationOnly: true
});
