/**
 * @title Lines
 * @category Toolkit
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*K4P2TK5c3IoAAAAAAAAAAAAADiR2AQ/original
 */
import { Camera, Color, Vector2, Vector3, WebGLEngine } from "@galacean/engine";
import {
  Line,
  DashLine,
  LineCap,
  LineJoin,
} from "@galacean/engine-toolkit-lines";
import * as dat from "dat.gui";

const lines: Line[] = [];
const controls = {
  width: 0.02,
  cap: LineCap.Round,
  join: LineJoin.Round,
};
const colors = [
  new Color(91 / 255, 143 / 255, 249 / 255),
  new Color(92 / 255, 206 / 255, 161 / 255),
  new Color(246 / 255, 189 / 255, 22 / 255),
  new Color(170 / 255, 0 / 255, 97 / 255),
  new Color(0 / 255, 155 / 255, 119 / 255),
];
// Create engine and get root entity
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const rootEntity = engine.sceneManager.activeScene.createRootEntity("Root");

  // Create camera.
  const cameraEntity = rootEntity.createChild("Camera");
  const center = new Vector3(0, 0, 0);
  cameraEntity.transform.setPosition(center.x, center.y, 50);
  cameraEntity.transform.lookAt(center);
  const camera = cameraEntity.addComponent(Camera);
  camera.isOrthographic = true;
  engine.sceneManager.activeScene.background.solidColor.set(0.8, 0.8, 0.8, 1);
  engine.run();

  fetch(
    "https://gw.alipayobjects.com/os/basement_prod/0d2f0113-f48b-4db9-8adc-a3937243d5a3.json"
  )
    .then((res) => res.json())
    .then((data) => {
      const lineEntity = rootEntity.createChild("Line");
      // lineEntity.transform.translate(new Vector3(-15, 0, 0))
      // lineEntity.transform.setScale(30, 30, 1);
      for (let index = 0; index < data.features.length; index++) {
        const geometry = data.features[index].geometry;
        let line;
        if (index % 2 === 0) {
          line = lineEntity.addComponent(Line);
        } else {
          line = lineEntity.addComponent(DashLine);
          line.dash = new Vector2(0.2, 0.1);
        }
        line.cap = controls.cap;
        line.join = controls.join;
        line.width = controls.width;
        line.color = colors[index % colors.length];
        line.points = geometry.coordinates[0].map((p) => {
          return { x: (p[0] - 116.4) * 30, y: (p[1] - 39.9) * 30 };
        });

        lines.push(line);
      }
    });

  showDebug();

  function showDebug() {
    const gui = new dat.GUI({
      name: "line",
    });

    const widthControl = gui.add(controls, "width", 0.01, 0.1);
    const capControl = gui.add(controls, "cap", {
      butt: LineCap.Butt,
      round: LineCap.Round,
      square: LineCap.Square,
    });
    const joinControl = gui.add(controls, "join", {
      bevel: LineJoin.Bevel,
      round: LineJoin.Round,
      miter: LineJoin.Miter,
    });

    widthControl.onChange(change);
    capControl.onChange(change);
    joinControl.onChange(change);

    function change() {
      if (lines.length) {
        lines.forEach((line) => {
          line.cap = controls.cap;
          line.join = Number(controls.join);
          line.width = Number(controls.width);
        });
      }
    }
  }
});
