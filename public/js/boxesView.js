/**
 * 物理收纳空间与自封袋专业标签打印驱动 (public/js/boxesView.js)
 * 专为创客自封袋、防静电袋、剪带收纳与零件盒打造：
 * - 紧凑型自封袋标签 (48x28mm 黄金排版)
 * - 双模输出：普通 A4 高密度拼版 (30枚/页 · 裁切虚线) vs 小型热敏不干胶标签机 (连续单标)
 * - 自封袋卡片流：秒搜过滤、按需勾选（只打新到的袋子）、扫码直达透视与手机端出入库
 */

let allBoxes = [];
let selectedBoxNames = new Set();
let boxesSearchQuery = '';
let currentPrintMode = 'a4'; // 'a4' | 'thermal'
let currentPrintTargetBox = null; // null: 批量/选定模式; string: 单袋指定打印
let currentXRayBox = null;
let currentXRayItems = [];

document.addEventListener('DOMContentLoaded', () => {
  initBoxesView();
});

function initBoxesView() {
  // 批量打印按钮
  const btnOpenPrint = document.getElementById('btn-open-print-labels');
  if (btnOpenPrint) {
    btnOpenPrint.addEventListener('click', () => {
      openPrintCenter(null);
    });
  }

  // 系统打印触发 (window.print)
  const btnTriggerPrint = document.getElementById('btn-trigger-print');
  if (btnTriggerPrint) {
    btnTriggerPrint.addEventListener('click', () => {
      window.print();
    });
  }

  // 刷新按钮
  const btnRefresh = document.getElementById('btn-refresh-boxes');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      loadBoxes();
    });
  }

  // 透视箱内加料
  const btnXrayAdd = document.getElementById('btn-xray-add-comp');
  if (btnXrayAdd) {
    btnXrayAdd.addEventListener('click', () => {
      if (currentXRayBox && currentXRayBox !== '未指定收纳盒 (随手放)') {
        const locInput = document.getElementById('input-location');
        if (locInput) locInput.value = currentXRayBox;
      }
      closeDrawer('modal-box-xray-backdrop');
      openDrawer('drawer-entry-backdrop');
      setTimeout(() => {
        const textInput = document.getElementById('entry-text-input');
        if (textInput) textInput.focus();
      }, 200);
    });
  }

  // 透视箱搜索过滤
  const xraySearch = document.getElementById('xray-search-input');
  if (xraySearch) {
    xraySearch.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      filterXRayItems(q);
    });
  }

  // 收纳空间主搜索框
  const boxesSearchInput = document.getElementById('boxes-search-input');
  if (boxesSearchInput) {
    boxesSearchInput.addEventListener('input', (e) => {
      boxesSearchQuery = e.target.value.trim().toLowerCase();
      const clearBtn = document.getElementById('btn-boxes-search-clear');
      if (clearBtn) clearBtn.style.display = boxesSearchQuery ? 'block' : 'none';
      filterAndRenderBoxes();
    });
  }

  // 侦测 URL Hash: 手机扫码后直接进入透视箱模式
  checkHashRoute();
  window.addEventListener('hashchange', checkHashRoute);

  // 初次加载收纳空间列表
  loadBoxes();
}

function checkHashRoute() {
  const hash = window.location.hash;
  if (hash && hash.startsWith('#box=')) {
    const boxName = decodeURIComponent(hash.slice(5)).trim();
    if (boxName) {
      setTimeout(() => {
        openBoxXRay(boxName);
      }, 100);
    }
  }
}

async function loadBoxes() {
  try {
    const res = await fetch('/api/boxes');
    const result = await res.json();
    if (result.success) {
      allBoxes = result.data || [];
      // 保持之前的已选集合中仍然存在于 allBoxes 中的项
      const validNames = new Set(allBoxes.map(b => b.box_name));
      selectedBoxNames = new Set([...selectedBoxNames].filter(n => validNames.has(n)));
      
      updateBulkActionsUI();
      filterAndRenderBoxes();
    }
  } catch (err) {
    console.error('加载收纳空间失败:', err);
  }
}

function filterAndRenderBoxes() {
  let filtered = allBoxes;
  if (boxesSearchQuery) {
    filtered = allBoxes.filter(box => {
      const nameMatch = (box.box_name || '').toLowerCase().includes(boxesSearchQuery);
      const catMatch = (box.categories || '').toLowerCase().includes(boxesSearchQuery);
      const pkgMatch = (box.packages || '').toLowerCase().includes(boxesSearchQuery);
      const itemMatch = (box.item_names || '').toLowerCase().includes(boxesSearchQuery);
      const sampleMatch = (box.sample_name || '').toLowerCase().includes(boxesSearchQuery);
      return nameMatch || catMatch || pkgMatch || itemMatch || sampleMatch;
    });
  }
  renderBoxesGrid(filtered);
}

