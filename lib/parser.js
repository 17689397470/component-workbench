/**
 * 本地元器件离线智能规则解析引擎 (lib/parser.js)
 * 具备阻容电感智能识别、数值归一化（0.1uF = 100nF = 104）、封装提取、耐压/精度提取
 * 以及常见芯片/半导体前缀特征匹配能力。零网络依赖，毫秒级响应。
 */

// 常见贴片及插件封装集合
const KNOWN_PACKAGES = [
  '0201', '0402', '0603', '0805', '1206', '1210', '1812', '2010', '2512',
  'SOT-23', 'SOT-23-3', 'SOT-23-5', 'SOT-23-6', 'SOT-223', 'SOT-89', 'SOD-123', 'SOD-323', 'SOD-523',
  'SMA', 'SMB', 'SMC', 'SMAF', 'SMBF',
  'SOP-8', 'SOP-14', 'SOP-16', 'SOIC-8', 'SOIC-16', 'MSOP-8', 'MSOP-10', 'TSSOP-8', 'TSSOP-14', 'TSSOP-16', 'TSSOP-20',
  'QFN-16', 'QFN-20', 'QFN-24', 'QFN-32', 'QFN-48', 'LQFP-32', 'LQFP-48', 'LQFP-64', 'LQFP-100',
  'TO-92', 'TO-220', 'TO-252', 'TO-263',
  'DIP-8', 'DIP-14', 'DIP-16', 'DIP-28',
  '0420', '0530', '0630', 'CD32', 'CD43', 'CD54', 'CD75', 'NR3015', 'NR4040'
];

/**
 * 规范化封装字符串
 */
function normalizePackage(str) {
  if (!str) return null;
  const upper = str.toUpperCase().trim();
  // 匹配类似 "0805_RES", "R0805", "C0603"
  for (const pkg of KNOWN_PACKAGES) {
    const pkgUpper = pkg.toUpperCase();
    const regex = new RegExp(`(^|[^a-zA-Z0-9])${pkgUpper}([^a-zA-Z0-9]|$)`, 'i');
    if (regex.test(upper)) {
      return pkg;
    }
  }
  return null;
}

/**
 * 解析阻值并返回欧姆数 (Standard Ohms)
 * 示例: 10k -> 10000, 4.7k -> 4700, 4R7 -> 4.7, 0R1 -> 0.1, 1M -> 1000000, 330 -> 330
 */
function parseResistance(text) {
  if (!text) return null;
  // 匹配形如 4R7, 2K2, 1M5
  const altMatch = text.match(/(\d+)([RKMkΩr])(\d+)/i);
  if (altMatch) {
    const pre = altMatch[1];
    const unit = altMatch[2].toLowerCase();
    const post = altMatch[3];
    const val = parseFloat(`${pre}.${post}`);
    if (unit === 'k') return { val: val * 1000, display: `${val}kΩ` };
    if (unit === 'm') return { val: val * 1000000, display: `${val}MΩ` };
    if (unit === 'r' || unit === 'Ω') return { val, display: `${val}Ω` };
  }

  // 匹配形如 10k, 10kohm, 4.7k, 100R, 100 ohm, 0.1R
  const stdMatch = text.match(/(\d+(?:\.\d+)?)\s*(k|m|r|ohm|Ω)?(?:\s|$|%|±)/i);
  if (stdMatch) {
    const num = parseFloat(stdMatch[1]);
    const unit = (stdMatch[2] || '').toLowerCase();
    if (unit === 'k') return { val: num * 1000, display: `${num}kΩ` };
    if (unit === 'm') return { val: num * 1000000, display: `${num}MΩ` };
    if (unit === 'r' || unit === 'ohm' || unit === 'Ω') return { val: num, display: `${num}Ω` };
    // 无单位纯数字，如果上下文有电阻特征
    return { val: num, display: `${num}Ω` };
  }
  return null;
}

