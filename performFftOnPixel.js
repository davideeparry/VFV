const {parentPort, workerData} = require("worker_threads");
const gainToDecibels = require('decibels/from-gain');
const fft = require('fourier-transform');

parentPort.postMessage(performFftOnPixel(workerData.width, workerData.height, workerData.window_size, workerData.frame_rate, workerData.data_structs));

function performFftOnPixel(width, height, window_size, frame_rate, data_structs) {
    console.log("worker");
    var fft_input = [];
    for (var i = 0; i < window_size/2; i++) {
        fft_input.push(0);
    }
    for (var frame = 0; frame < (window_size); frame++) {
        fft_input.push(data_structs.chunk_cube[frame][height][width]* hammingWindow(frame));
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
    var max_output_db = gainToDecibels(max_output+1);
    return {max_output_freq, max_output_db};
    //data_structs.f_output_chunk_plane[width][height] = max_output_freq;
    //data_structs.i_output_chunk_plane[width][height] = gainToDecibels(max_output+1);//*max_output;
}

function hammingWindow(n, window_size) {
    return (.5 - 0.5*Math.cos(2*Math.PI*n/window_size));
 }