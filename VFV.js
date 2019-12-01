const fs = require('fs');
var fft = require('fourier-transform');
var gainToDecibels = require('decibels/from-gain');
var jpeg = require('jpeg-js');
var convert = require('color-convert');
var ffmpeg = require('fluent-ffmpeg');
var readline = require('readline');

//
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
// VAR INITIALIZATION
var window_size;
var frame_width;
var frame_height;
var frame_rate;
var input_file_path;
var inputFileTemp;
if (!process.argv[2] || !process.argv[3] || !process.argv[4]) {
    rl.question('Path to video: ', function(answer) {
        input_file_path = answer;
        inputFileTemp = ffmpeg(answer);
        rl.question('How many frames to process per image: ', function(answer) {
            window_size = parseInt(answer);
            rl.question('How many FPS was the video recorded at: ', function(answer) {
                frame_rate = parseInt(answer);
                rl.close();
                startProgram();
            });
        });
        
    });
    
    
}  else {
    window_size = parseInt(process.argv[3]);
    frame_rate = parseInt(process.argv[4]); 
    inputFileTemp = ffmpeg(process.argv[2]);
    input_file_path = process.argv[2];
    startProgram();
}

function startProgram() {
    inputFileTemp.on('codecData', function (data) {
        console.log(data);
        w_h = data.video_details[4];
        frame_width = parseInt(w_h);
        frame_height = parseInt(w_h.substring(w_h.indexOf('x')+1,w_h.length));
        var num_pixels = frame_width*frame_height;
        var chunk_size = num_pixels + (num_pixels/2);
        var data = Buffer.allocUnsafe(num_pixels*window_size);
        var frame_counter = 0;
        var output_counter = 0;
        // Initializing cube
        // hunk_cube_format -> [frame][height][width]
        var chunk_cube = new Array();
        for (var frame = 0; frame < window_size; frame++) {
            chunk_cube[frame] = new Array();
            for (var height = 0; height < frame_height; height++) {
                chunk_cube[frame][height] = new Array();
            }
        }
        
        var output_chunk_plane = new Array();
        for (var output_width = 0; output_width < frame_width; output_width++) {
            output_chunk_plane[output_width] = new Array();
        }
        
        var i_output_chunk_plane = new Array();
        for (var output_width = 0; output_width < frame_width; output_width++) {
            i_output_chunk_plane[output_width] = new Array();
        }
        
        // Process the input file
        
        
        
        var inputFile = ffmpeg(input_file_path);
        
        /*inputFile.on('codecData', function (data) {
            w_h = data.video_details[4];
            frame_width = parseInt(w_h);
            frame_height = parseInt(w_h.substring(w_h.indexOf('x')+1,w_h.length));
        });*/
        
        inputFile.on('end', function() { // Called when the input file has been converted
            var file = fs.createReadStream('./temp.yuv', {highWaterMark: chunk_size});
            // The event handler for the streamed data
            file.on('data', function (chunk) {
                chunk.copy(data,frame_counter*num_pixels,0,num_pixels);
                frame_counter = frame_counter+1;
                if (frame_counter === window_size) {
                    process_window();
                    make_output_jpeg();
                    // Here I need to write a window
                    console.log("FFT #" + output_counter + " complete.");
                    frame_counter = 0;
                }
            });
        
            file.on('end', function() {
                console.log("Video File Processed.");
                fs.unlink('./temp.yuv', function(err) {
                    if (err) {
                       console.log(err);
                    }
                });
                fs.unlink('./temp2.avi', function(err) {
                    if (err) {
                       console.log(err);
                    }
                });
            });
        });
        
        inputFile.save('./temp.yuv'); 
        
        // Chunk-size specified to be the size of a YUV frame
        
        
        function make_output_jpeg() {
            var data_index = 0;
            var data_index_raw = 0;
            var max_i= 0;
            var max_f = 0;
            var max_i_f = 0;
            var frameData = Buffer.allocUnsafe(frame_width * frame_height * 4);
            var frameDataRaw = Buffer.allocUnsafe(frame_width * frame_height * 4);
            for (var height = 0; height < frame_height; height++) {
                for (var width = 0; width < frame_width; width++) {
                    if (output_chunk_plane[width][height] > max_f) {
                        max_f = output_chunk_plane[width][height];
                    }
                    if (i_output_chunk_plane[width][height] > max_i) {
                        max_i = i_output_chunk_plane[width][height];
                    }
                    if (i_output_chunk_plane[width][height]*output_chunk_plane[width][height] > max_i_f) {
                        max_i_f = i_output_chunk_plane[width][height]*output_chunk_plane[width][height];
                    }
                }
            }
            for (var height = 0; height < frame_height; height++) {
                for (var width = 0; width < frame_width; width++) {
                    var h = (output_chunk_plane[width][height]/max_f)*359; // Scaled Output Freq
                    var s = 100;
                    var v = (i_output_chunk_plane[width][height]/max_i)*99; // Scaled Output Energy
                    var rgb_array = convert.hsv.rgb(h,s,v);
                    // HSV Frame Data
                    frameData[data_index++] = rgb_array[0];
                    frameData[data_index++] = rgb_array[1];
                    frameData[data_index++] = rgb_array[2];
                    frameData[data_index++] = output_chunk_plane[width][height]; // Value is irrelevent not used by JPEG
                    // RAW Data Frame
                    frameDataRaw[data_index_raw++] = output_chunk_plane[width][height];
                    frameDataRaw[data_index_raw++] = i_output_chunk_plane[width][height];
                    frameDataRaw[data_index_raw++] = 0;
                    frameDataRaw[data_index_raw++] = 0;
                }
            }
            // FOR HSV IMAGE
            var rawImageData = {
                data: frameData,
                width: frame_width,
                height: frame_height
              };
            var jpegImageData = jpeg.encode(rawImageData, 100);
            fs.writeFile("./output/hsv"+output_counter+".jpeg",jpegImageData.data, function(err) {
                if (err) {
                    console.log(err);
                }
            });
            // FOR RAW IMAGE
            var rawImageDataRaw = {
                data: frameDataRaw,
                width: frame_width,
                height: frame_height
              };
            var jpegImageDataRaw = jpeg.encode(rawImageDataRaw, 100);
            fs.writeFile("./output/raw"+output_counter+".jpeg",jpegImageDataRaw.data, function(err) {
                if (err) {
                    console.log(err);
                }
            });
            output_counter++;
        }
        
        
        function perform_fft_on_pixel(width, height) {
            var fft_input = [];
            for (var frame = 0; frame < (window_size); frame++) {
                fft_input.push(chunk_cube[frame][height][width]);
            }
            var fft_output = fft(fft_input);
            var freq_interval = frame_rate/window_size;
            var max_output = 0;
            var max_output_index = 0;
            for (var i = 0; i < fft_output.length; i++) {
                if (fft_output[i] > max_output && i != 0) {
                    max_output = fft_output[i];
                    max_output_index = i;
                }
            }
            var max_output_freq = max_output_index * freq_interval;
            output_chunk_plane[width][height] = max_output_freq;
            i_output_chunk_plane[width][height] = gainToDecibels(max_output+1);//*max_output;
        };
        
        
        // Function is called each time the window worth of chunks is sitting as data
        // to turn that data into an array that will be processed by the FFT algorithm
        function process_window() {
            var data_index = 0;
            for (var frame = 0; frame < window_size; frame++) {
                for (var height = 0; height < frame_height; height++) {
                    for (var width = 0; width < frame_width; width++) {
                        chunk_cube[frame][height][width] = data.readUInt8(data_index);
                        data_index++;
                    }
                }
            }
        
            for (var height = 0; height < frame_height; height++) {
                for (var width = 0; width < frame_width; width++) { 
                    perform_fft_on_pixel(width, height);
                }
            }
            // At this point the chunk_cube is ready to be processed by the FFT
            
        };
    });
    
    
    inputFileTemp.save('./temp2.avi');
}










