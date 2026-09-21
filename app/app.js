let data;
let currentProposal = null;
let demandRevision = 0;
let aiConfigured = false;
let sampleImages = [];
let bomFile = null;
let bomHints = {};
let bomRequestController = null;
let bomRevision = 0;
let productionBaseline = null;
let lastInferred = {};
let autoValues = {};
let apiPaths = { bomParse: '/api/bom/parse' };
let bomInteraction = { selectedFile: null, status: 'idle', isRecognizing: false, error: null };
const { buildSubmitPayload, normalizeBomData, toAgentOrder } = window.payloadUtils;
const { selectBomFile, beginBomRecognition, finishBomRecognition, failBomRecognition, getBomRecognitionUiState } = window.interactionState;
const $ = (selector) => document.querySelector(selector);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function loadWorkspace(){
$('#factory-grid').setAttribute('aria-busy','true');
return Promise.all([fetch('/data/demo_data.json').then((response) => response.json()), fetch('/api/status').then((response) => response.json())])
  .then(([loaded, status]) => {
    data = loaded;
    aiConfigured = status.configured;
    apiPaths = { ...apiPaths, ...(status.endpoints || {}) };
    renderFactories();
    $('#service-status').textContent=aiConfigured?'智能推荐已启用':'关键词推荐可用';
    $('#data-note').textContent = aiConfigured ? '智能推荐已启用 · 请核对需求，工厂资料以登记信息为准。' : '关键词推荐可用，也可手动选厂提交需求。';
  })
  .catch(() => {$('#service-status').textContent='连接需要检查';$('#factory-grid').setAttribute('aria-busy','false');$('#factory-grid').innerHTML='<div class="card result-empty"><h3>暂时无法加载工厂资料</h3><p>请检查连接后重试。</p><button type="button" id="retry-workspace">重新加载</button></div>';$('#retry-workspace').onclick=loadWorkspace;showToast('服务或演示数据加载失败，请检查连接',{type:'error'});});
}
loadWorkspace();

function capacityInDeadline(factory, deadline) { return factory.available_capacity_by_day.slice(0, deadline).reduce((total, day) => total + day, 0); }
function renderFactories() {
  $('#factory-grid').setAttribute('aria-busy','false');
  $('#factory-grid').innerHTML = data.factories.map((factory) => {
    const materialWarning = Object.values(factory.material_status).some((value) => value.includes('缺料'));
    return `<article class="card factory"><header><h3>${escapeHtml(factory.name)}</h3><span>${escapeHtml(factory.cooperation_status)}</span></header><div class="tags">${factory.categories.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join('')}</div><dl class="factory-dl"><div><dt>10 天可用产能</dt><dd>${capacityInDeadline(factory, 10)} 双</dd></div><div><dt>历史准时率</dt><dd>${Math.round(factory.on_time_rate * 100)}%</dd></div><div><dt>最小起订量</dt><dd>${factory.min_order_quantity} 双</dd></div><div><dt>关键物料</dt><dd class="${materialWarning ? 'material-warning' : 'material-ok'}">${materialWarning ? '需关注' : '本单待核对'}</dd></div></dl></article>`;
  }).join('');
}
function resetSteps() { document.querySelectorAll('#agent-steps li').forEach((item) => { item.className = ''; item.querySelector('em').textContent = '待执行'; }); }
async function executeStep(index, output) { const step = document.querySelectorAll('#agent-steps li')[index]; step.className = 'active'; step.querySelector('em').textContent = '执行中'; await wait(380); step.className = 'done'; step.querySelector('em').textContent = output; }
function finishDay(factory, quantity) { let total = 0; for (let day = 0; day < factory.available_capacity_by_day.length; day += 1) { total += factory.available_capacity_by_day[day]; if (total >= quantity) return day + 1; } return '超期'; }

