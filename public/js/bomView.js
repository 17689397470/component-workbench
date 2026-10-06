/**
 * Apple / Linear 沉浸式 BOM 查重比对工作台交互驱动 (public/js/bomView.js)
 * 具备主流 EDA 模版识别、折叠式列映射、双栏对齐 Pro Table、
 * 多维状态过滤与位号实时秒搜、一键采纳合规替代、
 * 带进度条的分盒拣料助手、缺料采购复制导出、以及出库安全明细预览。
 */

let currentBOMData = null;
let currentComparisonResults = null;
let currentBOMFilter = 'all'; // 'all' | 'EXACT_MATCH' | 'SUBSTITUTE_AVAILABLE' | 'LOW_STOCK' | 'LACK'
let currentBOMSearch = '';
let pickingCheckedItems = new Set(); // 记录照单拣料已核对打钩的物料 key

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function initBOMView() {
  const dropzone = document.getElementById('bom-dropzone');
  const fileInput = document.getElementById('bom-file-input');

  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleBOMUpload(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleBOMUpload(e.target.files[0]);
      }
    });
  }

  // 紧凑文件栏控制按钮
  const btnReupload = document.getElementById('btn-bom-reupload');
  if (btnReupload) {
    btnReupload.addEventListener('click', resetBOMUploadState);
  }

  const btnToggleMapping = document.getElementById('btn-toggle-mapping');
  if (btnToggleMapping) {
    btnToggleMapping.addEventListener('click', () => {
      const mappingDrawer = document.getElementById('bom-mapping-bar');
      if (mappingDrawer) {
        const isHidden = mappingDrawer.style.display === 'none' || !mappingDrawer.style.display;
        mappingDrawer.style.display = isHidden ? 'block' : 'none';
        btnToggleMapping.innerText = isHidden ? '收起列映射' : '⚙️ 列映射微调';
      }
    });
  }

  const btnRunCompare = document.getElementById('btn-run-compare');
  if (btnRunCompare) {
    btnRunCompare.addEventListener('click', runBOMComparison);
  }

  // 实时搜索框
  const searchInput = document.getElementById('bom-search-input');
  const btnClearSearch = document.getElementById('btn-bom-search-clear');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentBOMSearch = e.target.value.trim().toLowerCase();
      if (btnClearSearch) {
        btnClearSearch.style.display = currentBOMSearch ? 'inline-block' : 'none';
      }
      renderBOMProTableRows();
    });
  }

  // 底部操作坞按钮
  const btnPicking = document.getElementById('btn-dock-picking');
  if (btnPicking) {
    btnPicking.addEventListener('click', openBOMPickingModal);
  }

  const btnExportShortage = document.getElementById('btn-dock-export-shortage');
  if (btnExportShortage) {
    btnExportShortage.addEventListener('click', openBOMPurchaseModal);
  }

  const btnDeduct = document.getElementById('btn-dock-deduct');
  if (btnDeduct) {
    btnDeduct.addEventListener('click', openBOMDeductModal);
  }

  const btnSaveProject = document.getElementById('btn-dock-save-project');
  if (btnSaveProject) {
    btnSaveProject.addEventListener('click', () => {
      if (!currentComparisonResults || currentComparisonResults.length === 0) {
        alert('当前没有可转存的 BOM 比对数据');
        return;
      }
      const filename = currentBOMData ? currentBOMData.filename : 'BOM工程';
      if (window.openSaveBOMAsProjectModal) {
        window.openSaveBOMAsProjectModal(filename, currentComparisonResults);
      }
    });
  }
}

function resetBOMUploadState() {
  const dropzone = document.getElementById('bom-dropzone');
  const compactBar = document.getElementById('bom-compact-file-bar');
  const mappingDrawer = document.getElementById('bom-mapping-bar');
  const resultsArea = document.getElementById('bom-results-area');
  const fileInput = document.getElementById('bom-file-input');

  if (dropzone) dropzone.style.display = 'block';
  if (compactBar) compactBar.style.display = 'none';
  if (mappingDrawer) mappingDrawer.style.display = 'none';
  if (resultsArea) resultsArea.style.display = 'none';
  if (fileInput) fileInput.value = '';

  currentBOMData = null;
  currentComparisonResults = null;
  currentBOMFilter = 'all';
  currentBOMSearch = '';
  pickingCheckedItems.clear();
}

