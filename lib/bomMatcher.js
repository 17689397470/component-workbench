/**
 * 通用 BOM 智能查重与红绿蓝四色比对引擎 (lib/bomMatcher.js)
 * 支持 CSV / Excel / 剪贴板直接粘贴任意文本导入、交互式列映射微调、
 * 阻容等效换算匹配、耐压/精度向下兼容替代推荐、同类物料位号区间智能聚合、
 * 打样套数倍数放大、按物理货位流转拣料单生成与立创商城一键下单格式导出。
 */

const XLSX = require('xlsx');
const { parseComponentText, normalizePackage, parseVoltage, parseTolerance } = require('./parser');

/**
 * 识别主流 EDA 软件导出模版
 */
function detectEDATemplate(headers) {
  const headerStr = headers.join(' ').toLowerCase();
  if (
    headerStr.includes('立创') ||
    headerStr.includes('c编号') ||
    headerStr.includes('lcsc') ||
    (headerStr.includes('器件') && headerStr.includes('位号'))
  ) {
    return '嘉立创EDA (EasyEDA)';
  }
  if (headerStr.includes('reference') && headerStr.includes('value') && headerStr.includes('footprint')) {
    return 'KiCad EDA';
  }
  if (
    (headerStr.includes('designator') || headerStr.includes('comment')) &&
    headerStr.includes('footprint') &&
    (headerStr.includes('quantity') || headerStr.includes('qty'))
  ) {
    return 'Altium Designer';
  }
  return '标准工程 BOM';
}

/**
 * 根据表头关键字智能推测映射列
 */
function guessColumns(headers) {
  const map = {
    partCol: -1,        // 器件型号 / 名称 / Comment / Value / 规格
    footprintCol: -1,   // 封装 / Footprint / Package
    designatorCol: -1,  // 位号 / Designator / Refs
    quantityCol: -1,    // 数量 / Qty / Quantity / 用量
    lcscCol: -1         // 立创编号 / C编号 / LCSC
  };

  headers.forEach((h, idx) => {
    const name = String(h || '').toLowerCase().trim();
    // 型号列
    if (map.partCol === -1 && (
      name.includes('comment') || name.includes('value') || name.includes('型号') ||
      name.includes('名称') || name.includes('器件') || name.includes('mpn') ||
      name.includes('description') || name === 'name' || name.includes('物料')
    )) {
      map.partCol = idx;
    }

    // 封装列
    if (map.footprintCol === -1 && (
      name.includes('footprint') || name.includes('package') || name.includes('封装') ||
      (name.includes('规格') && !name.includes('型号'))
    )) {
      map.footprintCol = idx;
    }

    // 位号列
    if (map.designatorCol === -1 && (
      name.includes('designator') || name.includes('位号') || name.includes('ref') ||
      name.includes('refs') || name.includes('reference')
    )) {
      map.designatorCol = idx;
    }

    // 数量列
    if (map.quantityCol === -1 && (
      name.includes('qty') || name.includes('quantity') || name.includes('数量') ||
      name.includes('用量') || name.includes('count') || name.includes('件数')
    )) {
      map.quantityCol = idx;
    }

    // 立创编号
    if (map.lcscCol === -1 && (
      name.includes('lcsc') || name.includes('立创') || name.includes('c编号') ||
      name.includes('part #') || name.includes('元件编号')
    )) {
      map.lcscCol = idx;
    }
  });

  // 兜底默认值
  if (map.partCol === -1 && headers.length > 0) map.partCol = 0;
  if (map.footprintCol === -1 && headers.length > 1) map.footprintCol = 1;
  if (map.quantityCol === -1) {
    const qtyIdx = headers.findIndex(h => /qty|数量|用量/i.test(String(h)));
    map.quantityCol = qtyIdx !== -1 ? qtyIdx : (headers.length > 2 ? 2 : 0);
  }

  return map;
}

/**
 * 解析上传的 BOM 文件 (Buffer)，返回表头、前10行数据预览及自动推测的列映射
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
      rowStr.includes('立创') || rowStr.includes('c编号') || rowStr.includes('value')
    ) {
      headerIndex = i;
      break;
    }
  }

  const rawHeaders = rows[headerIndex].map(h => String(h || '').trim());
  const dataRows = rows.slice(headerIndex + 1).filter(r => r.some(c => String(c).trim() !== ''));

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
 * 直接解析剪贴板或文本框中的纯文本 BOM (制表符TSV、逗号CSV、分号等)
 */
