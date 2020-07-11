import { Config, Loader } from "../types";

export class BinaryLoader implements Loader<ArrayBuffer> {
  load(config: Config): Promise<ArrayBuffer> {
    return undefined;
  }
  // load(url:string):Promise<ArrayBuffer>;
  // load(config: Config): Promise<ArrayBuffer> {
  //   return new Promise<ArrayBuffer>((resolve, reject) => {});
  // }

}
