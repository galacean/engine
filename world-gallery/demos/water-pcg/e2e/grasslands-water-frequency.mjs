const ALGORITHM = "grasslands-detail-frequency-v3-banded-energy-weighted-derivative";
const CHANNEL_COUNT = 3;
const MINIMUM_RESIDUAL_RMS = 1e-6;
const POWER_EPSILON = 1e-12;
const MINIMUM_DETAIL_CYCLES_ACROSS_SHORT_AXIS = 5;

function assertInput(condition, message) {
  if (!condition) throw new Error(message);
}

function nextPowerOfTwo(value) {
  let result = 1;
  while (result < value) result *= 2;
  return result;
}

function fftRadix2(real, imaginary) {
  const length = real.length;
  assertInput(length === imaginary.length && (length & (length - 1)) === 0, "FFT length must be a power of two.");
  for (let index = 1, reversed = 0; index < length; index++) {
    let bit = length >> 1;
    while (reversed & bit) {
      reversed ^= bit;
      bit >>= 1;
    }
    reversed ^= bit;
    if (index >= reversed) continue;
    [real[index], real[reversed]] = [real[reversed], real[index]];
    [imaginary[index], imaginary[reversed]] = [imaginary[reversed], imaginary[index]];
  }
  for (let blockSize = 2; blockSize <= length; blockSize *= 2) {
    const angle = (-2 * Math.PI) / blockSize;
    const stepReal = Math.cos(angle);
    const stepImaginary = Math.sin(angle);
    for (let offset = 0; offset < length; offset += blockSize) {
      let twiddleReal = 1;
      let twiddleImaginary = 0;
      for (let index = 0; index < blockSize / 2; index++) {
        const even = offset + index;
        const odd = even + blockSize / 2;
        const oddReal = real[odd] * twiddleReal - imaginary[odd] * twiddleImaginary;
        const oddImaginary = real[odd] * twiddleImaginary + imaginary[odd] * twiddleReal;
        real[odd] = real[even] - oddReal;
        imaginary[odd] = imaginary[even] - oddImaginary;
        real[even] += oddReal;
        imaginary[even] += oddImaginary;
        const nextTwiddleReal = twiddleReal * stepReal - twiddleImaginary * stepImaginary;
        twiddleImaginary = twiddleReal * stepImaginary + twiddleImaginary * stepReal;
        twiddleReal = nextTwiddleReal;
      }
    }
  }
}

function fft2dReal(samples, sourceWidth, sourceHeight, paddedWidth, paddedHeight) {
  const real = new Float64Array(paddedWidth * paddedHeight);
  const imaginary = new Float64Array(real.length);
  for (let y = 0; y < sourceHeight; y++) {
    real.set(samples.subarray(y * sourceWidth, (y + 1) * sourceWidth), y * paddedWidth);
  }
  const rowReal = new Float64Array(paddedWidth);
  const rowImaginary = new Float64Array(paddedWidth);
  for (let y = 0; y < paddedHeight; y++) {
    const offset = y * paddedWidth;
    rowReal.set(real.subarray(offset, offset + paddedWidth));
    rowImaginary.fill(0);
    fftRadix2(rowReal, rowImaginary);
    real.set(rowReal, offset);
    imaginary.set(rowImaginary, offset);
  }
  const columnReal = new Float64Array(paddedHeight);
  const columnImaginary = new Float64Array(paddedHeight);
  for (let x = 0; x < paddedWidth; x++) {
    for (let y = 0; y < paddedHeight; y++) {
      const offset = y * paddedWidth + x;
      columnReal[y] = real[offset];
      columnImaginary[y] = imaginary[offset];
    }
    fftRadix2(columnReal, columnImaginary);
    for (let y = 0; y < paddedHeight; y++) {
      const offset = y * paddedWidth + x;
      real[offset] = columnReal[y];
      imaginary[offset] = columnImaginary[y];
    }
  }
  return { real, imaginary };
}

