const test = require('node:test');
const assert = require('node:assert/strict');
const { infer } = require('../bom-linkage');
const { parseDeepSeekBomResponse } = require('../deepseek-bom');
test('style maps to production category and explicit modes override material default', () => {
  const bom = { style_name: '水晶晚礼服', fabric_details: '雪纺', accessory_details: '水钻' };
  assert.equal(infer(bom).category, '晚礼服');
  assert.equal(infer(bom).mode, '带料加工（纯加工）');
  assert.equal(infer({ ...bom, material_info: '包工包料' }).mode, '包工包料');
  assert.equal(infer({ style_name: '透气运动鞋' }).category, '运动鞋');
  assert.equal(infer({ style_name: '女装连衣裙' }).category, '女装');
});
test('metadata survives BOM normalization and quantity does not come from accessories', () => {
  const result = parseDeepSeekBomResponse({ choices: [{ message: { content: JSON.stringify({ style_name: '晚礼服', accessory_details: '水钻 5000个', production_hints: { quantity: 120, quotation_reference: '核价参考 800 元/件' } }) } }] });
  assert.equal(infer(result, result.production_hints).quantity, '120');
  assert.match(infer(result, result.production_hints).notes, /800 元/);
  assert.equal(infer({ accessory_details: '水钻 5000个' }).quantity, '');
});