/**
 * 解析容值并返回皮法数 (pF) 与标准显示 (如 100nF, 0.1uF)
 * 示例: 100nF = 100000 pF, 0.1uF = 100000 pF, 104 = 100000 pF
 */
function parseCapacitance(text) {
  if (!text) return null;

  // 匹配三位数字代码如 104, 103, 105, 220, 471
  // 必须避免把 0805 或 100V 误当代码
  const codeMatch = text.match(/\b([1-9]\d)([0-9])\b/);
  let pFFromCode = null;
  if (codeMatch && !text.includes('V') && !text.includes('v')) {
    const base = parseInt(codeMatch[1], 10);
    const exp = parseInt(codeMatch[2], 10);
    // 过滤掉年份或常见非电容代码
    if (exp <= 7) {
      pFFromCode = base * Math.pow(10, exp);
    }
  }

  // 匹配形如 0.1uF, 100nf, 10u, 22pf, 4.7uf, 0.1µF
  const capMatch = text.match(/(\d+(?:\.\d+)?)\s*(pf|nf|uf|u|µf|p|n)?(?:\s|$|v|V|%)/i);
  if (capMatch) {
    const num = parseFloat(capMatch[1]);
    const unit = (capMatch[2] || '').toLowerCase();
    let pF = null;
    if (unit === 'pf' || unit === 'p') pF = num;
    else if (unit === 'nf' || unit === 'n') pF = num * 1000;
    else if (unit === 'uf' || unit === 'u' || unit === 'µf') pF = num * 1000000;
    else if (pFFromCode) pF = pFFromCode;

    if (pF !== null) {
      // 格式化易读展示
      let display = '';
      if (pF >= 1000000) {
        display = `${pF / 1000000}µF`;
      } else if (pF >= 1000) {
        display = `${pF / 1000}nF`;
      } else {
        display = `${pF}pF`;
      }
      return { val: pF, display, uF: pF / 1000000, nF: pF / 1000 };
    }
  }

  if (pFFromCode !== null) {
    let display = pFFromCode >= 1000000 ? `${pFFromCode / 1000000}µF` : (pFFromCode >= 1000 ? `${pFFromCode / 1000}nF` : `${pFFromCode}pF`);
    return { val: pFFromCode, display, uF: pFFromCode / 1000000, nF: pFFromCode / 1000 };
  }

  return null;
}

/**
 * 提取耐压值 (Voltage Rating, 如 50V, 16V, 6.3V, 100V)
 */
function parseVoltage(text) {
  if (!text) return null;
  const m = text.match(/(\d+(?:\.\d+)?)\s*V\b/i);
  return m ? parseFloat(m[1]) : null;
}

/**
 * 提取精度/容差 (Tolerance, 如 1%, 5%, ±1%, ±5%)
 */
function parseTolerance(text) {
  if (!text) return null;
  const m = text.match(/[±]?\s*(\d+(?:\.\d+)?)\s*%/);
  if (m) return `${m[1]}%`;
  if (/\b(1%|0\.1%|0\.5%|2%|5%|10%|20%)\b/i.test(text)) {
    return text.match(/\b(1%|0\.1%|0\.5%|2%|5%|10%|20%)\b/i)[1];
  }
  return null;
}

/**
 * 常用芯片、二极管、晶体管与接口模式库
 */
