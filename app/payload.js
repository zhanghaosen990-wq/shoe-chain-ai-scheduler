(function attachPayloadUtils(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.payloadUtils = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function createPayloadUtils() {
  const BOM_FIELDS = [
    'style_name',
    'sku_code',
    'color_info',
    'size_range',
    'craftsmanship',
    'fabric_details',
    'accessory_details',
    'material_info'
  ];

  function normalizeBomData(source = {}) {
    return BOM_FIELDS.reduce((result, field) => {
      result[field] = String(source[field] || '').trim();
      return result;
    }, {});
  }

  function createMockBomData(fileName = '') {
    const hasImage = /\.(png|jpe?g|webp)$/i.test(fileName);
    return normalizeBomData({
      style_name: hasImage ? '轻商务德训鞋（图片识别）' : '轻商务德训鞋',
      sku_code: 'YS-2609-B01',
      color_info: '咖啡棕 / C-07',
      size_range: '39-44',
      craftsmanship: '头层牛皮鞋面、固特异外观线、橡胶大底',
      fabric_details: '头层牛皮鞋面，透气网布内里',
      accessory_details: '鞋带、鞋垫、鞋眼、包装盒',
      material_info: '皮料需做耐折测试，辅料按确认样执行'
    });
  }

  function buildSubmitPayload({ sampleImages = [], bomData = {}, productionRequirements = {}, planningContext = {} } = {}) {
    return {
      sample_images: sampleImages.filter(Boolean),
      bom_data: normalizeBomData(bomData),
      production_requirements: {
        cooperation_mode: productionRequirements.cooperation_mode || '包工包料',
        special_notes: String(productionRequirements.special_notes || '').trim()
      },
      planning_context: {
        category: planningContext.category || '商务男鞋',
        quantity: Number(planningContext.quantity) || 0,
        deadline_days: Number(planningContext.deadlineDays ?? planningContext.deadline_days) || 0,
        splittable: planningContext.splittable !== false
      }
    };
  }

  function toAgentOrder(payload = {}) {
    const bom = normalizeBomData(payload.bom_data);
    const planning = payload.planning_context || {};
    const requirements = payload.production_requirements || {};
    const processes = bom.craftsmanship.split(/[、,，；;。]/).map((item) => item.trim()).filter(Boolean);
    return {
      style_code: bom.sku_code || bom.style_name,
      category: planning.category || '商务男鞋',
      quantity: Number(planning.quantity) || 0,
      deadline_days: Number(planning.deadline_days) || 0,
      required_processes: processes.length ? processes : ['常规鞋服工艺'],
      splittable: planning.splittable !== false,
      note: String(requirements.special_notes || '').trim()
    };
  }

  return { BOM_FIELDS, normalizeBomData, createMockBomData, buildSubmitPayload, toAgentOrder };
}));
