const test = require('node:test');
const assert = require('node:assert/strict');

const { selectBomFile, beginBomRecognition, finishBomRecognition, failBomRecognition, getBomRecognitionUiState } = require('../interaction-state');

test('selecting a BOM file keeps recognition idle until the button is clicked', () => {
  const state = selectBomFile({ status: 'idle', selectedFile: null }, { name: 'sample.xlsx', size: 1024 });

  assert.equal(state.status, 'ready');
  assert.equal(state.isRecognizing, false);
  assert.equal(state.selectedFile.name, 'sample.xlsx');
});

test('recognition enters loading only after explicit start and always exits on success or failure', () => {
  const selected = selectBomFile({ status: 'idle', selectedFile: null }, { name: 'sample.xlsx' });
  const started = beginBomRecognition(selected);
  assert.equal(started.status, 'recognizing');
  assert.equal(started.isRecognizing, true);

  const completed = finishBomRecognition(started);
  assert.equal(completed.status, 'success');
  assert.equal(completed.isRecognizing, false);

  const failed = failBomRecognition(started, 'BOM 识别失败');
  assert.equal(failed.status, 'error');
  assert.equal(failed.isRecognizing, false);
  assert.equal(failed.error, 'BOM 识别失败');
});

test('selected BOM file enables the recognition button without showing loading', () => {
  const state = selectBomFile({ status: 'idle', selectedFile: null }, { name: 'sample.jpg' });
  const ui = getBomRecognitionUiState(state);

  assert.equal(ui.buttonDisabled, false);
  assert.equal(ui.loadingVisible, false);
  assert.equal(ui.statusText, '待识别');
});
