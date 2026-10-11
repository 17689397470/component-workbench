/**
 * 立创商城/元器件官方数据检索服务 (lib/lcscService.js)
 * 支持联网查询立创元器件信息、官方品名、封装、图片链接及技术规格，
 * 同时内置高频标准库字典与立创官方页面直达链接生成，断网或WAF拦截时自动无缝兜底。
 */

const { parseComponentText, parseOmniboxText, parseSingleComponentText } = require('./parser');

// 常见高频立创物料标准字典（用于毫秒级官方直出与离线保底）
const COMMON_LCSC_DICT = {
  'C2057': { name: '0603 100nF (0.1µF) 50V X7R 贴片电容', category: '电容', package: '0603', value: '100nF', standard_value: 100000, unit: 'pF', voltage: 50, tolerance: '10%', manufacturer: 'YAGEO(国巨)', image_url: 'https://alimg.szlcsc.com/upload/public/product/middle/20241021/5D238F3C2CC0E2E5CEF3EF098E3D0F96.jpg', notes: '立创商城官方热销物料' },
  'C14663': { name: '0805 100nF (0.1µF) 50V X7R 贴片电容', category: '电容', package: '0805', value: '100nF', standard_value: 100000, unit: 'pF', voltage: 50, tolerance: '10%', manufacturer: 'YAGEO(国巨)', image_url: 'https://alimg.szlcsc.com/upload/public/product/middle/20250715/565F44E7FCAE51D13767AECBC328360D.jpg', notes: '电源去耦常用' },
  'C17414': { name: '0805 10kΩ ±1% 贴片电阻', category: '电阻', package: '0805', value: '10kΩ', standard_value: 10000, unit: 'Ω', voltage: null, tolerance: '1%', manufacturer: 'UNI-ROYAL(厚声)', image_url: 'https://alimg.szlcsc.com/upload/public/product/middle/20221228/9FAC57B04CBA608011C05FA2B3C494C9.jpg', notes: '标准上拉分压电阻' },
  'C17511': { name: '0805 1kΩ ±1% 贴片电阻', category: '电阻', package: '0805', value: '1kΩ', standard_value: 1000, unit: 'Ω', voltage: null, tolerance: '1%', manufacturer: 'UNI-ROYAL(厚声)', image_url: 'https://alimg.szlcsc.com/upload/public/product/middle/20250913/09701B7890417F43142EF2167E69EA69.jpg', notes: '指示灯限流常用' },
  'C6186': { name: 'AMS1117-3.3 稳压IC 1A', category: '芯片', package: 'SOT-223', value: 'AMS1117-3.3', standard_value: null, unit: '', voltage: 15, tolerance: '', manufacturer: 'Advanced Monolithic Systems', image_url: 'https://alimg.szlcsc.com/upload/public/product/middle/20221228/86A005C4AE28CBFAC8169BD196951188.jpg', notes: '经典3.3V降压稳压芯片' },
  'C84681': { name: 'CH340C USB转串口芯片(内置晶振)', category: '芯片', package: 'SOP-8', value: 'CH340C', standard_value: null, unit: '', voltage: null, tolerance: '', manufacturer: 'WCH(江苏沁恒)', image_url: 'https://alimg.szlcsc.com/upload/public/product/middle/20221231/E7457713AE92BDCF7B940DE5B3A740F5.jpg', notes: '免外部晶振USB转串口' },
  'C8678': { name: 'SS34 肖特基二极管 3A 40V', category: '二极管', package: 'SMA', value: 'SS34', standard_value: null, unit: '', voltage: 40, tolerance: '', manufacturer: 'MDD(辰达行)', image_url: 'https://alimg.szlcsc.com/upload/public/product/middle/20251214/3E06C7B2F793FAB995CA50B0C8DB6A4B.jpg', notes: '电源防反接/高频整流' },
  'C81598': { name: '1N4148W 高速开关二极管', category: '二极管', package: 'SOD-123', value: '1N4148W', standard_value: null, unit: '', voltage: 100, tolerance: '', manufacturer: 'JCET(长电科技)', image_url: 'https://alimg.szlcsc.com/upload/public/product/middle/20250828/BDE80AD0078E39ACD843276B01195ABC.jpg', notes: '小信号高速开关' },
  'C20917': { name: 'AO3400 N沟道场效应管(MOSFET) 30V 5.7A', category: '三极管/MOS', package: 'SOT-23', value: 'AO3400', standard_value: null, unit: '', voltage: 30, tolerance: '', manufacturer: 'AOS(万代)', image_url: 'https://alimg.szlcsc.com/upload/public/product/middle/20221228/B2A9B82BA2CC6EA0E599C36D8250DBA5.jpg', notes: '低内阻开关MOS管' },
  'C2835408': { name: 'TYPE-C 16P 四脚插板母座', category: '接插件', package: 'TYPE-C', value: 'TYPE-C-16P', standard_value: null, unit: '', voltage: null, tolerance: '', manufacturer: '韩荣(HRO)', image_url: 'https://alimg.szlcsc.com/upload/public/product/middle/20230105/28472125D5E4E7207C90ED4D90487182.jpg', notes: '通用Type-C母座' }
};

/**
 * 查询立创元器件官方信息并结合 Omnibox 全能速记切词
 * @param {string} query - 可以是复合语句如 "10k 0805 100 A-01" 或 "C2057 50" 或微型丝印 "A7 100"
 */
