let data;
let aiConfigured = false;
const $ = (selector) => document.querySelector(selector);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

Promise.all([fetch('/data/demo_data.json').then((response) => response.json()), fetch('/api/status').then((response) => response.json())])
  .then(([loaded, status]) => {
    data = loaded;
    aiConfigured = status.configured;
    renderFactories();
    $('#data-note').textContent = aiConfigured ? `真实 Agent 已连接 · ${status.provider} / ${status.model} · 工厂数据为模拟数据` : '未检测到大模型密钥，目前只能使用演示规则模式。';
  })
  .catch(() => showToast('服务或演示数据加载失败，请检查是否已启动原型。'));

function capacityInDeadline(factory, deadline) { return factory.available_capacity_by_day.slice(0, deadline).reduce((total, day) => total + day, 0); }
function renderFactories() {
  $('#factory-grid').innerHTML = data.factories.map((factory) => {
    const materialWarning = Object.values(factory.material_status).some((value) => value.includes('缺料'));
    return `<article class="card factory"><header><h3>${factory.name}</h3><span>${factory.cooperation_status}</span></header><div class="tags">${factory.categories.map((item) => `<span class="tag">${item}</span>`).join('')}</div><dl class="factory-dl"><div><dt>10 天可用产能</dt><dd>${capacityInDeadline(factory, 10)} 双</dd></div><div><dt>历史准时率</dt><dd>${Math.round(factory.on_time_rate * 100)}%</dd></div><div><dt>最小起订量</dt><dd>${factory.min_order_quantity} 双</dd></div><div><dt>关键物料</dt><dd class="${materialWarning ? 'material-warning' : 'material-ok'}">${materialWarning ? '需关注' : '可满足'}</dd></div></dl></article>`;
  }).join('');
}
function resetSteps() { document.querySelectorAll('#agent-steps li').forEach((item) => { item.className = ''; item.querySelector('em').textContent = '待执行'; }); }
async function executeStep(index, output) { const step = document.querySelectorAll('#agent-steps li')[index]; step.className = 'active'; step.querySelector('em').textContent = '执行中'; await wait(380); step.className = 'done'; step.querySelector('em').textContent = output; }
function finishDay(factory, quantity) { let total = 0; for (let day = 0; day < factory.available_capacity_by_day.length; day += 1) { total += factory.available_capacity_by_day[day]; if (total >= quantity) return day + 1; } return '超期'; }

function renderResult(plan, answer, order) {
  const card = $('#result-card'); card.classList.remove('empty');
  if (!plan?.length) { card.innerHTML = `<div class="result-top"><div><span class="success-label">需要人工介入</span><h2>当前没有低风险的可执行方案</h2></div></div><p class="agent-explanation">${answer || '建议放宽交期、增加备选工厂，或调整关键工艺要求。'}</p>`; return; }
  const allocations = plan.map(({factory, quantity}) => `<div class="allocation"><strong>${factory.name}</strong><span>${quantity} 双</span><small>预计第 ${finishDay(factory, quantity)} 天完成 · 准时率 ${Math.round(factory.on_time_rate * 100)}%</small></div>`).join('');
  const riskFactory = plan.find(({factory}) => factory.on_time_rate < .92);
  const risk = riskFactory ? `中风险：${riskFactory.factory.name}历史准时率为 ${Math.round(riskFactory.factory.on_time_rate * 100)}%。建议发送询单后要求其在 2 小时内确认排期，并设置第 5 天进度预警。` : '低风险：关键工艺、物料状态和可用产能均满足订单要求。';
  card.innerHTML = `<div class="result-top"><div><span class="success-label">推荐方案已生成</span><h2>${plan.length > 1 ? '拆单协同生产方案' : '单厂生产方案'}</h2></div><span class="pill done">可提交审批</span></div><div class="plan-grid">${allocations}</div><p class="agent-explanation"><strong>Agent 说明：</strong>${answer}</p><div class="risk"><strong>风险提示：</strong>${risk}</div><div class="actions"><button class="primary" id="approve">提交人工审批</button><button class="secondary" id="message">生成询单消息</button></div>`;
  $('#approve').onclick = () => showToast('已创建审批任务，等待品牌方负责人确认。');
  $('#message').onclick = () => generateInquiryMessages(plan, order);
}
function setFailure(message) { $('#result-card').className = 'card result-card'; $('#result-card').innerHTML = `<div class="result-top"><div><span class="success-label">连接需要检查</span><h2>真实 Agent 未完成本次分析</h2></div></div><p class="risk">${message}</p>`; }

function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }
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
  } catch (error) { showToast(error.message); }
  finally { button.disabled = false; button.textContent = '生成询单消息'; }
}

$('#order-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!data) return showToast('正在加载演示数据，请稍候。');
  if (!aiConfigured) return setFailure('未检测到 API 密钥。请确认项目根目录的 .env 文件已保存，并重启原型服务。');
  const order = { style_code: $('#style-code').value.trim(), category: $('#category').value, quantity: Number($('#quantity').value), deadline_days: Number($('#deadline').value), required_processes: $('#process').value.split(/[、,，]/).map((item) => item.trim()).filter(Boolean), splittable: $('#splittable').checked, note: $('#order-note').value.trim() };
  if (!order.quantity || !order.deadline_days || !order.required_processes.length) return showToast('请补全订单数量、交期和关键工艺。');
  resetSteps(); $('#result-card').className = 'card result-card empty'; $('#result-card').innerHTML = '<div class="result-empty"><span>◌</span><h2>真实 Agent 正在调用业务工具</h2><p>它会读取工厂能力、产能和物料状态，再生成需人工确认的建议。</p></div>'; $('#run-state').className = 'pill running'; $('#run-state').textContent = '执行中';
  try {
    const response = await fetch('/api/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(order) });
    const aiResult = await response.json(); if (!response.ok) throw new Error(aiResult.error || '真实 Agent 暂时无法响应。');
    const logs = aiResult.logs || [];
    await executeStep(0, '已解析');
    await executeStep(1, logs.find((item) => item.tool === 'query_factory_capabilities')?.summary || '已完成');
    await executeStep(2, logs.find((item) => item.tool === 'query_capacity_schedule')?.summary || '已完成');
    await executeStep(3, logs.find((item) => item.tool === 'query_material_status')?.summary || '已完成');
    await executeStep(4, logs.find((item) => item.tool === 'evaluate_dispatch_plan')?.summary || '已完成');
    const plan = aiResult.plan?.allocations?.map((item) => ({ factory: data.factories.find((factory) => factory.id === item.factory_id), quantity: item.quantity })).filter((item) => item.factory);
    renderResult(plan, aiResult.answer || 'Agent 已完成分析。', order); $('#run-state').className = 'pill done'; $('#run-state').textContent = '执行完成';
  } catch (error) { setFailure(error.message); $('#run-state').className = 'pill'; $('#run-state').textContent = '执行失败'; showToast('请检查 .env 密钥、网络或模型配置。'); }
});
function showToast(message) { const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2600); }
