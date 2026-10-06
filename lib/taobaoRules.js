/**
 * 淘宝解析规则与黑白名单配置持久层 (lib/taobaoRules.js)
 * 支持自定义：
 * 1. 忽略黑名单关键词 (例如: 赠品、测试架、运费补差等自动标记忽略)
 * 2. 标题清洗噪声词 (例如: 原装正品、包邮、大特价等营销词清洗)
 * 3. 分类默认推荐收纳盒映射 (根据识别出的电阻、电容、芯片自动推荐对应箱袋)
 */

const fs = require('fs');
const path = require('path');

const RULES_PATH = path.join(__dirname, '..', 'data', 'taobao_rules.json');

const DEFAULT_RULES = {
  ignoreKeywords: [
    '赠品', '测试架', '运费', '补差价', '包装袋', '自封袋', '快递', '专拍', '订制', '打样'
  ],
  cleanGarbageWords: [
    '原装正品', '正品原装', '全新原装', '原装', '优质', '包邮', '大特价',
    '优惠价', '冲量', '热卖', 'DIY配件', '小钢炮', '特价', '现货', '拍前联系'
  ],
  categoryDefaultLocations: {
    '电阻': '默认电阻盒',
    '电容': '默认电容盒',
    '发光管/LED': '发光管收纳盒',
    '二极管': '二极管袋',
    '三极管/MOS': '三极管袋',
    '芯片': '芯片收纳袋',
    '接插件': '接插件盒',
    '结构件/五金': '螺栓五金盒',
    '开关/按键': '开关按键盒',
    '保护器件': '保护器件袋',
    '电源/电池': '电源模组盒',
    '其他': '淘宝待整理散料盒'
  }
};

function getRules() {
  try {
    if (fs.existsSync(RULES_PATH)) {
      const content = fs.readFileSync(RULES_PATH, 'utf8');
      const parsed = JSON.parse(content);
      return {
        ignoreKeywords: Array.isArray(parsed.ignoreKeywords) ? parsed.ignoreKeywords : DEFAULT_RULES.ignoreKeywords,
        cleanGarbageWords: Array.isArray(parsed.cleanGarbageWords) ? parsed.cleanGarbageWords : DEFAULT_RULES.cleanGarbageWords,
        categoryDefaultLocations: { ...DEFAULT_RULES.categoryDefaultLocations, ...(parsed.categoryDefaultLocations || {}) }
      };
    }
  } catch (err) {
    console.error('[TaobaoRules] 读取规则配置文件失败，使用默认规则:', err.message);
  }
  return JSON.parse(JSON.stringify(DEFAULT_RULES));
}

function saveRules(newRules) {
  try {
    const dir = path.dirname(RULES_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const merged = {
      ignoreKeywords: Array.isArray(newRules.ignoreKeywords) ? newRules.ignoreKeywords.map(s => String(s).trim()).filter(Boolean) : DEFAULT_RULES.ignoreKeywords,
      cleanGarbageWords: Array.isArray(newRules.cleanGarbageWords) ? newRules.cleanGarbageWords.map(s => String(s).trim()).filter(Boolean) : DEFAULT_RULES.cleanGarbageWords,
      categoryDefaultLocations: { ...DEFAULT_RULES.categoryDefaultLocations, ...(newRules.categoryDefaultLocations || {}) }
    };
    fs.writeFileSync(RULES_PATH, JSON.stringify(merged, null, 2), 'utf8');
    return merged;
  } catch (err) {
    console.error('[TaobaoRules] 保存规则配置文件失败:', err.message);
    throw err;
  }
}

function resetRules() {
  try {
    if (fs.existsSync(RULES_PATH)) {
      fs.unlinkSync(RULES_PATH);
    }
  } catch (err) {
    // ignore
  }
  return JSON.parse(JSON.stringify(DEFAULT_RULES));
}

module.exports = {
  DEFAULT_RULES,
  getRules,
  saveRules,
  resetRules
};