function clearBoxesSearch() {
  const input = document.getElementById('boxes-search-input');
  if (input) input.value = '';
  boxesSearchQuery = '';
  const clearBtn = document.getElementById('btn-boxes-search-clear');
  if (clearBtn) clearBtn.style.display = 'none';
  filterAndRenderBoxes();
}

function renderBoxesGrid(boxes) {
  const container = document.getElementById('boxes-grid-container');
  if (!container) return;

  if (!boxes || boxes.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 60px 20px; text-align: center; color: var(--text-dim); background: var(--bg-surface); border: 1px dashed var(--border-subtle); border-radius: 12px;">
        <div style="font-size: 28px; margin-bottom: 8px;">🗄️</div>
        <div style="font-size: 15px; font-weight: 500;">${boxesSearchQuery ? '未找到符合条件的收纳袋' : '暂无物理收纳袋数据'}</div>
        <div style="font-size: 13px; margin-top: 4px;">在录入或修改元器件时填写“存放位置”（如【A-01】或【贴片盒-R01】），系统将自动为您聚合自封袋。</div>
      </div>
    `;
    return;
  }

  let html = '';
  boxes.forEach(box => {
    const isSelected = selectedBoxNames.has(box.box_name);
    const tagsHtml = (box.categories_list || []).map(cat => 
      `<span class="sub-tag-pill">${escapeHtml(cat)}</span>`
    ).join(' ');

    const pkgHtml = (box.packages_list || []).slice(0, 3).map(pkg => 
      `<span class="sub-tag-pill pro-td-mono" style="opacity: 0.85;">${escapeHtml(pkg)}</span>`
    ).join(' ');

    // 主要物料品名解析展示
    let mainComponentDisplay = '';
    if (box.item_count === 1 && box.sample_name) {
      mainComponentDisplay = `<div class="box-main-component-tag" title="${escapeAttr(box.sample_name)}">⚡ ${escapeHtml(box.sample_name)}</div>`;
    } else if (box.sample_name) {
      mainComponentDisplay = `<div class="box-main-component-tag" title="${escapeAttr(box.item_names || box.sample_name)}">⚡ ${escapeHtml(box.sample_name)} 等 ${box.item_count} 种</div>`;
    }

    html += `
      <div class="box-card ${isSelected ? 'is-selected' : ''}" id="box-card-${encodeURIComponent(box.box_name).replace(/%/g, '_')}">
        <div>
          <div class="box-card-top">
            <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
              <input type="checkbox" class="box-select-chk" 
                ${isSelected ? 'checked' : ''} 
                title="勾选加入批量打印"
                onclick="event.stopPropagation(); toggleBoxSelection('${escapeAttr(box.box_name)}', this.checked)">
              <div class="box-card-title" title="${escapeAttr(box.box_name)}">
                <span>📦</span>
                <span>${escapeHtml(box.box_name)}</span>
              </div>
            </div>
            ${box.qr_data_url ? `
              <img src="${box.qr_data_url}" class="box-card-qr-thumb" title="点击放大/扫码透视" onclick="openBoxXRay('${escapeAttr(box.box_name)}')">
            ` : ''}
          </div>

          ${mainComponentDisplay}

          <div class="box-card-tags">
            ${tagsHtml || '<span class="sub-tag-pill">自封散袋</span>'}
            ${pkgHtml}
          </div>
        </div>

        <div>
          <div class="box-card-stats">
            <span>内含 <strong>${box.item_count}</strong> 项物料</span>
            <span>共 <strong>${box.total_quantity}</strong> 件</span>
          </div>

          <div class="box-card-actions">
            <button class="btn-box-action" onclick="openBoxXRay('${escapeAttr(box.box_name)}')">
              <span>🔍</span> <span>透视清单</span>
            </button>
            <button class="btn-box-action" onclick="printSingleBoxLabel('${escapeAttr(box.box_name)}')">
              <span>🏷️</span> <span>打印单标</span>
            </button>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function toggleBoxSelection(boxName, isChecked) {
  if (isChecked) {
    selectedBoxNames.add(boxName);
  } else {
    selectedBoxNames.delete(boxName);
  }
  updateBulkActionsUI();
  // 局部更新卡片高亮样式
  const card = document.getElementById(`box-card-${encodeURIComponent(boxName).replace(/%/g, '_')}`);
  if (card) {
    if (isChecked) {
      card.classList.add('is-selected');
    } else {
      card.classList.remove('is-selected');
    }
  }
}

function selectAllBoxes(selectAll) {
  if (selectAll) {
    // 全选当前列表中的所有项
    allBoxes.forEach(b => selectedBoxNames.add(b.box_name));
  } else {
    selectedBoxNames.clear();
  }
  updateBulkActionsUI();
  filterAndRenderBoxes();
}

function updateBulkActionsUI() {
  const count = selectedBoxNames.size;
  const badge = document.getElementById('boxes-selected-badge');
  const printCountNum = document.getElementById('btn-print-count-num');

  if (badge) {
    if (count > 0) {
      badge.style.display = 'inline-block';
      badge.innerText = `已选 ${count} 袋`;
    } else {
      badge.style.display = 'none';
    }
  }

  if (printCountNum) {
    if (count > 0) {
      printCountNum.innerText = `已选 ${count} 袋`;
    } else {
      printCountNum.innerText = `全部 ${allBoxes.length} 袋`;
    }
  }
}

/**
 * 打开打印中心
 * @param {string|null} targetBoxName 如果为指定袋名，则单标模式；若为 null，则按照选定或全部
 */
function openPrintCenter(targetBoxName = null) {
  currentPrintTargetBox = targetBoxName;
  renderPrintableLabels();
  openDrawer('modal-print-labels-backdrop');
}

function printSingleBoxLabel(boxName) {
  openPrintCenter(boxName);
}

function setPrintMode(mode) {
  currentPrintMode = mode;
  const btnA4 = document.getElementById('btn-print-mode-a4');
  const btnThermal = document.getElementById('btn-print-mode-thermal');
  const tipText = document.getElementById('print-mode-tip-text');
  const sheet = document.getElementById('printable-label-sheet');

  if (btnA4) btnA4.classList.toggle('active', mode === 'a4');
  if (btnThermal) btnThermal.classList.toggle('active', mode === 'thermal');

  if (sheet) {
    sheet.classList.remove('mode-a4', 'mode-thermal');
    sheet.classList.add(`mode-${mode}`);
  }

  if (tipText) {
    if (mode === 'a4') {
      tipText.innerText = '已针对普通 A4 纸排版优化：5 列 × 6 行 (30枚/页)，黑白对比清晰，自带虚线裁切标';
    } else {
      tipText.innerText = '热敏标签机连续打印模式：适配 40×25mm / 50×30mm 单标规格，自动分页，撕下即贴';
    }
  }

  renderPrintableLabels();
}

/**
 * 渲染创客黄金自封袋标签 (Golden Bag Label)
 */
function renderPrintableLabels() {
  const container = document.getElementById('printable-label-sheet');
  const countBadge = document.getElementById('print-sheet-count-badge');
  if (!container) return;

  let boxesToPrint = [];

  if (currentPrintTargetBox) {
    // 单袋打印
    boxesToPrint = allBoxes.filter(b => b.box_name === currentPrintTargetBox);
  } else if (selectedBoxNames.size > 0) {
    // 勾选批量打印
    boxesToPrint = allBoxes.filter(b => selectedBoxNames.has(b.box_name));
  } else {
    // 默认打印全部
    boxesToPrint = allBoxes;
  }

  if (countBadge) {
    const pageEst = Math.ceil(boxesToPrint.length / 30);
    countBadge.innerText = currentPrintMode === 'a4' 
      ? `共 ${boxesToPrint.length} 枚 (A4 拼版约需 ${pageEst} 页)`
      : `共 ${boxesToPrint.length} 枚 (热敏单标连续)`;
  }

  if (boxesToPrint.length === 0) {
    container.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--text-dim);">未找到可打印的收纳袋</div>';
    return;
  }

  let html = '';
  boxesToPrint.forEach(box => {
    // 提炼主品名 (如 10k 0805 或 AMS1117-3.3)
    let mainName = box.sample_name || box.box_name;
    let descText = '';

    if (box.item_count === 1) {
      descText = (box.packages_list || []).join(' ') || (box.categories_list || []).join(' ');
    } else {
      descText = `内含 ${(box.item_names_list || []).slice(0, 3).join(' · ')} 等 ${box.item_count} 种`;
    }

    // 辅助胶囊
    const pills = [];
    if (box.categories_list && box.categories_list.length > 0) {
      pills.push(box.categories_list[0]);
    }
    if (box.packages_list && box.packages_list.length > 0) {
      pills.push(box.packages_list[0]);
    }
    const pillsHtml = pills.map(p => `<span class="bag-mini-pill">${escapeHtml(p)}</span>`).join('');

    html += `
      <div class="bag-label-card">
        <div>
          <div class="bag-label-top">
            <div class="bag-label-title-box">
              <div class="bag-label-name" title="${escapeAttr(mainName)}">
                ${escapeHtml(mainName)}
              </div>
              <div class="bag-label-desc" title="${escapeAttr(descText)}">
                ${escapeHtml(descText)}
              </div>
            </div>
            ${box.qr_data_url ? `
              <img src="${box.qr_data_url}" class="bag-label-qr" alt="QR">
            ` : ''}
          </div>

          <div class="bag-label-pills">
            ${pillsHtml}
          </div>
        </div>

        <div class="bag-label-foot">
          <span class="bag-label-foot-loc">📦 ${escapeHtml(box.box_name)}</span>
          <span class="bag-label-foot-qty">${box.total_quantity} pcs</span>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

async function openBoxXRay(boxName) {
  currentXRayBox = boxName;
  document.getElementById('xray-box-title').innerText = `📦 ${boxName}`;
  document.getElementById('xray-item-count-pill').innerText = '加载中...';
  
  const searchInput = document.getElementById('xray-search-input');
  if (searchInput) searchInput.value = '';

  openDrawer('modal-box-xray-backdrop');

  try {
    const res = await fetch(`/api/boxes/items?name=${encodeURIComponent(boxName)}`);
    const result = await res.json();
    if (result.success) {
      currentXRayItems = result.data || [];
      document.getElementById('xray-item-count-pill').innerText = `共 ${currentXRayItems.length} 项物料`;
      renderXRayItems(currentXRayItems);
    }
  } catch (err) {
    console.error('获取盒内物料失败:', err);
  }
}

function filterXRayItems(query) {
  if (!query) {
    renderXRayItems(currentXRayItems);
    return;
  }
  const filtered = currentXRayItems.filter(item => {
    return (item.name && item.name.toLowerCase().includes(query)) ||
           (item.category && item.category.toLowerCase().includes(query)) ||
           (item.package && item.package.toLowerCase().includes(query)) ||
           (item.value && item.value.toLowerCase().includes(query)) ||
           (item.lcsc_part && item.lcsc_part.toLowerCase().includes(query)) ||
           (item.notes && item.notes.toLowerCase().includes(query));
  });
  renderXRayItems(filtered);
}

function renderXRayItems(items) {
  const container = document.getElementById('xray-items-list');
  if (!container) return;

  if (!items || items.length === 0) {
    container.innerHTML = `
      <div style="padding: 40px 20px; text-align: center; color: var(--text-dim);">
        <div style="font-size: 20px; margin-bottom: 6px;">🍃</div>
        <div>盒内暂无此物料</div>
      </div>
    `;
    return;
  }

  let html = '';
  items.forEach(item => {
    const icon = window.getCategoryIcon ? window.getCategoryIcon(item.category) : '🔹';
    const spec = window.formatSpec ? window.formatSpec(item) : (item.value || item.notes || '-');

    html += `
      <div class="xray-item-card" onclick="openDetailDrawer(${item.id})">
        <div class="xray-item-main">
          <div class="xray-item-name">
            <span>${icon}</span>
            <span>${escapeHtml(item.name)}</span>
            <span class="sub-tag-pill">${escapeHtml(item.category)}</span>
            ${item.package ? `<span class="sub-tag-pill pro-td-mono">${escapeHtml(item.package)}</span>` : ''}
          </div>
          <div class="xray-item-meta">
            <span>${escapeHtml(spec)}</span>
            ${item.lcsc_part ? `<span style="margin-left: 8px; color: #0284c7;">${escapeHtml(item.lcsc_part)}</span>` : ''}
          </div>
        </div>

        <div class="pro-table-stepper" onclick="event.stopPropagation()">
          <button class="mini-step-btn" onclick="stepQuantity(${item.id}, -1)">−</button>
          <span class="mini-step-val" id="row-qty-${item.id}">${item.quantity}</span>
          <button class="mini-step-btn" onclick="stepQuantity(${item.id}, 1)">＋</button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// 导出供全局调用的函数
window.loadBoxes = loadBoxes;
window.openBoxXRay = openBoxXRay;
window.renderPrintableLabels = renderPrintableLabels;
window.printSingleBoxLabel = printSingleBoxLabel;
window.openPrintCenter = openPrintCenter;
window.setPrintMode = setPrintMode;
window.toggleBoxSelection = toggleBoxSelection;
window.selectAllBoxes = selectAllBoxes;
window.clearBoxesSearch = clearBoxesSearch;
