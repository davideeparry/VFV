import fs from 'fs';
import express from 'express';
import formidable from 'formidable';
import fft from 'fourier-transform';
import gainToDecibels from 'decibels/from-gain.js';
import jpeg from 'jpeg-js';
import convert from 'color-convert';
import ffmpeg from 'fluent-ffmpeg';
import readline from 'readline';
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 5001 });

const app = express();

wss.on('connection', function connection(ws) {
    ws.send('WebSocket opened');
    ws.on('message', function message(data) {
        ws.send(sizeProcessed + "/" + fileSize);
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
        const file = `${process.cwd()}/output/video.mp4`;
        res.set('Access-Control-Allow-Origin', '*');
        res.download(file); // Set disposition and send it.
      });

    
    
});

app.listen(5000, () => {
    console.log("VFV server started on port 5000");
});

/* this obj which is returned by initArgs() is constantly referenced, these are it's fields for reference 
var fftVars = { 
    num_pixels: 0,
    window_size: 0,
    frame_width: 0,
    frame_height: 0,
    frame_counter: 0,
    output_counter: 0,
    chunk_size: 0
};
*/

/// these are placeholder globals until a better usage of video filters to normalize output values for visualization is built
var max_i= 0;
var max_f = 0;
var max_i_f = 0;

var fileSize = 100;
var sizeProcessed = 0;
var fftVars;


// START of processing
export function startVFV(args, videoFile, ws) {
    fftVars = initArgs(args);
    //console.log(fftVars);
    // using fluent-ffmpeg to convert video into yuv format
    var input_video_ffmpeg = ffmpeg(videoFile.filepath);

    input_video_ffmpeg.on('codecData', (data) => {
        // displays information on the decoded video file
        //console.log(data);
    }).save('./temp.yuv'); // specifying the .yuv file ext will cause ffmpeg to convert to yuv420

    input_video_ffmpeg.on('end', function() {
        var first_window = true;
        // data_structs holds the data per each processing window, not sure if it being garbage collected each iteration or having it be reused is better.
        var data_structs = createDataStructures(fftVars.num_pixels, fftVars.window_size, fftVars.frame_width, fftVars.frame_height);
        fs.stat('./temp.yuv', function (err, stats) {
            fileSize = stats.size;
            
            var file = fs.createReadStream('./temp.yuv', {highWaterMark: fftVars.chunk_size});
            
            file.on('data', function (input_chunk) {
                var fpsDivisor = fftVars.frame_rate / 30;
                sizeProcessed = sizeProcessed + fftVars.chunk_size;
                // first_window exists because the entire fft window needs to be loaded first, after the first fft window is loaded the proceeding windows will overlap.
                if (first_window) {
                    input_chunk.copy(data_structs.input_data, fftVars.frame_counter*fftVars.num_pixels, 0, fftVars.num_pixels);
                    fftVars.frame_counter = fftVars.frame_counter+1;
                    if (fftVars.frame_counter == fftVars.window_size) {
                        processWindow(data_structs); // perform fft
                        makeOutputJpeg(first_window, data_structs); // NOTE: The next refactor should not use the cube array structure and should work directly off the buffer.
                        first_window = false;
                    }
                } else {
                    fftVars.frame_counter = fftVars.frame_counter+1;
                    // reindex buffer so thatthe first entry is now the second entry and there is one 
                    // more spot avaliable at the end of the buffer. In this iteration this is because the output video will have the same number of frames. 
                    // A second version should only enough for a non-slow-motion video, this will dramatically reduce processing time. 
                    // TEMP NOTES: If the highspeed vid fps is 240, and we 60fps out then that is
                    data_structs.input_data.copy( data_structs.input_data, 0, fftVars.num_pixels, (fftVars.window_size-1)*fftVars.num_pixels )
                    input_chunk.copy(data_structs.input_data,(fftVars.window_size-2)*fftVars.num_pixels,0,fftVars.num_pixels);
                    if (fftVars.frame_counter % Math.ceil(fftVars.frame_rate/30) === 0) {
                        processWindow(data_structs); // perform fft.
                        makeOutputJpeg(first_window, data_structs);
                    }
                    
                }
            });

            file.on('end', function() {
                console.log("Video File Processed.");
                
                fs.unlink('./temp.yuv', function(err) {
                    if (err) {
                       console.log(err);
                    }
                });
                // assembles the images into a video
                var proc = ffmpeg('./output/hsv%d.jpeg')
                .fps(25)
                .addOption('-vf','format=yuv420p')
                .save('./output/video.mp4');
                ws.send("done");
            });
            process.on('exit', function(code) {
                fs.unlink('./temp.yuv', function(err) {
                    if (err) {
                       console.log(err);
                    }
                });
            });

        }); 
    });      
}


// END of processing, beyond here be functions.

function initArgs(args) {
    var fftVars = {};
    
    fftVars.frame_width = args.width;
    fftVars.frame_height = args.height;
    fftVars.window_size = args.windowSize;
    fftVars.frame_rate = args.FPS;
    
    // Create output directory if does not exist
    if (!fs.existsSync('./output')){
        fs.mkdirSync('./output');
    }
    // num_pixels is the number of pixels per frame
    fftVars.num_pixels = fftVars.frame_width*fftVars.frame_height;
    // chunk size is the size in bytes of each YUV420 frame
    fftVars.chunk_size = fftVars.num_pixels + (fftVars.num_pixels/2);
    fftVars.frame_counter = 0;
    fftVars.output_counter = 0;
    return fftVars;
}