function parseBOMText(text) {
  if (!text || !text.trim()) {
    throw new Error('粘贴的文本内容为空');
  }

  const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (rawLines.length === 0) {
    throw new Error('未检测到有效的文本行');
  }

  // 侦测行内分隔符：制表符、逗号、分号
  const firstFew = rawLines.slice(0, Math.min(rawLines.length, 6)).join('\n');
  const tabCount = (firstFew.match(/\t/g) || []).length;
  const commaCount = (firstFew.match(/,/g) || []).length;
  const semicolonCount = (firstFew.match(/;/g) || []).length;

  let delimiter = '\t';
  if (tabCount >= commaCount && tabCount >= semicolonCount && tabCount > 0) {
    delimiter = '\t';
  } else if (commaCount > tabCount && commaCount >= semicolonCount) {
    delimiter = ',';
  } else if (semicolonCount > tabCount && semicolonCount > commaCount) {
    delimiter = ';';
  }

  // 简易带引号拆分
  const splitLine = (line, delim) => {
    if (delim === '\t') {
      return line.split('\t').map(c => c.trim().replace(/^"(.*)"$/, '$1'));
    }
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delim && !inQuotes) {
        result.push(cur.trim().replace(/^"(.*)"$/, '$1'));
        cur = '';
      } else {
        cur += char;
      }
    }
    result.push(cur.trim().replace(/^"(.*)"$/, '$1'));
    return result;
  };

  const rows = rawLines.map(l => splitLine(l, delimiter));
  if (rows.length === 0) {
    throw new Error('BOM 文本未能拆分出有效数据行');
  }

  // 寻找表头行
  let headerIndex = 0;
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const rowStr = rows[i].join(' ').toLowerCase();
    if (
      rowStr.includes('comment') || rowStr.includes('footprint') || rowStr.includes('designator') ||
      rowStr.includes('型号') || rowStr.includes('封装') || rowStr.includes('位号') ||
      rowStr.includes('数量') || rowStr.includes('qty') || rowStr.includes('器件') ||
      rowStr.includes('立创') || rowStr.includes('c编号') || rowStr.includes('value')
    ) {
      headerIndex = i;
      break;
    }
  }

  const rawHeaders = rows[headerIndex].map(h => String(h || '').trim());
  const dataRows = rows.slice(headerIndex + 1).filter(r => r.some(c => String(c).trim() !== ''));

  const autoMapping = guessColumns(rawHeaders);
  const detectedTemplate = detectEDATemplate(rawHeaders);

  return {
    headers: rawHeaders,
    headerIndex,
    preview: dataRows.slice(0, 10),
    totalRows: dataRows.length,
    autoMapping,
    detectedTemplate,
    dataRows
  };
}

/**
 * 智能合并位号区间 (如 C1, C2, C3, C4, C6 -> C1-C4, C6)
 */
function formatDesignatorRanges(designatorList) {
  if (!designatorList) return '';
  let items = [];
  if (Array.isArray(designatorList)) {
    items = designatorList;
  } else if (typeof designatorList === 'string') {
    items = designatorList.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
  }
  if (items.length === 0) return '';

  const parsed = [];
  for (const raw of items) {
    const clean = raw.trim();
    if (!clean) continue;
    const match = clean.match(/^([A-Za-z_-]+)(\d+)$/);
    if (match) {
      parsed.push({ prefix: match[1].toUpperCase(), num: parseInt(match[2], 10), raw: clean });
    } else {
      parsed.push({ prefix: '__OTHER__', num: -1, raw: clean });
    }
  }

  const groups = {};
  for (const item of parsed) {
    if (!groups[item.prefix]) groups[item.prefix] = [];
    groups[item.prefix].push(item);
  }

  const resultSegments = [];
  const prefixes = Object.keys(groups).sort((a, b) => {
    if (a === '__OTHER__') return 1;
    if (b === '__OTHER__') return -1;
    return a.localeCompare(b);
  });

  for (const prefix of prefixes) {
    if (prefix === '__OTHER__') {
      resultSegments.push(...groups[prefix].map(x => x.raw));
      continue;
    }
    // 按数字升序排序并去重
    const sorted = groups[prefix]
      .filter((v, idx, arr) => arr.findIndex(x => x.num === v.num) === idx)
      .sort((a, b) => a.num - b.num);

    let start = 0;
    while (start < sorted.length) {
      let end = start;
      while (end + 1 < sorted.length && sorted[end + 1].num === sorted[end].num + 1) {
        end++;
      }
      if (end >= start + 2) {
        resultSegments.push(`${prefix}${sorted[start].num}-${prefix}${sorted[end].num}`);
      } else if (end === start + 1) {
        resultSegments.push(`${prefix}${sorted[start].num}, ${prefix}${sorted[end].num}`);
      } else {
        resultSegments.push(`${prefix}${sorted[start].num}`);
      }
      start = end + 1;
    }
  }

  return resultSegments.join(', ');
}