async function queryOfficialComponent(query) {
  if (!query || typeof query !== 'string') return null;

  // 1. 先进行单行全能速记切词拆解与全品类智能解析
  const omni = parseOmniboxText(query);
  const singleParsed = parseSingleComponentText(query);
  const coreQuery = (omni.coreText || query).trim();
  const cleanQ = coreQuery.toUpperCase();

  const extraMeta = {
    extracted_quantity: singleParsed.quantity !== null ? singleParsed.quantity : omni.quantity,
    extracted_location: singleParsed.location || omni.location || null,
    extracted_package: singleParsed.package || omni.package || null
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

  // 4. 尝试联网向公开接口发起核心词查询 (优先使用精准提纯后的品名规格)
  try {
    const searchKeyword = lcscPart || (singleParsed && singleParsed.name ? singleParsed.name : coreQuery);
    const searchUrl = `https://pro.lceda.cn/api/eda/product/search?keyword=${encodeURIComponent(searchKeyword)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);

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
      const productList = data?.result?.productList || data?.result?.lists || [];
      if (Array.isArray(productList) && productList.length > 0) {
        // 优先精准匹配 C 编号，其次匹配指定封装
        const targetPkg = (singleParsed.package || omni.package || '').toUpperCase();
        let top = null;
        if (lcscPart) {
          top = productList.find(p => (p.code || p.productCode || '').toUpperCase() === lcscPart);
        }
        if (!top && targetPkg) {
          top = productList.find(p => ((p.standard || p.package || '').toUpperCase().includes(targetPkg)) || ((p.model || '').toUpperCase().includes(targetPkg)));
        }
        if (!top) {
          top = productList[0];
        }
        
        const rawCode = top.code || top.productCode || lcscPart || '';
        const rawName = top.name || top.title || top.display_title || coreQuery;
        const rawModel = top.model || '';
        const rawBrand = top.brandName || top.brand_name || '';
        const rawCatalog = top.catalogName || '';
        const rawPackage = top.standard || top.package || '';
        const rawImg = top.image ? top.image.split('<$>')[0] : (top.images && top.images[0] ? top.images[0] : '');
        let rawPdf = top.pdfFileUrl || top.pdf || '';
        if (rawPdf && !rawPdf.startsWith('http')) {
          rawPdf = 'https://www.szlcsc.com' + (rawPdf.startsWith('/') ? '' : '/') + rawPdf;
        }

        // 解析与智能分类
        const parsed = parseComponentText(`${rawModel} ${rawName} ${rawPackage}`);
        let category = parsed.category || '其他';
        if (rawCatalog) {
          if (rawCatalog.includes('电容')) category = '电容';
          else if (rawCatalog.includes('电阻')) category = '电阻';
          else if (rawCatalog.includes('电感')) category = '电感';
          else if (rawCatalog.includes('二极管')) category = '二极管';
          else if (rawCatalog.includes('三极管') || rawCatalog.includes('MOS')) category = '三极管/MOS';
          else if (rawCatalog.includes('模块') || rawCatalog.includes('WiFi') || rawCatalog.includes('蓝牙')) category = '模块';
          else if (rawCatalog.includes('芯片') || rawCatalog.includes('IC') || rawCatalog.includes('MCU') || rawCatalog.includes('运放')) category = '芯片';
          else if (rawCatalog.includes('接插件') || rawCatalog.includes('连接器') || rawCatalog.includes('端子') || rawCatalog.includes('排针')) category = '接插件';
          else if (rawCatalog.includes('开关') || rawCatalog.includes('按键')) category = '开关';
          else if (rawCatalog.includes('晶振')) category = '晶振';
        }

        // 整理阻容值及避免将C编号误赋为阻值
        let finalValue = parsed.value || rawModel || rawName;
        if (finalValue && lcscPart && finalValue.toUpperCase() === lcscPart) {
          finalValue = rawModel || '';
        }
        if (['芯片', '模块', '接插件', '开关'].includes(category)) {
          finalValue = rawModel || finalValue;
        }

        const fullName = rawModel ? `${rawModel} ${rawName}`.trim() : rawName;

        return {
          source: 'lceda_api',
          lcsc_part: rawCode,
          name: fullName,
          model: rawModel,
          category: category,
          package: omni.package || rawPackage || parsed.package || '',
          value: finalValue,
          standard_value: parsed.standard_value,
          unit: parsed.unit,
          voltage: parsed.voltage,
          tolerance: parsed.tolerance,
          manufacturer: rawBrand,
          image_url: rawImg,
          datasheet_url: rawPdf || (rawCode ? `https://item.szlcsc.com/${rawCode.replace('C', '')}.html` : ''),
          notes: top.desc || top.description || parsed.notes || '',
          official_stock: top.stockNumber ? parseInt(top.stockNumber, 10) : null,
          official_price: top.priceList && top.priceList[0] ? top.priceList[0].price : null,
          ...extraMeta
        };
      }
    }
  } catch (e) {
    // 忽略网络或超时错误，平滑进入本地规则兜底
  }

  // 5. 本地智能解析引擎兜底 (采用全品类深度识别引擎)
  return {
    source: 'local_parser',
    lcsc_part: lcscPart || singleParsed.lcsc_part || '',
    name: singleParsed.name || coreQuery,
    category: singleParsed.category,
    package: singleParsed.package || omni.package || '',
    value: singleParsed.value,
    standard_value: singleParsed.standard_value,
    unit: singleParsed.unit,
    voltage: singleParsed.voltage,
    tolerance: singleParsed.tolerance,
    manufacturer: '',
    image_url: '',
    datasheet_url: lcscPart ? `https://item.szlcsc.com/${lcscPart.replace('C', '')}.html` : '',
    notes: singleParsed.notes || '',
    ...extraMeta
  };
}

module.exports = {
  COMMON_LCSC_DICT,
  queryOfficialComponent
};
