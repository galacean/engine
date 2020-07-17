import { Texture2D } from "@alipay/o3-material";

export function createTextureFromCanvas(name, width, height, drawFunc, rhi) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.width = width;
  canvas.height = height;
  context.clearRect(0, 0, width, height);
  drawFunc && drawFunc(context);
  const texture = new Texture2D(rhi, width, height);
  texture.setImageSource(canvas);
  return texture;
}

export function drawText(context, text, position, config) {
  context.save();
  Object.assign(context, config);
  let offsetX;
  if (config.align === "right") {
    offsetX = context.canvas.width - context.measureText(text).width - position.x;
  } else if (config.align === "center") {
    offsetX = context.canvas.width - context.measureText(text).width - position.x;
    offsetX = (offsetX + position.x) / 2;
  } else {
    offsetX = position.x;
  }

  if (config.strokeStyle) {
    context.strokeText(text, offsetX, position.y);
  } else {
    context.fillText(text, offsetX, position.y);
  }
  context.restore();
}

export function drawLine(context, startPoint, pathPoint, config) {
  context.save();
  context.moveTo(startPoint.x, startPoint.y);
  pathPoint.forEach((point) => {
    context.lineTo(point.x, point.y);
  });
  Object.assign(context, config);
  context.stroke();
  context.restore();
}

export function drawBezierLine(context, startPoint, controlPoint, config) {
  context.save();
  context.beginPath();
  context.moveTo(startPoint.x, startPoint.y);
  context.bezierCurveTo(
    controlPoint.cp1x,
    controlPoint.cp1y,
    controlPoint.cp2x,
    controlPoint.cp2y,
    controlPoint.x,
    controlPoint.y
  );
  Object.assign(context, config);
  context.stroke();
  context.restore();
}

export function drawTextAutoLine(context, value, position, config) {
  const initX = position.x;
  let initY = position.y;
  const canvasWidth = context.canvas.width;
  let lastSubStrIndex = 0;
  let lineWidth = 0;
  let lineHeight = parseInt(config.font);
  if (config.lineHeight) {
    lineHeight *= config.lineHeight;
  }
  context.font = config.font;
  for (let i = 0; i < value.length; i++) {
    lineWidth += context.measureText(value[i]).width;
    if (lineWidth > canvasWidth - context.measureText(value[i]).width - initX) {
      //减去initX,防止边界出现的问题

      drawText(context, value.substring(lastSubStrIndex, i), { x: initX, y: initY }, config);
      initY += lineHeight;
      lineWidth = 0;
      lastSubStrIndex = i;
    }
    if (i === value.length - 1) {
      drawText(context, value.substring(lastSubStrIndex, i + 1), { x: initX, y: initY }, config);
    }
  }
  return initY + 2 * lineHeight;
}

export function drawEnTextAutoLine(context, value, position, config) {
  const x = position.x;
  let y = position.y;
  const maxWidth = context.canvas.width;
  let lineHeight = parseInt(config.font);
  if (config.lineHeight) {
    lineHeight *= config.lineHeight;
  }

  var words = value.split(" ");
  var line = "";
  context.font = config.font;
  for (var n = 0; n < words.length; n++) {
    var testLine = line + words[n] + " ";
    var metrics = context.measureText(testLine);
    var testWidth = metrics.width;
    if (testWidth > maxWidth) {
      drawText(context, line, { x: x, y: y }, config);
      line = words[n] + " ";
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  drawText(context, line, { x: x, y: y }, config);
}

export function clearCanvas(context) {
  const canvas = context.canvas;
  context.clearRect(0, 0, canvas.width, canvas.height);
}
