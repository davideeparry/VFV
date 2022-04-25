/* eslint-disable jsx-a11y/label-has-associated-control */
import React from 'react';
import '../css/styles.css';
import { Progress } from 'semantic-ui-react';
import Modal from './Modal';
import { postVideo, getVideo } from '../api/axios';

import msgs from '../api/msgs';

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      showVideoSelector: false,
      showProcessing: false,
      showCompleted: false,
      selectedVideo: { name: 'temp' },
      windowSize: 128,
      FPS: 960,
      height: 720,
      width: 1280,
      fileSize: 100,
      fileProcessed: 0,
      progress: 0,
      progressSuccess: false,
    };
    this.socket = undefined;
  }

  componentDidMount = () => {
    this.socket = new WebSocket('ws://localhost:5001');
    const { state } = this;
    this.socket.onmessage = (e) => {
      // console.log('hit on message');
      const msg = JSON.parse(e.data.toString());
      console.log(msg);
      if (
        msg.type === msgs.types.DONE ||
        state.fileProcessed === state.fileSize
      ) {
        this.setState({ progressSuccess: true });
        setTimeout(this.toggleCompleted, 2000);
      } else if (msg.type === msgs.types.ACTIVE) {
        this.setState({
          showVideoSelector: false,
          showCompleted: false,
          showProcessing: true,
        });
        this.setState({
          fileSize: msg.fileSize,
          fileProcessed: msg.sizeProcessed,
          progress: Math.ceil(100 * (msg.sizeProcessed / msg.fileSize)),
        });
      } else if (msg.type === msgs.types.PROGRESS) {
        // if (state.showProcessing === true) {
        this.setState({
          fileSize: msg.fileSize,
          fileProcessed: msg.sizeProcessed,
          progress: Math.ceil(100 * (msg.sizeProcessed / msg.fileSize)),
        });
        // }
      }
    };
  };

  componentWillUnmount() {
    this.socket.close();
  }

  fileSelect = async () => {
    this.toggleSelector();
    const [fileHandle] = await window.showOpenFilePicker();
    const file = await fileHandle.getFile();
    console.log(file);
    this.setState({ selectedVideo: file });
  };

  submitVFV = () => {
    const { state } = this;
    this.setState({
      showVideoSelector: false,
      showCompleted: false,
      showProcessing: true,
    });
    postVideo(
      {
        width: state.width,
        height: state.height,
        FPS: state.FPS,
        windowSize: state.windowSize,
      },
      state.selectedVideo
    );
    return 0;
  };

  resetState = () => {
    this.socket.send(msgs.reset());
    this.setState({
      showVideoSelector: false,
      showProcessing: false,
      showCompleted: false,
      selectedVideo: { name: 'temp ' },
      windowSize: 128,
      FPS: 960,
      height: 720,
      width: 1280,
      fileSize: 100,
      fileProcessed: 0,
      progress: 0,
      progressSuccess: false,
    });
  };

  // processing
  toggleProcessing = () => {
    const { state } = this;
    const { showProcessing } = state;
    this.setState({ showProcessing: !showProcessing });
  };

  renderProcessing = () => {
    return (
      <Modal
        title="Processing Video..."
        content={this.renderProcessingContent()}
        actions={this.renderProcessingActions()}
      />
    );
  };

  renderProcessingActions = () => {};

  renderProcessingContent = () => {
    const { state } = this;
    let labelString;
    if (state.progress === 0) {
      labelString = `Initializing...`;
      return <Progress percent={state.progress} label={labelString} progress />;
    }
    if (state.progressSuccess) {
      labelString = `${state.fileSize} bytes of ${state.fileSize} processed`;
      return <Progress percent={state.progress} label={labelString} success />;
    }
    labelString = `${state.fileProcessed} bytes of ${state.fileSize} processed`;
    return <Progress percent={state.progress} label={labelString} progress />;
  };

  // completed
  toggleCompleted = () => {
    this.setState({
      showCompleted: true,
      showVideoSelector: false,
      showProcessing: false,
    });
  };

  renderCompleted = () => {
    return (
      <Modal
        title="Processing Complete!"
        content={this.renderCompletedContent()}
        actions={this.renderCompletedActions()}
      />
    );
  };

  renderCompletedActions = () => {
    return (
      <>
        <button type="button" onClick={() => getVideo()} className="ui button">
          Download VFV
        </button>
        <button
          type="button"
          onClick={() => this.resetState()}
          className="ui button"
        >
          Transform Another Video
        </button>
      </>
    );
  };

  renderCompletedContent = () => {
    return <div>The video is processed and ready to be downloaded.</div>;
  };

  // selector
  toggleSelector = () => {
    const { state } = this;
    const { showVideoSelector } = state;
    this.setState({ showVideoSelector: !showVideoSelector });
  };

  renderSelector = () => {
    return (
      <Modal
        title="Input Video Info"
        content={this.renderSelectorContent()}
        actions={this.renderSelectorActions()}
      />
    );
  };

  renderSelectorActions = () => {
    return (
      <>
        <button
          type="button"
          onClick={() => this.submitVFV()}
          className="ui button"
        >
          Process
        </button>
      </>
    );
  };

  renderSelectorContent = () => {
    const { state } = this;
    console.log(state);
    return (
      <div>
        <div className="ui form">
          <div className="field">
            <label>
              Video Path
              <input readOnly value={state.selectedVideo.name} />
            </label>
          </div>
          <div className="field">
            <label>
              Window Size
              <input
                value={state.windowSize}
                onChange={(e) => this.setState({ windowSize: e.target.value })}
              />
            </label>
          </div>
          <div className="field">
            <label>
              FPS
              <input
                value={state.FPS}
                onChange={(e) => this.setState({ FPS: e.target.value })}
              />
            </label>
          </div>
          <div className="field">
            <label>
              Height
              <input
                value={state.height}
                onChange={(e) => this.setState({ height: e.target.value })}
              />
            </label>
          </div>
          <div className="field">
            <label>
              Width
              <input
                value={state.width}
                onChange={(e) => this.setState({ width: e.target.value })}
              />
            </label>
          </div>
        </div>
      </div>
    );
  };

  render() {
    const { state } = this;
    return (
      <div className="ui container">
        <div className="ui clearing top attached segment">
          <h3 className="ui left floated header">
            Fourier Transform For High Speed Video
          </h3>
          <h3 className="ui right floated header">
            https://github.com/davideeparry/VFV
          </h3>
        </div>
        <div className="ui placeholder attached segment">
          <button
            type="button"
            onClick={() => this.fileSelect()}
            className="massive ui icon button"
          >
            <div className="ui left floated">Select High Speed Video</div>
            <br />
            <i className="icon large file" />
          </button>
        </div>
        {state.showVideoSelector ? this.renderSelector() : null}
        {state.showProcessing ? this.renderProcessing() : null}
        {state.showCompleted ? this.renderCompleted() : null}
      </div>
    );
  }
}

export default App;