function fitResidualPlane(rgbaBytes, width, height, channel) {
  const pixelCount = width * height;
  let valueSum = 0;
  let valueXSum = 0;
  let valueYSum = 0;
  let xSquareSum = 0;
  let ySquareSum = 0;
  for (let y = 0; y < height; y++) {
    const normalizedY = height === 1 ? 0 : (2 * y) / (height - 1) - 1;
    for (let x = 0; x < width; x++) {
      const normalizedX = width === 1 ? 0 : (2 * x) / (width - 1) - 1;
      const value = rgbaBytes[(y * width + x) * 4 + channel] / 255;
      valueSum += value;
      valueXSum += value * normalizedX;
      valueYSum += value * normalizedY;
      xSquareSum += normalizedX * normalizedX;
      ySquareSum += normalizedY * normalizedY;
    }
  }
  const intercept = valueSum / pixelCount;
  const slopeX = valueXSum / xSquareSum;
  const slopeY = valueYSum / ySquareSum;
  const residual = new Float64Array(pixelCount);
  let squareSum = 0;
  for (let y = 0; y < height; y++) {
    const normalizedY = height === 1 ? 0 : (2 * y) / (height - 1) - 1;
    for (let x = 0; x < width; x++) {
      const normalizedX = width === 1 ? 0 : (2 * x) / (width - 1) - 1;
      const index = y * width + x;
      const value = rgbaBytes[index * 4 + channel] / 255;
      residual[index] = value - (intercept + slopeX * normalizedX + slopeY * normalizedY);
      squareSum += residual[index] * residual[index];
    }
  }
  const rms = Math.sqrt(squareSum / pixelCount);
  if (!Number.isFinite(rms) || rms <= MINIMUM_RESIDUAL_RMS) return null;
  return { residual, rms };
}

function createWindowedDerivative(residual, width, height, axis) {
  const output = new Float64Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    const windowY = 0.5 - 0.5 * Math.cos((2 * Math.PI * y) / (height - 1));
    for (let x = 1; x < width - 1; x++) {
      const windowX = 0.5 - 0.5 * Math.cos((2 * Math.PI * x) / (width - 1));
      const index = y * width + x;
      const derivative =
        axis === "x"
          ? 0.5 * (residual[index + 1] - residual[index - 1])
          : 0.5 * (residual[index + width] - residual[index - width]);
      output[index] = derivative * windowX * windowY;
    }
  }
  return output;
}

function addSpectrumPower(target, transform) {
  for (let index = 0; index < target.length; index++) {
    target[index] +=
      transform.real[index] * transform.real[index] + transform.imaginary[index] * transform.imaginary[index];
  }
}

