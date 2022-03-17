import React from 'react';
import '../css/styles.css';
import Modal from './Modal';
import {startVFV} from '../VFV/VFV';

class App extends React.Component {
    constructor() {
        super();
        this.state = {
            showVideoSelector: false,
            showProcessing: false,
            showCompleted: false,
            selectedVideo: null,
            windowSize: 0,
            FPS: 0,
            height: 0,
            width: 0
        };
    }
    submitVFV() {
        this.setState({ showVideoSelector: false, showCompleted: false, showProcessing: true});
        startVFV({width: this.state.width, height: this.state.height, FPS: this.state.FPS, windowSize: this.state.windowSize}, this.state.selectedVideo);
        return 0;
    }
    checkVFVProgress() {
        return 0;
    }
    // processing
    toggleProcessing = () => {
        this.setState({ showProcessing: !this.state.showProcessing });
    }
    renderProcessing = () => {
        if (this.state.showProcessing) {
            return (
                <Modal 
                    title="Processing Video..."
                    content={this.renderProcessingContent()}
                    actions={this.renderProcessingActions()}
                />
            )
        }
    }
    renderProcessingContent = () => {
        return (
            <div className="ui teal progress" data-percent="74" id="example1">
                <div className="bar"></div>
                <div className="label">74% Processed</div>
            </div>
        )
    }
    renderProcessingActions = () => {

    }
    //completed
    toggleCompleted = () => {
        this.setState({ showCompleted: !this.state.showCompleted });
    }
    
    // selector
    toggleSelector = () => {
        this.setState({ showVideoSelector: !this.state.showVideoSelector });
    }
    renderSelector = () => {
        if (this.state.showVideoSelector) {
            return (
                <Modal 
                    title="Input Video Info"
                    content={this.renderSelectorContent()}
                    actions={this.renderSelectorActions()}
                />
            )
        }
    }
    renderSelectorActions = () => {
        return (
            <React.Fragment>
                <button onClick={() => this.submitVFV()} className="ui button">Process</button>
            </React.Fragment>
        )
    }
    renderSelectorContent = () => {
        if (this.state.selectedVideo) {
            return (
                <div>
                    <div className="ui form">
                        <div className="field">
                            <label>Video Path</label>
                            <input readOnly={true} value={this.state.selectedVideo.name} />
                        </div>
                        <div className="field">
                            <label>Window Size</label>
                            <input value={this.state.windowSize} onChange={(e) => this.setState({ windowSize: e.target.value })} />
                        </div>
                        <div className="field">
                            <label>FPS</label>
                            <input value={this.state.FPS} onChange={(e) => this.setState({ FPS: e.target.value })} />
                        </div>
                        <div className="field">
                            <label>Height</label>
                            <input value={this.state.height} onChange={(e) => this.setState({ height: e.target.value })} />
                        </div>
                        <div className="field">
                            <label>Width</label>
                            <input value={this.state.width} onChange={(e) => this.setState({ width: e.target.value })} />
                        </div>
                    </div>
                </div>
            )
        }
        
    }
    fileSelect = async () => {
        this.toggleSelector();
        var [fileHandle] = await window.showOpenFilePicker();
        var file = await fileHandle.getFile();
        console.log(file);
        this.setState({ selectedVideo: file});
    }

    render() {
        return (
            <div className="ui container">
                <div className="ui clearing top attached segment">
                    <h3 className="ui left floated header">Fourier Transform For High Speed Video</h3> 
                    <h3 className="ui right floated header">https://github.com/davideeparry/VFV</h3> 
                </div>
                <div className="ui placeholder attached segment">
                    <button onClick={() => this.fileSelect()} className="massive ui icon button">
                        <div className="ui left floated">Select High Speed Video</div>
                        <br/>
                        <i className="icon large file"></i>        
                    </button>
                </div>
                {this.renderSelector()}
                {this.renderProcessing()}
            </div>
        );
    }
};

export default App;