import { Disposable } from "./Utils";
import { Texture, TextureFilter } from "./Texture";
import { TextureWrap, TextureRegion } from "./Texture";

export class TextureAtlas implements Disposable {
  pages = new Array<TextureAtlasPage>();
  regions = new Array<TextureAtlasRegion>();

  constructor(atlasText: string, textureLoader: (path: string, width?: number, height?: number) => any) {
    this.load(atlasText, textureLoader);
  }

  private load(atlasText: string, textureLoader: (path: string, width?: number, height?: number) => any) {
    if (textureLoader == null) throw new Error("textureLoader cannot be null.");

    const reader = new TextureAtlasReader(atlasText);
    const tuple = new Array<string>(4);
    let page: TextureAtlasPage = null;
    while (true) {
      let line = reader.readLine();
      if (line == null) break;
      line = line.trim();
      if (line.length == 0) page = null;
      else if (!page) {
        page = new TextureAtlasPage();
        page.name = line;

        if (reader.readTuple(tuple) == 2) {
          // size is only optional for an atlas packed with an old TexturePacker.
          page.width = parseInt(tuple[0]);
          page.height = parseInt(tuple[1]);
          reader.readTuple(tuple);
        }
        // page.format = Format[tuple[0]]; we don't need format in WebGL

        reader.readTuple(tuple);
        page.minFilter = Texture.filterFromString(tuple[0]);
        page.magFilter = Texture.filterFromString(tuple[1]);

        const direction = reader.readValue();
        page.uWrap = TextureWrap.ClampToEdge;
        page.vWrap = TextureWrap.ClampToEdge;
        if (direction == "x") page.uWrap = TextureWrap.Repeat;
        else if (direction == "y") page.vWrap = TextureWrap.Repeat;
        else if (direction == "xy") page.uWrap = page.vWrap = TextureWrap.Repeat;

        page.texture = textureLoader(line);
        page.texture.setFilters(page.minFilter, page.magFilter);
        page.texture.setWraps(page.uWrap, page.vWrap);
        page.width = page.texture.width;
        page.height = page.texture.height;
        this.pages.push(page);
      } else {
        const region: TextureAtlasRegion = new TextureAtlasRegion();
        region.name = line;
        region.page = page;

        const rotateValue = reader.readValue();
        if (rotateValue.toLocaleLowerCase() == "true") {
          region.degrees = 90;
        } else if (rotateValue.toLocaleLowerCase() == "false") {
          region.degrees = 0;
        } else {
          region.degrees = parseFloat(rotateValue);
        }
        region.rotate = region.degrees == 90;

        reader.readTuple(tuple);
        const x = parseInt(tuple[0]);
        const y = parseInt(tuple[1]);

        reader.readTuple(tuple);
        const width = parseInt(tuple[0]);
        const height = parseInt(tuple[1]);

        region.u = x / page.width;
        region.v = y / page.height;
        if (region.rotate) {
          region.u2 = (x + height) / page.width;
          region.v2 = (y + width) / page.height;
        } else {
          region.u2 = (x + width) / page.width;
          region.v2 = (y + height) / page.height;
        }
        region.x = x;
        region.y = y;
        region.width = Math.abs(width);
        region.height = Math.abs(height);

        if (reader.readTuple(tuple) == 4) {
          // split is optional
          // region.splits = new Vector.<int>(parseInt(tuple[0]), parseInt(tuple[1]), parseInt(tuple[2]), parseInt(tuple[3]));
          if (reader.readTuple(tuple) == 4) {
            // pad is optional, but only present with splits
            //region.pads = Vector.<int>(parseInt(tuple[0]), parseInt(tuple[1]), parseInt(tuple[2]), parseInt(tuple[3]));
            reader.readTuple(tuple);
          }
        }

        region.originalWidth = parseInt(tuple[0]);
        region.originalHeight = parseInt(tuple[1]);

        reader.readTuple(tuple);
        region.offsetX = parseInt(tuple[0]);
        region.offsetY = parseInt(tuple[1]);

        region.index = parseInt(reader.readValue());

        region.texture = page.texture;
        this.regions.push(region);
      }
    }
  }

  findRegion(name: string): TextureAtlasRegion {
    for (let i = 0; i < this.regions.length; i++) {
      if (this.regions[i].name == name) {
        return this.regions[i];
      }
    }
    return null;
  }

  dispose() {
    for (let i = 0; i < this.pages.length; i++) {
      this.pages[i].texture.dispose();
    }
  }
}

class TextureAtlasReader {
  lines: Array<string>;
  index: number = 0;

  constructor(text: string) {
    this.lines = text.split(/\r\n|\r|\n/);
  }

  readLine(): string {
    if (this.index >= this.lines.length) return null;
    return this.lines[this.index++];
  }

  readValue(): string {
    const line = this.readLine();
    const colon = line.indexOf(":");
    if (colon == -1) throw new Error("Invalid line: " + line);
    return line.substring(colon + 1).trim();
  }

  readTuple(tuple: Array<string>): number {
    const line = this.readLine();
    const colon = line.indexOf(":");
    if (colon == -1) throw new Error("Invalid line: " + line);
    let i = 0,
      lastMatch = colon + 1;
    for (; i < 3; i++) {
      const comma = line.indexOf(",", lastMatch);
      if (comma == -1) break;
      tuple[i] = line.substr(lastMatch, comma - lastMatch).trim();
      lastMatch = comma + 1;
    }
    tuple[i] = line.substring(lastMatch).trim();
    return i + 1;
  }
}

export class TextureAtlasPage {
  name: string;
  minFilter: TextureFilter;
  magFilter: TextureFilter;
  uWrap: TextureWrap;
  vWrap: TextureWrap;
  texture: Texture;
  width: number;
  height: number;
}

export class TextureAtlasRegion extends TextureRegion {
  page: TextureAtlasPage;
  name: string;
  x: number;
  y: number;
  index: number;
  degrees: number;
  texture: Texture;
}