const KNOWN_IC_PATTERNS = [
  { pattern: /AMS1117(-\d+\.\d+|-ADJ)?/i, category: '芯片', desc: '线性稳压器(LDO)' },
  { pattern: /ME6211(-\d+\.\d+)?/i, category: '芯片', desc: '低噪声微功耗LDO' },
  { pattern: /CH340[CNGEKB]?/i, category: '芯片', desc: 'USB转TTL串口芯片' },
  { pattern: /CP210[24]/i, category: '芯片', desc: 'USB转UART桥接芯片' },
  { pattern: /MAX485|SP3485/i, category: '芯片', desc: 'RS-485收发器' },
  { pattern: /STM32[A-Z0-9]+/i, category: '芯片', desc: 'ARM Cortex MCU' },
  { pattern: /ESP32(-[A-Z0-9]+)?/i, category: '模块', desc: 'Wi-Fi/BLE 双模模组' },
  { pattern: /ESP8266(-[A-Z0-9]+)?/i, category: '模块', desc: 'Wi-Fi SOC 模组' },
  { pattern: /RP2040/i, category: '芯片', desc: '树莓派双核微控制器' },
  { pattern: /SS[12345]4/i, category: '二极管', desc: '肖特基二极管(SMD)' },
  { pattern: /1N4148/i, category: '二极管', desc: '高速开关二极管' },
  { pattern: /1N400[1-7]/i, category: '二极管', desc: '整流二极管' },
  { pattern: /B5819W/i, category: '二极管', desc: '肖特基二极管' },
  { pattern: /AO3400/i, category: '三极管/MOS', desc: 'N沟道场效应管(MOSFET)' },
  { pattern: /AO3401/i, category: '三极管/MOS', desc: 'P沟道场效应管(MOSFET)' },
  { pattern: /SI230[12]/i, category: '三极管/MOS', desc: '小信号MOSFET' },
  { pattern: /SS8050|SS8550|S8050|S8550/i, category: '三极管/MOS', desc: '小功率双极型晶体管' },
  { pattern: /TYPE-C/i, category: '接插件', desc: 'USB Type-C 接口插座' },
  { pattern: /MICRO-USB/i, category: '接插件', desc: 'Micro-USB 接口插座' }
];

/**
 * 综合解析函数
 * 输入任意用户原始输入文本（如 "10k 0805 1%", "0603 100nF 50V", "AMS1117-3.3 SOT-223", "C2057"）
 * 输出标准化结构
 */
