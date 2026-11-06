import originalMeshes from "./meshes";
import cottage from "./catalog/cottage";
import gothic from "./catalog/gothic";
import doors from "./catalog/doors";
import arrows from "./catalog/arrows";
import lanterns from "./catalog/lanterns";
import hatches from "./catalog/hatches";
import { registerDecorationMeshes, type DecorationMesh } from "./catalog-codec";
export type { DecorationMesh } from "./catalog-codec";
/** Exact original mesh names; legacy meshes keep their original exported identity. */
const meshes: Record<string, DecorationMesh> = { ...originalMeshes };
for (const family of [cottage, gothic, doors, arrows, lanterns, hatches]) registerDecorationMeshes(meshes, family);
export default meshes;
