/**
 * 通用 BOM 智能查重与红绿蓝四色比对引擎 (lib/bomMatcher.js)
 * 支持 CSV / Excel 任意列结构导入、交互式列映射、
 * 阻容等效换算匹配、耐压/精度向下兼容替代推荐、按箱聚合拣料单生成与缺料采购单导出。
 */

const XLSX = require('xlsx');
const { parseComponentText, normalizePackage } = require('./parser');

/**
 * 解析上传的 BOM 文件，返回表头、前10行数据预览及自动推测的列映射
 */
function parseBOMFile(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];

  // 读取所有行（保留二维数组形式）
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
  if (!rows || rows.length === 0) {
    throw new Error('BOM 文件内容为空或无法解析');
  }

  // 寻找真正的表头行（跳过前几行的标题或元信息）
  let headerIndex = 0;
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const rowStr = rows[i].join(' ').toLowerCase();
    if (
      rowStr.includes('comment') || rowStr.includes('footprint') || rowStr.includes('designator') ||
      rowStr.includes('型号') || rowStr.includes('封装') || rowStr.includes('位号') ||
      rowStr.includes('数量') || rowStr.includes('qty') || rowStr.includes('器件') ||
      rowStr.includes('立创') || rowStr.includes('c编号')
    ) {
      headerIndex = i;
      break;
    }
  }

  const rawHeaders = rows[headerIndex].map(h => String(h || '').trim());
  const dataRows = rows.slice(headerIndex + 1).filter(r => r.some(c => String(c).trim() !== ''));

  // 自动推测列索引与识别 EDA 模版
  const autoMapping = guessColumns(rawHeaders);
  const detectedTemplate = detectEDATemplate(rawHeaders);

  return {
    sheetNames: workbook.SheetNames,
    activeSheet: firstSheetName,
    headerIndex,
    headers: rawHeaders,
    preview: dataRows.slice(0, 10),
    totalRows: dataRows.length,
    autoMapping,
    detectedTemplate,
    dataRows
  };
}

/**
 * 识别主流 EDA 软件导出模版
 */
function detectEDATemplate(headers) {
  const headerStr = headers.join(' ').toLowerCase();
  if (headerStr.includes('立创') || headerStr.includes('c编号') || headerStr.includes('lcsc') || (headerStr.includes('器件') && headerStr.includes('位号'))) {
    return '嘉立创EDA (EasyEDA)';
  }
  if (headerStr.includes('reference') && headerStr.includes('value') && headerStr.includes('footprint')) {
    return 'KiCad EDA';
  }
  if ((headerStr.includes('designator') || headerStr.includes('comment')) && headerStr.includes('footprint') && (headerStr.includes('quantity') || headerStr.includes('qty'))) {
    return 'Altium Designer';
  }
  return '标准工程 BOM';
}

/**
 * 根据表头关键字智能推测映射列
 */
function guessColumns(headers) {
  const map = {
    partCol: -1,        // 器件型号 / 名称 / Comment / Value
    footprintCol: -1,   // 封装 / Footprint / Package
    designatorCol: -1,  // 位号 / Designator / Refs
    quantityCol: -1,    // 数量 / Qty / Quantity
    lcscCol: -1         // 立创编号 / C编号 / LCSC
  };

  headers.forEach((h, idx) => {
    const name = h.toLowerCase();
    // 型号列
    if (map.partCol === -1 && (
      name.includes('comment') || name.includes('value') || name.includes('型号') ||
      name.includes('名称') || name.includes('器件') || name.includes('mpn') ||
      name.includes('description') || name === 'name'
    )) {
      map.partCol = idx;
    }

    // 封装列
    if (map.footprintCol === -1 && (
      name.includes('footprint') || name.includes('package') || name.includes('封装') || name.includes('规格')
    )) {
      map.footprintCol = idx;
    }

    // 位号列
    if (map.designatorCol === -1 && (
      name.includes('designator') || name.includes('位号') || name.includes('ref') || name.includes('refs')
    )) {
      map.designatorCol = idx;
    }

    // 数量列
    if (map.quantityCol === -1 && (
      name.includes('qty') || name.includes('quantity') || name.includes('数量') || name.includes('用量') || name.includes('count')
    )) {
      map.quantityCol = idx;
    }

    // 立创编号
    if (map.lcscCol === -1 && (
      name.includes('lcsc') || name.includes('立创') || name.includes('c编号') || name.includes('part #')
    )) {
      map.lcscCol = idx;
    }
  });

  // 兜底默认值
  if (map.partCol === -1 && headers.length > 0) map.partCol = 0;
  if (map.footprintCol === -1 && headers.length > 1) map.footprintCol = 1;
  if (map.quantityCol === -1) {
    const qtyIdx = headers.findIndex(h => /qty|数量/i.test(h));
    map.quantityCol = qtyIdx !== -1 ? qtyIdx : (headers.length > 2 ? 2 : 0);
  }

  return map;
}