async function handleBOMUpload(file) {
  const formData = new FormData();
  formData.append('bomFile', file);

  const dropzone = document.getElementById('bom-dropzone');
  const origDropzoneHtml = dropzone ? dropzone.innerHTML : '';
  if (dropzone) {
    dropzone.innerHTML = `
      <div style="font-size: 32px; margin-bottom: 8px;">⏳</div>
      <div style="font-size: 15px; font-weight: 600; color: var(--text-main);">正在智能解析 BOM 表格与表头模版...</div>
      <div style="font-size: 12px; color: var(--text-dim); margin-top: 4px;">自动识别型号、封装、用量、位号与立创元器件编号</div>
    `;
  }

  try {
    const res = await fetch('/api/bom/upload', { method: 'POST', body: formData });
    const result = await res.json();
    if (!result.success) {
      throw new Error(result.error || '解析失败');
    }

    currentBOMData = result.data;

    // 切换到紧凑型文件信息条
    if (dropzone) {
      dropzone.style.display = 'none';
      dropzone.innerHTML = origDropzoneHtml; // 还原供换文件使用
    }

    const compactBar = document.getElementById('bom-compact-file-bar');
    if (compactBar) compactBar.style.display = 'flex';

    const fnTag = document.getElementById('bom-filename-tag');
    if (fnTag) fnTag.innerText = result.filename;

    const countTag = document.getElementById('bom-count-tag');
    if (countTag) countTag.innerText = `共 ${result.data.totalRows} 项物料`;

    const tmplBadge = document.getElementById('bom-template-badge');
    if (tmplBadge) {
      tmplBadge.innerText = `⚡ ${result.data.detectedTemplate || '标准工程 BOM'}`;
    }

    populateColumnSelectors(result.data.headers, result.data.autoMapping);

    // 默认收起列映射抽屉，把空间留给结果表格
    const mappingDrawer = document.getElementById('bom-mapping-bar');
    if (mappingDrawer) mappingDrawer.style.display = 'none';

    // 自动触发第一次比对
    await runBOMComparison();
  } catch (err) {
    alert(`BOM 上传或解析异常: ${err.message}`);
    if (dropzone) {
      dropzone.style.display = 'block';
      dropzone.innerHTML = origDropzoneHtml;
    }
  }
}

function populateColumnSelectors(headers, autoMap) {
  const selects = [
    { el: document.getElementById('map-part-col'), selected: autoMap.partCol },
    { el: document.getElementById('map-footprint-col'), selected: autoMap.footprintCol },
    { el: document.getElementById('map-qty-col'), selected: autoMap.quantityCol },
    { el: document.getElementById('map-designator-col'), selected: autoMap.designatorCol },
    { el: document.getElementById('map-lcsc-col'), selected: autoMap.lcscCol }
  ];

  selects.forEach(({ el, selected }) => {
    if (!el) return;
    el.innerHTML = '<option value="-1">-- 不映射 / 无此列 --</option>';
    headers.forEach((h, idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      opt.text = `列 [${idx + 1}]: ${h}`;
      if (idx === selected) opt.selected = true;
      el.appendChild(opt);
    });
  });
}

async function runBOMComparison() {
  if (!currentBOMData) return;

  const btnRun = document.getElementById('btn-run-compare');
  const origBtnText = btnRun ? btnRun.innerText : '';
  if (btnRun) {
    btnRun.innerText = '正在比对库存...';
    btnRun.disabled = true;
  }

  const mapping = {
    partCol: parseInt(document.getElementById('map-part-col')?.value ?? -1, 10),
    footprintCol: parseInt(document.getElementById('map-footprint-col')?.value ?? -1, 10),
    quantityCol: parseInt(document.getElementById('map-qty-col')?.value ?? -1, 10),
    designatorCol: parseInt(document.getElementById('map-designator-col')?.value ?? -1, 10),
    lcscCol: parseInt(document.getElementById('map-lcsc-col')?.value ?? -1, 10)
  };

  try {
    const res = await fetch('/api/bom/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: currentBOMData.dataRows,
        mapping
      })
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || '比对失败');
    }

    currentComparisonResults = data.results || [];
    pickingCheckedItems.clear();

    const resultsArea = document.getElementById('bom-results-area');
    if (resultsArea) resultsArea.style.display = 'block';

    updateBOMStats();
    renderBOMProTableRows();
  } catch (err) {
    alert(`BOM 比对异常: ${err.message}`);
  } finally {
    if (btnRun) {
      btnRun.innerText = origBtnText;
      btnRun.disabled = false;
    }
  }
}

function setBOMFilter(filterType) {
  currentBOMFilter = filterType;
  document.querySelectorAll('#bom-filter-pill-group .filter-tab-pill').forEach(btn => {
    btn.classList.remove('active');
  });

  const filterBtnMap = {
    all: 'tab-bom-filter-all',
    EXACT_MATCH: 'tab-bom-filter-match',
    SUBSTITUTE_AVAILABLE: 'tab-bom-filter-sub',
    LOW_STOCK: 'tab-bom-filter-short',
    LACK: 'tab-bom-filter-lack'
  };

  const activeId = filterBtnMap[filterType] || 'tab-bom-filter-all';
  const activeBtn = document.getElementById(activeId);
  if (activeBtn) activeBtn.classList.add('active');

  renderBOMProTableRows();
}