function parseComponentText(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { name: '', category: '其他', package: '', value: '', standard_value: null, unit: '', tolerance: '', voltage: null };
  }

  const text = rawText.trim();
  const pkg = normalizePackage(text);
  const voltage = parseVoltage(text);
  const tolerance = parseTolerance(text);

  // 检查立创编号 (Cxxxx)
  const lcscMatch = text.match(/\b(C\d{3,8})\b/i);
  const lcsc_part = lcscMatch ? lcscMatch[1].toUpperCase() : null;

  // 1. 先检查是否匹配已知芯片/半导体模式
  for (const item of KNOWN_IC_PATTERNS) {
    const match = text.match(item.pattern);
    if (match) {
      const chipModel = match[0].toUpperCase();
      return {
        name: chipModel,
        category: item.category,
        package: pkg || '',
        value: chipModel,
        standard_value: null,
        unit: '',
        tolerance: '',
        voltage: voltage,
        lcsc_part: lcsc_part,
        notes: item.desc
      };
    }
  }

  // 构建用于提取阻值/容值的净文本（剥离立创编号、封装代码与电压，避免数字被误当数值）
  let cleanText = text;
  if (lcsc_part) {
    cleanText = cleanText.replace(new RegExp(`\\b${lcsc_part}\\b`, 'gi'), ' ');
  }
  if (pkg) {
    cleanText = cleanText.replace(new RegExp(`\\b${pkg}\\b`, 'gi'), ' ');
  }
  if (voltage) {
    cleanText = cleanText.replace(new RegExp(`\\b${voltage}\\s*V\\b`, 'gi'), ' ');
  }

  // 2. 检查是否为电容 (带有 F, uF, nF, pF, 容值特征)
  if (/[0-9]\s*(pf|nf|uf|µf|p|n|u)\b/i.test(cleanText) || text.includes('电容') || text.includes('CAP') || text.includes('Capacitor')) {
    const cap = parseCapacitance(cleanText);
    if (cap) {
      return {
        name: `${cap.display} ${voltage ? voltage + 'V' : ''} ${pkg || ''}`.trim(),
        category: '电容',
        package: pkg || '',
        value: cap.display,
        standard_value: cap.val, // 单位 pF
        unit: 'pF',
        tolerance: tolerance || '',
        voltage: voltage,
        lcsc_part: lcsc_part,
        notes: voltage ? `耐压: ${voltage}V` : ''
      };
    }
  }

  // 3. 检查是否为电阻 (带有 k, M, R, ohm, 阻值特征)
  if (/[0-9]\s*(k|m|r|ohm|Ω)\b/i.test(cleanText) || /([0-9]+[RKMkΩr][0-9]+)/i.test(cleanText) || text.includes('电阻') || text.includes('RES') || text.includes('Resistor')) {
    const res = parseResistance(cleanText);
    if (res) {
      return {
        name: `${res.display} ${tolerance || ''} ${pkg || ''}`.trim(),
        category: '电阻',
        package: pkg || '',
        value: res.display,
        standard_value: res.val, // 单位 Ω
        unit: 'Ω',
        tolerance: tolerance || '',
        voltage: null,
        lcsc_part: lcsc_part,
        notes: tolerance ? `精度: ${tolerance}` : ''
      };
    }
  }

  // 4. 尝试电容推断
  const capTry = parseCapacitance(cleanText);
  if (capTry && (voltage || pkg)) {
    return {
      name: `${capTry.display} ${voltage ? voltage + 'V' : ''} ${pkg || ''}`.trim(),
      category: '电容',
      package: pkg || '',
      value: capTry.display,
      standard_value: capTry.val,
      unit: 'pF',
      tolerance: tolerance || '',
      voltage: voltage,
      lcsc_part: lcsc_part,
      notes: voltage ? `耐压: ${voltage}V` : ''
    };
  }

  // 5. 尝试电阻推断
  const resTry = parseResistance(cleanText);
  if (resTry && (tolerance || pkg)) {
    return {
      name: `${resTry.display} ${tolerance || ''} ${pkg || ''}`.trim(),
      category: '电阻',
      package: pkg || '',
      value: resTry.display,
      standard_value: resTry.val,
      unit: 'Ω',
      tolerance: tolerance || '',
      voltage: null,
      lcsc_part: lcsc_part,
      notes: tolerance ? `精度: ${tolerance}` : ''
    };
  }

  // 6. 兜底通用提取
  return {
    name: text,
    category: '其他',
    package: pkg || '',
    value: text,
    standard_value: null,
    unit: '',
    tolerance: tolerance || '',
    voltage: voltage,
    lcsc_part: lcsc_part,
    notes: ''
  };
}

/**
 * 常见贴片元器件微型丝印代码反查字典表 (Marking Code Database)
 * 解决贴片管体表面因体积狭小仅印刷简写代码的问题
 */
