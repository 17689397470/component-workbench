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
  '0420', '0530', '0630', 'CD32', 'CD43', 'CD54', 'CD75', 'NR3015', 'NR4040',
  '3225', '2520', '2016', '5032', 'HC-49S', 'HC-49U',
  'DO-214AC', 'DO-214AA', 'DO-214AB'
];

/**
 * 规范化封装字符串
 */
function normalizePackage(str) {
  if (!str) return null;
  const upper = str.toUpperCase().trim();

  // 1. SMD 贴片阻容四位标准英制代码 (0201 ~ 2512)，支持前后接字母/下划线（如 R0805, CC0603, 0603WAF, FCC0805）
  const smdMatch = upper.match(/(?:^|[A-Z_])(0201|0402|0603|0805|1206|1210|1812|2010|2512)(?:[A-Z_]|$)/);
  if (smdMatch) {
    return smdMatch[1];
  }

  // 2. 三星电容前缀规则 (CL03=0201, CL05=0402, CL10=0603, CL21=0805, CL31=1206)
  const samMatch = upper.match(/^CL(03|05|10|21|31|32)/);
  if (samMatch) {
    const samMap = { '03': '0201', '05': '0402', '10': '0603', '21': '0805', '31': '1206', '32': '1210' };
    return samMap[samMatch[1]];
  }

  // 3. 常见贴片集成电路及半导体变体
  if (upper.includes('ESOP8') || upper.includes('ESOP-8') || upper.includes('SOP8') || upper.includes('SOP-8')) return 'SOP-8';
  if (upper.includes('SOT-23-6') || upper.includes('SOT23-6')) return 'SOT-23-6';
  if (upper.includes('SOT-23-5') || upper.includes('SOT23-5')) return 'SOT-23-5';
  if (upper.includes('SOT-23') || upper.includes('SOT23')) return 'SOT-23';
  if (upper.includes('SOD-123') || upper.includes('SOD123') || upper.includes('1N4148W')) return 'SOD-123';
  if (upper.includes('TSSOP-8') || upper.includes('TSSOP8')) return 'TSSOP-8';
  if (upper.includes('FS8205A')) return 'TSSOP-8';
  if (upper.includes('DW01A')) return 'SOT-23-6';
  if (upper.includes('S8050') || upper.includes('SS8050') || upper.includes('S9013') || upper.includes('S9014')) return 'SOT-23';
  if (upper.includes('1608') || upper.includes('LTST-C193') || upper.includes('19-217')) return '0603';
  if (upper.includes('RT9080')) return 'SOT-23-5';

  // 4. 标准已知封装词库遍历匹配
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
  // 先把可能混入的精度如 ±10%, +-5%, 1%, 5% 排除，绝对不能把百分比里的数字误当阻值
  const clean = text.replace(/(?:±|\+-|\+\/-)?\s*\d+(?:\.\d+)?\s*%/g, ' ').trim();
  if (!clean) return null;

  // 避免将 3位 EIA 容值代码+K容差 (如 104K, 103K, 105K, 224K) 误认作 kΩ
  if (/\b[1-9]\d[0-9]k\b/i.test(clean) && !/[Ω欧ohm]/i.test(clean)) {
    return null;
  }

  // 匹配形如 4R7, 2K2, 1M5
  const altMatch = clean.match(/(\d+)([RKMkΩr])(\d+)/i);
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
  const stdMatch = clean.match(/(\d+(?:\.\d+)?)\s*(k|m|r|ohm|Ω|欧)\b/i);
  if (stdMatch) {
    const num = parseFloat(stdMatch[1]);
    const unit = stdMatch[2].toLowerCase();
    if (unit === 'k') return { val: num * 1000, display: `${num}kΩ` };
    if (unit === 'm') return { val: num * 1000000, display: `${num}MΩ` };
    if (unit === 'r' || unit === 'ohm' || unit === 'Ω' || unit === '欧') return { val: num, display: `${num}Ω` };
  }

  // 无单位纯数字，如果上下文有电阻特征且无耐压V
  if (!/[Vv]/.test(clean)) {
    const numMatch = clean.match(/\b(\d+(?:\.\d+)?)\b/);
    if (numMatch) {
      const num = parseFloat(numMatch[1]);
      return { val: num, display: `${num}Ω` };
    }
  }

  return null;
}

const LETTER_TOLERANCE_MAP = {
  'B': '±0.1%',
  'C': '±0.25%',
  'D': '±0.5%',
  'F': '±1%',
  'G': '±2%',
  'J': '±5%',
  'K': '±10%',
  'M': '±20%',
  'Z': '+80%/-20%'
};

