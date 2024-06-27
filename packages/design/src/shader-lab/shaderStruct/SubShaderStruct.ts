import { PassStruct } from "./PassStruct";
import { statement } from "./Statement";

export interface SubShaderStruct {
  name: string;
  passes: PassStruct[];
  globalContents: statement[];
}