function createDataStructures(num_pixels, window_size, frame_width, frame_height) {
    var input_data = Buffer.allocUnsafe(num_pixels*window_size);
    var chunk_cube = new Array();
    for (var frame = 0; frame < window_size; frame++) {
        chunk_cube[frame] = new Array();
        for (var height = 0; height < frame_height; height++) {
            chunk_cube[frame][height] = new Array();
        }
    }
    // each cube of input data makes two planes of output data
    // f is the frequency of the fft outbin bin with the highest dB value
    var f_output_chunk_plane = new Array();
    for (var output_width = 0; output_width < frame_width; output_width++) {
        f_output_chunk_plane[output_width] = new Array();
    }
    // i is the dB of the selected fft output bin.
    var i_output_chunk_plane = new Array();
    for (var output_width = 0; output_width < frame_width; output_width++) {
        i_output_chunk_plane[output_width] = new Array();
    }
    return { input_data, chunk_cube, f_output_chunk_plane, i_output_chunk_plane };
}

function makeOutputJpeg(first_window, data_structs) {
    var data_index = 0;
    var frame_width = fftVars.frame_width;
    var frame_height = fftVars.frame_height;
    var frame_data = Buffer.allocUnsafe(frame_width * frame_height * 4);
    if (first_window) { // This sets the max freq off of the first window, would be better to find a way to check as we go, and then perform the scaling at the end. 
        for (var height = 0; height < frame_height; height++) {
            for (var width = 0; width < frame_width; width++) {
                if (data_structs.f_output_chunk_plane[width][height] > max_f) {
                    max_f = data_structs.f_output_chunk_plane[width][height];
                }
                if (data_structs.i_output_chunk_plane[width][height] > max_i) {
                    max_i = data_structs.i_output_chunk_plane[width][height];
                }
                if (data_structs.i_output_chunk_plane[width][height]*data_structs.f_output_chunk_plane[width][height] > max_i_f) {
                    max_i_f = data_structs.i_output_chunk_plane[width][height]*data_structs.f_output_chunk_plane[width][height];
                }
            }
        }
    }
    for (var height = 0; height < frame_height; height++) {
        for (var width = 0; width < frame_width; width++) {
            var h = (data_structs.f_output_chunk_plane[width][height]/max_f)*359; // Scaled Output Freq
            var s = 100;
            var v = (data_structs.i_output_chunk_plane[width][height]/max_i)*99; // Scaled Output Energy
            var rgb_array = convert.hsv.rgb(h,s,v);
            // HSV Frame Data
            frame_data[data_index++] = rgb_array[0];
            frame_data[data_index++] = rgb_array[1];
            frame_data[data_index++] = rgb_array[2];
            frame_data[data_index++] = data_structs.f_output_chunk_plane[width][height]; // Value is irrelevent not used by JPEG

        }
    }
    // FOR HSV IMAGE
    var raw_image_data = {
        data: frame_data,
        width: frame_width,
        height: frame_height
      };

    var jpeg_image_data = jpeg.encode(raw_image_data, 100);
    fs.writeFile("./output/hsv"+fftVars.output_counter+".jpeg",jpeg_image_data.data, function(err) {
        if (err) {
            console.log(err);
        }
    });
    fftVars.output_counter++;
}

function hammingWindow(n) {
   return (.5 - 0.5*Math.cos(2*Math.PI*n/fftVars.window_size));
}

function performFftOnPixel(width, height, data_structs) {
    var fft_input = [];
    for (var i = 0; i < fftVars.window_size/2; i++) {
        fft_input.push(0);
    }
    for (var frame = 0; frame < (fftVars.window_size); frame++) {
        fft_input.push(data_structs.chunk_cube[frame][height][width]* hammingWindow(frame));
    }
    for (var i = 0; i < fftVars.window_size/2; i++) {
        fft_input.push(0);
    }
    var fft_output = fft(fft_input);
    var freq_interval = fftVars.frame_rate/(fftVars.window_size*2);
    var max_output = 0;
    var max_output_index = 0;
    for (var i = 0; i < fft_output.length; i++) {
        if (fft_output[i] > max_output && i > 10) {
            max_output = fft_output[i];
            max_output_index = i;
        }
    }
    var max_output_freq = max_output_index * freq_interval;
    data_structs.f_output_chunk_plane[width][height] = max_output_freq;
    data_structs.i_output_chunk_plane[width][height] = gainToDecibels(max_output+1);//*max_output;
}

// Function is called each time the window worth of chunks is sitting as data
// to turn that data into an array that will be processed by the FFT algorithm
function processWindow(data_structs) {
    var data_index = 0;
    for (var frame = 0; frame < fftVars.window_size; frame++) {
        for (var height = 0; height < fftVars.frame_height; height++) {
            for (var width = 0; width < fftVars.frame_width; width++) {
                data_structs.chunk_cube[frame][height][width] = data_structs.input_data.readUInt8(data_index);
                data_index++;
            }
        }
    }

    for (var height = 0; height < fftVars.frame_height; height++) {
        for (var width = 0; width < fftVars.frame_width; width++) { 
            performFftOnPixel(width, height, data_structs);
        }
    }
    // At this point the chunk_cube is ready to be processed by the FFT
}












