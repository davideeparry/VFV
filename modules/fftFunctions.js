import fft from 'fourier-transform';
import gainToDecibels from 'decibels/from-gain.js';
import vfvState from './vfvState.js';

function performFftOnPixel(width, height, data_structs) {
    var fft_input = [];
    for (var i = 0; i < vfvState.fftVars.window_size/2; i++) {
        fft_input.push(0);
    }
    for (var frame = 0; frame < (vfvState.fftVars.window_size); frame++) {
        fft_input.push(data_structs.chunk_cube[frame][height][width]* hammingWindow(frame));
    }
    for (var i = 0; i < vfvState.fftVars.window_size/2; i++) {
        fft_input.push(0);
    }
    var fft_output = fft(fft_input);
    var freq_interval = vfvState.fftVars.frame_rate/(vfvState.fftVars.window_size*2);
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
};

function hammingWindow(n) { 
    return (.5 - 0.5*Math.cos(2*Math.PI*n/vfvState.fftVars.window_size));
}

export default {
    createDataStructures: (num_pixels, window_size, frame_width, frame_height) => {
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
    },
    
    hammingWindow: hammingWindow,

    performFftOnPixel: performFftOnPixel,
    // Function is called each time the window worth of chunks is sitting as data
    // to turn that data into an array that will be processed by the FFT algorithm
    processWindow: (data_structs) => {
        var data_index = 0;
        for (var frame = 0; frame < vfvState.fftVars.window_size; frame++) {
            for (var height = 0; height < vfvState.fftVars.frame_height; height++) {
                for (var width = 0; width < vfvState.fftVars.frame_width; width++) {
                    data_structs.chunk_cube[frame][height][width] = data_structs.input_data.readUInt8(data_index);
                    data_index++;
                }
            }
        }
    
        for (var height = 0; height < vfvState.fftVars.frame_height; height++) {
            for (var width = 0; width < vfvState.fftVars.frame_width; width++) { 
                performFftOnPixel(width, height, data_structs);
            }
        }
    }



}