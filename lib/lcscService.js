/**
 * 立创商城/元器件官方数据检索服务 (lib/lcscService.js)
 * 支持联网查询立创元器件信息、官方品名、封装、图片链接及技术规格，
 * 同时内置高频标准库字典与立创官方页面直达链接生成，断网或WAF拦截时自动无缝兜底。
 */

const { parseComponentText, parseOmniboxText } = require('./parser');

// 常见高频立创物料标准字典（用于毫秒级官方直出与离线保底）
const COMMON_LCSC_DICT = {
  'C2057': { name: '0603 100nF (0.1µF) 50V X7R 贴片电容', category: '电容', package: '0603', value: '100nF', standard_value: 100000, unit: 'pF', voltage: 50, tolerance: '10%', manufacturer: 'YAGEO(国巨)', image_url: 'https://assets.lcsc.com/images/lcsc/900x900/20180914_YAGEO-国巨-CC0603KRX7R9BB104_C2057_front.jpg', notes: '立创商城官方热销物料' },
  'C14663': { name: '0805 100nF (0.1µF) 50V X7R 贴片电容', category: '电容', package: '0805', value: '100nF', standard_value: 100000, unit: 'pF', voltage: 50, tolerance: '10%', manufacturer: 'YAGEO(国巨)', image_url: 'https://assets.lcsc.com/images/lcsc/900x900/20180914_YAGEO-国巨-CC0805KRX7R9BB104_C14663_front.jpg', notes: '电源去耦常用' },
  'C17414': { name: '0805 10kΩ ±1% 贴片电阻', category: '电阻', package: '0805', value: '10kΩ', standard_value: 10000, unit: 'Ω', voltage: null, tolerance: '1%', manufacturer: 'UNI-ROYAL(厚声)', image_url: 'https://assets.lcsc.com/images/lcsc/900x900/20180914_UNI-ROYAL-厚声-0805W8F1002T5E_C17414_front.jpg', notes: '标准上拉分压电阻' },
  'C17511': { name: '0805 1kΩ ±1% 贴片电阻', category: '电阻', package: '0805', value: '1kΩ', standard_value: 1000, unit: 'Ω', voltage: null, tolerance: '1%', manufacturer: 'UNI-ROYAL(厚声)', image_url: 'https://assets.lcsc.com/images/lcsc/900x900/20180914_UNI-ROYAL-厚声-0805W8F1001T5E_C17511_front.jpg', notes: '指示灯限流常用' },
  'C6186': { name: 'AMS1117-3.3 稳压IC 1A', category: '芯片', package: 'SOT-223', value: 'AMS1117-3.3', standard_value: null, unit: '', voltage: 15, tolerance: '', manufacturer: 'Advanced Monolithic Systems', image_url: 'https://assets.lcsc.com/images/lcsc/900x900/20180914_AMS-AMS1117-3-3_C6186_front.jpg', notes: '经典3.3V降压稳压芯片' },
  'C84681': { name: 'CH340C USB转串口芯片(内置晶振)', category: '芯片', package: 'SOP-8', value: 'CH340C', standard_value: null, unit: '', voltage: null, tolerance: '', manufacturer: 'WCH(江苏沁恒)', image_url: 'https://assets.lcsc.com/images/lcsc/900x900/20180914_WCH-CH340C_C84681_front.jpg', notes: '免外部晶振USB转串口' },
  'C8678': { name: 'SS34 肖特基二极管 3A 40V', category: '二极管', package: 'SMA', value: 'SS34', standard_value: null, unit: '', voltage: 40, tolerance: '', manufacturer: 'MDD(辰达行)', image_url: 'https://assets.lcsc.com/images/lcsc/900x900/20180914_MDD-SS34_C8678_front.jpg', notes: '电源防反接/高频整流' },
  'C81598': { name: '1N4148W 高速开关二极管', category: '二极管', package: 'SOD-123', value: '1N4148W', standard_value: null, unit: '', voltage: 100, tolerance: '', manufacturer: 'JCET(长电科技)', image_url: 'https://assets.lcsc.com/images/lcsc/900x900/20180914_JCET-1N4148W_C81598_front.jpg', notes: '小信号高速开关' },
  'C20917': { name: 'AO3400 N沟道场效应管(MOSFET) 30V 5.7A', category: '三极管/MOS', package: 'SOT-23', value: 'AO3400', standard_value: null, unit: '', voltage: 30, tolerance: '', manufacturer: 'AOS(万代)', image_url: 'https://assets.lcsc.com/images/lcsc/900x900/20180914_AOS-AO3400_C20917_front.jpg', notes: '低内阻开关MOS管' },
  'C2835408': { name: 'TYPE-C 16P 四脚插板母座', category: '接插件', package: 'TYPE-C', value: 'TYPE-C-16P', standard_value: null, unit: '', voltage: null, tolerance: '', manufacturer: '韩荣(HRO)', image_url: 'https://assets.lcsc.com/images/lcsc/900x900/20210720_HRO-TYPE-C-16P_C2835408_front.jpg', notes: '通用Type-C母座' }
};

