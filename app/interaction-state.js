(function attachInteractionState(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.interactionState = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function createInteractionState() {
  function selectBomFile(state, file) {
    return { ...state, selectedFile: file, status: 'ready', isRecognizing: false, error: null };
  }

  function beginBomRecognition(state) {
    if (!state.selectedFile) return { ...state, status: 'error', isRecognizing: false, error: '请先选择 BOM 文件。' };
    return { ...state, status: 'recognizing', isRecognizing: true, error: null };
  }

  function finishBomRecognition(state) {
    return { ...state, status: 'success', isRecognizing: false, error: null };
  }

  function failBomRecognition(state, error) {
    return { ...state, status: 'error', isRecognizing: false, error: String(error || 'BOM 识别失败') };
  }

  function getBomRecognitionUiState(state) {
    const statusMap = {
      demo: { statusClass: 'pill done', statusText: '演示数据 · 预置结果' },
      idle: { statusClass: 'pill', statusText: '等待上传' },
      ready: { statusClass: 'pill', statusText: '待识别' },
      recognizing: { statusClass: 'pill running', statusText: '识别中' },
      success: { statusClass: 'pill done', statusText: '识别完成' },
      error: { statusClass: 'pill', statusText: '识别失败' }
    };
    const display = statusMap[state.status] || statusMap.idle;
    return { buttonDisabled: !state.selectedFile || state.isRecognizing, loadingVisible: state.isRecognizing, ...display };
  }

  return { selectBomFile, beginBomRecognition, finishBomRecognition, failBomRecognition, getBomRecognitionUiState };
}));
