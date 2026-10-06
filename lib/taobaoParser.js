/**
 * 淘宝/电商元器件订单智能解析引擎 (lib/taobaoParser.js)
 * 专为硬件工程师/电子爱好者淘宝散装采购设计：
 * 1. 自动挖掘包装系数 (如 1件(含50只) -> 真实数量 50件)；
 * 2. 深度从商品标题与款式规格中提取元器件分类、封装、阻容值、耐压、精度；
 * 3. 换算物理标准阻容值 (欧姆/皮法)；
 * 4. 自动去除优惠、原装正品、店铺前后缀等干扰词；
 * 5. 支持跨行继承合并单元格的【订单号】与【店铺名称】，实现精准订单溯源与防重；
 * 6. 支持智能黑名单过滤与分类推荐收纳盒。
 */

const XLSX = require('xlsx');
const { getRules } = require('./taobaoRules');

/**
 * 提取包装倍数与折算真实库存数量
 */
function extractPackMultiplier(title = '', sku = '', rawQty = 1) {
  let mult = 1;
  const numQty = parseInt(rawQty, 10) || 1;
  const target = `${sku && sku !== '暂无' ? sku + ' ' : ''}${title}`;

  // 匹配类似 (50只)、（100个）、50颗、20片、100pcs、20条、10包
  const m = target.match(/[（(【\[]?\s*(\d+)\s*(?:只|个|颗|片|PCS|pcs|条|根|粒|支|包)\s*[）)】\]]?/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 2 && n <= 10000) {
      mult = n;
    }
  }
  return {
    multiplier: mult,
    totalQuantity: numQty * mult
  };
}

/**
 * 清洗干扰噪音词，保留核心描述
 */
function cleanGarbageWords(str = '', noiseWords = []) {
  let result = str
    .replace(/【[^】]*】/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ');

  const defaultNoise = [
    '原装正品', '正品原装', '全新原装', '原装', '优质', '包邮', '大特价',
    '优惠价', '冲量', '热卖', 'DIY配件', '小钢炮', '特价', '现货', '拍前联系'
  ];
  const allNoise = Array.from(new Set([...defaultNoise, ...(noiseWords || [])]));

  for (const w of allNoise) {
    if (!w) continue;
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'gi'), ' ');
  }

  return result.replace(/\s+/g, ' ').trim();
}

/**
 * 提取封装规格 (Package / Footprint)
 */
function extractPackage(str = '') {
  const upper = str.toUpperCase();
  const patterns = [
    /\b(0805|0603|0402|1206|1210|2512)\b/,
    /\b(SOT-23-5|SOT23-5|SOT-23|SOT23|SOT-89|SOT89|SOT-223|SOT223)\b/,
    /\b(SOP-8|SOP8|SOP-16|SOP16|SOIC-8|SOIC-16|TSSOP-8|TSSOP-16|MSOP-8|MSOP-10)\b/,
    /\b(SMAF|SMA|SMB|SMC|DO-214AC|DO-214AA|DO-214AB)\b/,
    /\b(TO-220|TO-252|TO-92|TO-263)\b/,
    /\b(QFN-\d+|QFP-\d+|LQFP-\d+)\b/,
    /\b(3216|3528|6032|7343)\b/
  ];

  for (const regex of patterns) {
    const match = upper.match(regex);
    if (match) return match[1];
  }
  return '';
}

/**
 * 智能解析单行淘宝订单商品
 */