const SMD_MARKING_CODES = {
  'A7': [
    { name: '1N4148W', category: '二极管', package: 'SOD-123', value: '1N4148W', desc: '高速开关二极管 100V 0.15A', voltage: 100 },
    { name: 'BAV99', category: '二极管', package: 'SOT-23', value: 'BAV99', desc: '双高速开关二极管 70V 0.2A', voltage: 70 }
  ],
  'J3Y': [
    { name: 'S8050', category: '三极管/MOS', package: 'SOT-23', value: 'S8050', desc: 'NPN小功率晶体管 25V 0.5A', voltage: 25 }
  ],
  '2TY': [
    { name: 'S8550', category: '三极管/MOS', package: 'SOT-23', value: 'S8550', desc: 'PNP小功率晶体管 25V 0.5A', voltage: 25 }
  ],
  '1AM': [
    { name: 'MMBT3904', category: '三极管/MOS', package: 'SOT-23', value: 'MMBT3904', desc: 'NPN通用放大三极管 40V 0.2A', voltage: 40 }
  ],
  '2A': [
    { name: 'MMBT3906', category: '三极管/MOS', package: 'SOT-23', value: 'MMBT3906', desc: 'PNP通用晶体管 40V 0.2A', voltage: 40 }
  ],
  'A09T': [
    { name: 'AO3400A', category: '三极管/MOS', package: 'SOT-23', value: 'AO3400A', desc: 'N沟道场效应管(MOSFET) 30V 5.7A', voltage: 30 }
  ],
  'A19T': [
    { name: 'AO3401A', category: '三极管/MOS', package: 'SOT-23', value: 'AO3401A', desc: 'P沟道场效应管(MOSFET) 30V 4.2A', voltage: 30 }
  ],
  'B6': [
    { name: '1N4148', category: '二极管', package: 'SOD-323', value: '1N4148', desc: '高速开关二极管 100V', voltage: 100 }
  ],
  'WS4.5D': [
    { name: 'WS4.5D', category: '二极管', package: 'SOD-323', value: 'WS4.5D', desc: '单路单向ESD静电保护二极管' }
  ],
  'SS14': [
    { name: 'SS14', category: '二极管', package: 'SMA', value: 'SS14', desc: '肖特基二极管 1A 40V', voltage: 40 }
  ],
  'SS24': [
    { name: 'SS24', category: '二极管', package: 'SMA', value: 'SS24', desc: '肖特基二极管 2A 40V', voltage: 40 }
  ],
  'SS34': [
    { name: 'SS34', category: '二极管', package: 'SMA', value: 'SS34', desc: '肖特基二极管 3A 40V', voltage: 40 }
  ],
  'SS54': [
    { name: 'SS54', category: '二极管', package: 'SMA', value: 'SS54', desc: '肖特基二极管 5A 40V', voltage: 40 }
  ],
  'S4': [
    { name: '1N5819HW', category: '二极管', package: 'SOD-123', value: '1N5819', desc: '肖特基二极管 1A 40V', voltage: 40 }
  ],
  'SL': [
    { name: '1N5819WS', category: '二极管', package: 'SOD-323', value: '1N5819', desc: '肖特基二极管 1A 40V', voltage: 40 }
  ],
  '4A2D': [
    { name: 'ME6211C33M5G', category: '芯片', package: 'SOT-23-5', value: 'ME6211-3.3', desc: '3.3V 500mA 高PSRR低压差LDO', voltage: 6 }
  ],
  'L04': [
    { name: 'TL431', category: '芯片', package: 'SOT-23', value: 'TL431', desc: '精密基准稳压源 2.5V~36V' }
  ]
};

/**
 * 丝印代码反查查询
 */
function lookupSmdMarkingCode(code) {
  if (!code || typeof code !== 'string') return null;
  const upper = code.trim().toUpperCase();
  return SMD_MARKING_CODES[upper] || null;
}

/**
 * 全能 Omnibox 单行智能切词解析器
 * 从一整行速记文本中同时提取：核心型号/阻容/丝印、封装、数量、存放位置
 * 示例: "10k 0805 100 A-01" -> { core: "10k", package: "0805", quantity: 100, location: "A-01" }
 * 示例: "C2057 50" -> { core: "C2057", quantity: 50 }
 * 示例: "A7 100 抽屉-2" -> { core: "A7", quantity: 100, location: "抽屉-2" }
 */
