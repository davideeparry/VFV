/* eslint-disable no-plusplus */
/* eslint-disable prefer-destructuring */
const jpeg = require('jpeg-js');
const convert = require('color-convert');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
/*  const ffmpegPath = require('ffmpeg-static').replace(
  'app.asar',
  'app.asar.unpacked'
);  */
const vfvState = require('./vfvState').default;

//  ffmpeg.setFfmpegPath(ffmpegPath);

exports.default = {
  jpegToMp4: () => {
    const inputString = `./output${vfvState.folderInc}/hsv%d.jpeg`;
    const outputString = `./output${vfvState.folderInc}/video.mp4`;
    ffmpeg(inputString)
      .fps(25)
      .addOption('-vf', 'format=yuv420p')
      .save(outputString);
  },
  getFfmpegHandler: (filepath) => {
    return ffmpeg(filepath);
  },
  makeOutputJpeg: (first_window, data_structs) => {
    let dataIndex = 0;
    const frameWidth = vfvState.fftVars.frame_width;
    const frameHeight = vfvState.fftVars.frame_height;
    const frameData = Buffer.allocUnsafe(frameWidth * frameHeight * 4);
    if (first_window) {
      // This sets the max freq off of the first window, would be better to find a way to check as we go, and then perform the scaling at the end.
      for (let height = 0; height < frameHeight; height += 1) {
        for (let width = 0; width < frameWidth; width += 1) {
          if (
            data_structs.fOutputChunkPlane[width][height] >
            vfvState.normalization.max_f
          ) {
            vfvState.normalization.max_f =
              data_structs.fOutputChunkPlane[width][height];
          }
          if (
            data_structs.iOutputChunkPlane[width][height] >
            vfvState.normalization.max_i
          ) {
            vfvState.normalization.max_i =
              data_structs.iOutputChunkPlane[width][height];
          }
          if (
            data_structs.iOutputChunkPlane[width][height] *
              data_structs.fOutputChunkPlane[width][height] >
            vfvState.normalization.max_if
          ) {
            vfvState.normalization.max_if =
              data_structs.iOutputChunkPlane[width][height] *
              data_structs.fOutputChunkPlane[width][height];
          }
        }
      }
    }
    for (let height = 0; height < frameHeight; height += 1) {
      for (let width = 0; width < frameWidth; width += 1) {
        const h =
          (data_structs.fOutputChunkPlane[width][height] /
            vfvState.normalization.max_f) *
          359; // Scaled Output Freq
        const s = 100;
        const v =
          (data_structs.iOutputChunkPlane[width][height] /
            vfvState.normalization.max_i) *
          99; // Scaled Output Energy
        const rgbArray = convert.hsv.rgb(h, s, v);
        // HSV Frame Data
        frameData[dataIndex++] = rgbArray[0];
        frameData[dataIndex++] = rgbArray[1];
        frameData[dataIndex++] = rgbArray[2];
        frameData[dataIndex++] = data_structs.fOutputChunkPlane[width][height]; // Value is irrelevent not used by JPEG
      }
    }
    // FOR HSV IMAGE
    const rawImageData = {
      data: frameData,
      width: frameWidth,
      height: frameHeight,
    };

    const jpegImageData = jpeg.encode(rawImageData, 100);
    fs.writeFile(
      `./output${vfvState.folderInc}/hsv${vfvState.fftVars.output_counter}.jpeg`,
      jpegImageData.data,
      (err) => {
        if (err) {
          // console.log(err);
        }
      }
    );
    vfvState.fftVars.output_counter += 1;
  },
};