function parseTaobaoRow(row, rules = null) {
  const curRules = rules || getRules();
  const rawTitle = String(row['商品名称'] || row['宝贝标题'] || row['title'] || '').trim();
  const rawSku = String(row['型号款式'] || row['宝贝规格'] || row['sku'] || '').trim();
  const rawQty = row['商品数量'] || row['购买数量'] || row['quantity'] || 1;
  const store = String(row['店铺名称'] || row['卖家昵称'] || row['store'] || '').trim();
  const orderId = String(row['订单号'] || row['订单编号'] || row['主订单编号'] || row['order_id'] || '').trim();
  const orderTime = String(row['订单提交时间'] || row['创建时间'] || row['成交时间'] || row['order_time'] || '').trim();
  const price = String(row['商品金额'] || row['实付金额'] || row['price'] || '').trim();

  if (!rawTitle) return null;

  // 1. 检查黑名单关键词
  const ignoreKeywords = curRules.ignoreKeywords || [];
  let isIgnored = false;
  let ignoreReason = '';
  const searchForFilter = `${rawTitle} ${rawSku}`.toLowerCase();
  for (const kw of ignoreKeywords) {
    if (kw && searchForFilter.includes(kw.toLowerCase())) {
      isIgnored = true;
      ignoreReason = `命中黑名单关键词「${kw}」`;
      break;
    }
  }

  const { multiplier, totalQuantity } = extractPackMultiplier(rawTitle, rawSku, rawQty);
  const pkg = extractPackage(`${rawSku} ${rawTitle}`);
  const combinedText = `${rawSku !== '暂无' ? rawSku.replace(/[_/]/g, ' ') + ' ' : ''}${rawTitle}`;
  const cleaned = cleanGarbageWords(combinedText, curRules.cleanGarbageWords);

  let category = '其他';
  let name = '';
  let value = '';
  let standard_value = null;
  let unit = '';
  let voltage = null;
  let tolerance = '';
  let notes = store ? `淘宝[${store}]采购` : '淘宝散料采购';
  if (orderId) {
    notes += ` (订单号:${orderId})`;
  }
  if (multiplier > 1) {
    notes += ` · 原始包装每份${multiplier}件 (买${rawQty}份)`;
  }

  // ---------- 1. 电阻判断 ----------
  if (/电阻|千欧|欧姆|\b\d+R\b|\b\d+KΩ\b|\b\d+K\b|\b\d+M\b/i.test(combinedText) && !/电容|开关|灯/i.test(combinedText)) {
    category = '电阻';
    unit = 'Ω';
    // 阻值匹配 (如 10k, 1KΩ, 100R, 47千欧, 100欧, 2.2K)
    const resValMatch = combinedText.match(/(\d+(?:\.\d+)?)\s*(KΩ|KOHM|MΩ|MOHM|千欧|兆欧|K|M|R|OHM|欧姆|欧|Ω)/i);
    if (resValMatch) {
      const num = parseFloat(resValMatch[1]);
      const rawU = resValMatch[2].toUpperCase();
      if (rawU.includes('K') || rawU.includes('千')) {
        standard_value = num * 1000;
        value = `${num}kΩ`;
      } else if (rawU.includes('M') || rawU.includes('兆')) {
        standard_value = num * 1000000;
        value = `${num}MΩ`;
      } else {
        standard_value = num;
        value = `${num}Ω`;
      }
    }

    // 精度匹配
    const tolMatch = combinedText.match(/([±+-\s]?\d+(?:\.\d+)?%|精度[±+-\s]?\d+%)/i);
    if (tolMatch) {
      tolerance = tolMatch[1].replace('精度', '').trim();
      if (!tolerance.startsWith('±') && !tolerance.startsWith('+') && !tolerance.startsWith('-')) {
        tolerance = '±' + tolerance;
      }
    } else {
      tolerance = '±1%';
    }

    name = `${pkg || '贴片'} ${value || '电阻'} ${tolerance}`.trim();
  }

  // ---------- 2. 电容判断 ----------
  else if (/电容|钽电容|\bUF\b|\bNF\b|\bPF\b|\b106K\b|\b103K\b|\b104\b/i.test(combinedText) && !/电阻|灯丝/i.test(combinedText)) {
    category = '电容';
    unit = 'pF';

    // 容值匹配
    const capValMatch = combinedText.match(/(\d+(?:\.\d+)?)\s*(UF|NF|PF|µF|uF|nF|pF)/i);
    if (capValMatch) {
      const num = parseFloat(capValMatch[1]);
      const u = capValMatch[2].toLowerCase();
      if (u === 'uf' || u === 'µf') {
        standard_value = num * 1000000;
        value = `${num}µF`;
      } else if (u === 'nf') {
        standard_value = num * 1000;
        value = `${num}nF`;
      } else {
        standard_value = num;
        value = `${num}pF`;
      }
    }

    // 耐压匹配
    const voltMatch = combinedText.match(/(\d+(?:\.\d+)?)\s*V\b/i);
    if (voltMatch) {
      voltage = parseFloat(voltMatch[1]);
    }

    // 介质或精度 (X7R, X5R, 10%)
    const dielecMatch = combinedText.match(/\b(X7R|X5R|NPO|COG|Y5V)\b/i);
    const tolMatch = combinedText.match(/([±+-\s]?\d+%\b)/);
    const parts = [];
    if (dielecMatch) parts.push(dielecMatch[1].toUpperCase());
    if (tolMatch) parts.push(tolMatch[1].trim());
    tolerance = parts.join(' ') || '±10%';

    const isTan = /钽电容/i.test(combinedText);
    const typeLabel = isTan ? '钽电容' : '贴片电容';
    name = `${pkg ? pkg + ' ' : ''}${value || ''}${voltage ? ' ' + voltage + 'V' : ''} ${tolerance} ${typeLabel}`.trim();
  }

  // ---------- 3. 二极管 / 发光管 / LED ----------
  else if (/二极管|肖特基|发光|LED/i.test(combinedText) && !/三极管|MOS/i.test(combinedText)) {
    const isLed = /LED|发光/i.test(combinedText);
    category = isLed ? '发光管/LED' : '二极管';

    // 尝试提取型号 (如 SS24F, 1N4148, 0805贴片LED)
    const mModel = combinedText.match(/\b(SS\d+[A-Z]?|1N\d+[A-Z]?|B\d+[A-Z]?|SK\d+[A-Z]?|MBR\d+[A-Z]?|US\d+[A-Z]?)\b/i);
    if (mModel) {
      value = mModel[1].toUpperCase();
      name = `${value} 肖特基二极管 ${pkg || ''}`.trim();
    } else if (isLed) {
      const colorMatch = combinedText.match(/(翠绿|绿色|红光|红色|蓝光|蓝色|黄光|黄色|白光|白色|冷白|暖白|复古暖白)/);
      const color = colorMatch ? colorMatch[1] : '单色';
      name = `${pkg || '贴片'} LED发光二极管 (${color})`;
      value = color;
    } else {
      name = cleanGarbageWords(rawTitle, curRules.cleanGarbageWords).slice(0, 32);
    }
  }

  // ---------- 4. 三极管 / MOS管 ----------
  else if (/MOS管|三极管|场效应管|NPN|PNP|\bSOT-23\b/i.test(combinedText) && !/线性稳压|芯片|LDO/i.test(combinedText)) {
    category = '三极管/MOS';
    // 匹配典型型号如 AO3401, S8050, S8550, 2N7002, SI2301, AO3400 等
    const mModel = combinedText.match(/\b(AO\d+|SI\d+|S8050|S8550|2N7002|SS8050|SS8550|BSS138|IRF\w+|J3Y|2TY)\b/i);
    if (mModel) {
      value = mModel[1].toUpperCase();
      const isMos = /MOS|场效应/i.test(combinedText);
      name = `${value} ${isMos ? 'MOS管' : '贴片三极管'} ${pkg || 'SOT-23'}`.trim();
    } else {
      name = cleanGarbageWords(rawTitle, curRules.cleanGarbageWords).slice(0, 32);
    }
  }

  // ---------- 5. 芯片 / 稳压器 / 电源管理IC ----------
  else if (/芯片|稳压器|LDO|电源管理|IC|控制器|MCU|SOP-8|SOT23-5|SOT-23-5/i.test(combinedText) && !/螺母|铜柱/i.test(combinedText)) {
    category = '芯片';
    // 匹配 IC 型号 (如 SGM2036-ADJYN5G/TR, MCP73831T-2ATI/OT, SGL8022W, AMS1117, CH340C)
    const mModel = combinedText.match(/\b([A-Z0-9]{3,}-[A-Z0-9_\/]+|[A-Z]{2,}\d{3,}[A-Z0-9]*)\b/i);
    if (mModel) {
      value = mModel[1];
      let subDesc = '';
      if (/LDO|线性稳压/i.test(combinedText)) subDesc = '低压差线性稳压器(LDO)';
      else if (/充电|电池电源管理/i.test(combinedText)) subDesc = '锂电池充电管理IC';
      else if (/触摸/i.test(combinedText)) subDesc = '触摸检测控制器';
      name = `${value} ${subDesc} ${pkg || ''}`.trim();
    } else {
      name = cleanGarbageWords(rawTitle, curRules.cleanGarbageWords).slice(0, 35);
    }
  }

  // ---------- 6. 接插件 / USB / 排针 ----------
  else if (/Type-C|USB|插座|母座|排针|排母|端子|连接器/i.test(combinedText)) {
    category = '接插件';
    if (/Type-C|USB-3\.1/i.test(combinedText)) {
      const pinMatch = combinedText.match(/(\d+P)/i);
      const pins = pinMatch ? pinMatch[1] : '';
      name = `Type-C母座 ${pins} 贴片接口`;
    } else {
      name = cleanGarbageWords(rawTitle, curRules.cleanGarbageWords).slice(0, 32);
    }
  }

  // ---------- 7. 开关 / 按键 ----------
  else if (/开关|按键|拨动开关|轻触开关/i.test(combinedText)) {
    category = '开关/按键';
    name = cleanGarbageWords(rawTitle, curRules.cleanGarbageWords).slice(0, 32);
  }

  // ---------- 8. 保护器件 (保险丝/TVS/ESD) ----------
  else if (/保险丝|PPTC|自恢复|TVS|ESD/i.test(combinedText)) {
    category = '保护器件';
    const curMatch = combinedText.match(/(\d+(?:\.\d+)?A|\d+mA)/i);
    const voltMatch = combinedText.match(/(\d+(?:\.\d+)?V)/i);
    name = `${pkg || ''} ${curMatch ? curMatch[1] : ''} ${voltMatch ? voltMatch[1] : ''} 自恢复贴片保险丝PPTC`.replace(/\s+/g, ' ').trim();
  }

  // ---------- 9. 结构件 / 五金螺丝螺母 ----------
  else if (/螺母|铜柱|螺丝|螺栓|垫片|预埋件/i.test(combinedText)) {
    category = '结构件/五金';
    const mSize = (rawSku !== '暂无' ? rawSku : rawTitle).match(/(M\d+(?:\.\d+)?[\*X\d\.\+]+)/i);
    if (/铜柱/i.test(combinedText)) {
      name = `${mSize ? mSize[1] : ''} 单头六角铜柱螺栓`.trim();
    } else if (/螺母/i.test(combinedText)) {
      name = `${mSize ? mSize[1] : ''} 滚花注塑铜螺母预埋件`.trim();
    } else {
      name = cleanGarbageWords(rawTitle, curRules.cleanGarbageWords).slice(0, 32);
    }
  }

  // ---------- 10. 电池 / 电源模组 ----------
  else if (/电池|锂电池|聚合物/i.test(combinedText)) {
    category = '电源/电池';
    const capMatch = combinedText.match(/(\d+mAh|\d+mah)/i);
    const voltMatch = combinedText.match(/(3\.7V|3\.8V|7\.4V)/i);
    name = `${voltMatch ? voltMatch[1] : '3.7V'} ${capMatch ? capMatch[1] : ''} 聚合物锂电池`.trim();
  }

  // ---------- 其他兜底 ----------
  else {
    category = '其他';
    name = cleanGarbageWords(rawTitle, curRules.cleanGarbageWords).slice(0, 35);
  }

  // 分类推荐收纳盒
  const categoryDefaultMap = curRules.categoryDefaultLocations || {};
  const suggestedLocation = categoryDefaultMap[category] || '淘宝待整理散料盒';

  return {
    name: name || cleanGarbageWords(rawTitle, curRules.cleanGarbageWords),
    category,
    package: pkg || '通用规格',
    value: value || '',
    standard_value,
    unit: unit || '',
    voltage,
    tolerance: tolerance || '',
    quantity: totalQuantity,
    buy_count: parseInt(rawQty, 10) || 1,
    raw_title: rawTitle,
    raw_sku: rawSku,
    unit_multiplier: multiplier,
    notes,
    store,
    order_id: orderId,
    order_time: orderTime,
    price,
    is_ignored: isIgnored,
    ignore_reason: ignoreReason,
    suggested_location: suggestedLocation
  };
}

