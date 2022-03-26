import vfvState from './vfvState.js';

var types = {
    RESET: 'RESET',
    ACTIVE: 'ACTIVE',
    PROGRESS: 'PROGRESS',
    DONE: 'DONE'
};

export default {
    types: types, 
    active: () => {
        return JSON.stringify({ type: types.ACTIVE, sizeProcessed: vfvState.procInfo.sizeProcessed, fileSize: vfvState.procInfo.fileSize});
    },
    reset: () => {
        return JSON.stringify({ type: types.RESET});
    },
    progress: () => {
        
        return JSON.stringify({ type: types.PROGRESS, sizeProcessed: vfvState.procInfo.sizeProcessed, fileSize: vfvState.procInfo.fileSize});
    },
    done: () => {
        return JSON.stringify({ type: types.DONE });
    }
}