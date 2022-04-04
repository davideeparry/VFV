/* eslint-disable no-console */
const fs = require('fs');
const express = require('express');
const formidable = require('formidable');
const { WebSocketServer } = require('ws');

const vfvState = require('./modules/vfvState').default;
const msgs = require('./modules/messages').default;
const videoIO = require('./modules/videoIO').default;
const fft = require('./modules/fftFunctions').default;

function startVFV(args, videoFile, ws) {
  vfvState.resetVFV();
  vfvState.processingActive = true;
  fs.rmSync(`./output${vfvState.folderInc}`, { recursive: true, force: true });
  fs.mkdirSync(`./output${vfvState.folderInc}`);
  vfvState.initArgs(args);
  // console.log(vfvState.fftVars);
  // using fluent-ffmpeg to convert video into yuv format
  const inputVideoFfmpeg = videoIO.getFfmpegHandler(videoFile.filepath);

  inputVideoFfmpeg
    .on('codecData', (data) => {
      // displays information on the decoded video file
      console.log(data);
    })
    .save('./temp.yuv'); // specifying the .yuv file ext will cause ffmpeg to convert to yuv420

  inputVideoFfmpeg.on('end', () => {
    vfvState.firstWindow = true;
    // dataStructs holds the data per each processing window, not sure if it being garbage collected each iteration or having it be reused is better.
    const dataStructs = fft.createDataStructures(
      vfvState.fftVars.num_pixels,
      vfvState.fftVars.window_size,
      vfvState.fftVars.frame_width,
      vfvState.fftVars.frame_height
    );
    fs.stat('./temp.yuv', (err, stats) => {
      vfvState.procInfo.fileSize = stats.size;
      ws.send(msgs.active());

      const file = fs.createReadStream('./temp.yuv', {
        highWaterMark: vfvState.fftVars.chunk_size,
      });

      file.on('data', (input_chunk) => {
        const fpsDivisor = vfvState.fftVars.frame_rate / 30;
        vfvState.procInfo.sizeProcessed += vfvState.fftVars.chunk_size;
        // firstWindow exists because the entire fft window needs to be loaded first, after the first fft window is loaded the proceeding windows will overlap.
        if (vfvState.firstWindow) {
          input_chunk.copy(
            dataStructs.inputData,
            vfvState.fftVars.frame_counter * vfvState.fftVars.num_pixels,
            0,
            vfvState.fftVars.num_pixels
          );
          vfvState.fftVars.frame_counter += 1;
          // console.log(vfvState.fftVars.frame_counter);
          // console.log(vfvState.fftVars.window_size);
          // eslint-disable-next-line eqeqeq
          if (vfvState.fftVars.frame_counter == vfvState.fftVars.window_size) {
            fft.processWindow(dataStructs); // perform fft
            console.log(vfvState);
            videoIO.makeOutputJpeg(vfvState.firstWindow, dataStructs); // NOTE: The next refactor should not use the cube array structure and should work directly off the buffer.
            vfvState.firstWindow = false;
          }
        } else {
          vfvState.fftVars.frame_counter += 1;
          // reindex buffer so thatthe first entry is now the second entry and there is one
          // more spot avaliable at the end of the buffer. In this iteration this is because the output video will have the same number of frames.
          // A second version should only enough for a non-slow-motion video, this will dramatically reduce processing time.
          // TEMP NOTES: If the highspeed vid fps is 240, and we 60fps out then that is
          dataStructs.inputData.copy(
            dataStructs.inputData,
            0,
            vfvState.fftVars.num_pixels,
            (vfvState.fftVars.window_size - 1) * vfvState.fftVars.num_pixels
          );
          input_chunk.copy(
            dataStructs.inputData,
            (vfvState.fftVars.window_size - 2) * vfvState.fftVars.num_pixels,
            0,
            vfvState.fftVars.num_pixels
          );
          if (vfvState.fftVars.frame_counter % Math.ceil(fpsDivisor) === 0) {
            fft.processWindow(dataStructs); // perform fft.
            console.log(vfvState);
            videoIO.makeOutputJpeg(vfvState.firstWindow, dataStructs);
          }
        }
        ws.send(msgs.progress());
      });

      file.on('end', () => {
        // console.log('Video File Processed.');

        fs.unlink('./temp.yuv', (error) => {
          if (error) {
            // console.log(err);
          }
        });
        // assembles the images into a video
        videoIO.jpegToMp4();
        ws.send(msgs.done());
      });
    });
  });
}

function init() {
  const wss = new WebSocketServer({ port: 5001 });

  const app = express();
  app.listen(5000, () => {
    // console.log('VFV server started on port 5000');
  });

  wss.on('connection', function connection(ws) {
    if (vfvState.processingActive) {
      if (vfvState.procInfo.fileSize === vfvState.procInfo.sizeProcessed) {
        ws.send(msgs.done());
      } else {
        ws.send(msgs.active());
      }
    }
    ws.on('message', function message(data) {
      const msg = JSON.parse(data);
      if (msg.type === msgs.types.RESET) {
        vfvState.resetVFV();
      } else if (msg.type === msgs.types.PROGRESS) {
        ws.send(msgs.progress());
      }
    });

    app.options('/*', (req, res) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
      res.header(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, Content-Length, X-Requested-With'
      );
      res.sendStatus(200);
    });

    app.post('/', (req, res) => {
      // res.set('Access-Control-Allow-Origin', '*');
      const form = new formidable.IncomingForm();
      form.parse(req, (err, fields, files) => {
        if (err != null) {
          // console.log(err);
          return res.status(400).json({ message: err.message });
        }
        const [firstFileName] = Object.keys(files);
        // console.log(files.video);
        startVFV(fields, files.video, ws);

        res.set('Access-Control-Allow-Origin', '*');
        res.json({ filename: firstFileName });
        return res.status(200);
      });
    });

    app.get('/download', (req, res) => {
      const file = `${process.cwd()}/output${vfvState.folderInc}/video.mp4`;
      res.set('Access-Control-Allow-Origin', '*');
      res.download(file); // Set disposition and send it.
    });
  });
  process.on('exit', () => {
    fs.unlink('./temp.yuv', (err) => {
      if (err) {
        // console.log(err);
      }
    });
  });
}

init();