function renderResult(plan, answer, order, dashboard) {
  const card = $('#result-card'); card.classList.remove('empty');
  dashboard ||= window.presentation.buildDashboard(order, null, data.factories);
  const allocations = (plan || []).map(({ factory, quantity }) => `<div class="allocation"><strong>${escapeHtml(factory.name)}</strong><span>${quantity} ${/鞋/.test(order.category) ? '双' : '件'}</span><small>预计第 ${finishDay(factory, quantity)} 天完成 · 历史准时率 ${Math.round(factory.on_time_rate * 100)}%</small></div>`).join('');
  card.innerHTML = window.presentation.renderDashboard(dashboard, answer, `<div class="plan-grid">${allocations}</div>`);
  if (currentProposal) { appendSelectionAction(); return; }
  if (!dashboard.canApprove) return;
  card.insertAdjacentHTML('beforeend', '<div class="actions"><button type="button" class="primary" id="approve">提交人工审批</button><button type="button" class="secondary" id="message">生成询单消息</button></div>');
  $('#approve').onclick = () => {
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'brand-order-proposal', title: order.style_code || '小单快反订单', allocations: plan.map(({ factory, quantity }) => ({ factory_id: factory.id, quantity })) }, window.location.origin);
    } else showToast('请从品牌方工作台打开需求发布，再提交合作订单。');
  };
  $('#message').onclick = () => generateInquiryMessages(plan, order);
}
function appendSelectionAction() {
  if (!currentProposal) return;
  $('#result-card').insertAdjacentHTML('beforeend', '<div class="actions"><button type="button" class="primary" id="select-factories">选择工厂并分配数量 →</button><p>报价、工艺与排期待工厂确认，不影响提交需求。</p></div>');
  $('#select-factories').onclick = () => {
    if (!currentProposal || currentProposal.submitted) return;
    if (window.parent !== window) window.parent.postMessage({ type: 'brand-order-proposal', ...currentProposal }, window.location.origin);
    else showToast('请从品牌工作台登录后提交需求。');
  };
}
function setFailure(message) { $('#result-card').className = 'card result-card'; $('#result-card').innerHTML = `<div class="result-top"><div><span class="success-label">连接需要检查</span><h2>真实 Agent 未完成本次分析</h2></div></div><p class="risk">${escapeHtml(message)}</p>`; }