/**
 * 核心查重与比对算法
 * @param {Array} bomRows - 数据行数组
 * @param {Object} mapping - 列映射关系 { partCol, footprintCol, designatorCol, quantityCol, lcscCol }
 * @param {Array} stockList - 数据库现有全部元器件
 */
function compareBOMWithStock(bomRows, mapping, stockList) {
  const results = [];
  const summary = {
    exactMatchCount: 0,   // 🟩 完全现货免买
    substituteCount: 0,   // 🟦 可兼容替代
    lowStockCount: 0,     // 🟨 库存不足需补
    lackCount: 0,         // 🟥 确无现货需采购
    totalItems: 0
  };

  for (let i = 0; i < bomRows.length; i++) {
    const row = bomRows[i];
    const rawPart = String(row[mapping.partCol] || '').trim();
    if (!rawPart) continue; // 跳过空行

    const rawFootprint = mapping.footprintCol >= 0 ? String(row[mapping.footprintCol] || '').trim() : '';
    const rawDesignators = mapping.designatorCol >= 0 ? String(row[mapping.designatorCol] || '').trim() : '';
    let rawQty = mapping.quantityCol >= 0 ? parseInt(row[mapping.quantityCol], 10) : 1;
    if (isNaN(rawQty) || rawQty <= 0) rawQty = 1;

    const rawLcsc = mapping.lcscCol >= 0 ? String(row[mapping.lcscCol] || '').trim().toUpperCase() : '';

    // 解析当前 BOM 项
    const parsedBom = parseComponentText(`${rawPart} ${rawFootprint}`);
    const bomPkg = normalizePackage(rawFootprint) || parsedBom.package;

    let bestMatch = null;
    let matchType = 'LACK'; // 默认无现货
    let substituteOption = null;

    // 1. 先尝试立创编号精确匹配
    if (rawLcsc) {
      const lcscMatched = stockList.find(s => s.lcsc_part && s.lcsc_part.toUpperCase() === rawLcsc);
      if (lcscMatched) {
        bestMatch = lcscMatched;
        matchType = lcscMatched.quantity >= rawQty ? 'EXACT_MATCH' : 'LOW_STOCK';
      }
    }

    // 2. 若未匹配，尝试阻容参数完全匹配 或 芯片型号完全匹配
    if (!bestMatch) {
      for (const stock of stockList) {
        const stockPkg = normalizePackage(stock.package);
        const pkgMatches = !bomPkg || !stockPkg || bomPkg === stockPkg;

        // 电阻/电容标准值比对
        if (
          parsedBom.category === stock.category &&
          parsedBom.standard_value !== null &&
          stock.standard_value !== null &&
          parsedBom.standard_value === stock.standard_value
        ) {
          if (pkgMatches) {
            // 封装一致，检查耐压向下兼容
            if (parsedBom.category === '电容' && parsedBom.voltage && stock.voltage && stock.voltage < parsedBom.voltage) {
              // 库存耐压反而低于BOM需求，不满足
              continue;
            }

            // 若电容库存耐压严格高于需求耐压 (如 BOM 16V, 库存 50V)，归为建议替代项
            if (parsedBom.category === '电容' && parsedBom.voltage && stock.voltage && stock.voltage > parsedBom.voltage) {
              if (stock.quantity >= rawQty) {
                substituteOption = {
                  component: stock,
                  reason: `💡 高耐压向下兼容：库存有 ${stock.value} ${stock.voltage}V ${stock.package} (现存: ${stock.quantity} 件)`,
                  isFullSubstitute: true
                };
                matchType = 'SUBSTITUTE_AVAILABLE';
                break;
              }
            }

            if (stock.quantity >= rawQty) {
              bestMatch = stock;
              matchType = 'EXACT_MATCH';
              break;
            } else if (stock.quantity > 0) {
              bestMatch = stock;
              matchType = 'LOW_STOCK';
              break;
            }
          } else {
            // 阻容值一致但封装不同（例如 BOM 0603，库存 0805），作为弱替代备选
            if (!substituteOption && stock.quantity >= rawQty) {
              substituteOption = {
                component: stock,
                reason: `同值不同封装：库存有 ${stock.package} ${stock.value} (余量: ${stock.quantity})`,
                isFullSubstitute: false
              };
            }
          }
        }

        // 芯片/二极管/三极管 型号字符匹配
        if (parsedBom.category === stock.category && (stock.category === '芯片' || stock.category === '二极管' || stock.category === '三极管/MOS' || stock.category === '模块')) {
          const bomNameClean = parsedBom.name.toUpperCase().replace(/[^A-Z0-9]/g, '');
          const stockNameClean = stock.name.toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (bomNameClean === stockNameClean || stockNameClean.includes(bomNameClean) || bomNameClean.includes(stockNameClean)) {
            if (pkgMatches) {
              if (stock.quantity >= rawQty) {
                bestMatch = stock;
                matchType = 'EXACT_MATCH';
                break;
              } else if (stock.quantity > 0) {
                bestMatch = stock;
                matchType = 'LOW_STOCK';
                break;
              }
            }
          }
        }
      }
    }

    // 3. 寻找电容高耐压兼容替代 (BOM 要 16V，库存有 50V，且同容值同封装)
    if (!bestMatch && parsedBom.category === '电容' && parsedBom.standard_value !== null) {
      for (const stock of stockList) {
        const stockPkg = normalizePackage(stock.package);
        const pkgMatches = !bomPkg || !stockPkg || bomPkg === stockPkg;
        if (
          stock.category === '电容' &&
          stock.standard_value === parsedBom.standard_value &&
          pkgMatches &&
          stock.quantity >= rawQty
        ) {
          // 库存耐压高于或等于需求（或需求未标明耐压）
          const bomV = parsedBom.voltage || 0;
          const stockV = stock.voltage || 50;
          if (stockV >= bomV) {
            substituteOption = {
              component: stock,
              reason: `💡 高耐压向下兼容：库存有 ${stock.value} ${stock.voltage ? stock.voltage + 'V' : ''} ${stock.package} (现存: ${stock.quantity} 件)`,
              isFullSubstitute: true
            };
            matchType = 'SUBSTITUTE_AVAILABLE';
            break;
          }
        }
      }
    }

    let shortageQty = 0;
    if (matchType === 'LOW_STOCK' && bestMatch) {
      shortageQty = Math.max(0, rawQty - (bestMatch.quantity || 0));
    } else if (matchType === 'LACK') {
      shortageQty = rawQty;
    }

    // 汇总该物料状态
    const itemResult = {
      rowIndex: i + 1,
      partName: rawPart,
      footprint: rawFootprint,
      designators: rawDesignators,
      qtyNeeded: rawQty,
      shortageQty,
      lcscPart: rawLcsc,
      parsed: parsedBom,
      status: matchType, // EXACT_MATCH (绿), SUBSTITUTE_AVAILABLE (蓝), LOW_STOCK (黄), LACK (红)
      matchedStock: bestMatch,
      substituteOption: substituteOption,
      isAdoptedSubstitute: false, // 是否被用户点击采纳替代
      actionNeeded: matchType === 'EXACT_MATCH' ? 'FREE_PASS' : (matchType === 'SUBSTITUTE_AVAILABLE' ? 'CAN_SUBSTITUTE' : 'NEED_PURCHASE')
    };

    if (matchType === 'EXACT_MATCH') summary.exactMatchCount++;
    else if (matchType === 'SUBSTITUTE_AVAILABLE') summary.substituteCount++;
    else if (matchType === 'LOW_STOCK') summary.lowStockCount++;
    else summary.lackCount++;

    summary.totalItems++;
    results.push(itemResult);
  }

  return { summary, results };
}

