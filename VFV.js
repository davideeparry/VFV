import fs from 'fs';
import express from 'express';
import formidable from 'formidable';
import { WebSocketServer } from 'ws';

import vfvState from './modules/vfvState.js';
import msgs from './modules/messages.js';
import videoIO from './modules/videoIO.js';
import fft from './modules/fftFunctions.js';

const wss = new WebSocketServer({ port: 5001 });

const app = express();
app.listen(5000, () => {
    console.log("VFV server started on port 5000");
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
        var msg = JSON.parse(data);
        if (msg.type === msgs.types.RESET) {
            vfvState.resetVFV();
        } else if (msg.type === msgs.types.PROGRESS) {
            ws.send( msgs.progress());  
        }
    });

    app.options("/*", function(req, res, next){
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
        res.sendStatus(200);
    });

    app.post("/", (req, res) => {
        //res.set('Access-Control-Allow-Origin', '*');
        const form = new formidable.IncomingForm();
        form.parse(req, function(err, fields, files) {
            if (err != null) {
                console.log(err);
                return res.status(400).json({ message: err.message });
            }
            const [firstFileName] = Object.keys(files);
            //console.log(files.video);
            startVFV(fields,files.video, ws);

            res.set('Access-Control-Allow-Origin', '*');
            res.json({ filename: firstFileName });
        })
    });

    app.get('/download', function(req, res){
        const file = `${process.cwd()}/output`+vfvState.folderInc+`/video.mp4`;
        res.set('Access-Control-Allow-Origin', '*');
        res.download(file); // Set disposition and send it.
        
    });
});


// START of processing
function startVFV(args, videoFile, ws) {
    vfvState.resetVFV();
    vfvState.processingActive = true;
    fs.rmSync('./output'+vfvState.folderInc, { recursive: true, force: true });
    fs.mkdirSync('./output' + vfvState.folderInc);
    vfvState.initArgs(args);
    //console.log(vfvState.fftVars);
    // using fluent-ffmpeg to convert video into yuv format
    var input_video_ffmpeg = videoIO.getFfmpegHandler(videoFile.filepath);

    input_video_ffmpeg.on('codecData', (data) => {
        // displays information on the decoded video file
        //console.log(data);
    }).save('./temp.yuv'); // specifying the .yuv file ext will cause ffmpeg to convert to yuv420

    input_video_ffmpeg.on('end', function() {
        vfvState.first_window = true;
        // data_structs holds the data per each processing window, not sure if it being garbage collected each iteration or having it be reused is better.
        var data_structs = fft.createDataStructures(vfvState.fftVars.num_pixels, vfvState.fftVars.window_size, vfvState.fftVars.frame_width, vfvState.fftVars.frame_height);
        fs.stat('./temp.yuv', function (err, stats) {
            vfvState.procInfo.fileSize = stats.size;
            ws.send(msgs.active());
            
            var file = fs.createReadStream('./temp.yuv', {highWaterMark: vfvState.fftVars.chunk_size});
            
            file.on('data', function (input_chunk) {
                var fpsDivisor = vfvState.fftVars.frame_rate / 30;
                vfvState.procInfo.sizeProcessed = vfvState.procInfo.sizeProcessed + vfvState.fftVars.chunk_size;
                // first_window exists because the entire fft window needs to be loaded first, after the first fft window is loaded the proceeding windows will overlap.
                if (vfvState.first_window) {
                    input_chunk.copy(data_structs.input_data, vfvState.fftVars.frame_counter*vfvState.fftVars.num_pixels, 0, vfvState.fftVars.num_pixels);
                    vfvState.fftVars.frame_counter = vfvState.fftVars.frame_counter+1;
                    if (vfvState.fftVars.frame_counter == vfvState.fftVars.window_size) {
                        fft.processWindow(data_structs); // perform fft
                        videoIO.makeOutputJpeg(vfvState.first_window, data_structs); // NOTE: The next refactor should not use the cube array structure and should work directly off the buffer.
                        vfvState.first_window = false;
                    }
                } else {
                    vfvState.fftVars.frame_counter = vfvState.fftVars.frame_counter+1;
                    // reindex buffer so thatthe first entry is now the second entry and there is one 
                    // more spot avaliable at the end of the buffer. In this iteration this is because the output video will have the same number of frames. 
                    // A second version should only enough for a non-slow-motion video, this will dramatically reduce processing time. 
                    // TEMP NOTES: If the highspeed vid fps is 240, and we 60fps out then that is
                    data_structs.input_data.copy( data_structs.input_data, 0, vfvState.fftVars.num_pixels, (vfvState.fftVars.window_size-1)*vfvState.fftVars.num_pixels )
                    input_chunk.copy(data_structs.input_data,(vfvState.fftVars.window_size-2)*vfvState.fftVars.num_pixels,0,vfvState.fftVars.num_pixels);
                    if (vfvState.fftVars.frame_counter % Math.ceil(vfvState.fftVars.frame_rate/30) === 0) {
                        fft.processWindow(data_structs); // perform fft.
                        videoIO.makeOutputJpeg(vfvState.first_window, data_structs);
                    }     
                }
                console.log(vfvState.procInfo.sizeProcessed);
                ws.send(msgs.progress());
            });

            file.on('end', function() {
                console.log("Video File Processed.");
                
                fs.unlink('./temp.yuv', function(err) {
                    if (err) {
                       console.log(err);
                    }
                });
                // assembles the images into a video
                videoIO.jpegToMp4();
                ws.send(msgs.done());
            });
            

        }); 
    });      
}

process.on('exit', function(code) {
    fs.unlink('./temp.yuv', function(err) {
        if (err) {
           console.log(err);
        }
    });
});






