/**
 * 提取介质与材质特性 (Dielectric / Material)
 * 如 X7R, X5R, C0G, NPO, Y5V, 铝电解, 钽电容, 厚膜, 金属膜, 磁珠
 */
function parseMaterial(text) {
  if (!text) return null;
  const m = text.match(/\b(X7R|X5R|C0G|NPO|NP0|Y5V|X6S|X7T|X7S)\b/i);
  if (m) return m[1].toUpperCase().replace('NP0', 'NPO');
  if (/钽电容|钽/i.test(text)) return '钽电容';
  if (/铝电解|电解电容/i.test(text)) return '铝电解';
  if (/金属膜|金膜/i.test(text)) return '金属膜';
  if (/厚膜/i.test(text)) return '厚膜';
  if (/薄膜/i.test(text)) return '薄膜';
  if (/磁珠/i.test(text)) return '磁珠';
  if (/绕线/i.test(text)) return '绕线';
  if (/叠层/i.test(text)) return '叠层';
  return null;
}

/**
 * 解析容值并返回皮法数 (pF) 与标准显示 (如 100nF, 0.1uF, 4.7uF)
 * 示例: 100nF = 100000 pF, 0.1uF = 100000 pF, 104 = 100000 pF, 4u7 = 4.7uF, 2p2 = 2.2pF
 */
