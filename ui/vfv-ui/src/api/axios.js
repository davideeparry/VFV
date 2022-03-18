const axios = require('axios');
const FormData = require('form-data');



export async function postVideo(params, video) {
    const form = new FormData();
    form.append('width', params.width);
    form.append('height', params.height);
    form.append('windowSize', params.windowSize);
    form.append('FPS', params.FPS);
    form.append('video', video);
    const response = await axios.post('http://localhost:5000', form, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
    });
    console.log(response);
}






