const fft = require('fourier-transform');
const gainToDecibels = require('decibels/from-gain');
const vfvState = require('./vfvState').default;

function hammingWindow(n) {
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / vfvState.fftVars.window_size);
}

function performFftOnPixel(width, height, data_structs) {
  const fftInput = [];
  for (let i = 0; i < vfvState.fftVars.window_size / 2; i += 1) {
    fftInput.push(0);
  }
  for (let frame = 0; frame < vfvState.fftVars.window_size; frame += 1) {
    fftInput.push(
      data_structs.chunkCube[frame][height][width] * hammingWindow(frame)
    );
  }
  for (let i = 0; i < vfvState.fftVars.window_size / 2; i += 1) {
    fftInput.push(0);
  }
  const fftOutput = fft(fftInput);
  const freqInterval =
    vfvState.fftVars.frame_rate / (vfvState.fftVars.window_size * 2);
  let maxOutput = 0;
  let maxOutputIndex = 0;
  for (let i = 0; i < fftOutput.length; i += 1) {
    if (fftOutput[i] > maxOutput && i > 10) {
      maxOutput = fftOutput[i];
      maxOutputIndex = i;
    }
  }
  const maxOutputFreq = maxOutputIndex * freqInterval;
  data_structs.fOutputChunkPlane[width][height] = maxOutputFreq;
  data_structs.iOutputChunkPlane[width][height] = gainToDecibels(maxOutput + 1); //* maxOutput;
}

exports.default = {
  createDataStructures: (
    num_pixels,
    window_size,
    frame_width,
    frame_height
  ) => {
    const inputData = Buffer.allocUnsafe(num_pixels * window_size);
    const chunkCube = [];
    for (let frame = 0; frame < window_size; frame += 1) {
      chunkCube[frame] = [];
      for (let height = 0; height < frame_height; height += 1) {
        chunkCube[frame][height] = [];
      }
    }
    // each cube of input data makes two planes of output data
    // f is the frequency of the fft outbin bin with the highest dB value
    const fOutputChunkPlane = [];
    for (let outputWidth = 0; outputWidth < frame_width; outputWidth += 1) {
      fOutputChunkPlane[outputWidth] = [];
    }
    // i is the dB of the selected fft output bin.
    const iOutputChunkPlane = [];
    for (let outputWidth = 0; outputWidth < frame_width; outputWidth += 1) {
      iOutputChunkPlane[outputWidth] = [];
    }
    return {
      inputData,
      chunkCube,
      fOutputChunkPlane,
      iOutputChunkPlane,
    };
  },

  hammingWindow,

  performFftOnPixel,
  // Function is called each time the window worth of chunks is sitting as data
  // to turn that data into an array that will be processed by the FFT algorithm
  processWindow: (data_structs) => {
    let dataIndex = 0;
    for (let frame = 0; frame < vfvState.fftVars.window_size; frame += 1) {
      for (
        let height = 0;
        height < vfvState.fftVars.frame_height;
        height += 1
      ) {
        for (let width = 0; width < vfvState.fftVars.frame_width; width += 1) {
          data_structs.chunkCube[frame][height][width] =
            data_structs.inputData.readUInt8(dataIndex);
          dataIndex += 1;
        }
      }
    }

    for (let height = 0; height < vfvState.fftVars.frame_height; height += 1) {
      for (let width = 0; width < vfvState.fftVars.frame_width; width += 1) {
        performFftOnPixel(width, height, data_structs);
      }
    }
  },
};