function clearBOMSearch() {
  const searchInput = document.getElementById('bom-search-input');
  const btnClear = document.getElementById('btn-bom-search-clear');
  if (searchInput) searchInput.value = '';
  if (btnClear) btnClear.style.display = 'none';
  currentBOMSearch = '';
  renderBOMProTableRows();
}

function updateBOMStats() {
  if (!currentComparisonResults) return;

  let exact = 0, sub = 0, low = 0, lack = 0;
  currentComparisonResults.forEach(item => {
    if (item.status === 'EXACT_MATCH' || (item.status === 'SUBSTITUTE_AVAILABLE' && item.isAdoptedSubstitute)) {
      exact++;
    } else if (item.status === 'SUBSTITUTE_AVAILABLE') {
      sub++;
    } else if (item.status === 'LOW_STOCK') {
      low++;
    } else {
      lack++;
    }
  });

  const total = currentComparisonResults.length;
  const elAll = document.getElementById('stat-all-count');
  const elMatch = document.getElementById('stat-match-count');
  const elSub = document.getElementById('stat-sub-count');
  const elShort = document.getElementById('stat-short-count');
  const elLack = document.getElementById('stat-lack-count');

  if (elAll) elAll.innerText = total;
  if (elMatch) elMatch.innerText = exact;
  if (elSub) elSub.innerText = sub;
  if (elShort) elShort.innerText = low;
  if (elLack) elLack.innerText = lack;

  // 一键采纳全部合规替代料按钮控制
  const btnAdoptAll = document.getElementById('btn-adopt-all-substitutes');
  if (btnAdoptAll) {
    if (sub > 0) {
      btnAdoptAll.style.display = 'inline-block';
      btnAdoptAll.innerText = `⚡ 一键采纳全部替代 (${sub}项)`;
    } else {
      btnAdoptAll.style.display = 'none';
    }
  }
}

