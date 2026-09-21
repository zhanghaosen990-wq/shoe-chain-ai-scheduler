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
  // Build the smallest valid uncompressed XLSX-like ZIP in memory so CI does
  // not depend on a developer's ignored `outputs/` directory.
  const zip = entries => {
    const local = [], central = [];
    let offset = 0;
    for (const [name, value] of Object.entries(entries)) {
      const nameBuffer = Buffer.from(name);
      const data = Buffer.from(value);
      const header = Buffer.alloc(30);
      header.writeUInt32LE(0x04034b50, 0);
      header.writeUInt16LE(20, 4);
      header.writeUInt16LE(0, 6);
      header.writeUInt16LE(0, 8);
      header.writeUInt32LE(data.length, 18);
      header.writeUInt32LE(data.length, 22);
      header.writeUInt16LE(nameBuffer.length, 26);
      local.push(header, nameBuffer, data);
      const directory = Buffer.alloc(46);
      directory.writeUInt32LE(0x02014b50, 0);
      directory.writeUInt16LE(20, 4);
      directory.writeUInt16LE(20, 6);
      directory.writeUInt16LE(0, 8);
      directory.writeUInt16LE(0, 10);
      directory.writeUInt32LE(data.length, 20);
      directory.writeUInt32LE(data.length, 24);
      directory.writeUInt16LE(nameBuffer.length, 28);
      directory.writeUInt32LE(offset, 42);
      central.push(directory, nameBuffer);
      offset += header.length + nameBuffer.length + data.length;
    }
    const centralBuffer = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(Object.keys(entries).length, 8);
    end.writeUInt16LE(Object.keys(entries).length, 10);
    end.writeUInt32LE(centralBuffer.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...local, centralBuffer, end]);
  };
  const workbook = zip({
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row><c r="A1" t="inlineStr"><is><t>款式名称</t></is></c><c r="B1" t="inlineStr"><is><t>轻商务德训鞋</t></is></c></row><row><c r="A2" t="inlineStr"><is><t>货号</t></is></c><c r="B2" t="inlineStr"><is><t>YS-2609-B01</t></is></c></row></sheetData></worksheet>'
  });
  const input = prepareBomInput({
    filename: '鞋服小单快反_BOM设计单_测试.xlsx',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: workbook
  });

  assert.match(input.text, /YS-2609-B01/);
  assert.match(input.text, /轻商务德训鞋/);
});