/**
 * 核心查重与比对算法 (支持倍数放大、同类聚合、高容差向上代换及自定义规则)
 * @param {Array} bomRows - 数据行数组
 * @param {Object} mapping - 列映射关系 { partCol, footprintCol, designatorCol, quantityCol, lcscCol }
 * @param {Array} stockList - 数据库现有全部元器件
 * @param {Object} options - { multiplier: number, aggregate: boolean, customRules: Array }
 */
function compareBOMWithStock(bomRows, mapping, stockList, options = {}) {
  const multiplier = Math.max(1, parseInt(options.multiplier, 10) || 1);
  const shouldAggregate = options.aggregate !== false; // 默认开启同类合并
  const customRules = Array.isArray(options.customRules) ? options.customRules : [];

  // 1. 预处理数据行：提取标准字段
  const flatItems = [];
  for (let i = 0; i < bomRows.length; i++) {
    const row = bomRows[i];
    const rawPart = String(row[mapping.partCol] || '').trim();
    if (!rawPart) continue; // 跳过空行

    const rawFootprint = mapping.footprintCol >= 0 ? String(row[mapping.footprintCol] || '').trim() : '';
    const rawDesignators = mapping.designatorCol >= 0 ? String(row[mapping.designatorCol] || '').trim() : '';
    let unitQty = mapping.quantityCol >= 0 ? parseInt(row[mapping.quantityCol], 10) : 1;
    if (isNaN(unitQty) || unitQty <= 0) unitQty = 1;

    const rawLcsc = mapping.lcscCol >= 0 ? String(row[mapping.lcscCol] || '').trim().toUpperCase() : '';

    flatItems.push({
      originalRowIndex: i + 1,
      partName: rawPart,
      footprint: rawFootprint,
      designators: rawDesignators,
      unitQty,
      qtyNeeded: unitQty * multiplier,
      lcscPart: rawLcsc,
      multiplier
    });
  }

  // 2. 根据 aggregate 选项决定比对的工作集 (聚合项 或 逐行项)
  let itemsToCompare = [];
  if (shouldAggregate) {
    const groupMap = new Map();
    for (const item of flatItems) {
      // 聚合 key: 优先使用立创编号；若无则使用 标准化型号 + 标准化封装
      const normPkg = normalizePackage(item.footprint) || item.footprint.toUpperCase();
      const normName = item.partName.toUpperCase().replace(/\s+/g, '');
      const groupKey = item.lcscPart ? `LCSC:${item.lcscPart}` : `NAME:${normName}|PKG:${normPkg}`;

      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          partName: item.partName,
          footprint: item.footprint,
          lcscPart: item.lcscPart,
          unitQty: 0,
          qtyNeeded: 0,
          multiplier,
          designatorList: [],
          rawRows: []
        });
      }

      const grp = groupMap.get(groupKey);
      grp.unitQty += item.unitQty;
      grp.qtyNeeded += item.qtyNeeded;
      if (item.designators) {
        grp.designatorList.push(...item.designators.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean));
      }
      grp.rawRows.push({
        rowIndex: item.originalRowIndex,
        designator: item.designators,
        quantity: item.qtyNeeded,
        unitQty: item.unitQty
      });
    }

    let grpIndex = 1;
    for (const grp of groupMap.values()) {
      const formattedDes = formatDesignatorRanges(grp.designatorList);
      itemsToCompare.push({
        rowIndex: grpIndex++,
        partName: grp.partName,
        footprint: grp.footprint,
        designators: formattedDes || (grp.designatorList.length > 0 ? grp.designatorList.join(', ') : ''),
        unitQty: grp.unitQty,
        qtyNeeded: grp.qtyNeeded,
        lcscPart: grp.lcscPart,
        multiplier,
        rawRows: grp.rawRows
      });
    }
  } else {
    itemsToCompare = flatItems.map((item, idx) => ({
      rowIndex: idx + 1,
      partName: item.partName,
      footprint: item.footprint,
      designators: item.designators,
      unitQty: item.unitQty,
      qtyNeeded: item.qtyNeeded,
      lcscPart: item.lcscPart,
      multiplier,
      rawRows: [{ rowIndex: item.originalRowIndex, designator: item.designators, quantity: item.qtyNeeded }]
    }));
  }

  // 3. 执行单项比对
  const summary = {
    exactMatchCount: 0,   // 🟩 完全现货免买
    substituteCount: 0,   // 🟦 可兼容替代
    lowStockCount: 0,     // 🟨 库存不足需补
    lackCount: 0,         // 🟥 确无现货需采购
    totalItems: 0,
    totalQtyNeeded: 0,
    totalShortageQty: 0
  };

  const results = [];

  for (const item of itemsToCompare) {
    const rawPart = item.partName;
    const rawFootprint = item.footprint;
    const rawLcsc = item.lcscPart;
    const qtyNeeded = item.qtyNeeded;

    const parsedBom = parseComponentText(`${rawPart} ${rawFootprint}`);
    const bomPkg = normalizePackage(rawFootprint) || parsedBom.package;
    const bomVolt = parseVoltage(rawPart) || parseVoltage(rawFootprint);
    const bomTol = parseTolerance(rawPart) || parseTolerance(rawFootprint);

    let bestMatch = null;
    let matchType = 'LACK';
    let substituteOption = null;

    // A. 优先匹配用户手动指定的持久化替代规则
    if (customRules.length > 0) {
      const rule = customRules.find(r =>
        (rawLcsc && r.target_part && r.target_part.toUpperCase() === rawLcsc) ||
        (r.target_part && r.target_part.toLowerCase() === rawPart.toLowerCase())
      );
      if (rule) {
        const customStock = stockList.find(s => s.id === rule.substitute_part_id || s.name === rule.substitute_name);
        if (customStock) {
          substituteOption = {
            component: customStock,
            reason: `⭐ 已记忆自定义替代规则: ${rule.note || '用户历史偏好映射'} (余量: ${customStock.quantity} 件)`,
            isFullSubstitute: true,
            ruleId: rule.id
          };
          matchType = 'SUBSTITUTE_AVAILABLE';
        }
      }
    }

    // B. 立创编号精确匹配
    if (!bestMatch && !substituteOption && rawLcsc) {
      const lcscMatched = stockList.find(s => s.lcsc_part && s.lcsc_part.toUpperCase() === rawLcsc);
      if (lcscMatched) {
        bestMatch = lcscMatched;
        matchType = lcscMatched.quantity >= qtyNeeded ? 'EXACT_MATCH' : (lcscMatched.quantity > 0 ? 'LOW_STOCK' : 'LACK');
      }
    }

    // C. 阻容参数或芯片型号匹配
    if (!bestMatch && !substituteOption) {
      for (const stock of stockList) {
        const stockPkg = normalizePackage(stock.package);
        const pkgMatches = !bomPkg || !stockPkg || bomPkg === stockPkg;

        // 1) 电阻/电容标准值比对
        if (
          parsedBom.category === stock.category &&
          parsedBom.standard_value !== null &&
          stock.standard_value !== null &&
          parsedBom.standard_value === stock.standard_value
        ) {
          if (pkgMatches) {
            // 电容耐压判定
            if (parsedBom.category === '电容') {
              const reqV = bomVolt || 0;
              const curV = stock.voltage || 50;
              if (reqV > 0 && curV < reqV) {
                // 库存耐压过低，不能替代
                continue;
              }
              // 库存耐压严格高于需求耐压 (如需求 16V，库存 50V)，作为建议高耐压向下兼容替代
              if (reqV > 0 && curV > reqV) {
                if (stock.quantity >= qtyNeeded) {
                  substituteOption = {
                    component: stock,
                    reason: `💡 高耐压向下兼容：库存有 ${stock.value || ''} ${curV}V ${stock.package} (余量: ${stock.quantity} 件)`,
                    isFullSubstitute: true
                  };
                  matchType = 'SUBSTITUTE_AVAILABLE';
                  break;
                }
              }
            }

            // 电阻精度判定 (BOM 需求 5%，库存 1% 或 0.1% 高精度向下兼容)
            if (parsedBom.category === '电阻' && bomTol) {
              const stockTol = stock.tolerance || parseTolerance(stock.name) || '1%';
              const reqTolNum = parseFloat(bomTol);
              const curTolNum = parseFloat(stockTol);
              if (!isNaN(reqTolNum) && !isNaN(curTolNum) && curTolNum < reqTolNum) {
                if (stock.quantity >= qtyNeeded) {
                  substituteOption = {
                    component: stock,
                    reason: `💡 高精度向下兼容：需求精度 ${bomTol}，库存有 ${stockTol} 更高精度 ${stock.package} (余量: ${stock.quantity} 件)`,
                    isFullSubstitute: true
                  };
                  matchType = 'SUBSTITUTE_AVAILABLE';
                  break;
                }
              }
            }

            // 完全匹配常规现货
            if (stock.quantity >= qtyNeeded) {
              bestMatch = stock;
              matchType = 'EXACT_MATCH';
              break;
            } else if (stock.quantity > 0) {
              bestMatch = stock;
              matchType = 'LOW_STOCK';
              break;
            }
          } else {
            // 阻容值一致但封装相近 (0603 vs 0805)，作为同值手工焊代换备选
            if (!substituteOption && stock.quantity >= qtyNeeded) {
              substituteOption = {
                component: stock,
                reason: `同阻容跨封装代用：库存有 ${stock.package} ${stock.value || stock.name} (余量: ${stock.quantity})`,
                isFullSubstitute: false
              };
            }
          }
        }

        // 2) 芯片/二极管/三极管 型号字符匹配
        if (
          parsedBom.category === stock.category &&
          (stock.category === '芯片' || stock.category === '二极管' || stock.category === '三极管/MOS' || stock.category === '模块')
        ) {
          const bomNameClean = parsedBom.name.toUpperCase().replace(/[^A-Z0-9]/g, '');
          const stockNameClean = stock.name.toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (bomNameClean === stockNameClean || stockNameClean.includes(bomNameClean) || bomNameClean.includes(stockNameClean)) {
            if (pkgMatches) {
              if (stock.quantity >= qtyNeeded) {
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

    // D. 兜底电容高耐压兜底搜索 (BOM 16V，库存 50V)
    if (!bestMatch && !substituteOption && parsedBom.category === '电容' && parsedBom.standard_value !== null) {
      for (const stock of stockList) {
        const stockPkg = normalizePackage(stock.package);
        const pkgMatches = !bomPkg || !stockPkg || bomPkg === stockPkg;
        if (stock.category === '电容' && stock.standard_value === parsedBom.standard_value && pkgMatches && stock.quantity >= qtyNeeded) {
          const reqV = bomVolt || 0;
          const curV = stock.voltage || 50;
          if (curV >= reqV) {
            substituteOption = {
              component: stock,
              reason: `💡 高耐压向下兼容：库存有 ${stock.value || stock.name} ${curV}V ${stock.package} (余量: ${stock.quantity} 件)`,
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
      shortageQty = Math.max(0, qtyNeeded - (bestMatch.quantity || 0));
    } else if (matchType === 'LACK') {
      shortageQty = qtyNeeded;
    }

    const itemResult = {
      rowIndex: item.rowIndex,
      partName: item.partName,
      footprint: item.footprint,
      designators: item.designators,
      unitQty: item.unitQty,
      qtyNeeded,
      multiplier,
      shortageQty,
      lcscPart: item.lcscPart,
      parsed: parsedBom,
      status: matchType,
      matchedStock: bestMatch,
      substituteOption,
      isAdoptedSubstitute: false,
      rawRows: item.rawRows || []
    };

    if (matchType === 'EXACT_MATCH') summary.exactMatchCount++;
    else if (matchType === 'SUBSTITUTE_AVAILABLE') summary.substituteCount++;
    else if (matchType === 'LOW_STOCK') summary.lowStockCount++;
    else summary.lackCount++;

    summary.totalItems++;
    summary.totalQtyNeeded += qtyNeeded;
    summary.totalShortageQty += shortageQty;

    results.push(itemResult);
  }

  return { summary, results };
}

/**
 * 生成按物理存放位置（收纳盒/仓位）分组排序的拣料清单
 */
function generatePickingList(comparisonResults) {
  const groupedByLocation = {};
  const flatPickList = [];

  for (const item of comparisonResults) {
    let targetComp = null;
    let isSub = false;
    let subReason = '';

    if (item.status === 'EXACT_MATCH' || item.status === 'LOW_STOCK') {
      targetComp = item.matchedStock;
    } else if (item.status === 'SUBSTITUTE_AVAILABLE' && item.isAdoptedSubstitute) {
      targetComp = item.substituteOption ? item.substituteOption.component : null;
      isSub = true;
      subReason = item.substituteOption ? item.substituteOption.reason : '';
    }

    if (targetComp) {
      const loc = (targetComp.location && targetComp.location.trim()) ? targetComp.location.trim() : '未标注位置';
      if (!groupedByLocation[loc]) {
        groupedByLocation[loc] = [];
      }

      const takeQty = item.status === 'LOW_STOCK'
        ? Math.min(item.qtyNeeded, targetComp.quantity)
        : item.qtyNeeded;

      const pickEntry = {
        id: targetComp.id,
        name: targetComp.name,
        package: targetComp.package,
        location: loc,
        box_name: targetComp.box_name || loc.split('-')[0] || '默认盒',
        takeQty,
        availableQty: targetComp.quantity,
        designators: item.designators,
        partName: item.partName,
        isSubstitute: isSub,
        substituteReason: subReason
      };

      groupedByLocation[loc].push(pickEntry);
      flatPickList.push(pickEntry);
    }
  }

  // 按仓位自然字典序重排
  const sortedLocationKeys = Object.keys(groupedByLocation).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  );

  const sortedGrouped = {};
  for (const k of sortedLocationKeys) {
    sortedGrouped[k] = groupedByLocation[k];
  }

  flatPickList.sort((a, b) =>
    a.location.localeCompare(b.location, undefined, { numeric: true, sensitivity: 'base' })
  );

  return sortedGrouped;
}

/**
 * 提取真实待采购清单（仅包含无货及需补差额物料），并生成立创商城批量导入下单文本
 */
function extractPurchaseShortageList(comparisonResults) {
  const shortages = [];
  const lcscRows = [];
  const noLcscRows = [];

  for (const item of comparisonResults) {
    // 若已采纳替代料或完全匹配，免买
    if (item.status === 'EXACT_MATCH' || (item.status === 'SUBSTITUTE_AVAILABLE' && item.isAdoptedSubstitute)) {
      continue;
    }

    let missingQty = item.qtyNeeded;
    let reason = '手头完全无现货';

    if (item.status === 'LOW_STOCK' && item.matchedStock) {
      missingQty = Math.max(0, item.qtyNeeded - item.matchedStock.quantity);
      reason = `库存不足 (总需 ${item.qtyNeeded} 件，手头仅有 ${item.matchedStock.quantity} 件)`;
    } else if (item.status === 'SUBSTITUTE_AVAILABLE' && !item.isAdoptedSubstitute) {
      reason = '有相近替代料但尚未采纳';
    }

    const shortageEntry = {
      rowIndex: item.rowIndex,
      partName: item.partName,
      footprint: item.footprint,
      designators: item.designators,
      qtyNeeded: item.qtyNeeded,
      missingQty,
      lcscPart: item.lcscPart,
      reason
    };

    shortages.push(shortageEntry);

    // 分类构建立创商城快速采购格式
    if (item.lcscPart && item.lcscPart.trim()) {
      lcscRows.push(`${item.lcscPart.trim()},${missingQty}`);
    } else {
      noLcscRows.push(`${item.partName} (${item.footprint || '通用封装'}) x${missingQty} [${item.designators || '-'}]`);
    }
  }

  // 生成立创商城专属批量导入文本
  const lcscBatchText = lcscRows.join('\n');
  const humanReadableListText = [
    lcscRows.length > 0 ? `=== 🛒 立创商城一键下单编码 ===\n${lcscBatchText}` : '',
    noLcscRows.length > 0 ? `=== 📋 其他需手动采购物料 ===\n${noLcscRows.join('\n')}` : ''
  ].filter(Boolean).join('\n\n');

  // 挂载辅助属性在数组上，保证向后兼容性
  shortages.lcscBatchText = lcscBatchText;
  shortages.humanReadableListText = humanReadableListText;
  shortages.totalShortageItems = shortages.length;

  return shortages;
}

module.exports = {
  detectEDATemplate,
  guessColumns,
  parseBOMFile,
  parseBOMText,
  formatDesignatorRanges,
  compareBOMWithStock,
  generatePickingList,
  extractPurchaseShortageList
};
