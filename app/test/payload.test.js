const test = require('node:test');
const assert = require('node:assert/strict');

const { buildSubmitPayload, createMockBomData, toAgentOrder } = require('../payload');

test('BOM mock parser returns all editable structured fields', () => {
  const bom = createMockBomData('YS-2609-B01.xlsx');

  assert.deepEqual(Object.keys(bom), [
    'style_name',
    'sku_code',
    'color_info',
    'size_range',
    'craftsmanship',
    'fabric_details',
    'accessory_details',
    'material_info'
  ]);
  assert.equal(bom.style_name, '轻商务德训鞋');
  assert.match(bom.fabric_details, /头层牛皮/);
});

test('submit payload keeps sample images, BOM data and production requirements', () => {
  const bom = {
    style_name: '轻商务德训鞋',
    sku_code: 'YS-2609-B01',
    color_info: '咖啡棕 / C-07',
    size_range: '39-44',
    craftsmanship: '固特异外观线，橡胶大底',
    fabric_details: '头层牛皮鞋面',
    accessory_details: '鞋带、鞋垫、包装盒',
    material_info: '皮料需做耐折测试'
  };
  const payload = buildSubmitPayload({
    sampleImages: ['data:image/jpeg;base64,shoe'],
    bomData: bom,
    productionRequirements: { cooperation_mode: '带料加工（纯加工）', special_notes: '交期 10 天，单独包装' },
    planningContext: { category: '商务男鞋', quantity: 800, deadlineDays: 10, splittable: true }
  });

  assert.deepEqual(payload.sample_images, ['data:image/jpeg;base64,shoe']);
  assert.deepEqual(payload.bom_data, bom);
  assert.deepEqual(payload.production_requirements, { cooperation_mode: '带料加工（纯加工）', special_notes: '交期 10 天，单独包装' });
  assert.equal(payload.planning_context.deadline_days, 10);
});

test('agent order adapter preserves existing dispatch fields and uses BOM SKU', () => {
  const order = toAgentOrder({
    bom_data: { style_name: '轻商务德训鞋', sku_code: 'YS-2609-B01', craftsmanship: '固特异外观线' },
    production_requirements: { special_notes: '请重点关注鞋面耐折' },
    planning_context: { category: '商务男鞋', quantity: 800, deadline_days: 10, splittable: true }
  });

  assert.deepEqual(order, {
    style_code: 'YS-2609-B01',
    category: '商务男鞋',
    quantity: 800,
    deadline_days: 10,
    required_processes: ['固特异外观线'],
    splittable: true,
    note: '请重点关注鞋面耐折'
  });
});
