
var types = {
    RESET: 'RESET',
    ACTIVE: 'ACTIVE',
    PROGRESS: 'PROGRESS',
    DONE: 'DONE'
};

export default {
    types: types, 
    reset: () => {
        return JSON.stringify({ type: types.RESET});
    }
}