// Optional visual smoke check: NODE_PATH=<playwright installation> node app/verify-ui.cjs
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    await page.goto((process.env.BASE_URL || 'http://localhost:4173') + '/workspace');
    await page.waitForFunction(() => !!window.presentation && !!document.querySelector('#factory-grid').children.length);
    await page.evaluate(() => {
      fillBomData({ style_name: '水晶渐变晚礼服', sku_code: 'DR-2026-08', color_info: '黑色 / BK01', size_range: 'S–XL', fabric_details: '85%氨纶15%锦纶 / 单耗 1.2 米/件\n水晶渐变织网', accessory_details: '水钻珠串多层项链；方糖黑色钻；方糖暗红钻', craftsmanship: '上衣竖向水钻高温固定；雪纺褶皱定型；整套礼服缝制', material_info: '订单模式 CMT；预估核价 800 元/件' });
      const order = { category: '商务男鞋', quantity: 800, deadline_days: 10, required_processes: ['整套礼服缝制'], bom_data: readBomData() };
      renderResult([], '完整分析：请确认品类与工艺，补充具有服装生产能力的授权工厂。', order, window.presentation.buildDashboard(order, null, data.factories));
    });
    if (await page.locator('.metric-card').count() !== 4) throw Error('missing metrics');
    if (await page.locator('.report-body').isVisible()) throw Error('report should be collapsed');
    await page.locator('.full-report summary').click();
    if (!await page.locator('.report-body').isVisible()) throw Error('report cannot expand');
    await page.locator('.full-report summary').click();
    await page.locator('.bom-edit summary').last().click();
    await page.locator('#bom-accessory-details').fill('水钻项链；珍珠纽扣');
    if (await page.locator('[data-bom-tags="accessory_details"] .bom-chip').count() !== 2) throw Error('tags not synchronized');
    await page.locator('.bom-edit summary').last().click();
    await page.locator('#result-card').screenshot({ path: '/tmp/yongjia-dashboard-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('mobile overflow');
    await page.locator('#result-card').screenshot({ path: '/tmp/yongjia-dashboard-mobile.png' });
    console.log('PASS: four metrics, collapsed/expandable report, editable tags, 390px no overflow');
  } finally { await browser.close(); }
})();