function parseOmniboxText(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { coreText: '', quantity: null, location: null, package: null, smdCandidates: null, parsedComponent: null };
  }

  let text = rawText.trim();
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return { coreText: '', quantity: null, location: null, package: null, smdCandidates: null, parsedComponent: null };
  }

  let extractedQuantity = null;
  let extractedLocation = null;
  let extractedPackage = null;
  const remainingTokens = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    // 1. 尝试匹配封装 (如 0805, 0603, SOT-23, SOD-123 等)
    const pkgMatch = normalizePackage(token);
    if (pkgMatch && !extractedPackage) {
      extractedPackage = pkgMatch;
      continue;
    }

    // 2. 尝试匹配显式数量，如 100, 50件, x100, *50
    const qtyExplicit = token.match(/^(?:[xX*]?(\d{1,6})(?:件|pcs|PCS)?|(\d{1,6})(?:件|pcs|PCS))$/);
    if (qtyExplicit && !extractedQuantity && i > 0) {
      // 只有在非第一个词（避免如 100R 的 100）且为纯数字或带单位时判定为数量
      const num = parseInt(qtyExplicit[1] || qtyExplicit[2], 10);
      if (!isNaN(num) && num > 0) {
        extractedQuantity = num;
        continue;
      }
    }

    // 3. 尝试匹配位置特征词，如 "盒A", "A-01", "抽屉-2", "R0805-12", "柜3", "箱1"
    const locPattern = /^([A-Za-z0-9]+-[0-9A-Za-z]+|[A-Za-z]\d{1,3}|(?:盒|抽屉|柜|箱|位|排|包|袋|格)[\w\u4e00-\u9fa5-]+|[\w\u4e00-\u9fa5-]+(?:盒|抽屉|柜|箱|格))$/;
    if (locPattern.test(token) && !extractedLocation && i > 0) {
      extractedLocation = token;
      continue;
    }

    remainingTokens.push(token);
  }

  // 如果最后剩下一个纯数字且还没提取数量，且前面已有核心词，则判定最后一个数字为数量
  if (remainingTokens.length >= 2 && extractedQuantity === null) {
    const lastToken = remainingTokens[remainingTokens.length - 1];
    if (/^\d{1,5}$/.test(lastToken)) {
      const num = parseInt(lastToken, 10);
      // 避免误判电阻代码如 104, 470, 0805
      if (!KNOWN_PACKAGES.includes(lastToken)) {
        extractedQuantity = num;
        remainingTokens.pop();
      }
    }
  }

  // 拼接剩余核心词
  const coreText = remainingTokens.join(' ');

  // 检查是否命中 SMD 贴片丝印
  let smdCandidates = null;
  const directSmd = lookupSmdMarkingCode(coreText);
  if (directSmd) {
    smdCandidates = directSmd;
  }

  // 综合解析核心元件
  const parsedComponent = parseComponentText(coreText || text);
  if (extractedPackage && (!parsedComponent.package || parsedComponent.package === '标准')) {
    parsedComponent.package = extractedPackage;
  }

  return {
    raw: rawText,
    coreText: coreText || text,
    quantity: extractedQuantity,
    location: extractedLocation,
    package: extractedPackage || parsedComponent.package,
    smdCandidates,
    parsedComponent
  };
}

// 电商与网页营销噪音词清洗字典
const MARKETING_NOISE_REGEX = /(?:全新原装|原装正品|正品原装|原厂原包|全新进口|进口原装|原装进口|正品特价|实物拍摄|拍下即发|假一赔十|拍单|热卖|爆款|特价|包邮|直拍|全新|原装|正品|现货|现货直发|直发|原厂|进口|国产|高品质|优质|精品|常用|通用|拆机|散装|盘装|卷带|编带|剪带|原盘|带胶|环保|无铅|贴片|直插)/gi;