/**
 * 查询立创元器件官方信息并结合 Omnibox 全能速记切词
 * @param {string} query - 可以是复合语句如 "10k 0805 100 A-01" 或 "C2057 50" 或微型丝印 "A7 100"
 */
async function queryOfficialComponent(query) {
  if (!query || typeof query !== 'string') return null;

  // 1. 先进行单行全能速记切词拆解
  const omni = parseOmniboxText(query);
  const coreQuery = (omni.coreText || query).trim();
  const cleanQ = coreQuery.toUpperCase();

  const extraMeta = {
    extracted_quantity: omni.quantity,
    extracted_location: omni.location,
    extracted_package: omni.package
  };

  // 2. 检查是否命中 SMD 贴片微型丝印代码字典
  if (omni.smdCandidates && omni.smdCandidates.length > 0) {
    const top = omni.smdCandidates[0];
    return {
      source: 'smd_marking_code',
      lcsc_part: '',
      name: top.name,
      category: top.category,
      package: omni.package || top.package,
      value: top.value,
      standard_value: null,
      unit: '',
      voltage: top.voltage || null,
      tolerance: '',
      manufacturer: '',
      image_url: '',
      datasheet_url: '',
      notes: top.desc,
      candidates: omni.smdCandidates,
      ...extraMeta
    };
  }

  // 3. 如果匹配立创编号，检查本地高频字典
  const cMatch = cleanQ.match(/\b(C\d{3,8})\b/i);
  const lcscPart = cMatch ? cMatch[1].toUpperCase() : null;

  if (lcscPart && COMMON_LCSC_DICT[lcscPart]) {
    const item = COMMON_LCSC_DICT[lcscPart];
    return {
      source: 'official_dict',
      lcsc_part: lcscPart,
      name: item.name,
      category: item.category,
      package: omni.package || item.package,
      value: item.value,
      standard_value: item.standard_value,
      unit: item.unit,
      voltage: item.voltage,
      tolerance: item.tolerance,
      manufacturer: item.manufacturer,
      image_url: item.image_url,
      datasheet_url: `https://item.szlcsc.com/${lcscPart.replace('C', '')}.html`,
      notes: item.notes,
      ...extraMeta
    };
  }

  // 4. 尝试联网向公开接口发起核心词查询
  try {
    const searchUrl = `https://pro.lceda.cn/api/eda/product/search?keyword=${encodeURIComponent(coreQuery)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);

    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      },
      signal: controller.signal
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      if (data && data.result && data.result.lists && data.result.lists.length > 0) {
        const top = data.result.lists[0];
        const parsed = parseComponentText(`${top.title || ''} ${top.package || ''}`);
        return {
          source: 'lceda_api',
          lcsc_part: top.productCode || lcscPart || '',
          name: top.title || top.display_title || coreQuery,
          category: parsed.category || '其他',
          package: omni.package || top.package || parsed.package || '',
          value: parsed.value || top.title || coreQuery,
          standard_value: parsed.standard_value,
          unit: parsed.unit,
          voltage: parsed.voltage,
          tolerance: parsed.tolerance,
          manufacturer: top.brand_name || '',
          image_url: top.images && top.images[0] ? top.images[0] : '',
          datasheet_url: top.pdf || (lcscPart ? `https://item.szlcsc.com/${lcscPart.replace('C', '')}.html` : ''),
          notes: top.description || '',
          ...extraMeta
        };
      }
    }
  } catch (e) {
    // 忽略网络或超时错误，平滑进入本地规则兜底
  }

  // 5. 本地智能解析引擎兜底
  const parsedFallback = omni.parsedComponent || parseComponentText(coreQuery);
  return {
    source: 'local_parser',
    lcsc_part: lcscPart || '',
    name: parsedFallback.name || coreQuery,
    category: parsedFallback.category,
    package: omni.package || parsedFallback.package,
    value: parsedFallback.value,
    standard_value: parsedFallback.standard_value,
    unit: parsedFallback.unit,
    voltage: parsedFallback.voltage,
    tolerance: parsedFallback.tolerance,
    manufacturer: '',
    image_url: '',
    datasheet_url: lcscPart ? `https://item.szlcsc.com/${lcscPart.replace('C', '')}.html` : '',
    notes: parsedFallback.notes || '',
    ...extraMeta
  };
}

module.exports = {
  COMMON_LCSC_DICT,
  queryOfficialComponent
};
