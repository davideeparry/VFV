const fs = require('fs');
var fft = require('fourier-transform');
var gainToDecibels = require('decibels/from-gain');
var jpeg = require('jpeg-js');
var convert = require('color-convert');
var ffmpeg = require('fluent-ffmpeg');
var readline = require('readline');

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
var ff_input_file_temp;
// FLAGS
var first_window = 1;
// Maxes for output
var max_i= 0;
var max_f = 0;
var max_i_f = 0;
// Program "Boot Sequence"
if (!process.argv[2] || !process.argv[3] || !process.argv[4] || !process.argv[5] || !process.argv[6]) {
    rl.question('Path to video: ', function(answer) {
        input_file_path = answer;
        ff_input_file_temp = ffmpeg(answer);
        rl.question('How many frames to process per image: ', function(answer) {
            window_size = parseInt(answer);
            rl.question('How many FPS was the video recorded at: ', function(answer) {
                frame_rate = parseInt(answer);
                rl.question('Height in pixels: ', function(answer) {
                    frame_height = parseInt(answer);
                    rl.question('Width in pixels: ', function(answer) {
                        frame_width = parseInt(answer);
                        rl.close();
                        startProgram();
                    });
                });
            });
        });
    });
}  else {
    frame_width = parseInt(process.argv[6]);
    frame_height = parseInt(process.argv[5]);
    window_size = parseInt(process.argv[3]);
    frame_rate = parseInt(process.argv[4]); 
    ff_input_file_temp = ffmpeg(process.argv[2]);
    input_file_path = process.argv[2];
    startProgram();
    rl.close();
}

