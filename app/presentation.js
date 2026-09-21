(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.presentation = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const short = (value, max = 64) => { const text = String(value || '').replace(/[#*`]/g, '').trim(); return text.length > max ? text.slice(0, max - 1) + '…' : text; };
  function items(value) {
    return [...new Set((Array.isArray(value) ? value : String(value || '').split(/[\n；;、]+/)).map(x => String(x).trim()).filter(Boolean))];
  }
  function compactBom(source) {
    const result = { ...source };
    for (const field of ['fabric_details', 'accessory_details', 'craftsmanship', 'material_info']) {
      result[field] = items(result[field]).flatMap(x => x.split(/[，,](?=\s*(?:损耗|制单|复核|审核|审批|加工单位|预计日均|成本计算|计算公式))/))
        .map(x => x.replace(/(?:制单|复核|审核|审批)\s*[:：][^；;\n]*/g, '').trim())
        .filter(x => x && !/^(?:损耗|加工单位|预计日均|成本计算|计算公式|定价成本)/.test(x) && !/^[\s*＿_—-]+$/.test(x)).join('；');
      if (field === 'fabric_details') result[field] = result[field].replace(/\s*[/／|，,]?\s*(?:预计用量|总用量|总量|采购数量)\s*[:：]?\s*[^；;\n/／|，,]+/g, '').trim();
      if (field === 'material_info') result[field] = items(result[field]).filter(x => !/^(?:订单数量|目标交期|业务类型)/.test(x)).join('；');
    }
    return result;
  }
  function buildDashboard(order, plan, factories) {
    const bom = order.bom_data || {};
    const mismatch = /鞋/.test(order.category || '') && /礼服|连衣裙|上衣|半身裙/.test(`${bom.style_name || ''} ${(order.required_processes || []).join(' ')}`);
    const allocations = (plan?.allocations || []).map(a => ({ ...a, factory: factories.find(f => f.id === a.factory_id) }));
    const viable = !mismatch && plan?.status === 'recommended' && allocations.length > 0 && allocations.every(a => a.factory && a.quantity > 0) && allocations.reduce((n, a) => n + a.quantity, 0) === order.quantity;
    const usable = viable ? allocations : [];
    const risks = [];
    if (mismatch) risks.push(`订单品类（${short(order.category, 12)}）与服装款式或工艺疑似不匹配，请核实。`);
    if (!viable) risks.push(short(plan?.reason || '暂无可执行的授权工厂方案，请核实工艺或补充工厂。'));
    if (usable.some(a => a.factory.on_time_rate < .92)) risks.push('部分工厂历史准时率偏低，请确认排期并跟踪进度。');
    risks.push(viable ? '方案基于模拟工厂数据；报价、质量与排期需人工确认。' : '报价与质量暂无可靠数据，需人工核算和验样。');
    const historical = usable.length && usable.every(a => Number.isFinite(a.factory.on_time_rate)) ? Math.round(usable.reduce((n, a) => n + a.quantity * a.factory.on_time_rate, 0) / order.quantity * 100) : null;
    const quote = String(bom.material_info || '').match(/(?:预估核价|核价参考|预估报价)\s*[:：]?\s*[¥￥]?\s*(\d+(?:\.\d+)?)\s*元?(?:\s*\/\s*(件|双|套))?/);
    const metric = (label, value, note) => ({ label, value, note });
    return {
      status: viable ? (plan.risk === 'low' ? '风险可控' : '待确认排期') : '需人工介入',
      tone: viable && plan.risk === 'low' ? 'success' : 'warning',
      canApprove: viable,
      metrics: [
        metric('预估报价', quote ? `¥ ${quote[1]}${quote[2] ? ' / ' + quote[2] : ''}` : '待人工核算', quote ? 'BOM 核价参考 · 非工厂正式报价' : '缺少工厂报价依据'),
        metric('交货 / 履约参考', historical === null ? '待评估' : `${historical}%`, historical === null ? `目标交期 ${order.deadline_days || '—'} 天 · 尚无可执行方案` : '模拟历史准时率 · 按分配量加权，非预测'),
        metric('合格水平 / 质量评级', '待验样', '尚无质检报告或合格率记录'),
        metric('材料质量 / 匹配度', viable ? '待检验' : '待核验', viable ? '备料状态可满足 · 材质质量仍需检验' : '待确认物料与工艺适配')
      ],
      risks: risks.slice(0, 3)
    };
  }
  function renderDashboard(dashboard, answer, allocationHtml = '') {
    return `<div class="metric-grid">${dashboard.metrics.map(m => `<article class="metric-card"><span>${escape(m.label)}</span><strong>${escape(m.value)}</strong><small>${escape(m.note)}</small></article>`).join('')}</div>
      <div class="result-top"><div><span class="success-label">生产协同建议</span><h2>${dashboard.selectionMode ? '推荐已完成，请选择工厂' : dashboard.canApprove ? '候选方案已生成' : '请先确认订单与接单条件'}</h2></div><span class="decision-badge ${dashboard.tone === 'success' ? 'success' : 'warning'}">${escape(dashboard.status)}</span></div>
      <ul class="risk-list">${dashboard.risks.map(r => `<li><span aria-hidden="true">⚠</span>${escape(r)}</li>`).join('')}</ul>
      ${dashboard.canApprove ? allocationHtml : ''}
      <details class="full-report"><summary>查看完整分析报告</summary><div class="report-body">${escape(answer || '暂无详细报告。')}</div></details>`;
  }
  return { items, compactBom, buildDashboard, renderDashboard };
}));
