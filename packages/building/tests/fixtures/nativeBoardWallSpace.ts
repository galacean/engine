import { nativeBytes } from "./nativeBytes";
import { shape } from "./nativeCottageRoof";
import { RecoveredCottageRoofSection } from "../../src/tiny-glade/runtime/RecoveredCottageRoofSampler";
import { RecoveredBoardWallSpace } from "../../src/tiny-glade/runtime/RecoveredBoardWallSpace";

/** Oracle decoding only. Product callers supply semantic published shapes. */
export function nativeBoardWallSpace(hex: string) {
  const bytes = nativeBytes(hex);
  const section = (offset: number) => new RecoveredCottageRoofSection(shape(hex.slice(offset * 2, (offset + 28) * 2)));
  return new RecoveredBoardWallSpace(
    bytes.getUint32(0, true) === 1 ? section(0) : null,
    bytes.getUint32(28, true) === 2 ? null : section(28),
    bytes.getFloat32(56, true),
    bytes.getFloat32(60, true),
    bytes.getFloat32(64, true)
  );
}