function startProgram() {
    // Create output directory if does not exist
    if (!fs.existsSync('./output')){
        fs.mkdirSync('./output');
    }
    // Read in input file metadata, rest of program waits on this. TODO: Should format differently.
    ff_input_file_temp.on('codecData', function (data) {
        console.log(data);
        w_h = data.video_details[4];
        //frame_width = parseInt(w_h);
        //frame_height = parseInt(w_h.substring(w_h.indexOf('x')+1,w_h.length));
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
        
        var f_output_chunk_plane = new Array();
        for (var output_width = 0; output_width < frame_width; output_width++) {
            f_output_chunk_plane[output_width] = new Array();
        }
        
        var i_output_chunk_plane = new Array();
        for (var output_width = 0; output_width < frame_width; output_width++) {
            i_output_chunk_plane[output_width] = new Array();
        }
        
        // Process the input file   
        var ff_input_file = ffmpeg(input_file_path);
        // OLD CODE USED TO TRY AND AUTOMATICALLY GET METADATA, DIDN'T WORK BECAUSE THE video_details ARRAY DOES NOT ALWAYS PUT THE SAME DATA IN THE SAME PLACE
        /*ff_input_file.on('codecData', function (data) {
            w_h = data.video_details[4];
            frame_width = parseInt(w_h);
            frame_height = parseInt(w_h.substring(w_h.indexOf('x')+1,w_h.length));
        });*/
        
        ff_input_file.on('end', function() { // Called when the input file has been converted
            var file = fs.createReadStream('./temp.yuv', {highWaterMark: chunk_size});
            // The event handler for the streamed data
            file.on('data', function (chunk) {
                if (first_window) {
                    chunk.copy(data,frame_counter*num_pixels,0,num_pixels);
                    frame_counter = frame_counter+1;
                    if (frame_counter === window_size) {
                        processWindow();
                        makeOutputJpeg();
                        first_window = 0;
                    }
                } else {
                    // reindex buffer so that the first entry is now the second entry and there is one 
                    // more spot avaliable at the end of the buffer.
                    data.copy(data,0,num_pixels,(frame_counter-1)*num_pixels)
                    chunk.copy(data,(frame_counter-2)*num_pixels,0,num_pixels);
                    processWindow();
                    makeOutputJpeg();
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
                // assembles the images into a video
                var proc = ffmpeg('./output/hsv%d.jpeg')
                .fps(25)
                .addOption('-vf','format=yuv420p')
                .save('./output/video.mp4');
            });
        });
        
        ff_input_file.save('./temp.yuv'); 
        
        // Chunk-size specified to be the size of a YUV frame
        
        
        function makeOutputJpeg() {
            var data_index = 0;
            var data_index_raw = 0;

            var frame_data = Buffer.allocUnsafe(frame_width * frame_height * 4);
            var frame_data_raw = Buffer.allocUnsafe(frame_width * frame_height * 4);
            if (first_window) {
                for (var height = 0; height < frame_height; height++) {
                    for (var width = 0; width < frame_width; width++) {
                        if (f_output_chunk_plane[width][height] > max_f) {
                            max_f = f_output_chunk_plane[width][height];
                        }
                        if (i_output_chunk_plane[width][height] > max_i) {
                            max_i = i_output_chunk_plane[width][height];
                        }
                        if (i_output_chunk_plane[width][height]*f_output_chunk_plane[width][height] > max_i_f) {
                            max_i_f = i_output_chunk_plane[width][height]*f_output_chunk_plane[width][height];
                        }
                    }
                }
            }
            for (var height = 0; height < frame_height; height++) {
                for (var width = 0; width < frame_width; width++) {
                    var h = (f_output_chunk_plane[width][height]/max_f)*359; // Scaled Output Freq
                    var s = 100;
                    var v = (i_output_chunk_plane[width][height]/max_i)*99; // Scaled Output Energy
                    var rgb_array = convert.hsv.rgb(h,s,v);
                    // HSV Frame Data
                    frame_data[data_index++] = rgb_array[0];
                    frame_data[data_index++] = rgb_array[1];
                    frame_data[data_index++] = rgb_array[2];
                    frame_data[data_index++] = f_output_chunk_plane[width][height]; // Value is irrelevent not used by JPEG
                    // RAW Data Frame
                    /*
                    frame_data_raw[data_index_raw++] = f_output_chunk_plane[width][height];
                    frame_data_raw[data_index_raw++] = i_output_chunk_plane[width][height];
                    frame_data_raw[data_index_raw++] = 0;
                    frame_data_raw[data_index_raw++] = 0;
                    */
                }
            }
            // FOR HSV IMAGE
            var raw_image_data = {
                data: frame_data,
                width: frame_width,
                height: frame_height
              };
            var jpeg_image_data = jpeg.encode(raw_image_data, 100);
            fs.writeFile("./output/hsv"+output_counter+".jpeg",jpeg_image_data.data, function(err) {
                if (err) {
                    console.log(err);
                }
            });
            /*
            // FOR RAW IMAGE
            var raw_image_data_raw = {
                data: frame_data_raw,
                width: frame_width,
                height: frame_height
              };
            var jpeg_image_data_raw = jpeg.encode(raw_image_data_raw, 100);
            fs.writeFile("./output/raw"+output_counter+".jpeg",jpeg_image_data_raw.data, function(err) {
                if (err) {
                    console.log(err);
                }
            });
            */
            output_counter++;
        }
        function hammingWindow(n) {
           return (.5 - 0.5*Math.cos(2*Math.PI*n/window_size));
        }
        function performFftOnPixel(width, height) {
            var fft_input = [];
            for (var i = 0; i < window_size/2; i++) {
                fft_input.push(0);
            }
            for (var frame = 0; frame < (window_size); frame++) {
                fft_input.push(chunk_cube[frame][height][width]* hammingWindow(frame));
            }
            for (var i = 0; i < window_size/2; i++) {
                fft_input.push(0);
            }
            var fft_output = fft(fft_input);
            var freq_interval = frame_rate/(window_size*2);
            var max_output = 0;
            var max_output_index = 0;
            for (var i = 0; i < fft_output.length; i++) {
                if (fft_output[i] > max_output && i > 10) {
                    max_output = fft_output[i];
                    max_output_index = i;
                }
            }
            var max_output_freq = max_output_index * freq_interval;
            f_output_chunk_plane[width][height] = max_output_freq;
            i_output_chunk_plane[width][height] = gainToDecibels(max_output+1);//*max_output;
        };

        
        // Function is called each time the window worth of chunks is sitting as data
        // to turn that data into an array that will be processed by the FFT algorithm
        function processWindow() {
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
                    performFftOnPixel(width, height);
                }
            }
            // At this point the chunk_cube is ready to be processed by the FFT
            
        };
    });
    
    
    ff_input_file_temp.save('./temp2.avi');
}

process.on('exit', function(code) {
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
})