function renderBOMProTableRows() {
  const tbody = document.getElementById('bom-pro-table-tbody');
  if (!tbody || !currentComparisonResults) return;

  // 综合过滤：状态胶囊 + 实时搜索
  const filtered = currentComparisonResults.map((item, originalIndex) => ({ item, originalIndex })).filter(({ item }) => {
    // 状态过滤
    if (currentBOMFilter !== 'all') {
      if (currentBOMFilter === 'EXACT_MATCH') {
        const isMatch = item.status === 'EXACT_MATCH' || (item.status === 'SUBSTITUTE_AVAILABLE' && item.isAdoptedSubstitute);
        if (!isMatch) return false;
      } else if (currentBOMFilter === 'SUBSTITUTE_AVAILABLE') {
        if (item.status !== 'SUBSTITUTE_AVAILABLE' || item.isAdoptedSubstitute) return false;
      } else if (item.status !== currentBOMFilter) {
        return false;
      }
    }

    // 搜索过滤 (型号、封装、位号、立创编号、库存名、收纳盒)
    if (currentBOMSearch) {
      const q = currentBOMSearch;
      const part = (item.partName || '').toLowerCase();
      const pkg = (item.footprint || '').toLowerCase();
      const refs = (item.designators || '').toLowerCase();
      const lcsc = (item.lcscPart || '').toLowerCase();
      const matchedName = item.matchedStock ? (item.matchedStock.name || '').toLowerCase() : '';
      const matchedLoc = item.matchedStock ? (item.matchedStock.location || '').toLowerCase() : '';
      const subName = (item.substituteOption && item.substituteOption.component) ? (item.substituteOption.component.name || '').toLowerCase() : '';

      const matched = part.includes(q) || pkg.includes(q) || refs.includes(q) || lcsc.includes(q) ||
                      matchedName.includes(q) || matchedLoc.includes(q) || subName.includes(q);
      if (!matched) return false;
    }

    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--text-dim); padding: 48px 16px;">
          未检索到符合条件的 BOM 物料项
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(({ item, originalIndex }) => {
    const isEffectiveMatch = item.status === 'EXACT_MATCH' || (item.status === 'SUBSTITUTE_AVAILABLE' && item.isAdoptedSubstitute);
    const targetComp = (item.status === 'SUBSTITUTE_AVAILABLE' && item.substituteOption)
      ? item.substituteOption.component
      : item.matchedStock;

    // 行状态类
    let rowStatusClass = '';
    let statusBadgeHtml = '';

    if (isEffectiveMatch) {
      rowStatusClass = 'bom-row-match';
      if (item.isAdoptedSubstitute) {
        statusBadgeHtml = `<span class="bom-badge match" title="已采纳高耐压向下兼容替代现货">✔ 采用替代</span>`;
      } else {
        statusBadgeHtml = `<span class="bom-badge match">● 充足免买</span>`;
      }
    } else if (item.status === 'SUBSTITUTE_AVAILABLE') {
      rowStatusClass = 'bom-row-sub';
      statusBadgeHtml = `<span class="bom-badge sub" title="${escapeHtml(item.substituteOption?.reason || '')}">● 建议替代</span>`;
    } else if (item.status === 'LOW_STOCK') {
      rowStatusClass = 'bom-row-short';
      statusBadgeHtml = `<span class="bom-badge short">● 缺差额</span>`;
    } else {
      rowStatusClass = 'bom-row-lack';
      statusBadgeHtml = `<span class="bom-badge lack">● 必须采购</span>`;
    }

    // 需求侧封装与立创编号
    const pkgBadge = item.footprint ? `<span class="sub-tag-pill pro-td-mono" style="font-size: 11px;">${escapeHtml(item.footprint)}</span>` : '';
    const lcscBadge = item.lcscPart ? `<span class="sub-tag-pill" style="font-size: 11px; color: #0284c7; background: rgba(2, 132, 199, 0.08);">${escapeHtml(item.lcscPart)}</span>` : '';

    // 库存侧展示
    let stockNameHtml = '';
    let stockQtyHtml = '';
    let stockBoxHtml = '';
    let opHtml = '';

    if (targetComp) {
      const compClickAttr = targetComp.id ? `style="cursor: pointer; font-weight: 600; color: var(--text-main);" onclick="openDetailDrawer(${targetComp.id})" title="点击查看库存详情"` : 'style="font-weight: 600; color: var(--text-main);"';
      const specPill = formatCompSpec(targetComp);

      let subNote = '';
      if (item.status === 'SUBSTITUTE_AVAILABLE' && item.substituteOption) {
        subNote = `
          <div style="font-size: 11px; color: #0284c7; margin-top: 3px; display: flex; align-items: center; gap: 4px;">
            <span>💡</span>
            <span>${escapeHtml(item.substituteOption.reason)}</span>
          </div>
        `;
      }

      stockNameHtml = `
        <div>
          <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <span ${compClickAttr}>${escapeHtml(targetComp.name)}</span>
            ${specPill}
          </div>
          ${subNote}
        </div>
      `;

      if (item.status === 'LOW_STOCK') {
        const lackNum = item.shortageQty || (item.qtyNeeded - (targetComp.quantity || 0));
        stockQtyHtml = `
          <div>
            <span class="pro-td-mono" style="font-size: 12px; color: var(--text-muted);">存 ${targetComp.quantity} 只</span>
            <div style="color: #d97706; font-weight: 600; font-size: 11px; margin-top: 1px;">⚠️ 缺 ${lackNum} 只</div>
          </div>
        `;
      } else {
        stockQtyHtml = `
          <div>
            <span class="pro-td-mono" style="font-size: 12px; font-weight: 600; color: #16a34a;">存 ${targetComp.quantity} 只</span>
            <div style="font-size: 10px; color: var(--text-dim); margin-top: 1px;">库存充足</div>
          </div>
        `;
      }

      stockBoxHtml = `
        <span class="sub-tag-pill" style="font-size: 11px; font-weight: 500; color: var(--text-main);" title="收纳盒: ${escapeHtml(targetComp.location || '随手存')}">
          📦 ${escapeHtml(targetComp.location || '随手存放处')}
        </span>
      `;
    } else {
      stockNameHtml = `<span style="color: var(--text-dim); font-size: 12px; font-style: italic;">库内无此型号物料</span>`;
      stockQtyHtml = `
        <div>
          <span class="pro-td-mono" style="font-size: 12px; color: var(--text-dim);">存 0 只</span>
          <div style="color: #dc2626; font-weight: 600; font-size: 11px; margin-top: 1px;">全缺 ${item.qtyNeeded} 只</div>
        </div>
      `;
      stockBoxHtml = `<span style="color: var(--text-dim);">-</span>`;
    }

    // 动作栏
    if (item.status === 'SUBSTITUTE_AVAILABLE') {
      if (item.isAdoptedSubstitute) {
        opHtml = `
          <button type="button" class="btn-apple-secondary" style="font-size: 11px; padding: 2px 7px; color: var(--text-dim);" onclick="revertSingleSubstitute(${originalIndex})">
            ↺ 恢复
          </button>
        `;
      } else {
        opHtml = `
          <button type="button" class="btn-apple-secondary" style="font-size: 11px; padding: 2px 8px; color: #0284c7; border-color: rgba(2, 132, 199, 0.35); background: rgba(2, 132, 199, 0.05); font-weight: 600;" onclick="adoptSingleSubstitute(${originalIndex})">
            ✔ 采用替代
          </button>
        `;
      }
    } else if (item.status === 'EXACT_MATCH') {
      opHtml = `<span style="color: #16a34a; font-size: 11px; font-weight: 500;">现货免买</span>`;
    } else {
      opHtml = `
        <button type="button" class="icon-btn-minimal" style="font-size: 11px; width: auto; height: 22px; padding: 1px 7px; border: 1px solid var(--border-subtle); border-radius: 4px; color: var(--text-muted);" onclick="copySingleItemToClipboard(${originalIndex})" title="复制该物料采购型号">
          📋 复制
        </button>
      `;
    }

    const designatorsText = item.designators || '未标位号';

    return `
      <tr class="${rowStatusClass}">
        <td style="text-align: center;">
          <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
            <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-dim);">#${item.rowIndex}</span>
            ${statusBadgeHtml}
          </div>
        </td>
        <td>
          <div style="display: flex; flex-direction: column; gap: 3px;">
            <div style="font-weight: 600; color: var(--text-main); font-size: 13px;">${escapeHtml(item.partName)}</div>
            <div style="display: flex; gap: 4px; align-items: center; flex-wrap: wrap;">
              ${pkgBadge}
              ${lcscBadge}
            </div>
          </div>
        </td>
        <td>
          <div class="bom-refs-cell" title="${escapeHtml(designatorsText)}">
            ${escapeHtml(designatorsText)}
          </div>
        </td>
        <td style="text-align: right;">
          <span style="font-family: var(--font-mono); font-weight: 700; font-size: 13px; color: var(--text-main);">${item.qtyNeeded}</span>
          <span style="font-size: 11px; color: var(--text-dim); margin-left: 2px;">只</span>
        </td>
        <td class="col-stock-boundary">
          ${stockNameHtml}
        </td>
        <td>
          ${stockQtyHtml}
        </td>
        <td>
          ${stockBoxHtml}
        </td>
        <td style="text-align: center;">
          ${opHtml}
        </td>
      </tr>
    `;
  }).join('');
}

function formatCompSpec(comp) {
  if (!comp) return '';
  if (comp.category === '电阻' && comp.value) {
    return `<span class="param-badge-res">${escapeHtml(comp.value)}</span>`;
  }
  if (comp.category === '电容' && comp.value) {
    const vTag = comp.voltage ? ` ${comp.voltage}V` : '';
    return `<span class="param-badge-cap">${escapeHtml(comp.value + vTag)}</span>`;
  }
  if (comp.package) {
    return `<span class="sub-tag-pill pro-td-mono" style="font-size: 10px;">${escapeHtml(comp.package)}</span>`;
  }
  return '';
}

function adoptSingleSubstitute(index) {
  if (!currentComparisonResults || !currentComparisonResults[index]) return;
  currentComparisonResults[index].isAdoptedSubstitute = true;
  if (window.playBeep) window.playBeep();
  updateBOMStats();
  renderBOMProTableRows();
  showToast(`✔ 已采纳 [${currentComparisonResults[index].partName}] 的高耐压替代料`);
}

function revertSingleSubstitute(index) {
  if (!currentComparisonResults || !currentComparisonResults[index]) return;
  currentComparisonResults[index].isAdoptedSubstitute = false;
  updateBOMStats();
  renderBOMProTableRows();
  showToast(`已恢复 [${currentComparisonResults[index].partName}] 为建议替代状态`);
}

function adoptAllSubstitutes() {
  if (!currentComparisonResults) return;
  let adoptedCount = 0;
  currentComparisonResults.forEach(item => {
    if (item.status === 'SUBSTITUTE_AVAILABLE' && !item.isAdoptedSubstitute) {
      item.isAdoptedSubstitute = true;
      adoptedCount++;
    }
  });

  if (window.playBeep) window.playBeep();
  updateBOMStats();
  renderBOMProTableRows();
  showToast(`✔ 成功一键采纳 ${adoptedCount} 项合规高耐压替代物料！`);
}

function copySingleItemToClipboard(index) {
  if (!currentComparisonResults || !currentComparisonResults[index]) return;
  const item = currentComparisonResults[index];
  const text = `${item.partName} ${item.footprint || ''} 需${item.qtyNeeded}只`.trim();
  navigator.clipboard.writeText(text).then(() => {
    showToast(`📋 已复制: ${text}`);
  }).catch(() => {
    prompt('请手动复制该物料采购信息:', text);
  });
}

// ==================== 照单拣料助手 (Apple Checklist 带进度条) ====================

function openBOMPickingModal() {
  if (!currentComparisonResults || currentComparisonResults.length === 0) {
    showToast('⚠️ 当前无比对结果，请先上传并比对 BOM');
    return;
  }

  const grouped = {};
  let totalPickItems = 0;

  currentComparisonResults.forEach((item, index) => {
    const isEffectiveMatch = item.status === 'EXACT_MATCH' || (item.status === 'SUBSTITUTE_AVAILABLE' && item.isAdoptedSubstitute) || item.status === 'LOW_STOCK';
    const target = (item.status === 'SUBSTITUTE_AVAILABLE' && item.substituteOption)
      ? item.substituteOption.component
      : item.matchedStock;

    if (isEffectiveMatch && target) {
      const loc = target.location || '随手存放处 (未标具体箱)';
      if (!grouped[loc]) grouped[loc] = [];
      const itemKey = `pick_${item.rowIndex}_${target.id}`;
      grouped[loc].push({
        key: itemKey,
        target,
        partName: item.partName,
        footprint: item.footprint,
        takeQty: item.qtyNeeded,
        availableQty: target.quantity,
        designators: item.designators
      });
      totalPickItems++;
    }
  });

  const container = document.getElementById('picking-grouped-container');
  if (!container) return;

  const locs = Object.keys(grouped);
  if (locs.length === 0) {
    container.innerHTML = `<p style="text-align: center; color: var(--text-dim); padding: 36px 12px;">暂无可从库存拣取的现货物料（库存无货或需采购）</p>`;
    updatePickingProgress(0, 0);
    openDrawer('modal-picking-backdrop');
    return;
  }

  container.innerHTML = locs.map(loc => {
    const items = grouped[loc];
    const itemsHtml = items.map(it => {
      const isChecked = pickingCheckedItems.has(it.key);
      return `
        <label id="pick-row-${it.key}" class="pick-item-row" style="display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px dashed var(--border-subtle); cursor: pointer; ${isChecked ? 'opacity: 0.38; text-decoration: line-through;' : ''}">
          <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="togglePickItemRow('${it.key}', this)" style="cursor: pointer; transform: scale(1.15);">
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              <span style="font-weight: 600; font-size: 13px; color: var(--text-main);">${escapeHtml(it.target.name)}</span>
              ${it.footprint ? `<span class="sub-tag-pill pro-td-mono" style="font-size: 10px;">${escapeHtml(it.footprint)}</span>` : ''}
              <span style="font-size: 11px; color: var(--text-dim);">[BOM: ${escapeHtml(it.partName)}]</span>
            </div>
            ${it.designators ? `<div style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); margin-top: 2px;">位号: ${escapeHtml(it.designators)}</div>` : ''}
          </div>
          <div style="font-family: var(--font-mono); font-weight: 700; color: var(--accent); font-size: 14px; white-space: nowrap;">
            拿 ${it.takeQty} 件
          </div>
        </label>
      `;
    }).join('');

    return `
      <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 10px; padding: 12px 16px; margin-bottom: 12px; box-shadow: var(--shadow-sm);">
        <div style="font-weight: 600; font-size: 13px; margin-bottom: 6px; color: var(--text-main); display: flex; justify-content: space-between; align-items: center;">
          <span>📦 存放位置: <strong style="color: #b45309;">${escapeHtml(loc)}</strong></span>
          <span class="sub-tag-pill">${items.length} 种料</span>
        </div>
        <div>${itemsHtml}</div>
      </div>
    `;
  }).join('');

  updatePickingProgress(pickingCheckedItems.size, totalPickItems);
  openDrawer('modal-picking-backdrop');
}

function togglePickItemRow(key, checkbox) {
  const row = document.getElementById(`pick-row-${key}`);
  if (checkbox.checked) {
    pickingCheckedItems.add(key);
    if (row) {
      row.style.opacity = '0.38';
      row.style.textDecoration = 'line-through';
    }
    if (window.playBeep) window.playBeep();
  } else {
    pickingCheckedItems.delete(key);
    if (row) {
      row.style.opacity = '1';
      row.style.textDecoration = 'none';
    }
  }

  // 计算总数
  const total = document.querySelectorAll('#picking-grouped-container input[type="checkbox"]').length;
  updatePickingProgress(pickingCheckedItems.size, total);
}

function updatePickingProgress(checkedCount, totalCount) {
  const label = document.getElementById('picking-progress-label');
  const fill = document.getElementById('picking-progress-fill');
  const pct = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  if (label) label.innerText = `${checkedCount} / ${totalCount} 项 (${pct}%)`;
  if (fill) fill.style.width = `${pct}%`;
}

function copyPickingListText() {
  if (!currentComparisonResults) return;
  const grouped = {};
  currentComparisonResults.forEach(item => {
    const isEffectiveMatch = item.status === 'EXACT_MATCH' || (item.status === 'SUBSTITUTE_AVAILABLE' && item.isAdoptedSubstitute) || item.status === 'LOW_STOCK';
    const target = (item.status === 'SUBSTITUTE_AVAILABLE' && item.substituteOption)
      ? item.substituteOption.component
      : item.matchedStock;

    if (isEffectiveMatch && target) {
      const loc = target.location || '随手存放处';
      if (!grouped[loc]) grouped[loc] = [];
      grouped[loc].push(`• [拿 ${item.qtyNeeded}只] ${target.name} (封装:${target.package || '-'}, 位号:${item.designators || '-'})`);
    }
  });

  const lines = ['【工程照单拣料清单】'];
  Object.keys(grouped).forEach(loc => {
    lines.push(`\n📦 位置: ${loc}`);
    lines.push(...grouped[loc]);
  });

  const fullText = lines.join('\n');
  navigator.clipboard.writeText(fullText).then(() => {
    showToast('📋 已将按收纳盒整理的拣料清单复制到剪贴板！');
  }).catch(() => {
    prompt('请复制拣料清单:', fullText);
  });
}

// ==================== 缺料采购助手 (Purchase Helper) ====================

function openBOMPurchaseModal() {
  if (!currentComparisonResults) {
    showToast('⚠️ 当前无比对结果');
    return;
  }

  const shortages = [];
  let totalMissingPieces = 0;

  currentComparisonResults.forEach(item => {
    const isEffectiveMatch = item.status === 'EXACT_MATCH' || (item.status === 'SUBSTITUTE_AVAILABLE' && item.isAdoptedSubstitute);
    if (isEffectiveMatch) return;

    let missing = item.qtyNeeded;
    let reason = '手头无现货';
    if (item.status === 'LOW_STOCK' && item.matchedStock) {
      missing = Math.max(0, item.qtyNeeded - (item.matchedStock.quantity || 0));
      reason = `现有${item.matchedStock.quantity}只(缺${missing}只)`;
    }

    totalMissingPieces += missing;
    shortages.push({
      partName: item.partName,
      footprint: item.footprint || '',
      designators: item.designators || '',
      qtyNeeded: item.qtyNeeded,
      missingQty: missing,
      lcscPart: item.lcscPart || '',
      reason
    });
  });

  const summaryText = document.getElementById('bom-purchase-summary-text');
  const previewTextarea = document.getElementById('bom-purchase-preview-textarea');

  if (shortages.length === 0) {
    if (summaryText) summaryText.innerText = '🎉 恭喜！当前 BOM 所有物料均有现货或已采纳替代，无需采购任何新料！';
    if (previewTextarea) previewTextarea.value = '全部物料现货充足，无缺料。';
    openDrawer('modal-bom-purchase-backdrop');
    return;
  }

  if (summaryText) {
    summaryText.innerText = `共缺 ${shortages.length} 种元器件，共需补购 ${totalMissingPieces} 件`;
  }

  // 格式化采购文本 (优化为立创商城与淘宝批量搜索通用格式)
  const lines = [
    `【BOM 缺料待采购清单】(共 ${shortages.length} 种元器件，折合需采购 ${totalMissingPieces} 件)`,
    `导出时间: ${new Date().toLocaleString()}`,
    '------------------------------------------------------------'
  ];

  shortages.forEach((s, idx) => {
    const lcscTag = s.lcscPart ? ` [立创编号: ${s.lcscPart}]` : '';
    const pkgTag = s.footprint ? ` [封装: ${s.footprint}]` : '';
    const refsTag = s.designators ? ` (位号: ${s.designators})` : '';
    lines.push(`${idx + 1}. ${s.partName}${pkgTag}${lcscTag} ➔ 需采购: ${s.missingQty}只${refsTag} · ${s.reason}`);
  });

  lines.push('------------------------------------------------------------');
  lines.push('💡 提示：可直接全选上方型号粘贴至立创商城“BOM匹配”或淘宝采购。');

  if (previewTextarea) {
    previewTextarea.value = lines.join('\n');
  }

  openDrawer('modal-bom-purchase-backdrop');
}

function copyPurchaseText() {
  const textarea = document.getElementById('bom-purchase-preview-textarea');
  if (!textarea || !textarea.value) return;
  navigator.clipboard.writeText(textarea.value).then(() => {
    showToast('📋 采购清单文本已成功复制到剪贴板！');
  }).catch(() => {
    textarea.select();
    document.execCommand('copy');
    showToast('📋 采购清单已复制');
  });
}

function downloadPurchaseCSV() {
  if (!currentComparisonResults) return;

  const shortages = [];
  currentComparisonResults.forEach(item => {
    const isEffectiveMatch = item.status === 'EXACT_MATCH' || (item.status === 'SUBSTITUTE_AVAILABLE' && item.isAdoptedSubstitute);
    if (isEffectiveMatch) return;

    let missing = item.qtyNeeded;
    let reason = '手头无现货';
    if (item.status === 'LOW_STOCK' && item.matchedStock) {
      missing = Math.max(0, item.qtyNeeded - (item.matchedStock.quantity || 0));
      reason = `库存不足(缺${missing}只)`;
    }

    shortages.push({
      partName: item.partName,
      footprint: item.footprint || '',
      designators: item.designators || '',
      qtyNeeded: item.qtyNeeded,
      missingQty: missing,
      lcscPart: item.lcscPart || '',
      reason
    });
  });

  if (shortages.length === 0) {
    showToast('🎉 无缺料，无需导出');
    return;
  }

  let csvContent = '器件型号/名称,封装规格,位号,工程需用量,缺失采购数量,立创元器件编号,缺料原因说明\n';
  shortages.forEach(s => {
    csvContent += `"${s.partName}","${s.footprint}","${s.designators}",${s.qtyNeeded},${s.missingQty},"${s.lcscPart}","${s.reason}"\n`;
  });

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `BOM缺料采购清单_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📥 采购清单 CSV 下载已触发！');
}

// ==================== 一键出库扣减安全确认 ====================

let pendingDeductItems = [];

function openBOMDeductModal() {
  if (!currentComparisonResults) return;

  pendingDeductItems = [];
  currentComparisonResults.forEach(item => {
    const isEffectiveMatch = item.status === 'EXACT_MATCH' || (item.status === 'SUBSTITUTE_AVAILABLE' && item.isAdoptedSubstitute) || item.status === 'LOW_STOCK';
    const target = (item.status === 'SUBSTITUTE_AVAILABLE' && item.substituteOption)
      ? item.substituteOption.component
      : item.matchedStock;

    if (isEffectiveMatch && target) {
      const deductQty = Math.min(item.qtyNeeded, target.quantity || 0);
      if (deductQty > 0) {
        pendingDeductItems.push({
          id: target.id,
          name: target.name,
          package: target.package,
          deductQty,
          currentQty: target.quantity,
          remainQty: Math.max(0, target.quantity - deductQty),
          location: target.location || '随手存放处'
        });
      }
    }
  });

  if (pendingDeductItems.length === 0) {
    showToast('⚠️ 当前无可以扣减库存的现货物料');
    return;
  }

  const tbody = document.getElementById('bom-deduct-preview-tbody');
  if (tbody) {
    tbody.innerHTML = pendingDeductItems.map(it => `
      <tr>
        <td style="padding: 8px 12px; font-weight: 500; color: var(--text-main);">
          ${escapeHtml(it.name)}
          ${it.package ? `<span class="sub-tag-pill pro-td-mono" style="font-size: 10px;">${escapeHtml(it.package)}</span>` : ''}
        </td>
        <td style="padding: 8px 12px; text-align: right; font-family: var(--font-mono); font-weight: 700; color: #dc2626;">
          -${it.deductQty} 只
        </td>
        <td style="padding: 8px 12px; text-align: center; font-family: var(--font-mono);">
          <span style="color: var(--text-muted);">${it.currentQty}</span> ➔ <strong style="color: ${it.remainQty === 0 ? '#dc2626' : '#16a34a'};">${it.remainQty}</strong> 只
        </td>
        <td style="padding: 8px 12px; color: var(--text-muted);">
          📦 ${escapeHtml(it.location)}
        </td>
      </tr>
    `).join('');
  }

  openDrawer('modal-bom-deduct-backdrop');
}

async function confirmBOMDeductExecution() {
  if (pendingDeductItems.length === 0) return;

  const btnConfirm = document.getElementById('btn-confirm-bom-deduct');
  const origBtnText = btnConfirm ? btnConfirm.innerText : '';
  if (btnConfirm) {
    btnConfirm.innerText = '正在扣减库存...';
    btnConfirm.disabled = true;
  }

  const payload = pendingDeductItems.map(it => ({
    id: it.id,
    deductQty: it.deductQty
  }));

  try {
    const res = await fetch('/api/bom/deduct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: payload })
    });

    const result = await res.json();
    if (!result.success) {
      throw new Error(result.error || '出库失败');
    }

    closeDrawer('modal-bom-deduct-backdrop');
    showToast(`<span style="color: #34c759; font-size: 15px;">✔</span> BOM 投产出库成功！已扣减 ${result.data.deducted} 项物料库存。`, 5000);

    if (window.loadInventory) window.loadInventory();
    if (window.loadFrequentLocations) window.loadFrequentLocations();
    if (window.refreshLowStockBadge) window.refreshLowStockBadge();

    // 重新比对刷新当前表格
    await runBOMComparison();
  } catch (err) {
    showToast(`❌ 出库失败: ${err.message}`);
    alert(`出库失败: ${err.message}`);
  } finally {
    if (btnConfirm) {
      btnConfirm.innerText = origBtnText;
      btnConfirm.disabled = false;
    }
  }
}

// 导出全局函数供内联 HTML 调用
window.initBOMView = initBOMView;
window.setBOMFilter = setBOMFilter;
window.clearBOMSearch = clearBOMSearch;
window.adoptSingleSubstitute = adoptSingleSubstitute;
window.revertSingleSubstitute = revertSingleSubstitute;
window.adoptAllSubstitutes = adoptAllSubstitutes;
window.copySingleItemToClipboard = copySingleItemToClipboard;
window.openBOMPickingModal = openBOMPickingModal;
window.togglePickItemRow = togglePickItemRow;
window.copyPickingListText = copyPickingListText;
window.openBOMPurchaseModal = openBOMPurchaseModal;
window.copyPurchaseText = copyPurchaseText;
window.downloadPurchaseCSV = downloadPurchaseCSV;
window.openBOMDeductModal = openBOMDeductModal;
window.confirmBOMDeductExecution = confirmBOMDeductExecution;
