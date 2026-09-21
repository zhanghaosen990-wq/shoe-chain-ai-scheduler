const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.goto((process.env.BASE_URL || 'http://localhost:4173') + '/workspace');
    await page.waitForFunction(() => !!window.bomLinkage);
    const result = { bom_data: { style_name: '水晶晚礼服', fabric_details: '雪纺', accessory_details: '水钻', material_info: '预估核价 800 元/件', production_hints: { quantity: 120 } } };
    await page.route('**/api/bom/parse', route => route.fulfill({ json: result }));
    const file = { name: 'bom.png', mimeType: 'image/png', buffer: Buffer.from('test') };
    await page.locator('#bom-file-input').setInputFiles(file);
    await page.locator('#start-bom-recognition').click();
    await page.waitForFunction(() => document.querySelector('#bom-status').textContent === '识别完成');
    assert.equal(await page.locator('#category').inputValue(), '晚礼服');
    assert.equal(await page.locator('#quantity').inputValue(), '120');
    assert.equal(await page.locator('#cooperation-mode').inputValue(), '带料加工（纯加工）');
    assert.match(await page.locator('#special-notes').inputValue(), /800 元/);
    await page.locator('#category').selectOption('女装');
    await page.locator('#bom-color-info').fill('黑色');
    assert.equal(await page.locator('#category').inputValue(), '女装');
    await page.locator('#bom-style-name').fill('透气运动鞋');
    assert.equal(await page.locator('#category').inputValue(), '运动鞋');
    await page.locator('#quantity').fill('150');
    await page.locator('#remove-bom-file').click();
    assert.equal(await page.locator('#bom-file-state').isVisible(), false);
    assert.equal(await page.locator('#bom-file-state').innerHTML(), '');
    assert.equal(await page.locator('#start-bom-recognition').isDisabled(), true);
    assert.equal(await page.locator('#bom-style-name').inputValue(), '');
    assert.equal(await page.locator('#category').inputValue(), '商务男鞋');
    assert.equal(await page.locator('#quantity').inputValue(), '150');
    // Force an old response to resolve even after AbortController cancellation.
    await page.evaluate(() => {
      window.originalFetch = window.fetch;
      window.fetch = (url, options) => url === '/api/bom/parse' ? new Promise(resolve => { window.releaseOldBom = () => resolve(new Response(JSON.stringify({ bom_data: { style_name: '旧晚礼服' } }), { status: 200 })); }) : window.originalFetch(url, options);
    });
    await page.locator('#bom-file-input').setInputFiles(file);
    await page.locator('#start-bom-recognition').click();
    await page.waitForFunction(() => !!window.releaseOldBom);
    await page.locator('#remove-bom-file').click();
    await page.evaluate(async () => { window.releaseOldBom(); await new Promise(resolve => setTimeout(resolve, 50)); });
    assert.equal(await page.locator('#bom-style-name').inputValue(), '');
    assert.equal(await page.locator('#bom-status').innerText(), '等待上传');
    assert.equal(await page.locator('#bom-loading').isVisible(), false);
    console.log('PASS: automatic linkage, manual overrides, remove/reset, stale response ignored');
  } finally { await browser.close(); }
})();