/**
 * 解析上传的 Excel 或 CSV 文件
 * 具备自动填充合并单元格（如淘宝跨商品订单号、店铺名称）的容错机制
 */
function parseTaobaoOrderFile(buffer, rules = null) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const firstSheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet);

  const curRules = rules || getRules();
  const results = [];

  let lastOrderId = '';
  let lastOrderTime = '';
  let lastStore = '';

  for (const row of rawRows) {
    // 淘宝导出的合并单元格容错：向下继承同一主订单的订单号与店铺名
    const rowOrderId = String(row['订单号'] || row['订单编号'] || row['主订单编号'] || row['order_id'] || '').trim();
    const rowOrderTime = String(row['订单提交时间'] || row['创建时间'] || row['成交时间'] || row['order_time'] || '').trim();
    const rowStore = String(row['店铺名称'] || row['卖家昵称'] || row['store'] || '').trim();

    if (rowOrderId) lastOrderId = rowOrderId;
    if (rowOrderTime) lastOrderTime = rowOrderTime;
    if (rowStore) lastStore = rowStore;

    const normalizedRow = {
      ...row,
      '订单号': rowOrderId || lastOrderId,
      '订单提交时间': rowOrderTime || lastOrderTime,
      '店铺名称': rowStore || lastStore
    };

    const parsed = parseTaobaoRow(normalizedRow, curRules);
    if (parsed) {
      results.push(parsed);
    }
  }
  return results;
}

module.exports = {
  extractPackMultiplier,
  cleanGarbageWords,
  extractPackage,
  parseTaobaoRow,
  parseTaobaoOrderFile
};
