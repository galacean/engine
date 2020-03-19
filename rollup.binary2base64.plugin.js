import { createFilter } from "@rollup/pluginutils";
import { readFile } from "fs";

export default function binary2base64(options = {}) {
  if (!options.include) {
    throw Error("include option should be specified");
  }
  const filter = createFilter(options.include, options.exclude);

  return {
    name: "binary",
    load(id) {
      if (filter(id)) {
        return new Promise((res, reject) => {
          readFile(id, (error, buffer) => {
            if (error != null) {
              reject(error);
            }
            res(buffer.toString("binary"));
          });
        });
      }
      return null;
    },
    transform(code, id) {
      if (filter(id)) {
        const src = Buffer.from(code, "binary").toString("base64");
        return `export default ${JSON.stringify(src)}`;
      }
    }
  };
}