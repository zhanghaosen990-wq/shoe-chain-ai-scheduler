const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEEPSEEK_CHAT_ENDPOINT,
  buildBomRequest,
  parseDeepSeekBomResponse,
  parseMultipartFile,
  prepareBomInput
} = require('../deepseek-bom');

test('BOM recognition uses the official DeepSeek Chat Completions endpoint', () => {
  assert.equal(DEEPSEEK_CHAT_ENDPOINT, 'https://api.deepseek.com/v1/chat/completions');
  const request = buildBomRequest({
    filename: 'sample.jpg',
    contentType: 'image/jpeg',
    buffer: Buffer.from('image-bytes')
  });

  assert.equal(request.model, 'deepseek-chat');
  assert.equal(request.response_format.type, 'json_object');
  assert.equal(request.messages[1].content[1].type, 'image_url');
  assert.match(request.messages[1].content[1].image_url.url, /^data:image\/jpeg;base64,/);
});

test('BOM recognition request uses extracted document text for spreadsheets', () => {
  const request = buildBomRequest({
    filename: 'sample.xlsx',
    contentType: 'text/plain',
    text: '款式名称\t轻商务德训鞋\n货号\tYS-2609-B01'
  });

  assert.equal(typeof request.messages[1].content, 'string');
  assert.match(request.messages[1].content, /YS-2609-B01/);
});

test('DeepSeek JSON response is normalized to all editable BOM fields', () => {
  const result = parseDeepSeekBomResponse({
    choices: [{ message: { content: JSON.stringify({
      style_name: '轻商务德训鞋',
      sku_code: 'YS-2609-B01',
      color_info: '咖啡棕 / C-07',
      size_range: '39-44',
      craftsmanship: '固特异外观线',
      fabric_details: '头层牛皮鞋面',
      accessory_details: '鞋带、鞋垫',
      material_info: '皮料需做耐折测试'
    }) } }]
  });

  assert.deepEqual(result, {
    style_name: '轻商务德训鞋',
    sku_code: 'YS-2609-B01',
    color_info: '咖啡棕 / C-07',
    size_range: '39-44',
    craftsmanship: '固特异外观线',
    fabric_details: '头层牛皮鞋面',
    accessory_details: '鞋带；鞋垫',
    material_info: '皮料需做耐折测试'
  });
});

test('multipart parser extracts the uploaded BOM file without an upstream API', () => {
  const boundary = 'bom-test-boundary';
  const body = Buffer.from([
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="sample.jpg"',
    'Content-Type: image/jpeg',
    '',
    'image-bytes',
    `--${boundary}--`,
    ''
  ].join('\r\n'));
  const file = parseMultipartFile(body, `multipart/form-data; boundary=${boundary}`);

  assert.equal(file.filename, 'sample.jpg');
  assert.equal(file.contentType, 'image/jpeg');
  assert.equal(file.buffer.toString(), 'image-bytes');
});

test('XLSX BOM files are converted to text before Chat parsing', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const filePath = path.join(__dirname, '../../outputs/01a0bd33-08f6-7e40-bf8d-5d225ae372c8/鞋服小单快反_BOM设计单_测试.xlsx');
  const input = prepareBomInput({
    filename: '鞋服小单快反_BOM设计单_测试.xlsx',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: fs.readFileSync(filePath)
  });

  assert.match(input.text, /YS-2609-B01/);
  assert.match(input.text, /轻商务德训鞋/);
});
