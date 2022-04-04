import axios from 'axios';
import FormData from 'form-data';
import FileDownload from 'js-file-download';

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

export async function getVideo() {
  const response = await axios.get('http://localhost:5000/download', {
    responseType: 'blob',
  });
  // from https://stackoverflow.com/questions/41938718/how-to-download-files-using-axios
  FileDownload(response.data, 'vfv-output.mp4');
}
