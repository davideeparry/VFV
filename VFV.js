import fs from 'fs';

import gainToDecibels from 'decibels/from-gain.js';
import jpeg from 'jpeg-js';
import convert from 'color-convert';
import ffmpeg from 'fluent-ffmpeg';
import readline from 'readline';
import {Worker} from "worker_threads";

const threads = new Set();

var debug = false;
var start = process.hrtime();

var elapsed_time = function(note){
    var precision = 3; // 3 decimal places
    var elapsed = process.hrtime(start)[1] / 1000000; // divide by a million to get nano to milli
    console.log(process.hrtime(start)[0] + " s, " + elapsed.toFixed(precision) + " ms - " + note); // print message + time
    start = process.hrtime(); // reset the timer
}

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

// START of processing

var {fftVars, input_video_path} = initArgs();

// using fluent-ffmpeg to convert video into yuv format
var input_video_ffmpeg = ffmpeg(input_video_path);

input_video_ffmpeg.on('codecData', (data) => {
    // displays information on the decoded video file
    console.log(data);
}).save('./temp.yuv'); // specifying the .yuv file ext will cause ffmpeg to convert to yuv420

input_video_ffmpeg.on('end', function() {

    var first_window = true;
    // data_structs holds the data per each processing window, not sure if it being garbage collected each iteration or having it be reused is better.
    var data_structs = createDataStructures(fftVars.num_pixels, fftVars.window_size, fftVars.frame_width, fftVars.frame_height);
    var file = fs.createReadStream('./temp.yuv', {highWaterMark: fftVars.chunk_size});

    file.on('data', function (input_chunk) {
        // first_window exists because the entire fft window needs to be loaded first, after the first fft window is loaded the proceeding windows will overlap.
        if (first_window) {
            input_chunk.copy(data_structs.input_data, fftVars.frame_counter*fftVars.num_pixels, 0, fftVars.num_pixels);
            fftVars.frame_counter = fftVars.frame_counter+1;
            if (fftVars.frame_counter === fftVars.window_size) {
                processWindow(first_window, data_structs); // perform fft // NOTE: The next refactor should not use the cube array structure and should work directly off the buffer.
                first_window = false;
            }
        } else {
            // reindex buffer so that the first entry is now the second entry and there is one 
            // more spot avaliable at the end of the buffer. In this iteration this is because the output video will have the same number of frames. 
            // A second version should only enough for a non-slow-motion video, this will dramatically reduce processing time. 
            data_structs.input_data.copy( data_structs.input_data, 0, fftVars.num_pixels, (fftVars.frame_counter-1)*fftVars.num_pixels )
            input_chunk.copy(data_structs.input_data,(fftVars.frame_counter-2)*fftVars.num_pixels,0,fftVars.num_pixels);
            processWindow(first_window, data_structs); // perform fft.
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
    });
});

process.on('exit', function(code) {
    fs.unlink('./temp.yuv', function(err) {
        if (err) {
           console.log(err);
        }
    });
});

// END of processing, beyond here be functions.

function initArgs() {
    var fftVars = {};
    // sets input_file_path, ff_input_file_temp, window_size, frame_rate, frame_height, frame_width
    if (!process.argv[2] || !process.argv[3] || !process.argv[4] || !process.argv[5] || !process.argv[6]) {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        rl.question('Path to video: ', function(answer) {
            var input_video_path = answer;
            rl.question('How many frames to process per image: ', function(answer) {
                fftVars.window_size = parseInt(answer);
                rl.question('How many FPS was the video recorded at: ', function(answer) {
                    fftVars.frame_rate = parseInt(answer);
                    rl.question('Height in pixels: ', function(answer) {
                        fftVars.frame_height = parseInt(answer);
                        rl.question('Width in pixels: ', function(answer) {
                            fftVars.frame_width = parseInt(answer);
                        });
                    });
                });
            });
        });
        rl.close();
    }  else {
        fftVars.frame_width = parseInt(process.argv[6]);
        fftVars.frame_height = parseInt(process.argv[5]);
        fftVars.window_size = parseInt(process.argv[3]);
        fftVars.frame_rate = parseInt(process.argv[4]); 
        var input_video_path = process.argv[2];    
    }
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
    return {fftVars, input_video_path};
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
    if (debug) elapsed_time("start makeOutput Jpeg");
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
    if (debug) elapsed_time("within OutputJpeg start writing the jpeg");
    fs.writeFile("./output/hsv"+fftVars.output_counter+".jpeg",jpeg_image_data.data, function(err) {
        if (err) {
            console.log(err);
        }
    });
    fftVars.output_counter++;
    if (debug) elapsed_time("stop makeOutput Jpeg");
}





// Function is called each time the window worth of chunks is sitting as data
// to turn that data into an array that will be processed by the FFT algorithm
function processWindow(first_window, data_structs) {
    if (debug) elapsed_time("start processWindow");
    var data_index = 0;
    for (var frame = 0; frame < fftVars.window_size; frame++) {
        for (var height = 0; height < fftVars.frame_height; height++) {
            for (var width = 0; width < fftVars.frame_width; width++) {
                data_structs.chunk_cube[frame][height][width] = data_structs.input_data.readUInt8(data_index);
                data_index++;
            }
        }
    }
    const startPool = () => {
        return new Promise(function(resolve, reject) {
            for (var height = 0; height < fftVars.frame_height; height++) {
                for (var width = 0; width < fftVars.frame_width; width++) { 
                    let worker = new Worker('./performFftOnPixel.js', { workerData: { width, height, window_size: fftVars.window_size, frame_rate: fftVars.frame_rate, data_structs}});
                    worker.on('error', (err) => { console.log("ayo"); throw err; });
                    worker.on('exit', (code) => {
                        if (code !== 0) reject(new Error(`stopped with  ${code} exit code`));                    
                    });
                    worker.on('message', () => {
                        threads.delete(worker);
                        console.log(`Thread exiting, ${threads.size} running...`);
                        if (threads.size === 0) {
                            makeOutputJpeg(first_window, data_structs);
                            resolve();
                        }
                    });
                    threads.add(worker);
                }
            }
        });
    }
    const run = async () => {
        let res = await startPool();
        console.log("done pool");
    };
    run().catch(err => console.error(err));
    
    
    // At this point the chunk_cube is ready to be processed by the FFT
    if (debug) elapsed_time("stop processWindow");
}












