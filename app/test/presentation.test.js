const test = require('node:test');
const assert = require('node:assert/strict');
const { compactBom, buildDashboard, renderDashboard } = require('../presentation');
const { evaluatePlan, data } = require('../agent');
const order = { category: '商务男鞋', quantity: 800, deadline_days: 10, splittable: true, required_processes: ['头层牛皮鞋面', '固特异外观线', '橡胶大底'] };

test('BOM removes signature and loss noise while retaining composition and reference price', () => {
  const bom = compactBom({ fabric_details: '85%氨纶15%锦纶；单耗 1.2米/件；损耗率5%', accessory_details: '方糖黑色钻；制单: ****；方糖暗红钻', craftsmanship: '雪纺褶皱定型；加工单位: XX；预计日均产量50件', material_info: '订单模式 CMT；预估核价 800 元；审核: ****' });
  assert.equal(bom.fabric_details, '85%氨纶15%锦纶；单耗 1.2米/件');
  assert.equal(bom.accessory_details, '方糖黑色钻；方糖暗红钻');
  assert.equal(bom.craftsmanship, '雪纺褶皱定型');
  assert.equal(bom.material_info, '订单模式 CMT；预估核价 800 元');
});
test('recommended metrics use historical evidence and do not invent price or quality', () => {
  const d = buildDashboard(order, evaluatePlan(order), data.factories);
  assert.equal(d.canApprove, true);
  assert.equal(d.metrics[0].value, '待人工核算');
  assert.equal(d.metrics[1].value, '94%');
  assert.match(d.metrics[1].note, /非预测/);
  assert.equal(d.metrics[2].value, '待验样');
  assert.equal(d.metrics[3].value, '待检验');
  assert.ok(d.risks.length <= 3);
});
test('fabric total consumption and duplicate order metadata are omitted', () => {
  const bom = compactBom({ fabric_details: '头层牛皮 / 厚度1.3mm / 预计用量 1200 平方尺；网布 / 单耗 1.2米/件', material_info: '业务类型 小单快反；订单数量 800；目标交期（天）10；订单模式 CMT' });
  assert.equal(bom.fabric_details, '头层牛皮 / 厚度1.3mm；网布 / 单耗 1.2米/件');
  assert.equal(bom.material_info, '订单模式 CMT');
});
test('category mismatch blocks actionable recommendation and surfaces a concise risk', () => {
  const d = buildDashboard({ ...order, bom_data: { style_name: '晚礼服', material_info: '预估核价 800 元' } }, evaluatePlan(order), data.factories);
  assert.equal(d.canApprove, false);
  assert.equal(d.status, '需人工介入');
  assert.match(d.risks[0], /不匹配/);
  assert.equal(d.metrics[0].value, '¥ 800');
  assert.equal(d.metrics[1].value, '待评估');
});
test('empty plan still shows four KPI cards and report is escaped and collapsed', () => {
  const d = buildDashboard(order, null, data.factories);
  const html = renderDashboard(d, '<script>alert(1)</script>\n详细报告');
  assert.equal((html.match(/class="metric-card"/g) || []).length, 4);
  assert.match(html, /<details class="full-report">/);
  assert.doesNotMatch(html, /<details[^>]*\bopen\b|<script>/);
  assert.match(html, /&lt;script&gt;/);
});
