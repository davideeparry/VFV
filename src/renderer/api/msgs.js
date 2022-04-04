const types = {
  RESET: 'RESET',
  ACTIVE: 'ACTIVE',
  PROGRESS: 'PROGRESS',
  DONE: 'DONE',
};

export default {
  types,
  reset: () => {
    return JSON.stringify({ type: types.RESET });
  },
};