/**
 * 生成按物理存放位置（收纳箱/抽屉/自封袋）分组的拣料清单
 */
function generatePickingList(comparisonResults) {
  const groupedByLocation = {};

  for (const item of comparisonResults) {
    let targetComp = null;
    if (item.status === 'EXACT_MATCH' || item.status === 'LOW_STOCK') {
      targetComp = item.matchedStock;
    } else if (item.status === 'SUBSTITUTE_AVAILABLE' && item.isAdoptedSubstitute) {
      targetComp = item.substituteOption ? item.substituteOption.component : null;
    }

    if (targetComp) {
      const loc = targetComp.location || '未标注位置';
      if (!groupedByLocation[loc]) {
        groupedByLocation[loc] = [];
      }
      groupedByLocation[loc].push({
        id: targetComp.id,
        name: targetComp.name,
        package: targetComp.package,
        takeQty: item.qtyNeeded,
        availableQty: targetComp.quantity,
        designators: item.designators,
        partName: item.partName
      });
    }
  }

  return groupedByLocation;
}

/**
 * 提取真实待采购清单（仅包含无货及需补差额的物料）
 */
function extractPurchaseShortageList(comparisonResults) {
  const shortages = [];

  for (const item of comparisonResults) {
    // 若已采纳替代料或完全匹配，免买
    if (item.status === 'EXACT_MATCH' || (item.status === 'SUBSTITUTE_AVAILABLE' && item.isAdoptedSubstitute)) {
      continue;
    }

    let missingQty = item.qtyNeeded;
    let reason = '手头完全无现货';

    if (item.status === 'LOW_STOCK' && item.matchedStock) {
      missingQty = item.qtyNeeded - item.matchedStock.quantity;
      reason = `库存不足 (需 ${item.qtyNeeded} 件，手头仅有 ${item.matchedStock.quantity} 件)`;
    } else if (item.status === 'SUBSTITUTE_AVAILABLE' && !item.isAdoptedSubstitute) {
      reason = '有相近替代料但未采纳';
    }

    shortages.push({
      partName: item.partName,
      footprint: item.footprint,
      designators: item.designators,
      qtyNeeded: item.qtyNeeded,
      missingQty,
      lcscPart: item.lcscPart,
      reason
    });
  }

  return shortages;
}

module.exports = {
  parseBOMFile,
  guessColumns,
  compareBOMWithStock,
  generatePickingList,
  extractPurchaseShortageList
};
