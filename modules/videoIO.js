import jpeg from 'jpeg-js';
import convert from 'color-convert';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';

import vfvState from './vfvState.js';


export default {
    jpegToMp4: () => {
        var inputString = './output'+vfvState.folderInc+'/hsv%d.jpeg';
        var outputString = './output'+vfvState.folderInc+'/video.mp4';
        var proc = ffmpeg(inputString)
                .fps(25)
                .addOption('-vf','format=yuv420p')
                .save(outputString);
    },
    getFfmpegHandler: (filepath) => {
        return ffmpeg(filepath);
    },
    makeOutputJpeg: (first_window, data_structs) => {
        var data_index = 0;
        var frame_width = vfvState.fftVars.frame_width;
        var frame_height = vfvState.fftVars.frame_height;
        var frame_data = Buffer.allocUnsafe(frame_width * frame_height * 4);
        if (first_window) { // This sets the max freq off of the first window, would be better to find a way to check as we go, and then perform the scaling at the end. 
            for (var height = 0; height < frame_height; height++) {
                for (var width = 0; width < frame_width; width++) {
                    if (data_structs.f_output_chunk_plane[width][height] > vfvState.normalization.max_f) {
                        vfvState.normalization.max_f = data_structs.f_output_chunk_plane[width][height];
                    }
                    if (data_structs.i_output_chunk_plane[width][height] > vfvState.normalization.max_i) {
                        vfvState.normalization.max_i = data_structs.i_output_chunk_plane[width][height];
                    }
                    if (data_structs.i_output_chunk_plane[width][height]*data_structs.f_output_chunk_plane[width][height] > vfvState.normalization.max_i_f) {
                        vfvState.normalization.max_i_f = data_structs.i_output_chunk_plane[width][height]*data_structs.f_output_chunk_plane[width][height];
                    }
                }
            }
        }
        for (var height = 0; height < frame_height; height++) {
            for (var width = 0; width < frame_width; width++) {
                var h = (data_structs.f_output_chunk_plane[width][height]/vfvState.normalization.max_f)*359; // Scaled Output Freq
                var s = 100;
                var v = (data_structs.i_output_chunk_plane[width][height]/vfvState.normalization.max_i)*99; // Scaled Output Energy
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
        fs.writeFile("./output"+vfvState.folderInc+"/hsv"+vfvState.fftVars.output_counter+".jpeg",jpeg_image_data.data, function(err) {
            if (err) {
                console.log(err);
            }
        });
        vfvState.fftVars.output_counter++;
    }
}