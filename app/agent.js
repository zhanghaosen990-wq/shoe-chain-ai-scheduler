const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data', 'demo_data.json'), 'utf8'));

// DeepSeek 使用 OpenAI 兼容的 Chat Completions 协议：函数定义需放进 function 字段。
const toolDefinitions = [
  { type: 'function', function: { name: 'query_factory_capabilities', description: '查询符合订单品类和关键工艺的已授权工厂。', parameters: { type: 'object', properties: { category: { type: 'string' }, required_processes: { type: 'array', items: { type: 'string' } } }, required: ['category', 'required_processes'], additionalProperties: false } } },
  { type: 'function', function: { name: 'query_capacity_schedule', description: '查询指定工厂在目标交期内的可用产能和最小起订量。', parameters: { type: 'object', properties: { factory_ids: { type: 'array', items: { type: 'string' } }, deadline_days: { type: 'integer' } }, required: ['factory_ids', 'deadline_days'], additionalProperties: false } } },
  { type: 'function', function: { name: 'query_material_status', description: '查询指定工厂关键物料的满足状态。', parameters: { type: 'object', properties: { factory_ids: { type: 'array', items: { type: 'string' } } }, required: ['factory_ids'], additionalProperties: false } } },
  { type: 'function', function: { name: 'evaluate_dispatch_plan', description: '基于已查询的能力、产能和物料结果，计算可执行的单厂或拆单计划及业务风险。必须在给出最终推荐前调用。', parameters: { type: 'object', properties: { category: { type: 'string' }, required_processes: { type: 'array', items: { type: 'string' } }, quantity: { type: 'integer' }, deadline_days: { type: 'integer' }, splittable: { type: 'boolean' } }, required: ['category', 'required_processes', 'quantity', 'deadline_days', 'splittable'], additionalProperties: false } } }
];

function capacityInDeadline(factory, deadline) {
  return factory.available_capacity_by_day.slice(0, deadline).reduce((total, day) => total + day, 0);
}
function matchesProcesses(factory, processes) {
  return processes.every((item) => factory.process_capabilities.includes(item));
}
function factoryByIds(ids) {
  return data.factories.filter((factory) => ids.includes(factory.id));
}
function evaluatePlan(order) {
  const capabilityMatched = data.factories.filter((factory) => factory.categories.includes(order.category) && matchesProcesses(factory, order.required_processes));
  const viable = capabilityMatched.filter((factory) => capacityInDeadline(factory, order.deadline_days) >= factory.min_order_quantity);
  const safe = viable.filter((factory) => !Object.values(factory.material_status).some((value) => value.includes('缺料'))).sort((a, b) => b.on_time_rate - a.on_time_rate);
  if (!safe.length) return { status: 'human_review', reason: '没有物料状态明确、且满足品类、工艺与最小起订量要求的工厂。', allocations: [] };
  const first = safe[0];
  const firstCapacity = capacityInDeadline(first, order.deadline_days);
  if (firstCapacity >= order.quantity) return { status: 'recommended', allocations: [{ factory_id: first.id, quantity: order.quantity }], risk: 'low' };
  if (!order.splittable) return { status: 'human_review', reason: '订单不允许拆单，当前没有单一低风险工厂能在交期内完成。', allocations: [] };
  const second = safe.find((factory) => factory.id !== first.id && capacityInDeadline(factory, order.deadline_days) >= factory.min_order_quantity);
  if (!second) return { status: 'human_review', reason: '没有第二家满足物料与产能要求的工厂可用于拆单。', allocations: [] };
  const secondQuantity = Math.max(second.min_order_quantity, Math.min(capacityInDeadline(second, order.deadline_days), order.quantity - firstCapacity));
  const firstQuantity = order.quantity - secondQuantity;
  if (firstQuantity < first.min_order_quantity || firstQuantity > firstCapacity || secondQuantity > capacityInDeadline(second, order.deadline_days)) return { status: 'human_review', reason: '现有工厂组合无法同时满足交期和最小起订量。', allocations: [] };
  const risk = second.on_time_rate < 0.92 ? 'medium' : 'low';
  return { status: 'recommended', allocations: [{ factory_id: first.id, quantity: firstQuantity }, { factory_id: second.id, quantity: secondQuantity }], risk };
}

function runTool(name, args) {
  if (name === 'query_factory_capabilities') {
    return data.factories.filter((factory) => factory.categories.includes(args.category) && matchesProcesses(factory, args.required_processes)).map((factory) => ({ id: factory.id, name: factory.name, categories: factory.categories, process_capabilities: factory.process_capabilities, cooperation_status: factory.cooperation_status }));
  }
  if (name === 'query_capacity_schedule') return factoryByIds(args.factory_ids).map((factory) => ({ id: factory.id, name: factory.name, capacity_in_deadline: capacityInDeadline(factory, args.deadline_days), min_order_quantity: factory.min_order_quantity, earliest_start_date: factory.earliest_start_date, on_time_rate: factory.on_time_rate }));
  if (name === 'query_material_status') return factoryByIds(args.factory_ids).map((factory) => ({ id: factory.id, name: factory.name, material_status: factory.material_status }));
  if (name === 'evaluate_dispatch_plan') return evaluatePlan(args);
  throw new Error(`未知工具：${name}`);
}