export function analyzeGrasslandsDetailFrequency({ width, height, rgbaBytes }) {
  assertInput(Number.isInteger(width) && width >= 8, "Detail-frequency width must be an integer of at least 8.");
  assertInput(Number.isInteger(height) && height >= 8, "Detail-frequency height must be an integer of at least 8.");
  assertInput(
    Array.isArray(rgbaBytes) && rgbaBytes.length === width * height * 4,
    "Detail-frequency RGBA input length is invalid."
  );
  assertInput(
    rgbaBytes.every((value) => Number.isInteger(value) && value >= 0 && value <= 255),
    "Detail-frequency RGBA input must contain byte integers."
  );
  const paddedWidth = nextPowerOfTwo(width);
  const paddedHeight = nextPowerOfTwo(height);
  const combinedPower = new Float64Array(paddedWidth * paddedHeight);
  const channelResidualRms = [];
  for (let channel = 0; channel < CHANNEL_COUNT; channel++) {
    const plane = fitResidualPlane(rgbaBytes, width, height, channel);
    if (!plane) continue;
    channelResidualRms.push(plane.rms);
    for (const axis of ["x", "y"]) {
      const derivative = createWindowedDerivative(plane.residual, width, height, axis);
      addSpectrumPower(combinedPower, fft2dReal(derivative, width, height, paddedWidth, paddedHeight));
    }
  }
  const degradationReasons = [];
  if (channelResidualRms.length === 0) degradationReasons.push("no-active-rgb-channel");
  const maximumBin = Math.floor(0.5 * Math.max(paddedWidth, paddedHeight));
  const powerSum = new Float64Array(maximumBin + 1);
  const sampleCount = new Uint32Array(maximumBin + 1);
  const binWidthCyclesPerPixel = 1 / Math.max(paddedWidth, paddedHeight);
  const minimumDetailFrequencyCyclesPerPixel = MINIMUM_DETAIL_CYCLES_ACROSS_SHORT_AXIS / Math.min(width, height);
  const maximumDetailFrequencyCyclesPerPixel = 0.5 - binWidthCyclesPerPixel;
  let finitePower = true;
  for (let y = 0; y < paddedHeight; y++) {
    const signedY = y <= paddedHeight / 2 ? y : y - paddedHeight;
    const frequencyY = signedY / paddedHeight;
    for (let x = 0; x < paddedWidth; x++) {
      const signedX = x <= paddedWidth / 2 ? x : x - paddedWidth;
      const frequencyX = signedX / paddedWidth;
      const frequency = Math.hypot(frequencyX, frequencyY);
      if (frequency < minimumDetailFrequencyCyclesPerPixel || frequency > maximumDetailFrequencyCyclesPerPixel) {
        continue;
      }
      const bin = Math.round(frequency / binWidthCyclesPerPixel);
      if (bin <= 0 || bin > maximumBin) continue;
      const power = combinedPower[y * paddedWidth + x];
      if (!Number.isFinite(power) || power < 0) {
        finitePower = false;
        continue;
      }
      powerSum[bin] += power;
      sampleCount[bin]++;
    }
  }
  if (!finitePower) degradationReasons.push("non-finite-spectrum-power");
  const meanPower = new Float64Array(maximumBin + 1);
  let totalFinitePower = 0;
  for (let bin = 1; bin <= maximumBin; bin++) {
    if (sampleCount[bin] === 0) continue;
    meanPower[bin] = powerSum[bin] / sampleCount[bin];
    totalFinitePower += meanPower[bin];
  }
  if (!(totalFinitePower > POWER_EPSILON)) degradationReasons.push("zero-spectrum-power");
  const bins = [];
  let primaryBin = 0;
  let primaryPower = Number.NEGATIVE_INFINITY;
  let tiedNonAdjacentPeak = false;
  let firstAnalyzedBin = 0;
  let lastAnalyzedBin = 0;
  for (let bin = 1; bin <= maximumBin; bin++) {
    if (sampleCount[bin] === 0) continue;
    if (firstAnalyzedBin === 0) firstAnalyzedBin = bin;
    lastAnalyzedBin = bin;
    const normalizedPower = totalFinitePower > 0 ? meanPower[bin] / totalFinitePower : 0;
    bins.push({
      index: bin,
      cyclesPerPixel: bin * binWidthCyclesPerPixel,
      normalizedPower,
      sampleCount: sampleCount[bin]
    });
    if (normalizedPower > primaryPower + Number.EPSILON) {
      primaryBin = bin;
      primaryPower = normalizedPower;
      tiedNonAdjacentPeak = false;
    } else if (
      Math.abs(normalizedPower - primaryPower) <= Number.EPSILON &&
      primaryBin > 0 &&
      Math.abs(bin - primaryBin) > 1
    ) {
      tiedNonAdjacentPeak = true;
    }
  }
  if (primaryBin === firstAnalyzedBin || primaryBin === lastAnalyzedBin) {
    degradationReasons.push("primary-peak-at-analysis-boundary");
  }
  if (tiedNonAdjacentPeak) degradationReasons.push("non-unique-primary-peak");
  const cyclesPerPixel = primaryBin * binWidthCyclesPerPixel;
  if (!(cyclesPerPixel > 0) || !Number.isFinite(cyclesPerPixel)) {
    degradationReasons.push("invalid-primary-frequency");
  }
  return {
    algorithm: ALGORITHM,
    sourceWidth: width,
    sourceHeight: height,
    paddedWidth,
    paddedHeight,
    activeChannels: channelResidualRms.length,
    channelResidualRms,
    binWidthCyclesPerPixel,
    minimumDetailCyclesAcrossShortAxis: MINIMUM_DETAIL_CYCLES_ACROSS_SHORT_AXIS,
    minimumDetailFrequencyCyclesPerPixel,
    maximumDetailFrequencyCyclesPerPixel,
    totalFinitePower,
    bins,
    primaryPeak: {
      bin: primaryBin,
      cyclesPerPixel,
      wavelengthPixels: cyclesPerPixel > 0 ? 1 / cyclesPerPixel : null,
      normalizedPower: Number.isFinite(primaryPower) ? primaryPower : 0
    },
    degraded: degradationReasons.length > 0,
    degradationReasons
  };
}

export function evaluateGrasslandsDetailFrequencyParity(target, candidate, maximumRelativeError) {
  const targetPeak = target.primaryPeak.cyclesPerPixel;
  const candidatePeak = candidate.primaryPeak.cyclesPerPixel;
  const relativeError =
    Number.isFinite(targetPeak) && targetPeak > 0 && Number.isFinite(candidatePeak)
      ? Math.abs(candidatePeak - targetPeak) / targetPeak
      : Number.POSITIVE_INFINITY;
  return {
    status:
      !target.degraded &&
      !candidate.degraded &&
      Number.isFinite(maximumRelativeError) &&
      maximumRelativeError >= 0 &&
      Number.isFinite(relativeError) &&
      relativeError <= maximumRelativeError
        ? "passed"
        : "unmet",
    maximumRelativeError,
    relativeError
  };
}
