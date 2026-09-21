(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.bomLinkage = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function infer(bom, hints = {}) {
    const style = `${bom.style_name || ''} ${bom.craftsmanship || ''}`;
    const category = /晚礼服|礼服/.test(style) ? '晚礼服' : /运动鞋|跑鞋|篮球鞋/.test(style) ? '运动鞋' : /商务.*鞋|正装.*鞋/.test(style) ? '商务男鞋' : /休闲.*鞋|德训鞋/.test(style) ? '休闲男鞋' : /女装|连衣裙|半身裙|女式|女款|上衣/.test(style) ? '女装' : hints.category || '其他/待确认';
    const material = bom.material_info || '';
    const explicit = `${material} ${hints.cooperation_mode || ''}`;
    const mode = /包工包料|全包/.test(explicit) ? '包工包料' : /CMT|带料|来料|客供/i.test(explicit) ? '带料加工（纯加工）' : bom.fabric_details && bom.accessory_details ? '带料加工（纯加工）' : '包工包料';
    const quantityText = material.match(/(?:订单数量|订购数量|订单数)\s*[:：]?\s*([\d,]+)/)?.[1] || hints.quantity;
    const quantity = Number(String(quantityText || '').replace(/,/g, ''));
    const quote = material.match(/(?:预估核价|核价参考|预估报价)[^；;\n]*/)?.[0] || hints.quotation_reference || '';
    return { category, mode, quantity: Number.isSafeInteger(quantity) && quantity > 0 ? String(quantity) : '', notes: [quote, quantity > 0 ? `BOM订单数量：${quantity}` : '', hints.special_notes].filter(Boolean).join('；') };
  }
  return { infer };
}));