function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }
function fileSize(size) { return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`; }
function isSampleImage(file) { return /^image\/(jpeg|png)$/.test(file.type) || /\.(jpe?g|png)$/i.test(file.name); }
function isBomFile(file) { return /^(application\/pdf|application\/vnd\.ms-excel|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|image\/(jpeg|png))$/.test(file.type) || /\.(pdf|xls|xlsx|jpe?g|png)$/i.test(file.name); }

function bindDropzone(zone, input, onFiles) {
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); input.click(); } });
  input.addEventListener('change', () => { onFiles(input.files); input.value = ''; });
  ['dragenter', 'dragover'].forEach((eventName) => zone.addEventListener(eventName, (event) => { event.preventDefault(); zone.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach((eventName) => zone.addEventListener(eventName, (event) => { event.preventDefault(); zone.classList.remove('dragging'); }));
  zone.addEventListener('drop', (event) => onFiles(event.dataTransfer.files));
}

function renderSamplePreview() {
  $('#sample-preview').innerHTML = sampleImages.map((image, index) => {
    const statusText = image.status === 'uploading' ? '上传中…' : image.status === 'uploaded' ? '已上传' : '上传失败';
    const statusClass = image.status === 'uploaded' ? 'uploaded' : image.status === 'uploading' ? 'uploading' : 'upload-error';
    return `<figure class="preview-item"><img src="${image.dataUrl}" alt="样品图 ${index + 1}" /><button type="button" class="remove-preview" data-index="${index}" aria-label="删除第 ${index + 1} 张图片">×</button><figcaption>${escapeHtml(image.name)}<span class="preview-status ${statusClass}">${statusText}</span></figcaption></figure>`;
  }).join('');
  $('#sample-preview').querySelectorAll('.remove-preview').forEach((button) => {
    button.onclick = () => { invalidateProposal(); sampleImages.splice(Number(button.dataset.index), 1); renderSamplePreview(); showToast('样品图片已移除'); };
  });
}

function handleSampleFiles(files) {
  Array.from(files).forEach((file) => {
    if (!isSampleImage(file)) return showToast(`${file.name} 不是 JPG 或 PNG 图片。`);
    if (file.size > 5 * 1024 * 1024) return showToast(`${file.name} 超过 5MB，无法上传。`);
    const reader = new FileReader();
    reader.onload = () => {
      const sample = { name: file.name, dataUrl: reader.result, url: reader.result, status: 'uploaded' };
      sampleImages.push(sample); invalidateProposal(); renderSamplePreview();
      showToast('样品图片已添加，提交需求时将一并保存。');
    };
    reader.readAsDataURL(file);
  });
}

function readBomData() {
  return Array.from(document.querySelectorAll('[data-bom-field]')).reduce((result, field) => {
    result[field.dataset.bomField] = field.value.trim();
    return result;
  }, {});
}
function fillBomData(bomData) {
  invalidateProposal();
  bomHints = bomData.production_hints || {};
  Object.entries(bomData).forEach(([field, value]) => {
    const input = document.querySelector(`[data-bom-field="${field}"]`);
    if (input) input.value = value || '';
  });
  renderBomTags();
  syncProductionFromBom();
}
const linkedFields = { category: '#category', mode: '#cooperation-mode', quantity: '#quantity', notes: '#special-notes' };
function syncProductionFromBom() {
  if (!productionBaseline) productionBaseline = Object.fromEntries(Object.entries(linkedFields).map(([key, selector]) => [key, $(selector).value]));
  const inferred = window.bomLinkage.infer(readBomData(), bomHints);
  for (const [key, selector] of Object.entries(linkedFields)) {
    if (inferred[key] === lastInferred[key]) continue;
    const element = $(selector);
    if (!inferred[key]) {
      if (element.value === autoValues[key]) element.value = productionBaseline[key];
      delete autoValues[key];
      continue;
    }
    if (key === 'category' && !Array.from(element.options).some(option => option.value === inferred[key])) element.add(new Option(inferred[key], inferred[key]));
    // Keep the user's notes and replace only the previous BOM-generated addition.
    let value = inferred[key];
    if (key === 'notes') {
      const oldAddition = lastInferred.notes ? `\n【BOM参考】${lastInferred.notes}` : '';
      value = (oldAddition ? element.value.replace(oldAddition, '') : element.value).trimEnd() + `\n【BOM参考】${value}`;
    }
    element.value = value;
    autoValues[key] = value;
  }
  lastInferred = inferred;
}
function clearBomSelection() {
  window.workspaceUI?.clearDemo();
  invalidateProposal();
  bomRevision += 1;
  bomRequestController?.abort();
  bomRequestController = null;
  bomFile = null;
  bomHints = {};
  bomInteraction = { selectedFile: null, status: 'idle', isRecognizing: false, error: null };
  $('#bom-file-input').value = '';
  document.querySelectorAll('[data-bom-field]').forEach(input => { input.value = ''; });
  if (productionBaseline) for (const [key, selector] of Object.entries(linkedFields)) {
    if ($(selector).value === autoValues[key]) $(selector).value = productionBaseline[key];
    else if (key === 'notes' && lastInferred.notes) $(selector).value = $(selector).value.replace(`\n【BOM参考】${lastInferred.notes}`, '');
  }
  productionBaseline = null; lastInferred = {}; autoValues = {};
  $('#bom-source-hint').textContent = '尚未上传 BOM，以上字段也可以直接人工填写。';
  renderBomTags();
  renderBomFileState();
  window.workspaceUI?.update();
}
function renderBomTags() {
  for (const field of ['accessory_details', 'craftsmanship']) {
    const input = document.querySelector(`[data-bom-field="${field}"]`);
    const container = document.querySelector(`[data-bom-tags="${field}"]`);
    if (!container) continue;
    const values = window.presentation.items(input.value);
    container.innerHTML = values.length ? values.map(value => `<span class="bom-chip">${escapeHtml(value)}</span>`).join('') : '<span class="tag-empty">填写或识别后显示关键词</span>';
  }
}
function renderBomRecognitionState() {
  window.workspaceUI?.update();
  const loading = $('#bom-loading');
  const button = $('#start-bom-recognition');
  const ui = getBomRecognitionUiState(bomInteraction);
  loading.hidden = !ui.loadingVisible;
  button.disabled = ui.buttonDisabled;
  button.classList.toggle('loading', ui.loadingVisible);
  button.querySelector('span').textContent = ui.loadingVisible ? '…' : '→';
  $('#bom-status').className = ui.statusClass;
  $('#bom-status').textContent = ui.statusText;
}
function renderBomFileState() {
  $('#bom-file-state').hidden = !bomFile;
  if (!bomFile) { $('#bom-file-state').replaceChildren(); renderBomRecognitionState(); return; }
  const hint = bomInteraction.status === 'demo' ? '演示数据 · 预置结果' : bomInteraction.status === 'success' ? '识别完成 · 结果可编辑' : bomInteraction.status === 'recognizing' ? '正在智能解析…' : bomInteraction.status === 'error' ? '识别失败 · 可重新点击' : '已选中 · 点击“开始识别 BOM”';
  $('#bom-file-state').innerHTML = `<span class="file-state-icon">✓</span><div><strong>${escapeHtml(bomFile.name)}</strong><small>${fileSize(bomFile.size)} · ${hint}</small></div><button type="button" id="remove-bom-file" aria-label="移除 BOM 文件">移除</button>`;
  $('#remove-bom-file').onclick = ()=>{clearBomSelection();showToast('BOM 文件已移除');};
  renderBomRecognitionState();
}
async function requestBomParse(file, signal) {
  const formData = new FormData();
  formData.append('file', file, file.name);
  const response = await fetch(apiPaths.bomParse, { method: 'POST', body: formData, signal });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'BOM 识别失败，请重新上传或手动填写。');
  const raw = result.bom_data || result.data?.bom_data || result.data || result;
  return { production_hints: raw.production_hints || result.production_hints || {}, ...normalizeBomData({
    style_name: raw.style_name || raw.styleName || raw.style,
    sku_code: raw.sku_code || raw.skuCode || raw.item_no || raw.itemNo,
    color_info: raw.color_info || raw.colorInfo || raw.color,
    size_range: raw.size_range || raw.sizeRange || raw.measurements,
    craftsmanship: raw.craftsmanship || raw.processing_tech || raw.processingTech,
    fabric_details: raw.fabric_details || raw.fabricDetails,
    accessory_details: raw.accessory_details || raw.accessoryDetails,
    material_info: raw.material_info || raw.materialInfo
  }) };
}
function selectBomFiles(files) {
  const file = Array.from(files)[0];
  if (!file) return;
  if (!isBomFile(file)) return showToast('BOM 仅支持 PDF、Excel、JPG 或 PNG 文件。');
  clearBomSelection();
  bomFile = file;
  bomInteraction = selectBomFile(bomInteraction, file);
  $('#bom-source-hint').textContent = '文件已选中，点击“开始识别 BOM”后调用真实解析接口。';
  renderBomFileState();
}
async function recognizeBom() {
  if (bomInteraction.isRecognizing) return;
  const started = beginBomRecognition(bomInteraction);
  bomInteraction = started;
  if (!started.selectedFile) { renderBomRecognitionState(); return showToast(started.error); }
  const revision = ++bomRevision;
  bomRequestController = new AbortController();
  renderBomRecognitionState();
  try {
    const bomData = await requestBomParse(started.selectedFile, bomRequestController.signal);
    if (revision !== bomRevision) return;
    window.workspaceUI?.clearDemo();
    fillBomData(bomData);
    bomInteraction = finishBomRecognition(bomInteraction);
    $('#bom-source-hint').textContent = `已从 ${started.selectedFile.name} 提取 8 项结构化信息，请核对后提交。`;
    showToast('BOM 单解析成功，请核对信息');
  } catch (error) {
    if (revision !== bomRevision || error.name === 'AbortError') return;
    bomInteraction = failBomRecognition(bomInteraction, error.message || 'BOM 识别失败，请重新上传或手动填写。');
    $('#bom-source-hint').textContent = 'BOM 识别失败，请重新点击识别或手动填写下方字段。';
    showToast(bomInteraction.error,{type:'error'});
  } finally { if (revision === bomRevision) { bomRequestController = null; renderBomFileState(); renderBomRecognitionState(); } }
}

async function generateInquiryMessages(plan, order) {
  const button = $('#message');
  button.disabled = true; button.textContent = '正在生成…';
  try {
    const response = await fetch('/api/inquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order, allocations: plan.map(({ factory, quantity }) => ({ factory_id: factory.id, quantity })) }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '询单消息生成失败。');
    document.querySelector('#inquiry-messages')?.remove();
    const messages = result.messages || [];
    const section = document.createElement('section');
    section.id = 'inquiry-messages'; section.className = 'inquiry-messages';
    section.innerHTML = `<div class="inquiry-heading"><strong>AI 生成的询单消息</strong><span>请人工核对后再发送</span></div>${messages.map((item, index) => `<article class="inquiry-message"><header><strong>${escapeHtml(item.factory_name)}</strong><button class="copy-message" data-index="${index}">复制</button></header><p>${escapeHtml(item.content).replace(/\n/g, '<br>')}</p></article>`).join('')}`;
    $('#result-card').append(section);
    section.querySelectorAll('.copy-message').forEach((copyButton) => { copyButton.onclick = async () => { const text = messages[Number(copyButton.dataset.index)]?.content; try { await navigator.clipboard.writeText(text); showToast('询单消息已复制，可粘贴发送。'); } catch { showToast('复制失败，请手动选择消息内容。'); } }; });
    showToast(`已生成 ${messages.length} 条询单消息。`);
  } catch (error) { showToast(error.message,{type:'error'}); }
  finally { button.disabled = false; button.textContent = '生成询单消息'; }
}

bindDropzone($('#sample-dropzone'), $('#sample-images-input'), handleSampleFiles);
bindDropzone($('#bom-dropzone'), $('#bom-file-input'), selectBomFiles);
$('#start-bom-recognition').addEventListener('click', recognizeBom);
renderBomRecognitionState();
document.querySelectorAll('[data-bom-field]').forEach(input => input.addEventListener('input', () => { if(bomInteraction.isRecognizing){bomRevision++;bomRequestController?.abort();bomInteraction={...bomInteraction,isRecognizing:false,status:'ready'};$('#bom-source-hint').textContent='已保留您的手动修改，需要时可重新识别。';renderBomFileState();}renderBomTags(); syncProductionFromBom(); }));
renderBomTags();

$('#order-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if ($('#run-agent').disabled) return;
  if (!data) return showToast('正在加载演示数据，请稍候。');
  const bomData = readBomData();
  const planningContext = { category: $('#category').value, quantity: Number($('#quantity').value), deadlineDays: Number($('#deadline').value), splittable: $('#splittable').checked };
  if (!bomData.style_name || !bomData.sku_code || !bomData.craftsmanship) return showToast('请补全款式名称、货号和制作工艺要求。');
  if (!planningContext.quantity || !planningContext.deadlineDays) return showToast('请补全订单数量和目标交期。');
  if (sampleImages.some((image) => image.status === 'uploading')) return showToast('样品图片仍在上传，请稍候再提交。');
  if (sampleImages.some((image) => image.status === 'error')) return showToast('有样品图片上传失败，请删除后重新上传。');
  const payload = buildSubmitPayload({ sampleImages: sampleImages.filter((image) => image.status === 'uploaded').map((image) => image.url), bomData, productionRequirements: { cooperation_mode: $('#cooperation-mode').value, special_notes: $('#special-notes').value }, planningContext });
  const order = toAgentOrder(payload);
  const revision = demandRevision, requestId = crypto.randomUUID();
  currentProposal = { requestId, demand: payload, candidates: [] };
  window.workspaceUI?.setExecution('running');
  resetSteps(); $('#result-card').className = 'card result-card empty'; $('#result-card').innerHTML = '<div class="result-empty"><span>◌</span><h2>真实 Agent 正在调用业务工具</h2><p>读取最新工厂能力，推荐后由你选厂和分配数量。</p></div><div class="skeleton-block" aria-hidden="true"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>'; $('#run-state').className = 'pill running'; $('#run-state').textContent = '执行中'; $('#run-agent').disabled = true; $('#run-agent').querySelector('span').textContent = '…';
  try {
    const response = await fetch('/api/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const aiResult = await response.json(); if (!response.ok) throw new Error(aiResult.error || '真实 Agent 暂时无法响应。');
    if (revision !== demandRevision) { showChangedDemand(); return; }
    currentProposal = { requestId, demand: payload, candidates: aiResult.candidates || [], notice: aiResult.notice };
    if (aiResult.factories) { data.factories = aiResult.factories; renderFactories(); }
    const logs = aiResult.logs || [];
    await executeStep(0, '已解析');
    await executeStep(1, logs.find((item) => item.tool === 'query_factory_capabilities')?.summary || '已完成');
    await executeStep(2, logs.find((item) => item.tool === 'query_capacity_schedule')?.summary || '已完成');
    await executeStep(3, logs.find((item) => item.tool === 'query_material_status')?.summary || '已完成');
    await executeStep(4, logs.find((item) => item.tool === 'evaluate_dispatch_plan')?.summary || '已完成');
    if (revision !== demandRevision) { showChangedDemand(); return; }
    const plan = aiResult.plan?.allocations?.map((item) => ({ factory: data.factories.find((factory) => factory.id === item.factory_id), quantity: item.quantity })).filter((item) => item.factory);
    renderResult(plan, aiResult.answer || 'Agent 已完成分析。', { ...order, bom_data: bomData }, aiResult.dashboard); $('#run-state').className = 'pill done'; $('#run-state').textContent = '执行完成';window.workspaceUI?.setExecution('success');showToast('工厂推荐分析已完成，请核对方案并选择工厂');
  } catch (error) { if (revision !== demandRevision) { showChangedDemand(); return; } setFailure(error.message); window.workspaceUI?.setExecution('error');appendSelectionAction(); $('#run-state').className = 'pill'; $('#run-state').textContent = '可手动选厂'; showToast('分析暂不可用，仍可选择工厂提交需求。'); }
  finally { $('#run-agent').disabled = false; $('#run-agent').querySelector('span').textContent = '→'; }
});
let localNotifications;
function showToast(message,options={}) {
  const embedded=window.parent!==window&&new URLSearchParams(location.search).get('embedded')==='1';
  const kind=options.type||(/失败|无法|不支持|仅支持|超过/.test(message)?'error':'success');
  if(embedded)window.parent.postMessage({type:'shoe-ui:toast',message:String(message).slice(0,2000),kind},location.origin);
  else {localNotifications??=ShoeUI.mountNotifications();localNotifications.notify(message,{...options,type:kind});}
}

function invalidateProposal() {
  window.workspaceUI?.reset();
  demandRevision++; currentProposal = null;
  const button = $('#select-factories'); if (button) { button.disabled = true; button.textContent = '需求已修改，请重新分析'; }
}
function showChangedDemand() { currentProposal = null; $('#result-card').innerHTML = '<p>需求已修改，请重新分析后选择工厂。</p>'; $('#run-state').textContent = '需求已修改'; }
$('#order-form').addEventListener('input', invalidateProposal);
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== window.parent || event.data?.type !== 'brand-order-submitted' || event.data.requestId !== currentProposal?.requestId) return;
  window.workspaceUI?.setExecution('submitted');
  currentProposal.submitted = true; const button = $('#select-factories'); if (button) { button.disabled = true; button.textContent = '本次需求已提交'; }
});