function cleanMarketingNoise(str) {
  if (!str) return '';
  return str
    .replace(/[【】\[\]（）()★▲◆|/、]/g, ' ')
    .replace(MARKETING_NOISE_REGEX, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitFreeformTextIntoClauses(rawText) {
  if (!rawText) return [];
  // 1. 先按物理换行切分成行
  const rawLines = rawText.split(/\r?\n/);
  const clauses = [];

  for (let line of rawLines) {
    line = line.trim();
    if (!line) continue;

    // 2. 检查单行内是否包含多条器件自然语言连接（如 "，另外" / "，还有" / "，并且" / "；" / "。"）
    const subSegments = line.split(/(?:[；;。]|\s*(?:，|,)?\s*(?:另外|还有|并且|再加|外加|顺便)\s*)/);
    for (let sub of subSegments) {
      sub = sub.trim();
      if (sub && sub.length >= 2) {
        clauses.push(sub);
      }
    }
  }

  return clauses;
}

function parseFreeformBatchText(rawText) {
  const clauses = splitFreeformTextIntoClauses(rawText);
  const items = [];

  for (let i = 0; i < clauses.length; i++) {
    const clause = clauses[i];

    // 提取显式数量，如 100只, 50个, 20片, 200PCS, 买了100
    let extractedQty = null;
    let textWorking = clause;

    const qtyMatch = textWorking.match(/(\d{1,6})\s*(?:个|只|片|PCS|pcs|粒|颗|卷|包|袋|条|支)/i);
    if (qtyMatch) {
      extractedQty = parseInt(qtyMatch[1], 10);
      textWorking = textWorking.replace(qtyMatch[0], ' ');
    } else {
      const verbQtyMatch = textWorking.match(/(?:数量|用量|买|买了|到了|备|备了|共)\s*[:：]?\s*(\d{1,6})/);
      if (verbQtyMatch) {
        extractedQty = parseInt(verbQtyMatch[1], 10);
        textWorking = textWorking.replace(verbQtyMatch[0], ' ');
      }
    }

    // 提取物理收纳盒位置，如 "放在A-01", "放A1", "在贴片盒3", "抽屉5", "A-01盒"
    let extractedLoc = null;
    const locMatch = textWorking.match(/(?:放在|放入|放进|存入|放|存|在|位置|盒子|盒|箱|抽屉|柜)\s*[:：]?\s*([A-Za-z0-9\-_一-龥]{2,15})/);
    if (locMatch) {
      const candidateLoc = locMatch[1];
      if (!KNOWN_PACKAGES.includes(candidateLoc.toUpperCase()) && !/^\d+[Vv]$/.test(candidateLoc)) {
        extractedLoc = candidateLoc;
        textWorking = textWorking.replace(locMatch[0], ' ');
      }
    }

    // 清理电商营销噪音
    const cleanedText = cleanMarketingNoise(textWorking);
    if (!cleanedText) continue;

    // 借助 parseOmniboxText 进行深度解析（提取阻容值、封装、丝印、或者普通型号）
    const omni = parseOmniboxText(cleanedText);
    const comp = omni.parsedComponent;

    // 汇总数量与位置
    const finalQty = extractedQty || omni.quantity || 100;
    const finalLoc = extractedLoc || omni.location || '贴片盒-01';
    const finalPkg = omni.package || comp.package || '';

    // 忽略明显不是元器件的空泛废话
    if (!comp.name || comp.name.length < 2) continue;
    if (comp.category === '其他' && /^(收到|好的|谢谢|请查收|没问题|看一下|这个|那个)$/.test(comp.name)) continue;

    items.push({
      tempId: 'q_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2, 6),
      raw: clause,
      name: comp.name,
      category: comp.category || '其他',
      package: finalPkg,
      value: comp.value || '',
      standard_value: comp.standard_value || null,
      unit: comp.unit || '',
      voltage: comp.voltage || null,
      tolerance: comp.tolerance || '',
      quantity: finalQty,
      location: finalLoc,
      notes: comp.notes || '',
      image_url: comp.image_url || '',
      datasheet_url: comp.datasheet_url || '',
      lcsc_part: comp.lcsc_part || '',
      smdCandidates: omni.smdCandidates
    });
  }

  return {
    success: true,
    total: items.length,
    items
  };
}

module.exports = {
  KNOWN_PACKAGES,
  SMD_MARKING_CODES,
  normalizePackage,
  parseResistance,
  parseCapacitance,
  parseVoltage,
  parseTolerance,
  parseComponentText,
  lookupSmdMarkingCode,
  parseOmniboxText,
  cleanMarketingNoise,
  splitFreeformTextIntoClauses,
  parseFreeformBatchText
};