function parseCapacitance(text) {
  if (!text) return null;

  // 1. 匹配中置单位法 (如 4u7, 4µ7, 2p2, 1n5, 0u1)
  const midMatch = text.match(/(\d+)\s*([uUnNpPµ])\s*(\d+)/);
  if (midMatch) {
    const pre = midMatch[1];
    const unit = midMatch[2].toLowerCase();
    const post = midMatch[3];
    const num = parseFloat(`${pre}.${post}`);
    let pF = num;
    let display = '';
    if (unit === 'p') {
      pF = num;
      display = `${num}pF`;
    } else if (unit === 'n') {
      pF = num * 1000;
      display = `${num}nF`;
    } else if (unit === 'u' || unit === 'µ') {
      pF = num * 1000000;
      display = `${num}µF`;
    }
    return { val: pF, display, uF: pF / 1000000, nF: pF / 1000 };
  }

  // 2. 匹配三位数字代码如 104, 103, 105, 220, 471 (支持可能跟有字母容差如 104K, 104J, 104Z)
  const codeMatch = text.match(/\b([1-9]\d)([0-9])([B-Zb-z])?\b/);
  let pFFromCode = null;
  if (codeMatch && !text.includes('V') && !text.includes('v')) {
    const base = parseInt(codeMatch[1], 10);
    const exp = parseInt(codeMatch[2], 10);
    if (exp <= 7) {
      pFFromCode = base * Math.pow(10, exp);
    }
  }

  // 3. 匹配常规形如 0.1uF, 100nf, 10u, 22pf, 4.7uf, 0.1µF, 100n (允许省略 F)
  const capMatch = text.match(/(\d+(?:\.\d+)?)\s*(pf|nf|uf|u|µf|µ|p|n)?\b/i);
  if (capMatch && capMatch[2]) {
    const num = parseFloat(capMatch[1]);
    const unit = (capMatch[2] || '').toLowerCase();
    let pF = null;
    if (unit === 'pf' || unit === 'p') pF = num;
    else if (unit === 'nf' || unit === 'n') pF = num * 1000;
    else if (unit === 'uf' || unit === 'u' || unit === 'µf' || unit === 'µ') pF = num * 1000000;
    else if (pFFromCode) pF = pFFromCode;

    if (pF !== null) {
      let display = '';
      if (pF >= 1000000) display = `${pF / 1000000}µF`;
      else if (pF >= 1000) display = `${pF / 1000}nF`;
      else display = `${pF}pF`;
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
 * 提取精度/容差 (Tolerance, 如 1%, 5%, ±1%, ±5%, 以及工业字母代号如 F, J, K, M, Z)
 */
function parseTolerance(text) {
  if (!text) return null;
  // 1. 匹配标准百分比表达 (如 ±1%, +-10%, +80%/-20%, 5%)
  const m = text.match(/(?:±|\+-|\+\/-)\s*(\d+(?:\.\d+)?)\s*%/);
  if (m) return `±${m[1]}%`;
  const singleM = text.match(/(?:^|[\s,;，；])(\d+(?:\.\d+)?)\s*%(?=\s|$|[,;，；])/);
  if (singleM) return `±${singleM[1]}%`;

  // 2. 匹配汉字修饰档位 (如 K档, J档, F级, K级, ±10%精度)
  const gradeMatch = text.match(/\b([BCDFGJKMZ])\s*(?:档|级)\b/i);
  if (gradeMatch) {
    const code = gradeMatch[1].toUpperCase();
    return LETTER_TOLERANCE_MAP[code] || null;
  }

  // 3. 匹配附着在容值/阻值末尾的字母精度 (如 104K, 104J, 104Z, 100RF, 100R J)
  const attachedMatch = text.match(/(?:[0-9]+(?:[RKMkΩr]|[uUnNpPµ])?[0-9]*|[1-9]\d[0-9])\s*([BCDFGJKMZ])\b/);
  if (attachedMatch) {
    const code = attachedMatch[1].toUpperCase();
    return LETTER_TOLERANCE_MAP[code] || null;
  }

  return null;
}

/**
 * 常用芯片、二极管、晶体管与接口模式库
 */
const KNOWN_IC_PATTERNS = [
  { pattern: /\bAMS1117(-\d+\.\d+|-ADJ)?\b/i, category: '芯片', desc: '线性稳压器(LDO)', polarity: 'LDO稳压', rating: '1A', output_voltage: '1.2V~3.3V/ADJ' },
  { pattern: /\bME6211(-\d+\.\d+)?\b/i, category: '芯片', desc: '低噪声微功耗LDO', polarity: 'LDO稳压', rating: '500mA' },
  { pattern: /\bRT9080(-\d+\.\d+)?\b/i, category: '芯片', desc: '超低静态功耗LDO', polarity: 'LDO稳压', rating: '600mA 2µA' },
  { pattern: /\bTP4056\b/i, category: '芯片', desc: '单节锂电池充电管理IC', polarity: '电源管理', rating: '1A 4.2V' },
  { pattern: /\b(LM2596|LM2576|MP1584|MP2307|SY8089|EA3059)(-[A-Z0-9.]+)?\b/i, category: '芯片', desc: '开关电源DC-DC转换器', polarity: 'DC-DC降压', rating: '3A' },
  { pattern: /\b(LM358|LM324|LM393|LM339|NE555|TL431)\b/i, category: '芯片', desc: '运放/时基/基准IC', polarity: '模拟IC' },
  { pattern: /\b(CH340[CNGEKB]?|CP210[24]|FT232[A-Z0-9]?|PL2303)\b/i, category: '芯片', desc: 'USB接口桥接芯片', polarity: '接口芯片' },
  { pattern: /\b(MAX485|SP3485|SN65HVD[0-9]+)\b/i, category: '芯片', desc: 'RS-485收发器芯片', polarity: '通信接口' },
  { pattern: /\bSTM32[A-Z0-9]+\b/i, category: '芯片', desc: 'ARM Cortex 32位单片机', polarity: 'MCU主控' },
  { pattern: /\b(ESP32(-[A-Z0-9]+)?|ESP8266(-[A-Z0-9]+)?)\b/i, category: '模块', desc: 'Wi-Fi/蓝牙物联网模组', polarity: '无线模组' },
  { pattern: /\bRP2040\b/i, category: '芯片', desc: '树莓派双核微控制器', polarity: 'MCU主控' },
  { pattern: /\b(AT24C\d+|W25Q\d+[A-Z]*)\b/i, category: '芯片', desc: '非易失性存储芯片', polarity: '存储器' },
  { pattern: /\b(SS[12345]4|SK[12345]4|MBR\d+[A-Z]*)\b/i, category: '二极管', desc: '肖特基二极管', polarity: '肖特基二极管', rating: '40V 1A~5A' },
  { pattern: /\b(1N4148[A-Z]*|BAV99|BAT54[A-Z]*)\b/i, category: '二极管', desc: '高速开关二极管', polarity: '开关二极管', rating: '100V 150mA' },
  { pattern: /\b(1N400[1-7]|M[1-7]|RS1[A-M])\b/i, category: '二极管', desc: '通用整流二极管', polarity: '整流二极管', rating: '1000V 1A' },
  { pattern: /\b(B5819W|B5817W|1N5819[A-Z]*)\b/i, category: '二极管', desc: '肖特基二极管', polarity: '肖特基二极管', rating: '40V 1A' },
  { pattern: /\b(AO3400[A-Z]?|SI2302[A-Z]?|2N7002[A-Z]?|BSS138[A-Z]?)\b/i, category: '三极管/MOS', desc: 'N沟道场效应管(MOSFET)', polarity: 'N沟道MOS', rating: '30V 5.7A' },
  { pattern: /\b(AO3401[A-Z]?|SI2301[A-Z]?)\b/i, category: '三极管/MOS', desc: 'P沟道场效应管(MOSFET)', polarity: 'P沟道MOS', rating: '-30V -4.2A' },
  { pattern: /\b(SS8050|S8050|S9013|S9014|2N3904|2N2222|BC847)\b/i, category: '三极管/MOS', desc: 'NPN双极型小功率三极管', polarity: 'NPN三极管', rating: '25V 0.5A' },
  { pattern: /\b(SS8550|S8550|S9012|S9015|2N3906|BC857)\b/i, category: '三极管/MOS', desc: 'PNP双极型小功率三极管', polarity: 'PNP三极管', rating: '25V 0.5A' },
  { pattern: /\b(TYPE-C|MICRO-USB|USB-A|USB-B)\b/i, category: '接插件', desc: 'USB接口座' }
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

  // 构建用于提取阻值/容值的净文本（剥离立创编号、封装代码、电压与容差，避免数字被误当数值）
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
  if (tolerance) {
    cleanText = cleanText.replace(/(?:±|\+-|\+\/-)?\s*\d+(?:\.\d+)?\s*%/g, ' ');
  }

  // 2. 检查是否为电容 (带有 F, uF, nF, pF, 容值特征，或显式包含电容关键词)
  if (/[0-9]\s*(pf|nf|uf|µf|p|n|u)\b/i.test(cleanText) || text.includes('电容') || text.includes('CAP') || text.includes('Capacitor')) {
    const cap = parseCapacitance(cleanText);
    if (cap) {
      return {
        name: `${pkg ? pkg + ' ' : ''}${cap.display}${voltage ? ' ' + voltage + 'V' : ''}`.trim(),
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
    } else {
      // 显式电容关键词但数值为纯数字 (如 100, 10, 0.1, 22)
      const pureNumMatch = cleanText.match(/\b(\d+(?:\.\d+)?)\b/);
      if (pureNumMatch) {
        let display = pureNumMatch[1];
        let pF = parseFloat(display);
        if (display === '100' || display === '0.1') { display = '100nF'; pF = 100000; }
        else if (display === '1') { display = '1µF'; pF = 1000000; }
        else if (display === '10') { display = '10µF'; pF = 10000000; }
        else if (display === '22' || display === '33' || display === '47') { display = display + 'pF'; }
        return {
          name: `${pkg ? pkg + ' ' : ''}${display}${voltage ? ' ' + voltage + 'V' : ''}`.trim(),
          category: '电容',
          package: pkg || '',
          value: display,
          standard_value: pF,
          unit: 'pF',
          tolerance: tolerance || '',
          voltage: voltage,
          lcsc_part: lcsc_part,
          notes: voltage ? `耐压: ${voltage}V` : ''
        };
      }
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

    // 2. 尝试匹配显式数量，如 50件, 100只, 20片, x100, *50 (必须带有数量前缀符号或量词单位，避免把阻容数值 100、10、22 误当数量)
    const qtyExplicit = token.match(/^(?:[xX*×](\d{1,6})|(\d{1,6})(?:件|pcs|PCS|只|个|片|颗|支|条|套|盘|包|袋))$/i);
    if (qtyExplicit && !extractedQuantity) {
      const num = parseInt(qtyExplicit[1] || qtyExplicit[2], 10);
      if (!isNaN(num) && num > 0) {
        extractedQuantity = num;
        continue;
      }
    }

    // 3. 尝试匹配位置特征词，如 "@默认电容盒", "#A-01", "盒A", "A-01", "抽屉-2", "R0805-12", "柜3", "箱1"
    if ((token.startsWith('@') || token.startsWith('#')) && token.length >= 2) {
      extractedLocation = token.slice(1);
      continue;
    }
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

    // 借助全场景深度智能解析引擎 parseSingleComponentText 进行精准解析
    const parsed = parseSingleComponentText(clause);

    // 汇总数量与位置
    const finalQty = extractedQty || parsed.quantity || 100;
    const finalLoc = extractedLoc || parsed.location || '贴片盒-01';
    const finalPkg = parsed.package || '';

    // 忽略明显不是元器件的空泛废话
    if (!parsed.name || parsed.name.length < 2) continue;
    if (parsed.category === '其他' && /^(收到|好的|谢谢|请查收|没问题|看一下|这个|那个)$/.test(parsed.name)) continue;

    items.push({
      tempId: 'q_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2, 6),
      raw: clause,
      name: parsed.name,
      category: parsed.category || '其他',
      package: finalPkg,
      value: parsed.value || '',
      standard_value: parsed.standard_value || null,
      unit: parsed.unit || '',
      voltage: parsed.voltage || null,
      tolerance: parsed.tolerance || '',
      material: parsed.material || '',
      polarity: parsed.polarity || '',
      quantity: finalQty,
      location: finalLoc,
      notes: parsed.notes || '',
      image_url: '',
      datasheet_url: '',
      lcsc_part: parsed.lcsc_part || ''
    });
  }

  return {
    success: true,
    total: items.length,
    items
  };
}

/**
 * 单条自然语言/速记文本全场景高智能解析器 (用于一键点录速记框 & 抽屉速记)
 * 支持硬件全品类：电容、电阻、电感、磁珠、二极管、三极管、MOSFET、LDO、运放、MCU、晶振、按键、接插件
 * 完美处理纯数字、带单位、无单位、营销噪音、丝印、位置、数量、C编号
 */
function parseSingleComponentText(text) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    return {
      name: '',
      category: '其他',
      package: '',
      value: '',
      standard_value: null,
      unit: '',
      quantity: null,
      location: '',
      notes: '',
      lcsc_part: null,
      voltage: null,
      tolerance: '',
      material: '',
      polarity: '',
      rating: '',
      is_ambiguous: false,
      ambiguity_reason: '',
      ambiguity_suggestion: ''
    };
  }

  const rawText = text.trim();
  let workingText = rawText;

  // 0. 预处理：消除冗余别名括号如 100nF(104) -> 100nF
  workingText = workingText.replace(/(\d+(?:\.\d+)?\s*(?:pf|nf|uf|µf|k|m|r|ohm|Ω))[（(][^）)]*[）)]/gi, '$1 ');

  // 1. 提取明确数量 (必须带量词、前缀或明确关键词；支持 100只/包, 5000只/盘 等包装复合规格)
  let extractedQty = null;
  const qtyKeywordMatch = workingText.match(/(?:数量|入库数量|现存数量)\s*[:：=]?\s*(\d{1,6})/i);
  if (qtyKeywordMatch) {
    extractedQty = parseInt(qtyKeywordMatch[1], 10);
    workingText = workingText.replace(qtyKeywordMatch[0], ' ');
  } else {
    const qtyExplicitMatch = workingText.match(/(?:^|[\s,;，；])(?:x|X|\*|×)\s*(\d{1,6})(?=\s|$|[,;，；])/);
    if (qtyExplicitMatch) {
      extractedQty = parseInt(qtyExplicitMatch[1], 10);
      workingText = workingText.replace(qtyExplicitMatch[0], ' ');
    } else {
      const qtyUnitMatch = workingText.match(/(?:^|[\s,;，；])(\d{1,6})\s*(?:个|只|件|片|pcs|PCS|支|颗|条|套|把|包|袋|盘|卷)(?:\/(?:包|袋|盘|卷|套|盒))?(?=\s|$|[,;，；])/i);
      if (qtyUnitMatch) {
        extractedQty = parseInt(qtyUnitMatch[1], 10);
        workingText = workingText.replace(qtyUnitMatch[0], ' ');
      }
    }
  }

  // 2. 提取收纳盒仓位
  let extractedLoc = null;
  const atLocMatch = workingText.match(/[@#]\s*([A-Za-z0-9\-_一-龥]{2,20})/);
  if (atLocMatch) {
    extractedLoc = atLocMatch[1];
    workingText = workingText.replace(atLocMatch[0], ' ');
  } else {
    const locMatch = workingText.match(/(?:放在|放入|放进|存入|位置|盒子|盒|箱|抽屉|柜)\s*[:：]?\s*([A-Za-z0-9\-_一-龥]{2,15})/);
    if (locMatch && !KNOWN_PACKAGES.includes(locMatch[1].toUpperCase()) && !/^\d+[Vv]$/.test(locMatch[1])) {
      extractedLoc = locMatch[1];
      workingText = workingText.replace(locMatch[0], ' ');
    }
  }

  // 3. 提取立创 C 编号
  let extractedLcsc = null;
  const lcscMatch = workingText.match(/\b(C\d{3,8})\b/i);
  if (lcscMatch) {
    extractedLcsc = lcscMatch[1].toUpperCase();
    workingText = workingText.replace(lcscMatch[0], ' ');
  }

  // 4. 锁定显式类别关键词 (绝对最高优先级，避免跨界误判)
  let lockedCategory = null;
  if (/电容|瓷片|独石|钽电容|铝电解|容值|CAP|Capacitor/i.test(workingText)) lockedCategory = '电容';
  else if (/电阻|排阻|阻值|分流器|RES|Resistor/i.test(workingText)) lockedCategory = '电阻';
  else if (/电感|磁珠|感值|IND|Inductor|Bead/i.test(workingText)) lockedCategory = '电感';
  else if (/二极管|肖特基|发光二极管|LED|整流桥|TVS/i.test(workingText)) lockedCategory = '二极管';
  else if (/三极管|MOS管|场效应管|晶体管|IGBT|NPN|PNP|NMOS|PMOS/i.test(workingText)) lockedCategory = '三极管/MOS';
  else if (/单片机|MCU|LDO|运放|降压|升压|稳压芯片|驱动芯片|FLASH|EEPROM/i.test(workingText)) lockedCategory = '芯片';
  else if (/晶振|晶体|有源晶振|无源晶振|OSC|Crystal/i.test(workingText)) lockedCategory = '晶振';
  else if (/按键|轻触开关|拨码开关|继电器|开关/i.test(workingText)) lockedCategory = '开关/按键';
  else if (/接插件|排针|排母|端子|Type-C|Micro-USB|USB座/i.test(workingText)) lockedCategory = '接插件';

  // 5. 提取耐压/电压
  let voltage = null;
  const vMatch = workingText.match(/(\d+(?:\.\d+)?)\s*(?:V|v|伏特?)\b/);
  if (vMatch) {
    voltage = parseFloat(vMatch[1]);
    workingText = workingText.replace(vMatch[0], ' ');
  } else if (/1[Kk][Vv]\b/.test(workingText)) {
    voltage = 1000;
    workingText = workingText.replace(/1[Kk][Vv]\b/, ' ');
  }

  // 6. 提取精度/误差 (支持百分比与工业字母代号如 F, J, K, M, Z)
  let tolerance = parseTolerance(workingText) || '';
  if (tolerance) {
    workingText = workingText
      .replace(/(?:±|\+-|\+\/-)\s*\d+(?:\.\d+)?\s*%/g, ' ')
      .replace(/(?:^|\s)\d+(?:\.\d+)?\s*%(?:\s|$)/g, ' ')
      .replace(/\b[BCDFGJKMZ]\s*(?:档|级)\b/gi, ' ');
  }

  // 6.1 提取介质与材质特性 (如 X7R, C0G, 铝电解, 金属膜, 磁珠)
  const extractedMaterial = parseMaterial(workingText) || '';
  if (extractedMaterial) {
    workingText = workingText.replace(new RegExp(`\\b${extractedMaterial}\\b`, 'gi'), ' ');
  }

  // 7. 提取封装
  const extractedPkg = normalizePackage(workingText) || '';
  if (extractedPkg) {
    workingText = workingText.replace(new RegExp(`\\b${extractedPkg}\\b`, 'gi'), ' ');
  }

  // 8. 检查芯片/半导体型号匹配库
  let matchedIc = null;
  for (const ic of KNOWN_IC_PATTERNS) {
    const m = workingText.match(ic.pattern);
    if (m) {
      matchedIc = {
        model: m[0].toUpperCase(),
        category: ic.category,
        desc: ic.desc,
        polarity: ic.polarity || '',
        rating: ic.rating || '',
        output_voltage: ic.output_voltage || ''
      };
      break;
    }
  }

  // 9. 清洗修饰营销词
  workingText = workingText
    .replace(/(?:全新原装|原装正品|正品原装|原厂原包|全新进口|进口原装|原装进口|正品特价|实物拍摄|拍下即发|假一赔十|拍单|热卖|爆款|特价|包邮|直拍|全新|原装|正品|现货|现货直发|直发|原厂|进口|国产|高品质|优质|精品|常用|通用|拆机|散装|盘装|卷带|编带|剪带|原盘|带胶|环保|无铅|贴片|直插|正品保障|顺丰包邮|当日发货|极速发货|配单|BOM配单|一站式配单|支持实单|特价促销|质保一年|批量优惠)/gi, ' ')
    .replace(/(?:贴片电容|电容器?|贴片电阻|电阻器?|贴片电感|电感器?|发光二极管|二极管|三极管|MOS管|芯片|晶振|轻触开关)/gi, ' ')
    .replace(/[【】\[\]（）()★▲◆|/、]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 10. 严格防呆模式：检测是否存在严重歧义输入
  let isAmbiguous = false;
  let ambiguityReason = '';
  let ambiguitySuggestion = '';

  const cleanNoSpace = rawText.replace(/\s+/g, '');
  const pureNumOnly = /^[0-9]+(?:\.[0-9]+)?$/.test(cleanNoSpace);
  const pkgAndNumOnly = /^(?:0805|0603|0402|1206|1210|SOT-23|SOD-123)[0-9]+(?:\.[0-9]+)?$/i.test(cleanNoSpace);

  if ((pureNumOnly || pkgAndNumOnly) && !lockedCategory && !matchedIc && !voltage && !tolerance && !extractedMaterial) {
    isAmbiguous = true;
    ambiguityReason = '输入仅为纯数字，缺少明确单位与器件分类';
    ambiguitySuggestion = '请补充单位或类别，例如：100nF (电容) 或 100kΩ (电阻)';
  }

  // 11. 确定最终分类与参数
  const isEiaCapCodeWithK = /\b[1-9]\d[0-9]k\b/i.test(workingText) && !/[Ω欧ohm]/i.test(workingText);
  const hasCapUnit = /(?:\d+(?:\.\d+)?)\s*(?:pf|nf|uf|µf|p|n|u)\b/i.test(workingText) || /(\d+)\s*([uUnNpPµ])\s*(\d+)/.test(workingText) || isEiaCapCodeWithK;
  const hasResUnit = !isEiaCapCodeWithK && (/(?:\d+(?:\.\d+)?)\s*(?:k|m|r|ohm|Ω|欧)\b/i.test(workingText) || /\b\d+[RKMkΩr]\d+\b/i.test(workingText));
  const hasIndUnit = /(?:\d+(?:\.\d+)?)\s*(?:uh|nh|mh|µh)\b/i.test(workingText);

  // 判断是否为电容：显式锁定电容，或材质为电容介质，或有容值单位，或有耐压且无阻值单位
  const isCap = lockedCategory === '电容' || (!lockedCategory && !matchedIc && (
    ['X7R', 'X5R', 'C0G', 'NPO', 'Y5V', '钽电容', '铝电解'].includes(extractedMaterial) ||
    hasCapUnit ||
    (voltage && !hasIndUnit && !hasResUnit)
  ));

  // 判断是否为电阻：显式锁定电阻，或有阻值单位，或有精度但无电压
  const isRes = !isCap && (lockedCategory === '电阻' || (!lockedCategory && !matchedIc && (hasResUnit || (tolerance && !voltage && !isEiaCapCodeWithK) || ['厚膜', '金属膜', '薄膜'].includes(extractedMaterial))));

  let finalCategory = lockedCategory || (isCap ? '电容' : isRes ? '电阻' : matchedIc ? matchedIc.category : '其他');
  let finalValue = '';
  let finalName = '';
  let standardValue = null;
  let finalUnit = '';
  let notes = [];

  if (voltage) notes.push('耐压: ' + voltage + 'V');
  if (tolerance) notes.push('精度: ' + tolerance);
  if (extractedMaterial) notes.push('材质: ' + extractedMaterial);
  if (matchedIc) {
    const icSpecs = [matchedIc.desc, matchedIc.polarity, matchedIc.rating].filter(Boolean);
    if (icSpecs.length > 0) notes.push(icSpecs.join(' · '));
  }

  // 分支 1: 电容
  if (isCap) {
    finalCategory = '电容';
    finalUnit = 'pF';
    const parsedCap = parseCapacitance(workingText);
    if (parsedCap) {
      finalValue = parsedCap.display;
      standardValue = parsedCap.val;
    } else {
      // 纯数字无单位写法 (例如: 100, 10, 22)
      const pureNumMatch = workingText.match(/\b(\d+(?:\.\d+)?)\b/);
      if (pureNumMatch) {
        const num = pureNumMatch[1];
        if (num === '100' || num === '0.1') { finalValue = '100nF'; standardValue = 100000; }
        else if (num === '1') { finalValue = '1µF'; standardValue = 1000000; }
        else if (num === '10') { finalValue = '10µF'; standardValue = 10000000; }
        else if (num === '22' || num === '33' || num === '47') { finalValue = num + 'pF'; standardValue = parseFloat(num); }
        else { finalValue = num; }
      }
    }
    const parts = [];
    if (extractedPkg) parts.push(extractedPkg);
    if (finalValue) parts.push(finalValue);
    if (voltage) parts.push(voltage + 'V');
    if (extractedMaterial) parts.push(extractedMaterial);
    finalName = parts.length > 0 ? parts.join(' ') : (extractedPkg ? extractedPkg + ' 电容' : '电容');
  }
  // 分支 2: 电阻
  else if (isRes) {
    finalCategory = '电阻';
    finalUnit = 'Ω';
    const parsedRes = parseResistance(workingText);
    if (parsedRes) {
      finalValue = parsedRes.display;
      standardValue = parsedRes.val;
    }
    const parts = [];
    if (extractedPkg) parts.push(extractedPkg);
    if (finalValue) parts.push(finalValue);
    if (tolerance) parts.push(tolerance);
    if (extractedMaterial && extractedMaterial !== '厚膜') parts.push(extractedMaterial);
    finalName = parts.length > 0 ? parts.join(' ') : (extractedPkg ? extractedPkg + ' 电阻' : '电阻');
  }
  // 分支 3: 电感
  else if (lockedCategory === '电感' || (!lockedCategory && !matchedIc && /(?:\d+(?:\.\d+)?)\s*(?:uh|nh|mh|µh)\b/i.test(workingText))) {
    finalCategory = '电感';
    const indMatch = workingText.match(/(\d+(?:\.\d+)?)\s*(uh|nh|mh|µh)\b/i);
    if (indMatch) {
      const num = parseFloat(indMatch[1]);
      const u = indMatch[2].toLowerCase();
      if (u === 'uh' || u === 'µh') { finalValue = num + 'µH'; finalUnit = 'µH'; standardValue = num; }
      else if (u === 'nh') { finalValue = num + 'nH'; finalUnit = 'nH'; standardValue = num; }
      else if (u === 'mh') { finalValue = num + 'mH'; finalUnit = 'mH'; standardValue = num * 1000; }
    } else {
      const beadMatch = workingText.match(/(\d+)\s*(?:R|r|Ω|欧)/i);
      if (beadMatch) {
        finalValue = beadMatch[1] + 'Ω (磁珠)';
        finalUnit = 'Ω';
        standardValue = parseFloat(beadMatch[1]);
      }
    }
    const parts = [];
    if (extractedPkg) parts.push(extractedPkg);
    if (finalValue) parts.push(finalValue);
    finalName = parts.length > 0 ? parts.join(' ') : (extractedPkg ? extractedPkg + ' 电感' : '电感');
  }
  // 分支 4: 命中已知半导体/IC型号
  else if (matchedIc) {
    finalName = matchedIc.model;
    finalCategory = matchedIc.category;
    finalValue = matchedIc.model;
  }
  // 分支 5: 晶振
  else if (lockedCategory === '晶振' || /(?:\d+(?:\.\d+)?)\s*(?:mhz|khz)\b/i.test(workingText)) {
    finalCategory = '晶振';
    const freqMatch = workingText.match(/(\d+(?:\.\d+)?)\s*(mhz|khz)\b/i);
    if (freqMatch) {
      finalValue = freqMatch[1] + (freqMatch[2].toUpperCase());
    }
    const parts = [];
    if (finalValue) parts.push(finalValue);
    if (extractedPkg) parts.push(extractedPkg);
    parts.push('晶振');
    finalName = parts.join(' ');
  }
  // 分支 6: 二极管/LED
  else if (lockedCategory === '二极管' || /LED/i.test(workingText)) {
    finalCategory = '二极管';
    finalName = workingText || (extractedPkg ? extractedPkg + ' 二极管' : '二极管');
    finalValue = finalName;
  }
  // 分支 7: 三极管/MOS
  else if (lockedCategory === '三极管/MOS') {
    finalCategory = '三极管/MOS';
    finalName = workingText || 'MOS/三极管';
    finalValue = finalName;
  }
  // 分支 8: 通用/其他
  else {
    if (extractedLcsc) {
      finalName = extractedLcsc;
      finalValue = extractedLcsc;
    } else {
      finalName = workingText || rawText;
      finalValue = workingText || rawText;
    }
  }

  // 如果最后还有剩余数字但还没有识别到数量，且已有明确型号
  if (extractedQty === null && finalName && finalName !== rawText) {
    const trailingNumMatch = rawText.match(/\b(\d{1,5})\s*$/);
    if (trailingNumMatch) {
      const num = parseInt(trailingNumMatch[1], 10);
      if (!finalName.endsWith(trailingNumMatch[1]) && !finalValue.includes(trailingNumMatch[1]) && num !== voltage) {
        extractedQty = num;
      }
    }
  }

  return {
    name: finalName.trim(),
    category: finalCategory,
    package: extractedPkg,
    value: finalValue,
    standard_value: standardValue,
    unit: finalUnit,
    quantity: extractedQty,
    location: extractedLoc || '',
    notes: notes.join(', '),
    lcsc_part: extractedLcsc,
    voltage,
    tolerance,
    material: extractedMaterial || '',
    polarity: matchedIc?.polarity || '',
    rating: matchedIc?.rating || '',
    is_ambiguous: isAmbiguous,
    ambiguity_reason: ambiguityReason,
    ambiguity_suggestion: ambiguitySuggestion
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
  parseFreeformBatchText,
  parseSingleComponentText,
  parseMaterial,
  LETTER_TOLERANCE_MAP
};