async function apiRequest(body, config) {
  const endpoint = config.provider === 'deepseek' ? 'https://api.deepseek.com/chat/completions' : 'https://api.openai.com/v1/chat/completions';
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` }, body: JSON.stringify(body) });
  let result;
  try { result = await response.json(); } catch { throw new Error(`AI 服务返回了无法解析的响应（${response.status}）`); }
  if (!response.ok) throw new Error(result?.error?.message || `AI API 请求失败（${response.status}）`);
  return result;
}

async function runAgent(order, config) {
  const orderContext = JSON.stringify(order, null, 2);
  const instructions = `你是“鞋链智排”的鞋服供应链调度 Agent。你只能根据工具返回的模拟业务数据做判断，不能杜撰工厂数据。对于每一笔订单，必须依次调用：query_factory_capabilities、query_capacity_schedule、query_material_status、evaluate_dispatch_plan。最后用简洁中文说明推荐方案、理由、风险和必须由人工确认的动作。即使有推荐方案，也不得自动下单。`;
  const history = [{ role: 'system', content: instructions }, { role: 'user', content: `请处理以下品牌方订单，并按要求调用工具：\n${orderContext}` }];
  const logs = [];
  let latestPlan = null;
  for (let turn = 0; turn < 8; turn += 1) {
    const response = await apiRequest({ model: config.model, messages: history, tools: toolDefinitions, tool_choice: 'auto', temperature: 0.2 }, config);
    const message = response.choices?.[0]?.message;
    if (!message) throw new Error('AI 服务未返回有效消息。');
    const calls = message.tool_calls || [];
    if (!calls.length) return { answer: message.content || 'Agent 已完成分析。', logs, plan: latestPlan };
    history.push(message);
    const outputs = calls.map((call) => {
      let args;
      const name = call.function?.name;
      try { args = JSON.parse(call.function?.arguments || '{}'); } catch { throw new Error(`工具参数无法解析：${name || '未知工具'}`); }
      const output = runTool(name, args);
      if (name === 'evaluate_dispatch_plan') latestPlan = output;
      logs.push({ tool: name, summary: toolSummary(name, output) });
      return { role: 'tool', tool_call_id: call.id, content: JSON.stringify(output) };
    });
    history.push(...outputs);
  }
  throw new Error('Agent 调用工具次数过多，已停止本次分析。');
}

async function generateInquiryMessages(order, allocations, config) {
  if (!Array.isArray(allocations) || !allocations.length) throw new Error('缺少可用于询单的工厂分配方案。');
  const factories = allocations.map((allocation) => {
    const factory = data.factories.find((item) => item.id === allocation.factory_id);
    const quantity = Number(allocation.quantity);
    if (!factory || !Number.isFinite(quantity) || quantity <= 0) throw new Error('询单方案中包含无效的工厂或数量。');
    return { factory_id: factory.id, factory_name: factory.name, quantity, cooperation_status: factory.cooperation_status, contact_reply_hours: factory.contact_reply_hours };
  });
  const prompt = `你是鞋服品牌方的跟单助手。根据以下已审批前的候选分配方案，为每家工厂各写一条可直接发送的中文询单消息。语气专业、简洁，明确这是“请确认”、不是下单；必须包含款号、数量、交期、关键工艺，并请对方在对应时限内回复是否能接单及确认排期。不要编造价格、联系人、库存或已经下单的事实。\n\n订单：${JSON.stringify({ style_code: order.style_code || '未提供', category: order.category, deadline_days: order.deadline_days, required_processes: order.required_processes, note: order.note || '无' })}\n\n候选分配：${JSON.stringify(factories)}`;
  const response = await apiRequest({
    model: config.model,
    messages: [
      { role: 'system', content: '只输出合法 JSON，不要 Markdown。返回格式必须为 {"messages":[{"factory_id":"...","content":"..."}]}。' },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3
  }, config);
  const content = response.choices?.[0]?.message?.content;
  let result;
  try { result = JSON.parse(content); } catch { throw new Error('AI 返回的询单消息格式无法解析，请重试。'); }
  if (!Array.isArray(result.messages)) throw new Error('AI 未返回询单消息列表，请重试。');
  const messageByFactory = new Map(result.messages.filter((item) => item && typeof item.content === 'string').map((item) => [item.factory_id, item.content.trim()]));
  const messages = factories.map((factory) => ({ factory_id: factory.factory_id, factory_name: factory.factory_name, content: messageByFactory.get(factory.factory_id) })).filter((item) => item.content);
  if (messages.length !== factories.length) throw new Error('AI 未为每家工厂生成完整的询单消息，请重试。');
  return { messages };
}

function toolSummary(tool, result) {
  if (tool === 'query_factory_capabilities') return `找到 ${result.length} 家工艺匹配工厂`;
  if (tool === 'query_capacity_schedule') return `查询了 ${result.length} 家工厂的交期产能`;
  if (tool === 'query_material_status') return `核验了 ${result.length} 家工厂的物料状态`;
  return result.status === 'recommended' ? '已计算可执行调度方案' : '需要人工介入处理';
}

module.exports = { runAgent, generateInquiryMessages, evaluatePlan, data };
