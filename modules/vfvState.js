var normalization = {
    max_i: 0,
    max_f: 0,
    max_i_if: 0
};
var procInfo = {
    fileSize: 100,
    sizeProcessed: 0
};
var fftVars = {
    num_pixels: 0,
    window_size: 0,
    frame_width: 0,
    frame_height: 0,
    frame_counter: 0,
    output_counter: 0,
    chunk_size: 0
}
var first_window = false;
var folderInc = 0;
var processingActive = false;

export default {
    normalization,
    procInfo,
    fftVars,
    first_window,
    folderInc,
    processingActive,
    resetVFV() {
        normalization.max_i= 0;
        normalization.max_f = 0;
        normalization.max_i_f = 0;
        procInfo.fileSize = 100;
        procInfo.sizeProcessed = 0;
        fftVars.num_pixels = 0;
        fftVars.window_size = 0;
        fftVars.frame_width = 0;
        fftVars.frame_height = 0;
        fftVars.frame_counter = 0;
        fftVars.output_counter = 0;
        fftVars.chunk_size = 0;
        processingActive = false;
    },
    initArgs(args) {
        fftVars.frame_width = args.width;
        fftVars.frame_height = args.height;
        fftVars.window_size = args.windowSize;
        fftVars.frame_rate = args.FPS;        
        // num_pixels is the number of pixels per frame
        fftVars.num_pixels = fftVars.frame_width*fftVars.frame_height;
        // chunk size is the size in bytes of each YUV420 frame
        fftVars.chunk_size = fftVars.num_pixels + (fftVars.num_pixels/2);
        fftVars.frame_counter = 0;
        fftVars.output_counter = 0;
    }

};