/**
 * Apple / Craft / Notion 极简纸白交互驱动 (public/js/app.js)
 * 实现顶栏单页Tab切换、Spotlight全局搜索、流式物料清单、
 * 侧滑抽屉面板（录入/详情）、就地步进器及常用位置胶囊点选。
 */

let allComponents = [];
let currentCategoryFilter = '';
let currentSearchQuery = '';
let duplicateTarget = null;

let currentSortCol = 'id';
let currentSortOrder = 'desc';

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  renderProTableHeader('');
  initSearchAndFilter();
  initTableSorting();
  initEntryDrawer();
  initDetailDrawer();
  initPresetAndBackup();
  initTaobaoImport();
  initWorkshopDashboard();
  loadInventory();
  loadFrequentLocations();
  loadNetworkInfo();
  if (window.initBOMView) window.initBOMView();
});

// ==================== 1. 主题与全局导航 ====================

function initTheme() {
  const saved = localStorage.getItem('bom_theme') || 'light'; // 默认极简纸白
  applyTheme(saved);

  document.getElementById('btn-theme-toggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  });

  // 快捷键 '/' 聚焦 Spotlight 搜索框
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault();
      switchNavTab('tab-inventory');
      const search = document.getElementById('inventory-search');
      if (search) search.focus();
    }
  });

  // 手机二维码弹窗
  document.getElementById('btn-show-qr').addEventListener('click', () => {
    openDrawer('modal-qr-backdrop');
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('bom_theme', theme);
  const btn = document.getElementById('btn-theme-toggle');
  btn.innerText = theme === 'dark' ? '☀' : '🌙';
  btn.title = theme === 'dark' ? '切换为 Apple 极简纸白主题' : '切换为夜间深色主题';
}

function switchNavTab(tabId) {
  document.querySelectorAll('.tab-view').forEach(t => t.style.display = 'none');
  const target = document.getElementById(tabId);
  if (target) target.style.display = 'block';

  const btnInv = document.getElementById('nav-btn-inventory');
  if (btnInv) btnInv.classList.toggle('active', tabId === 'tab-inventory');
  const btnBoxes = document.getElementById('nav-btn-boxes');
  if (btnBoxes) btnBoxes.classList.toggle('active', tabId === 'tab-boxes');
  const btnBom = document.getElementById('nav-btn-bom');
  if (btnBom) btnBom.classList.toggle('active', tabId === 'tab-bom');
  const btnProjects = document.getElementById('nav-btn-projects');
  if (btnProjects) btnProjects.classList.toggle('active', tabId === 'tab-projects');

  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (tabId === 'tab-boxes' && window.loadBoxes) {
    window.loadBoxes();
  }
  if (tabId === 'tab-projects' && window.loadProjects) {
    window.loadProjects();
  }
}

function openDrawer(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function closeDrawer(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
  if (window.stopScanner) window.stopScanner();
}

// ==================== 2. 搜索过滤与物料流式行 ====================

function initSearchAndFilter() {
  const searchInput = document.getElementById('inventory-search');
  let debounceTimer = null;

  searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      currentSearchQuery = e.target.value.trim();
      loadInventory();
    }, 180);
  });

  // 分类胶囊标签切换
  const filterTags = document.querySelectorAll('#category-filter-bar .filter-tag');
  filterTags.forEach(tag => {
    tag.addEventListener('click', () => {
      const cat = tag.getAttribute('data-cat') || '';
      selectCategoryFilter(cat);
    });
  });

  // 导出补货单按钮
  const btnExportReplenish = document.getElementById('btn-export-replenishment');
  if (btnExportReplenish) {
    btnExportReplenish.addEventListener('click', () => {
      window.location.href = '/api/components/export-replenishment';
    });
  }

  // 全库流水日志按钮
  const btnGlobalLogs = document.getElementById('btn-open-global-logs');
  if (btnGlobalLogs) {
    btnGlobalLogs.addEventListener('click', () => {
      openDrawer('modal-global-logs-backdrop');
      loadGlobalLogs();
    });
  }
}

// 统一品类与状态过滤切换入口
function selectCategoryFilter(category) {
  currentCategoryFilter = category || '';
  const filterTags = document.querySelectorAll('#category-filter-bar .filter-tag');
  filterTags.forEach(t => {
    const dataCat = t.getAttribute('data-cat') || '';
    if (dataCat === currentCategoryFilter) {
      t.classList.add('active');
      if (currentCategoryFilter === '__low_stock__') {
        t.classList.add('active-alert');
      } else {
        t.classList.remove('active-alert');
      }
    } else {
      t.classList.remove('active');
      t.classList.remove('active-alert');
    }
  });

  if (currentCategoryFilter === '电阻' || currentCategoryFilter === '电容') {
    currentSortCol = 'standard_value';
    currentSortOrder = 'asc';
  } else {
    currentSortCol = 'id';
    currentSortOrder = 'desc';
  }
  renderProTableHeader(currentCategoryFilter);
  loadInventory();
}

// 复位全部分类
function resetCategoryFilter() {
  const searchInput = document.getElementById('inventory-search');
  if (searchInput) searchInput.value = '';
  currentSearchQuery = '';
  selectCategoryFilter('');
}

// 快速查看待补料物料
function filterByLowStock() {
  selectCategoryFilter('__low_stock__');
}

// 工坊大盘配色字典 (线性柔和色系)
const DASHBOARD_CATEGORY_COLORS = {
  '电阻': { color: '#2563eb', bg: '#eff6ff' },
  '电容': { color: '#059669', bg: '#ecfdf5' },
  '芯片': { color: '#7c3aed', bg: '#f5f3ff' },
  '二极管': { color: '#d97706', bg: '#fffbeb' },
  '三极管/MOS': { color: '#ea580c', bg: '#fff7ed' },
  '接插件': { color: '#0891b2', bg: '#ecfeff' },
  '模块': { color: '#db2777', bg: '#fdf2f8' },
  '电感': { color: '#0284c7', bg: '#f0f9ff' },
  '其他': { color: '#64748b', bg: '#f8fafc' }
};

function getDashboardCategoryStyle(cat) {
  return DASHBOARD_CATEGORY_COLORS[cat] || DASHBOARD_CATEGORY_COLORS['其他'];
}

// 折叠 / 展开工坊大盘
function toggleWorkshopDashboard() {
  const cardsGrid = document.getElementById('dashboard-cards-grid');
  const collapsedBar = document.getElementById('dashboard-collapsed-bar');
  const toggleBtn = document.getElementById('btn-toggle-dashboard');
  if (!cardsGrid || !collapsedBar) return;

  const isCurrentlyCollapsed = cardsGrid.style.display === 'none';

  if (isCurrentlyCollapsed) {
    cardsGrid.style.display = 'grid';
    collapsedBar.style.display = 'none';
    if (toggleBtn) {
      toggleBtn.innerText = '▲ 收起看板';
      toggleBtn.style.display = 'inline-block';
    }
    localStorage.setItem('bom_dashboard_collapsed', '0');
  } else {
    cardsGrid.style.display = 'none';
    collapsedBar.style.display = 'flex';
    if (toggleBtn) {
      toggleBtn.innerText = '▼ 展开看板';
      toggleBtn.style.display = 'none';
    }
    localStorage.setItem('bom_dashboard_collapsed', '1');
  }
}

// 初始化工坊大盘折叠持久化状态
function initWorkshopDashboard() {
  const savedCollapsed = localStorage.getItem('bom_dashboard_collapsed') === '1';
  const cardsGrid = document.getElementById('dashboard-cards-grid');
  const collapsedBar = document.getElementById('dashboard-collapsed-bar');
  const toggleBtn = document.getElementById('btn-toggle-dashboard');

  if (savedCollapsed) {
    if (cardsGrid) cardsGrid.style.display = 'none';
    if (collapsedBar) collapsedBar.style.display = 'flex';
    if (toggleBtn) {
      toggleBtn.innerText = '▼ 展开看板';
      toggleBtn.style.display = 'none';
    }
  } else {
    if (cardsGrid) cardsGrid.style.display = 'grid';
    if (collapsedBar) collapsedBar.style.display = 'none';
    if (toggleBtn) {
      toggleBtn.innerText = '▲ 收起看板';
      toggleBtn.style.display = 'inline-block';
    }
  }
}

// 刷新工坊大盘数据 (多色分段条、健康度与统计指标)
async function refreshWorkshopDashboard() {
  try {
    const [catRes, lowRes, boxRes] = await Promise.all([
      fetch('/api/components/categories').then(r => r.json()).catch(() => ({ success: false })),
      fetch('/api/components/low-stock').then(r => r.json()).catch(() => ({ success: false })),
      fetch('/api/boxes').then(r => r.json()).catch(() => ({ success: false }))
    ]);

    const catStats = (catRes.success && Array.isArray(catRes.data)) ? catRes.data : [];
    const lowStockList = (lowRes.success && Array.isArray(lowRes.data)) ? lowRes.data : [];
    const boxesList = (boxRes.success && Array.isArray(boxRes.data)) ? boxRes.data : [];

    const totalSKUs = catStats.reduce((sum, item) => sum + (item.count || 0), 0);
    const totalPieces = catStats.reduce((sum, item) => sum + (item.total_qty || 0), 0);
    const lowStockCount = lowStockList.length;
    const boxesCount = boxesList.length;

    // 1. 卡片 1 (在库现货总览)
    const totalTypesEl = document.getElementById('dash-total-types');
    if (totalTypesEl) totalTypesEl.innerText = totalSKUs;

    const totalPiecesEl = document.getElementById('dash-total-pieces');
    if (totalPiecesEl) totalPiecesEl.innerText = totalPieces.toLocaleString();

    const batchTagEl = document.getElementById('dash-batch-count-tag');
    if (batchTagEl) batchTagEl.innerText = `(已纳管 ${catStats.length} 个分类)`;

    // 2. 卡片 2 (品类结构分布 - 多色堆叠分段条 & 图例)
    const segBar = document.getElementById('dash-category-segmented-bar');
    const legendsEl = document.getElementById('dash-category-legends');
    if (segBar && legendsEl) {
      if (totalSKUs === 0) {
        segBar.innerHTML = `<div style="width: 100%; height: 100%; background: var(--border-subtle); border-radius: 6px;"></div>`;
        legendsEl.innerHTML = `<span style="color: var(--text-dim); font-size: 11px;">库内暂无物料，录入或导入后将自动展现分布</span>`;
      } else {
        let segHtml = '';
        let legHtml = '';

        catStats.forEach(item => {
          const cat = item.category || '未分类';
          const count = item.count || 0;
          const qty = item.total_qty || 0;
          const percent = ((count / totalSKUs) * 100).toFixed(1);
          const style = getDashboardCategoryStyle(cat);

          segHtml += `
            <div class="dash-bar-segment" 
                 style="width: ${percent}%; background: ${style.color};" 
                 title="${escapeHtml(cat)}: ${count} 种 (${qty.toLocaleString()} 件) · 占比 ${percent}%"
                 onclick="selectCategoryFilter('${escapeAttr(cat)}')">
            </div>
          `;

          legHtml += `
            <div class="dash-legend-item" onclick="selectCategoryFilter('${escapeAttr(cat)}')" title="点击筛选「${escapeHtml(cat)}」">
              <span class="dash-legend-dot" style="background: ${style.color};"></span>
              <span class="dash-legend-name">${escapeHtml(cat)}</span>
              <span class="dash-legend-count">${count}</span>
            </div>
          `;
        });

        segBar.innerHTML = segHtml;
        legendsEl.innerHTML = legHtml;
      }
    }

    // 3. 卡片 3 (物理收纳与健康度)
    const boxesCountEl = document.getElementById('dash-boxes-count');
    if (boxesCountEl) boxesCountEl.innerText = boxesCount;

    const lowStockNumEl = document.getElementById('dash-low-stock-num');
    if (lowStockNumEl) lowStockNumEl.innerText = lowStockCount;

    const alertPill = document.getElementById('dash-low-stock-alert');
    if (alertPill) {
      if (lowStockCount > 0) {
        alertPill.className = 'dash-alert-pill has-alert';
        alertPill.innerHTML = `<span>⚠️ 待补料:</span> <strong id="dash-low-stock-num">${lowStockCount}</strong> <span>种</span>`;
      } else {
        alertPill.className = 'dash-alert-pill all-good';
        alertPill.innerHTML = `<span>✓ 无缺料</span>`;
      }
    }

    const healthTextEl = document.getElementById('dash-storage-health-text');
    if (healthTextEl) {
      if (lowStockCount === 0) {
        healthTextEl.innerText = `物理收纳健康 · 活跃收纳单元 ${boxesCount} 个 · 全部充盈`;
      } else {
        healthTextEl.innerText = `存在 ${lowStockCount} 项物料低于安全库存 · 点击预警可直接查看`;
      }
    }

    // 4. 收起态单行摘要条
    const miniTypes = document.getElementById('dash-mini-types');
    if (miniTypes) miniTypes.innerText = totalSKUs;

    const miniPieces = document.getElementById('dash-mini-pieces');
    if (miniPieces) miniPieces.innerText = totalPieces.toLocaleString();

    const miniBoxes = document.getElementById('dash-mini-boxes');
    if (miniBoxes) miniBoxes.innerText = boxesCount;

    const miniLowSpan = document.getElementById('dash-mini-low-stock');
    if (miniLowSpan) {
      if (lowStockCount > 0) {
        miniLowSpan.style.display = 'inline';
        miniLowSpan.innerHTML = `⚠️ <strong id="dash-mini-low-num" style="color: #b45309;">${lowStockCount}</strong> 种待补料`;
      } else {
        miniLowSpan.style.display = 'inline';
        miniLowSpan.innerHTML = `<span style="color: #16a34a;">✓ 储备充裕</span>`;
      }
    }

    // 更新原生分类栏的“全部”总数显示
    const totalCountEl = document.getElementById('total-count-num');
    if (totalCountEl && !currentCategoryFilter && !currentSearchQuery) {
      totalCountEl.innerText = totalSKUs;
    }

  } catch (err) {
    console.warn('刷新工坊看板失败:', err);
  }
}

async function refreshLowStockBadge() {
  try {
    const res = await fetch('/api/components/low-stock');
    const result = await res.json();
    if (result.success && Array.isArray(result.data)) {
      const count = result.data.length;
      const countEl = document.getElementById('low-stock-count-num');
      if (countEl) countEl.innerText = count;

      const btnExport = document.getElementById('btn-export-replenishment');
      if (btnExport) {
        btnExport.style.display = count > 0 ? 'inline-flex' : 'none';
      }
    }
  } catch (err) {
    console.warn('获取低库存统计失败:', err);
  }
}

async function loadInventory() {
  try {
    const params = new URLSearchParams();
    if (currentSearchQuery) params.append('query', currentSearchQuery);
    if (currentCategoryFilter === '__low_stock__') {
      params.append('low_stock', 'true');
    } else if (currentCategoryFilter) {
      params.append('category', currentCategoryFilter);
    }

    const res = await fetch(`/api/components?${params.toString()}`);
    const result = await res.json();
    if (result.success) {
      allComponents = result.data;
      const countEl = document.getElementById('total-count-num');
      if (countEl && currentCategoryFilter !== '__low_stock__') {
        if (!currentCategoryFilter && !currentSearchQuery) {
          countEl.innerText = result.count;
        }
      }
      const pillEl = document.getElementById('table-total-pill');
      if (pillEl) pillEl.innerText = `共 ${result.count} 项`;
      renderProTable(result.data);
      refreshLowStockBadge();
      refreshWorkshopDashboard();
    }
  } catch (err) {
    console.error('加载库存失败:', err);
  }
}

function renderProTableHeader(category) {
  const thead = document.getElementById('pro-table-head');
  if (!thead) return;

  if (category === '电阻') {
    thead.innerHTML = `
      <tr>
        <th class="pro-th" data-sort="name" style="width: 22%;">品名 / 型号 <span class="sort-icon">▲▼</span></th>
        <th class="pro-th" data-sort="standard_value" style="width: 20%;">标称阻值 ⚡ <span class="sort-icon">▲▼</span></th>
        <th class="pro-th" data-sort="tolerance" style="width: 10%;">精度 <span class="sort-icon">▲▼</span></th>
        <th class="pro-th" data-sort="package" style="width: 10%;">封装 <span class="sort-icon">▲▼</span></th>
        <th class="pro-th" data-sort="location" style="width: 16%;">存放位置 <span class="sort-icon">▲▼</span></th>
        <th class="pro-th" data-sort="lcsc_part" style="width: 10%;">立创编号</th>
        <th class="pro-th" data-sort="quantity" style="text-align: right; width: 12%;">库存余量 <span class="sort-icon">▲▼</span></th>
        <th class="pro-th" style="text-align: center; width: 40px;"></th>
      </tr>
    `;
  } else if (category === '电容') {
    thead.innerHTML = `
      <tr>
        <th class="pro-th" data-sort="name" style="width: 22%;">品名 / 型号 <span class="sort-icon">▲▼</span></th>
        <th class="pro-th" data-sort="standard_value" style="width: 20%;">标称容值 🔋 <span class="sort-icon">▲▼</span></th>
        <th class="pro-th" data-sort="voltage" style="width: 10%;">额定耐压 <span class="sort-icon">▲▼</span></th>
        <th class="pro-th" data-sort="package" style="width: 10%;">封装 <span class="sort-icon">▲▼</span></th>
        <th class="pro-th" data-sort="location" style="width: 16%;">存放位置 <span class="sort-icon">▲▼</span></th>
        <th class="pro-th" data-sort="lcsc_part" style="width: 10%;">立创编号</th>
        <th class="pro-th" data-sort="quantity" style="text-align: right; width: 12%;">库存余量 <span class="sort-icon">▲▼</span></th>
        <th class="pro-th" style="text-align: center; width: 40px;"></th>
      </tr>
    `;
  } else if (category === '芯片') {
    thead.innerHTML = `
      <tr>
        <th class="pro-th" data-sort="name" style="width: 24%;">芯片型号 🔲 <span class="sort-icon">▲▼</span></th>
        <th class="pro-th" data-sort="value" style="width: 20%;">功能特性 / 描述 <span class="sort-icon">▲▼</span></th>
        <th class="pro-th" data-sort="package" style="width: 12%;">封装 <span class="sort-icon">▲▼</span></th>
        <th class="pro-th" data-sort="location" style="width: 18%;">存放位置 <span class="sort-icon">▲▼</span></th>
        <th class="pro-th" data-sort="lcsc_part" style="width: 12%;">立创编号</th>
        <th class="pro-th" data-sort="quantity" style="text-align: right; width: 14%;">库存余量 <span class="sort-icon">▲▼</span></th>
        <th class="pro-th" style="text-align: center; width: 40px;"></th>
      </tr>
    `;
  } else {
    thead.innerHTML = `
      <tr>
        <th class="pro-th" data-sort="name" style="width: 24%;">型号 / 品名 <span class="sort-icon">▲▼</span></th>
        <th class="pro-th" data-sort="category" style="width: 12%;">分类 <span class="sort-icon">▲▼</span></th>
        <th class="pro-th" data-sort="package" style="width: 12%;">封装 <span class="sort-icon">▲▼</span></th>
        <th class="pro-th" data-sort="value" style="width: 16%;">规格参数 <span class="sort-icon">▲▼</span></th>
        <th class="pro-th" data-sort="location" style="width: 16%;">存放位置 <span class="sort-icon">▲▼</span></th>
        <th class="pro-th" data-sort="lcsc_part" style="width: 10%;">立创编号</th>
        <th class="pro-th" data-sort="quantity" style="text-align: right; width: 10%;">库存余量 <span class="sort-icon">▲▼</span></th>
        <th class="pro-th" style="text-align: center; width: 40px;"></th>
      </tr>
    `;
  }
  initTableSorting();
}

function initTableSorting() {
  const ths = document.querySelectorAll('.pro-th[data-sort]');
  ths.forEach(th => {
    th.addEventListener('click', () => {
      const col = th.getAttribute('data-sort');
      if (currentSortCol === col) {
        currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
      } else {
        currentSortCol = col;
        currentSortOrder = (col === 'quantity') ? 'desc' : 'asc';
      }
      updateSortIndicators();
      renderProTable(allComponents);
    });
  });
  updateSortIndicators();
}

function updateSortIndicators() {
  document.querySelectorAll('.pro-th[data-sort]').forEach(th => {
    const col = th.getAttribute('data-sort');
    const icon = th.querySelector('.sort-icon');
    if (col === currentSortCol) {
      th.classList.add('sorted');
      if (icon) icon.innerText = currentSortOrder === 'asc' ? '▲' : '▼';
    } else {
      th.classList.remove('sorted');
      if (icon) icon.innerText = '▲▼';
    }
  });
}

function sortList(list) {
  if (!currentSortCol || !list) return list || [];
  return [...list].sort((a, b) => {
    let valA = a[currentSortCol];
    let valB = b[currentSortCol];

    if (currentSortCol === 'standard_value') {
      const numA = (a.standard_value !== null && a.standard_value !== undefined) ? Number(a.standard_value) : -Infinity;
      const numB = (b.standard_value !== null && b.standard_value !== undefined) ? Number(b.standard_value) : -Infinity;
      return currentSortOrder === 'asc' ? numA - numB : numB - numA;
    }

    if (currentSortCol === 'value') {
      if (a.standard_value !== null && a.standard_value !== undefined && b.standard_value !== null && b.standard_value !== undefined) {
        return currentSortOrder === 'asc' ? Number(a.standard_value) - Number(b.standard_value) : Number(b.standard_value) - Number(a.standard_value);
      }
      valA = a.value || a.standard_value || a.notes || '';
      valB = b.value || b.standard_value || b.notes || '';
    }

    if (valA === null || valA === undefined) valA = '';
    if (valB === null || valB === undefined) valB = '';

    if (typeof valA === 'number' && typeof valB === 'number') {
      return currentSortOrder === 'asc' ? valA - valB : valB - valA;
    }

    const strA = String(valA).toLowerCase();
    const strB = String(valB).toLowerCase();
    return currentSortOrder === 'asc'
      ? strA.localeCompare(strB, 'zh-CN')
      : strB.localeCompare(strA, 'zh-CN');
  });
}

function formatResValue(item) {
  if (item.standard_value !== null && item.standard_value !== undefined) {
    const ohms = item.standard_value;
    if (ohms >= 1000000) return (ohms / 1000000) + ' MΩ';
    if (ohms >= 1000) return (ohms / 1000) + ' kΩ';
    return ohms + ' Ω';
  }
  return item.value || '-';
}

function formatCapValue(item) {
  if (item.standard_value !== null && item.standard_value !== undefined) {
    const pF = item.standard_value;
    const nF = pF / 1000;
    const uF = pF / 1000000;
    if (uF >= 1) return `${uF} µF`;
    if (nF >= 1) return `${nF} nF (${(uF < 1 ? nF * 0.001 : uF).toFixed(1)}µF)`;
    return `${pF} pF`;
  }
  return item.value || '-';
}

function formatSpec(item) {
  const parts = [];
  if (item.category === '电阻' && item.standard_value !== null && item.standard_value !== undefined) {
    const ohms = item.standard_value;
    const str = ohms >= 1000000 ? (ohms / 1000000) + ' MΩ' : (ohms >= 1000 ? (ohms / 1000) + ' kΩ' : ohms + ' Ω');
    parts.push(str);
  } else if (item.category === '电容' && item.standard_value !== null && item.standard_value !== undefined) {
    const pF = item.standard_value;
    const nF = pF / 1000;
    const uF = pF / 1000000;
    if (uF >= 1) parts.push(`${uF} µF`);
    else if (nF >= 1) parts.push(`${nF} nF`);
    else parts.push(`${pF} pF`);
  } else if (item.value) {
    parts.push(item.value);
  }

  if (item.voltage) parts.push(`${item.voltage}V`);
  if (item.tolerance) parts.push(item.tolerance);

  if (parts.length > 0) {
    return parts.join(' · ');
  }
  return item.notes ? item.notes.slice(0, 20) : '-';
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

function filterByLocation(loc) {
  if (!loc) return;
  const searchInput = document.getElementById('inventory-search');
  if (searchInput) {
    if (searchInput.value === loc) {
      searchInput.value = '';
      currentSearchQuery = '';
    } else {
      searchInput.value = loc;
      currentSearchQuery = loc;
    }
    loadInventory();
  }
}

function renderProTable(list) {
  const tbody = document.getElementById('pro-table-body');
  const emptyHint = document.getElementById('empty-hint');
  const totalPill = document.getElementById('table-total-pill');
  if (totalPill) totalPill.innerText = `共 ${list ? list.length : 0} 项`;

  if (!list || list.length === 0) {
    if (tbody) tbody.innerHTML = '';
    if (emptyHint) emptyHint.style.display = 'block';
    return;
  }
  if (emptyHint) emptyHint.style.display = 'none';

  const sortedList = sortList(list);

  let html = '';
  sortedList.forEach(item => {
    const icon = getCategoryIcon(item.category);
    const locText = item.location ? item.location : '随手放';

    let lcscHtml = '<span style="color: var(--text-dim);">-</span>';
    if (item.lcsc_part) {
      const cNum = item.lcsc_part.toUpperCase().trim();
      const numOnly = cNum.replace('C', '');
      const link = item.datasheet_url || `https://item.szlcsc.com/${numOnly}.html`;
      lcscHtml = `<a href="${link}" target="_blank" class="lcsc-link-badge" onclick="event.stopPropagation();" title="在新标签页查看立创官方规格书"><span>${escapeHtml(cNum)}</span> <span style="font-size: 10px;">↗</span></a>`;
    }

    const locChipHtml = `
      <span class="location-chip-interactive" onclick="filterByLocation('${escapeAttr(item.location || '')}'); event.stopPropagation();" title="按此收纳盒过滤">
        <span>📦</span> ${escapeHtml(locText)}
      </span>
    `;

    const dotHtml = item.is_low_stock 
      ? `<span class="stock-status-dot dot-warning" title="当前库存 ${item.quantity} 件，低于安全阈值 ${item.effective_min_stock} 件"></span>` 
      : `<span class="stock-status-dot dot-ok" title="库存充足 (${item.quantity} 件)"></span>`;

    const stepperHtml = `
      <div style="display: inline-flex; align-items: center; justify-content: flex-end;">
        ${dotHtml}
        ${item.is_low_stock ? `<span class="badge-low-stock" title="当前库存 ${item.quantity} 件，低于安全阈值 ${item.effective_min_stock} 件">⚠️ 需补</span>` : ''}
        <div class="pro-table-stepper ${item.is_low_stock ? 'low-stock' : ''}" onclick="event.stopPropagation();">
          <button class="mini-step-btn" onclick="stepQuantity(${item.id}, -1)">−</button>
          <span class="mini-step-val" id="row-qty-${item.id}">${item.quantity}</span>
          <button class="mini-step-btn" onclick="stepQuantity(${item.id}, 1)">＋</button>
        </div>
      </div>
    `;

    if (currentCategoryFilter === '电阻') {
      html += `
        <tr onclick="openDetailDrawer(${item.id})">
          <td class="pro-td">
            <div class="pro-td-name">
              <span style="font-size: 15px;">⚡</span>
              <span title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
            </div>
          </td>
          <td class="pro-td">
            <span class="param-badge-res">${escapeHtml(formatResValue(item))}</span>
          </td>
          <td class="pro-td">
            <span class="sub-tag-pill">${escapeHtml(item.tolerance || '±1%')}</span>
          </td>
          <td class="pro-td">
            <span class="sub-tag-pill pro-td-mono">${escapeHtml(item.package || '-')}</span>
          </td>
          <td class="pro-td">${locChipHtml}</td>
          <td class="pro-td">${lcscHtml}</td>
          <td class="pro-td" style="text-align: right;">${stepperHtml}</td>
          <td class="pro-td" style="text-align: center;">
            <button class="pro-row-action-btn" title="查看官方规格与编辑">↗</button>
          </td>
        </tr>
      `;
    } else if (currentCategoryFilter === '电容') {
      html += `
        <tr onclick="openDetailDrawer(${item.id})">
          <td class="pro-td">
            <div class="pro-td-name">
              <span style="font-size: 15px;">🔋</span>
              <span title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
            </div>
          </td>
          <td class="pro-td">
            <span class="param-badge-cap">${escapeHtml(formatCapValue(item))}</span>
          </td>
          <td class="pro-td">
            <span class="sub-tag-pill">${item.voltage ? item.voltage + 'V' : (item.tolerance || '-')}</span>
          </td>
          <td class="pro-td">
            <span class="sub-tag-pill pro-td-mono">${escapeHtml(item.package || '-')}</span>
          </td>
          <td class="pro-td">${locChipHtml}</td>
          <td class="pro-td">${lcscHtml}</td>
          <td class="pro-td" style="text-align: right;">${stepperHtml}</td>
          <td class="pro-td" style="text-align: center;">
            <button class="pro-row-action-btn" title="查看官方规格与编辑">↗</button>
          </td>
        </tr>
      `;
    } else if (currentCategoryFilter === '芯片') {
      html += `
        <tr onclick="openDetailDrawer(${item.id})">
          <td class="pro-td">
            <div class="pro-td-name">
              <span style="font-size: 15px;">🔲</span>
              <span title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
            </div>
          </td>
          <td class="pro-td">
            <span class="param-badge-chip">${escapeHtml(item.notes || item.value || item.manufacturer || '-')}</span>
          </td>
          <td class="pro-td">
            <span class="sub-tag-pill pro-td-mono">${escapeHtml(item.package || '-')}</span>
          </td>
          <td class="pro-td">${locChipHtml}</td>
          <td class="pro-td">${lcscHtml}</td>
          <td class="pro-td" style="text-align: right;">${stepperHtml}</td>
          <td class="pro-td" style="text-align: center;">
            <button class="pro-row-action-btn" title="查看官方规格与编辑">↗</button>
          </td>
        </tr>
      `;
    } else {
      const spec = formatSpec(item);
      html += `
        <tr onclick="openDetailDrawer(${item.id})">
          <td class="pro-td">
            <div class="pro-td-name">
              <span style="font-size: 15px;">${icon}</span>
              <span title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
            </div>
          </td>
          <td class="pro-td">
            <span class="sub-tag-pill">${escapeHtml(item.category || '-')}</span>
          </td>
          <td class="pro-td">
            <span class="sub-tag-pill pro-td-mono">${escapeHtml(item.package || '-')}</span>
          </td>
          <td class="pro-td" style="color: var(--text-muted); font-size: 12px;">
            ${escapeHtml(spec)}
          </td>
          <td class="pro-td">${locChipHtml}</td>
          <td class="pro-td">${lcscHtml}</td>
          <td class="pro-td" style="text-align: right;">${stepperHtml}</td>
          <td class="pro-td" style="text-align: center;">
            <button class="pro-row-action-btn" title="查看官方规格与编辑">↗</button>
          </td>
        </tr>
      `;
    }
  });

  if (tbody) tbody.innerHTML = html;
}

function getCategoryIcon(cat) {
  const map = {
    '电阻': '⚡',
    '电容': '🔋',
    '芯片': '🔲',
    '二极管': '▲',
    '三极管/MOS': '◈',
    '接插件': '🔌',
    '模块': '📦',
    '电感': '🌀'
  };
  return map[cat] || '🔹';
}

async function stepQuantity(id, delta) {
  try {
    const res = await fetch(`/api/components/${id}/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delta })
    });
    const result = await res.json();
    if (result.success) {
      const target = allComponents.find(c => c.id === id);
      if (target) {
        target.quantity = result.data.quantity;
        const effMin = target.effective_min_stock !== undefined
          ? target.effective_min_stock
          : (target.min_stock !== null && target.min_stock !== undefined
              ? target.min_stock
              : (['电阻', '电容', '电感'].includes(target.category) ? 20 : 3));
        target.effective_min_stock = effMin;
        target.is_low_stock = result.data.quantity <= effMin;
      }

      const el = document.getElementById(`row-qty-${id}`);
      if (el) el.innerText = result.data.quantity;

      const detailInput = document.getElementById('detail-quantity');
      const detailId = document.getElementById('detail-id');
      if (detailInput && detailId && parseInt(detailId.value, 10) === id) {
        detailInput.value = result.data.quantity;
      }
      const specQty = document.getElementById('spec-qty');
      if (specQty && detailId && parseInt(detailId.value, 10) === id) {
        specQty.innerText = `${result.data.quantity} 件`;
      }

      if (window.playBeep) window.playBeep();

      refreshLowStockBadge();
      refreshWorkshopDashboard();

      // 如果当前筛选的是待补货，或更新了警戒状态，刷新视图
      if (currentCategoryFilter === '__low_stock__') {
        loadInventory();
      } else {
        renderProTable(allComponents);
      }

      // 如果详情抽屉当前正展示该元件，同步刷新该元件的单品时间轴
      if (detailId && parseInt(detailId.value, 10) === id) {
        loadComponentLogs(id);
      }
    }
  } catch (err) {
    console.error('调整数量失败:', err);
  }
}

// ==================== 3. 抽屉式「记一笔」轻量录入 ====================

function showToast(msg, duration = 2800) {
  let el = document.getElementById('apple-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'apple-toast';
    el.className = 'apple-toast';
    document.body.appendChild(el);
  }
  if (el.parentElement !== document.body) {
    document.body.appendChild(el);
  }

  el.innerHTML = msg;
  if (el.classList) {
    el.classList.remove('show');
    void el.offsetWidth; // 触发 reflow，确保微弹动效每次都完整播放
    el.classList.add('show');
  }

  clearTimeout(el._toastTimer);
  el._toastTimer = setTimeout(() => {
    if (el.classList) el.classList.remove('show');
  }, duration);
}

function parseResInput(str) {
  if (!str) return null;
  const s = str.trim().toUpperCase();
  const alt = s.match(/^(\d+)([RKMΩ])(\d+)$/);
  if (alt) {
    const val = parseFloat(`${alt[1]}.${alt[3]}`);
    const u = alt[2];
    if (u === 'K') return { standard_value: val * 1000, display: `${val}kΩ`, hint: `💡 识别为 ${val} kΩ (${val * 1000} Ω)` };
    if (u === 'M') return { standard_value: val * 1000000, display: `${val}MΩ`, hint: `💡 识别为 ${val} MΩ (${val * 1000000} Ω)` };
    if (u === 'R' || u === 'Ω') return { standard_value: val, display: `${val}Ω`, hint: `💡 识别为 ${val} Ω` };
  }
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(KΩ|KOHM|MΩ|MOHM|K|M|R|OHM|Ω)?$/);
  if (m) {
    const num = parseFloat(m[1]);
    const u = (m[2] || '').replace('Ω', '').replace('OHM', '');
    if (u === 'K') return { standard_value: num * 1000, display: `${num}kΩ`, hint: `💡 识别为 ${num} kΩ (${num * 1000} Ω)` };
    if (u === 'M') return { standard_value: num * 1000000, display: `${num}MΩ`, hint: `💡 识别为 ${num} MΩ (${num * 1000000} Ω)` };
    return { standard_value: num, display: `${num}Ω`, hint: `💡 识别为 ${num} Ω` };
  }
  return null;
}

function parseCapInput(str) {
  if (!str) return null;
  const s = str.trim().toLowerCase();
  const code = s.match(/^([1-9]\d)([0-7])$/);
  if (code && !s.includes('v') && !s.includes('f')) {
    const base = parseInt(code[1], 10);
    const exp = parseInt(code[2], 10);
    const pF = base * Math.pow(10, exp);
    const nF = pF / 1000;
    const uF = pF / 1000000;
    const disp = uF >= 1 ? `${uF}µF` : (nF >= 1 ? `${nF}nF` : `${pF}pF`);
    return { standard_value: pF, display: disp, hint: `💡 代码 ${s} = ${disp} (等效 ${nF}nF / ${pF}pF)` };
  }
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(pf|p|nf|n|uf|u|µf)?$/);
  if (m) {
    const num = parseFloat(m[1]);
    const u = m[2] || '';
    let pF = num;
    if (u === 'nf' || u === 'n') pF = num * 1000;
    else if (u === 'uf' || u === 'u' || u === 'µf') pF = num * 1000000;
    const nF = pF / 1000;
    const uF = pF / 1000000;
    const disp = uF >= 1 ? `${uF}µF` : (nF >= 1 ? `${nF}nF` : `${pF}pF`);
    return { standard_value: pF, display: disp, hint: `💡 识别为 ${disp} (等效 ${nF} nF / ${uF} µF)` };
  }
  return null;
}

function updateCategorySpecsVisibility(cat, prefix = 'entry') {
  const boxRes = document.getElementById(`${prefix}-specs-res`);
  const boxCap = document.getElementById(`${prefix}-specs-cap`);
  const boxInd = document.getElementById(`${prefix}-specs-ind`);
  const boxOther = document.getElementById(`${prefix}-specs-other`);

  if (boxRes) boxRes.style.display = (cat === '电阻') ? 'block' : 'none';
  if (boxCap) boxCap.style.display = (cat === '电容') ? 'block' : 'none';
  if (boxInd) boxInd.style.display = (cat === '电感') ? 'block' : 'none';
  if (boxOther) boxOther.style.display = (!['电阻', '电容', '电感'].includes(cat)) ? 'block' : 'none';
}


// ==================== 连续录入与全能速记工作流状态 ====================
let continuousHistory = [];
let currentSmdCandidates = [];
let lastParsedOmniData = null;
let currentEntryMode = 'single'; // 'single' | 'scratchpad'
let scratchpadQueue = [];

// 模式切换: 单件盲打 (single) vs 多行随手记 (scratchpad)
function switchEntryMode(mode) {
  currentEntryMode = mode;
  const tabSingle = document.getElementById('tab-entry-single');
  const tabScratch = document.getElementById('tab-entry-scratchpad');
  const viewSingle = document.getElementById('view-entry-single');
  const viewScratch = document.getElementById('view-entry-scratchpad');

  if (mode === 'scratchpad') {
    if (tabSingle) tabSingle.classList.remove('active');
    if (tabScratch) tabScratch.classList.add('active');
    if (viewSingle) viewSingle.style.display = 'none';
    if (viewScratch) viewScratch.style.display = 'block';
    setTimeout(() => {
      const area = document.getElementById('scratchpad-textarea');
      if (area) area.focus();
    }, 100);
  } else {
    if (tabSingle) tabSingle.classList.add('active');
    if (tabScratch) tabScratch.classList.remove('active');
    if (viewSingle) viewSingle.style.display = 'block';
    if (viewScratch) viewScratch.style.display = 'none';
    setTimeout(() => {
      const inp = document.getElementById('entry-text-input');
      if (inp) inp.focus();
    }, 100);
  }
}

// 填充真实场景示例文本
function fillScratchpadExample(type) {
  const area = document.getElementById('scratchpad-textarea');
  if (!area) return;

  if (type === 'multi') {
    area.value = "10k 0805 100 A-01\n0.1uF 0603 50V 200 A-02\nAMS1117-3.3 20 贴片盒1\nS8050 50个";
  } else if (type === 'taobao') {
    area.value = "贴片厚膜电阻 0805 10K 1% 100只 厚声 全新原装 正品\n直拍 贴片三极管 S8050 J3Y SOT-23 200只 丝印J3Y\n全新 1N4148W SOD-123 丝印 A7 高速开关二极管 100PCS";
  } else if (type === 'natural') {
    area.value = "今天刚到了100个0805的10k电阻放A1盒子，还有50个AMS1117-3.3稳压芯片放A2，另外买了20片STM32F103C8T6在抽屉3";
  }

  triggerParseScratchpad();
}

// 清空随手记文本与队列
function clearScratchpad() {
  const area = document.getElementById('scratchpad-textarea');
  if (area) area.value = '';
  scratchpadQueue = [];
  renderScratchpadQueue();
  if (area) area.focus();
}

// 触发多行随手记智能拆解与查重比对
async function triggerParseScratchpad() {
  const area = document.getElementById('scratchpad-textarea');
  if (!area) return;
  const text = area.value.trim();
  if (!text) {
    showToast('⚠️ 请输入或粘贴待拆解的内容');
    area.focus();
    return;
  }

  const btnParse = document.getElementById('btn-scratchpad-parse');
  const origText = btnParse ? btnParse.innerText : '';
  if (btnParse) {
    btnParse.innerText = '⚡ 拆解中...';
    btnParse.disabled = true;
  }

  try {
    const res = await fetch('/api/components/parse-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const result = await res.json();
    if (!result.success || !result.items) {
      throw new Error(result.error || '拆解异常');
    }

    scratchpadQueue = result.items.map(it => ({
      ...it,
      isForceNew: false
    }));

    renderScratchpadQueue();
    showToast(`✔ 成功拆解出 ${scratchpadQueue.length} 项元器件！`);
  } catch (err) {
    alert('拆解失败: ' + err.message);
  } finally {
    if (btnParse) {
      btnParse.innerText = origText;
      btnParse.disabled = false;
    }
  }
}

// 渲染卡片排队核对流 (Queue Cards)
function renderScratchpadQueue() {
  const section = document.getElementById('scratchpad-queue-section');
  const listEl = document.getElementById('scratchpad-queue-list');
  const statBadge = document.getElementById('queue-stat-badge');
  if (!section || !listEl) return;

  if (scratchpadQueue.length === 0) {
    section.style.display = 'none';
    listEl.innerHTML = '';
    return;
  }

  const totalPieces = scratchpadQueue.reduce((acc, it) => acc + (parseInt(it.quantity, 10) || 0), 0);
  if (statBadge) {
    statBadge.innerText = `${scratchpadQueue.length} 项 (${totalPieces} 件)`;
  }
  section.style.display = 'block';

  let html = '';
  scratchpadQueue.forEach((item, idx) => {
    const isDup = item.duplicate && item.duplicate.exists && !item.isForceNew;
    const catIcon = getCategoryIcon(item.category || '其他');
    const badgeHtml = isDup
      ? `<span class="queue-status-badge is-dup" title="命中在库元件【${escapeHtml(item.duplicate.name)}】">
          ⚠️ 合并存量 (${item.duplicate.current_quantity})
          <span class="queue-toggle-new-link" onclick="toggleQueueItemForceNew(${idx})">切另存</span>
        </span>`
      : `<span class="queue-status-badge is-new">
          ✨ 全新物料
          ${item.duplicate && item.duplicate.exists ? `<span class="queue-toggle-new-link" onclick="toggleQueueItemForceNew(${idx})">切合并</span>` : ''}
        </span>`;

    html += `
      <div class="scratchpad-queue-card" id="queue-card-${idx}">
        <div class="queue-card-top">
          <div class="queue-card-title-group">
            <span style="font-size: 18px;">${catIcon}</span>
            <span class="queue-card-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
            ${item.package ? `<span class="sub-tag-pill" style="font-size: 10px; font-weight: 600;">${escapeHtml(item.package)}</span>` : ''}
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            ${badgeHtml}
            <button type="button" class="queue-btn-remove" onclick="removeQueueItem(${idx})" title="从队列中移除此项">✕</button>
          </div>
        </div>

        <div class="queue-card-controls">
          <div class="queue-control-group">
            <span>📦 入库数:</span>
            <button type="button" class="tile-qty-btn" style="width: 20px; height: 20px; font-size: 11px;" onclick="stepQueueItemQty(${idx}, -10)">−</button>
            <input type="number" class="queue-qty-input" value="${item.quantity}" onchange="updateQueueItemQty(${idx}, this.value)" min="1">
            <button type="button" class="tile-qty-btn" style="width: 20px; height: 20px; font-size: 11px;" onclick="stepQueueItemQty(${idx}, 10)">＋</button>
            <span>件</span>
          </div>

          <div class="queue-control-group">
            <span>🗄️ 存放:</span>
            <input type="text" class="queue-loc-input" value="${escapeHtml(item.location || '贴片盒-01')}" onchange="updateQueueItemLoc(${idx}, this.value)">
          </div>
        </div>
      </div>
    `;
  });

  listEl.innerHTML = html;
}

// 步进修改队列单项数量
function stepQueueItemQty(idx, delta) {
  if (!scratchpadQueue[idx]) return;
  const curr = parseInt(scratchpadQueue[idx].quantity, 10) || 100;
  scratchpadQueue[idx].quantity = Math.max(1, curr + delta);
  renderScratchpadQueue();
}

// 修改队列单项数量输入
function updateQueueItemQty(idx, val) {
  if (!scratchpadQueue[idx]) return;
  scratchpadQueue[idx].quantity = Math.max(1, parseInt(val, 10) || 1);
  const totalPieces = scratchpadQueue.reduce((acc, it) => acc + (parseInt(it.quantity, 10) || 0), 0);
  const statBadge = document.getElementById('queue-stat-badge');
  if (statBadge) statBadge.innerText = `${scratchpadQueue.length} 项 (${totalPieces} 件)`;
}

// 修改队列单项位置
function updateQueueItemLoc(idx, loc) {
  if (!scratchpadQueue[idx]) return;
  scratchpadQueue[idx].location = loc.trim() || '随手存放处';
}

// 切换队列单项为“强制另存为新盒” vs “合并补仓”
function toggleQueueItemForceNew(idx) {
  if (!scratchpadQueue[idx]) return;
  scratchpadQueue[idx].isForceNew = !scratchpadQueue[idx].isForceNew;
  renderScratchpadQueue();
}

// 移除队列单项
function removeQueueItem(idx) {
  scratchpadQueue.splice(idx, 1);
  renderScratchpadQueue();
  showToast('已从排队清单移除');
}

// 一键全部存入并沉淀入库流水
async function submitScratchpadQueue() {
  if (scratchpadQueue.length === 0) return;

  const btnSubmit = document.getElementById('btn-queue-submit-all');
  const origText = btnSubmit ? btnSubmit.innerHTML : '';
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerText = '正在入库...';
  }

  const itemsPayload = scratchpadQueue.map(item => ({
    name: item.name,
    category: item.category,
    package: item.package,
    value: item.value,
    standard_value: item.standard_value,
    unit: item.unit,
    voltage: item.voltage,
    tolerance: item.tolerance,
    quantity: parseInt(item.quantity, 10) || 1,
    lcsc_part: item.lcsc_part,
    location: item.location || '随手存放处',
    notes: item.notes,
    image_url: item.image_url,
    datasheet_url: item.datasheet_url,
    duplicateTargetId: item.duplicate && item.duplicate.exists ? item.duplicate.id : null,
    isForceNew: !!item.isForceNew
  }));

  try {
    const res = await fetch('/api/components/batch-add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: itemsPayload })
    });
    const result = await res.json();
    if (!result.success || !result.data) {
      throw new Error(result.error || '入库失败');
    }

    // 记录到连续录入历史中以便一键撤销
    const data = result.data;
    if (Array.isArray(data.created)) {
      data.created.forEach(it => {
        continuousHistory.unshift({
          historyId: 'h_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          componentId: it.componentId,
          name: it.name,
          quantity: it.quantity,
          location: it.location,
          isAdd: false
        });
      });
    }
    if (Array.isArray(data.merged)) {
      data.merged.forEach(it => {
        continuousHistory.unshift({
          historyId: 'h_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          componentId: it.componentId,
          name: it.name,
          quantity: it.quantity,
          location: it.location,
          isAdd: true
        });
      });
    }

    renderContinuousHistory();
    if (window.playBeep) window.playBeep();
    showToast(`✔ 成功批量入库 ${data.total} 项元器件！`);

    // 清空便签与队列
    clearScratchpad();

    const isContinuous = document.getElementById('chk-continuous-mode') ? document.getElementById('chk-continuous-mode').checked : true;
    if (!isContinuous) {
      closeDrawer('drawer-entry-backdrop');
    }

    loadInventory();
    loadFrequentLocations();
  } catch (err) {
    alert('批量存入异常: ' + err.message);
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = origText;
    }
  }
}

// 收纳盒末尾数字自增算法 (支持 A-01 -> A-02, 抽屉-1 -> 抽屉-2, Box-09 -> Box-10)
function incrementLocationString(str) {
  if (!str) return str;
  const m = str.match(/^(.*?)(\d+)$/);
  if (!m) return str;
  const prefix = m[1];
  const numStr = m[2];
  const nextNum = parseInt(numStr, 10) + 1;
  const padded = String(nextNum).padStart(numStr.length, '0');
  return prefix + padded;
}

// 快捷示例点选填入与识别
function fillQuickExample(text) {
  const input = document.getElementById('entry-text-input');
  if (input) {
    input.value = text;
    triggerParseText(text);
  }
}

// 展开 / 收起更多专业参数微调区
function toggleAdvancedDrawer() {
  const body = document.getElementById('advanced-drawer-body');
  const icon = document.getElementById('advanced-toggle-icon');
  if (!body) return;
  const isHidden = body.style.display === 'none' || !body.style.display;
  if (isHidden) {
    body.style.display = 'block';
    if (icon) icon.innerText = '▲';
  } else {
    body.style.display = 'none';
    if (icon) icon.innerText = '▼';
  }
}

// 仪表盘步进修改本次入库数量
function stepCardQty(delta) {
  const qtyEl = document.getElementById('card-qty-display');
  let current = parseInt(qtyEl ? qtyEl.innerText : '100', 10) || 100;
  let next = Math.max(1, current + delta);
  if (qtyEl) qtyEl.innerText = next;

  const inputQty = document.getElementById('input-quantity');
  if (inputQty) inputQty.value = next;

  // 联动更新查重对账明细
  if (duplicateTarget) {
    const prev = duplicateTarget.quantity || 0;
    const auditAdd = document.getElementById('audit-add-qty');
    const auditTotal = document.getElementById('audit-total-qty');
    if (auditAdd) auditAdd.innerText = next;
    if (auditTotal) auditTotal.innerText = prev + next;
  }
}

// 仪表盘快捷更改收纳盒位置
function promptChangeLocation() {
  const currentLoc = (document.getElementById('card-loc-text') ? document.getElementById('card-loc-text').innerText.trim() : '') || '贴片盒-01';
  const newLoc = prompt('请输入/修改目标收纳盒或物理位置 (例如: A-01, 贴片盒-R02, 抽屉3):', currentLoc);
  if (newLoc !== null && newLoc.trim() !== '') {
    const loc = newLoc.trim();
    const cardLocText = document.getElementById('card-loc-text');
    if (cardLocText) cardLocText.innerText = loc;
    const inputLoc = document.getElementById('input-location');
    if (inputLoc) inputLoc.value = loc;
  }
}

// 渲染切词胶囊预览条
function renderOmniboxChips(data) {
  const bar = document.getElementById('omnibox-chips-bar');
  if (!bar) return;
  if (!data) {
    bar.style.display = 'none';
    bar.innerHTML = '';
    return;
  }

  const chips = [];
  if (data.name) chips.push(`<span class="omnibox-chip chip-val" title="解析型号/阻容">🏷️ ${escapeHtml(data.name)}</span>`);
  if (data.package) chips.push(`<span class="omnibox-chip chip-pkg" title="提取封装">📦 ${escapeHtml(data.package)}</span>`);
  if (data.extracted_quantity) chips.push(`<span class="omnibox-chip chip-qty" title="提取数量">🔢 ${data.extracted_quantity} 件</span>`);
  if (data.extracted_location) chips.push(`<span class="omnibox-chip chip-loc" title="提取收纳盒">🗄️ ${escapeHtml(data.extracted_location)}</span>`);

  if (chips.length > 0) {
    bar.innerHTML = chips.join('');
    bar.style.display = 'flex';
  } else {
    bar.style.display = 'none';
    bar.innerHTML = '';
  }
}

// 渲染 SMD 贴片丝印候选胶囊
function renderSmdCandidates(candidates) {
  const bar = document.getElementById('smd-candidates-bar');
  if (!bar) return;
  currentSmdCandidates = candidates || [];
  if (!candidates || candidates.length <= 1) {
    bar.style.display = 'none';
    bar.innerHTML = '';
    return;
  }

  let html = `<span style="font-size: 11px; color: #86198f; font-weight: 600;">⚡ 匹配到多个贴片丝印 (按数字键秒选):</span>`;
  candidates.forEach((c, idx) => {
    const key = idx + 1;
    html += `
      <div class="smd-candidate-pill ${idx === 0 ? 'active' : ''}" onclick="selectSmdCandidate(${idx})" title="${escapeHtml(c.desc || '')}">
        <span class="smd-candidate-key">${key}</span>
        <span>${escapeHtml(c.name)}</span>
        <span style="opacity: 0.7; font-size: 10px;">(${escapeHtml(c.package || '')})</span>
      </div>
    `;
  });
  bar.innerHTML = html;
  bar.style.display = 'flex';
}

// 切换选中的 SMD 贴片丝印候选
function selectSmdCandidate(idx) {
  if (!currentSmdCandidates || !currentSmdCandidates[idx]) return;
  const c = currentSmdCandidates[idx];

  const pills = document.querySelectorAll('.smd-candidate-pill');
  pills.forEach((p, i) => p.classList.toggle('active', i === idx));

  updateEntryIdentityCard(c);
  showToast(`已选用【${c.name}】(${c.package || '标准'})`);
}

// 驱动元器件大字确认卡片 (Identity Card)
function updateEntryIdentityCard(d) {
  if (!d) return;

  const emptyCard = document.getElementById('entry-card-empty');
  const activeCard = document.getElementById('entry-card-active');
  if (emptyCard) emptyCard.style.display = 'none';
  if (activeCard) activeCard.style.display = 'block';

  // 1. 分类图标与大字品名
  const catIcon = document.getElementById('card-cat-icon');
  const titleText = document.getElementById('card-title-text');
  if (catIcon) catIcon.innerText = getCategoryIcon(d.category || '其他');
  if (titleText) titleText.innerText = d.name || '未命名物料';

  // 2. 封装与参数规格 Pill
  const pkgChip = document.getElementById('card-pkg-chip');
  if (pkgChip) {
    pkgChip.innerText = d.package || '标准封装';
    pkgChip.style.display = 'inline-block';
  }

  const specParts = [];
  if (d.voltage) specParts.push(d.voltage + 'V');
  if (d.tolerance) specParts.push(d.tolerance);
  if (d.value && d.category !== '电阻' && d.category !== '电容') specParts.push(d.value);

  const specChip = document.getElementById('card-spec-chip');
  if (specChip) {
    if (specParts.length > 0) {
      specChip.innerText = specParts.join(' · ');
      specChip.style.display = 'inline-block';
    } else {
      specChip.style.display = 'none';
    }
  }

  const lcscChip = document.getElementById('card-lcsc-chip');
  if (lcscChip) {
    if (d.lcsc_part) {
      lcscChip.innerText = d.lcsc_part;
      lcscChip.style.display = 'inline-block';
    } else {
      lcscChip.style.display = 'none';
    }
  }

  // 3. 描述说明与图片
  const descText = document.getElementById('card-desc-text');
  if (descText) {
    const descParts = [];
    if (d.manufacturer) descParts.push(d.manufacturer);
    if (d.category) descParts.push(d.category);
    if (d.notes && d.notes !== d.name) descParts.push(d.notes);
    descText.innerText = descParts.length > 0 ? descParts.join(' · ') : (d.category ? `标准${d.category}元件` : '通用电子元件');
  }

  const thumbImg = document.getElementById('card-thumb-img');
  if (thumbImg) {
    if (d.image_url) {
      thumbImg.src = d.image_url;
      thumbImg.style.display = 'block';
    } else {
      thumbImg.style.display = 'none';
    }
  }

  // 4. 双联仪表: 存放收纳盒 (若图钉锁定且已有盒名，则保留，除非单行速记中明确指定了提取位置)
  const pinLoc = document.getElementById('chk-pin-location') && document.getElementById('chk-pin-location').checked;
  const currentLocDisplay = document.getElementById('card-loc-text');
  let finalLoc = '';
  if (d.extracted_location) {
    finalLoc = d.extracted_location;
  } else if (pinLoc && currentLocDisplay && currentLocDisplay.innerText && currentLocDisplay.innerText !== '未指定' && currentLocDisplay.innerText !== '随手存放处') {
    finalLoc = currentLocDisplay.innerText.trim();
  } else {
    finalLoc = document.getElementById('input-location') ? document.getElementById('input-location').value.trim() : '';
    if (!finalLoc) finalLoc = '贴片盒-01';
  }
  if (currentLocDisplay) currentLocDisplay.innerText = finalLoc;
  const inputLoc = document.getElementById('input-location');
  if (inputLoc) inputLoc.value = finalLoc;

  // 5. 双联仪表: 本次入库数量
  let finalQty = d.extracted_quantity || parseInt(document.getElementById('input-quantity') ? document.getElementById('input-quantity').value : '100', 10) || 100;
  const qtyDisplay = document.getElementById('card-qty-display');
  if (qtyDisplay) qtyDisplay.innerText = finalQty;
  const inputQty = document.getElementById('input-quantity');
  if (inputQty) inputQty.value = finalQty;

  // 6. 查重比对与对账条联动
  const matched = checkDuplicateInStock(d);
  const statusBar = document.getElementById('card-status-bar');
  const statusIcon = document.getElementById('card-status-icon');
  const statusText = document.getElementById('card-status-text');
  const auditBox = document.getElementById('card-audit-box');
  const btnSubmitText = document.getElementById('card-btn-text');
  const btnNewBox = document.getElementById('btn-card-new-box');

  if (matched) {
    duplicateTarget = matched;
    if (statusBar) {
      statusBar.className = 'card-status-bar is-duplicate';
      if (statusIcon) statusIcon.innerText = '⚠️';
      if (statusText) statusText.innerText = `已有库存匹配：在【${matched.location || '随手存放处'}】存有 ${matched.quantity} 件`;
    }
    if (auditBox) {
      auditBox.style.display = 'block';
      const prevEl = document.getElementById('audit-prev-qty');
      const addEl = document.getElementById('audit-add-qty');
      const totalEl = document.getElementById('audit-total-qty');
      if (prevEl) prevEl.innerText = matched.quantity;
      if (addEl) addEl.innerText = finalQty;
      if (totalEl) totalEl.innerText = matched.quantity + finalQty;
    }
    if (btnSubmitText) btnSubmitText.innerText = '✔ 合并累加';
    if (btnNewBox) btnNewBox.style.display = 'inline-block';
  } else {
    duplicateTarget = null;
    if (statusBar) {
      statusBar.className = 'card-status-bar is-new';
      if (statusIcon) statusIcon.innerText = '✨';
      if (statusText) statusText.innerText = '全新物料入库';
    }
    if (auditBox) auditBox.style.display = 'none';
    if (btnSubmitText) btnSubmitText.innerText = '✔ 确认存入';
    if (btnNewBox) btnNewBox.style.display = 'none';
  }

  // 7. 同步回填到隐藏与高级表单中
  const inName = document.getElementById('input-name');
  if (inName) inName.value = d.name || '';
  const inCat = document.getElementById('input-category');
  if (inCat && d.category) inCat.value = d.category;
  const inPkg = document.getElementById('input-package');
  if (inPkg) inPkg.value = d.package || '';
  const inParam = document.getElementById('input-param-val');
  if (inParam) inParam.value = d.value || '';
  const inVoltTol = document.getElementById('input-voltage-tol');
  if (inVoltTol) inVoltTol.value = specParts.join(' · ');
  const inLcsc = document.getElementById('input-lcsc');
  if (inLcsc) inLcsc.value = d.lcsc_part || '';
  const inNotes = document.getElementById('input-notes');
  if (inNotes) inNotes.value = d.notes || '';
  const inStd = document.getElementById('input-std-val');
  if (inStd) inStd.value = d.standard_value || '';
  const inUnit = document.getElementById('input-unit');
  if (inUnit) inUnit.value = d.unit || '';
  const inVolt = document.getElementById('input-voltage');
  if (inVolt) inVolt.value = d.voltage || '';
  const inTol = document.getElementById('input-tolerance');
  if (inTol) inTol.value = d.tolerance || '';
  const inImg = document.getElementById('input-image-url');
  if (inImg) inImg.value = d.image_url || '';
  const inDs = document.getElementById('input-datasheet-url');
  if (inDs) inDs.value = d.datasheet_url || '';
}

// 查重比对逻辑
function checkDuplicateInStock(parsed) {
  if (!allComponents || allComponents.length === 0) return null;
  const found = allComponents.find(c => {
    if (parsed.lcsc_part && c.lcsc_part && parsed.lcsc_part.trim().toUpperCase() === c.lcsc_part.trim().toUpperCase()) return true;
    if (parsed.name && c.name && parsed.name.trim().toLowerCase() === c.name.trim().toLowerCase()) {
      if (parsed.package && c.package) {
        return parsed.package.trim().toLowerCase() === c.package.trim().toLowerCase();
      }
      return true;
    }
    return false;
  });
  return found || null;
}

// 渲染本次连续录入流水卡片流
function renderContinuousHistory() {
  const listEl = document.getElementById('continuous-history-list');
  const countEl = document.getElementById('continuous-history-count');
  const clearBtn = document.getElementById('btn-clear-continuous-history');
  if (!listEl) return;

  const totalItems = continuousHistory.length;
  const totalPieces = continuousHistory.reduce((sum, it) => sum + (it.quantity || 0), 0);

  if (countEl) countEl.innerText = `${totalItems} 项 (${totalPieces}件)`;
  if (clearBtn) clearBtn.style.display = totalItems > 0 ? 'inline-block' : 'none';

  if (totalItems === 0) {
    listEl.innerHTML = `<div style="font-size: 11.5px; color: var(--text-dim); text-align: center; padding: 12px 0;">暂无连录记录，敲入参数后按 Ctrl+Enter 开始极速录入</div>`;
    return;
  }

  let html = '';
  continuousHistory.forEach(item => {
    html += `
      <div class="continuous-history-item" id="c-history-${item.historyId}">
        <div class="continuous-item-left">
          <span style="font-size: 13px;">${item.isAdd ? '➕' : '📦'}</span>
          <span class="continuous-item-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
          <div class="continuous-item-tags">
            <span class="sub-tag-pill" style="font-size: 10px; color: #059669; font-weight: 600;">+${item.quantity}件</span>
            <span class="sub-tag-pill" style="font-size: 10px;">${escapeHtml(item.location || '随手放')}</span>
            ${item.isAdd ? '<span class="sub-tag-pill" style="font-size: 9px; color: #b45309;">(补仓)</span>' : ''}
          </div>
        </div>
        <button type="button" class="btn-undo-entry" onclick="undoContinuousHistory('${item.historyId}')" title="撤销这一笔入库">
          ✕ 撤销
        </button>
      </div>
    `;
  });
  listEl.innerHTML = html;
}

// 撤销单笔录入记录
async function undoContinuousHistory(historyId) {
  const targetIdx = continuousHistory.findIndex(it => it.historyId === historyId);
  if (targetIdx === -1) return;
  const item = continuousHistory[targetIdx];

  try {
    if (item.isAdd) {
      // 补仓撤销: 扣减回刚才增加的数量
      const res = await fetch(`/api/components/${item.componentId}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta: -item.quantity })
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || '撤销补仓失败');
    } else {
      // 新建撤销: 直接删除新增的元件条目
      const res = await fetch(`/api/components/${item.componentId}`, { method: 'DELETE' });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || '撤销新建失败');
    }

    continuousHistory.splice(targetIdx, 1);
    renderContinuousHistory();
    loadInventory();
    showToast(`✔ 已成功撤销【${item.name}】(+${item.quantity}件) 的入库记录`);
  } catch (err) {
    alert('撤销失败: ' + err.message);
  }
}

// 清空当前连录流水
function clearContinuousHistory() {
  continuousHistory = [];
  renderContinuousHistory();
}

// 执行卡片存入或合并累加 (支持 isForceNew 另存为新盒)
async function submitCurrentCard(isForceNew = false) {
  const omniInput = document.getElementById('entry-text-input');
  const activeCard = document.getElementById('entry-card-active');
  const isCardActive = activeCard && activeCard.style.display !== 'none';

  if (!isCardActive && omniInput && omniInput.value.trim()) {
    await triggerParseText(omniInput.value.trim(), false);
  }

  const isContinuous = document.getElementById('chk-continuous-mode') ? document.getElementById('chk-continuous-mode').checked : true;
  const addQty = parseInt(document.getElementById('card-qty-display') ? document.getElementById('card-qty-display').innerText : '100', 10) || parseInt(document.getElementById('input-quantity') ? document.getElementById('input-quantity').value : '100', 10) || 1;
  const locStr = (document.getElementById('card-loc-text') ? document.getElementById('card-loc-text').innerText.trim() : '') || (document.getElementById('input-location') ? document.getElementById('input-location').value.trim() : '') || '随手存放处';

  // 1. 如果命中查重且非强制另存新盒 -> 直接合并累加补仓
  if (duplicateTarget && !isForceNew) {
    try {
      await stepQuantity(duplicateTarget.id, addQty);
      const histItem = {
        historyId: 'h_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        componentId: duplicateTarget.id,
        name: duplicateTarget.name,
        quantity: addQty,
        location: duplicateTarget.location || locStr,
        isAdd: true
      };
      continuousHistory.unshift(histItem);
      renderContinuousHistory();

      showToast(`✔ 已为【${duplicateTarget.name}】合并累加 +${addQty} 件！(现存 ${duplicateTarget.quantity + addQty} 件)`);
      if (window.playBeep) window.playBeep();

      if (isContinuous) {
        resetEntryFormForNext();
      } else {
        closeDrawer('drawer-entry-backdrop');
      }
      loadInventory();
      return;
    } catch (err) {
      alert('合并补仓异常: ' + err.message);
      return;
    }
  }

  // 2. 正常新增元器件入库或另存新盒
  const nameVal = (document.getElementById('input-name') ? document.getElementById('input-name').value.trim() : '') || (document.getElementById('card-title-text') ? document.getElementById('card-title-text').innerText.trim() : '') || (omniInput ? omniInput.value.trim() : '');
  if (!nameVal) {
    showToast('⚠️ 请输入元器件品名或型号');
    if (omniInput) omniInput.focus();
    return;
  }

  const catVal = (document.getElementById('input-category') ? document.getElementById('input-category').value.trim() : '') || '其他';
  const pkgVal = document.getElementById('input-package') ? document.getElementById('input-package').value.trim() : '';
  const valStr = document.getElementById('input-param-val') ? document.getElementById('input-param-val').value.trim() : '';
  const stdVal = parseFloat(document.getElementById('input-std-val') ? document.getElementById('input-std-val').value : '') || null;
  const unitStr = document.getElementById('input-unit') ? document.getElementById('input-unit').value : '';
  const voltVal = parseFloat(document.getElementById('input-voltage') ? document.getElementById('input-voltage').value : '') || null;
  const tolStr = document.getElementById('input-tolerance') ? document.getElementById('input-tolerance').value : '';
  const lcscStr = document.getElementById('input-lcsc') ? document.getElementById('input-lcsc').value.trim() : '';
  const notesStr = document.getElementById('input-notes') ? document.getElementById('input-notes').value.trim() : '';
  const imgStr = document.getElementById('input-image-url') ? document.getElementById('input-image-url').value : '';
  const dsStr = document.getElementById('input-datasheet-url') ? document.getElementById('input-datasheet-url').value : '';

  const data = {
    name: nameVal,
    category: catVal,
    package: pkgVal,
    value: valStr,
    standard_value: stdVal,
    unit: unitStr,
    voltage: voltVal,
    tolerance: tolStr,
    quantity: addQty,
    lcsc_part: lcscStr,
    location: locStr,
    notes: notesStr,
    image_url: imgStr,
    datasheet_url: dsStr
  };

  try {
    const res = await fetch('/api/components', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (result.success && result.data) {
      const newComp = result.data;
      const histItem = {
        historyId: 'h_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        componentId: newComp.id,
        name: newComp.name,
        quantity: addQty,
        location: newComp.location || locStr,
        isAdd: false
      };
      continuousHistory.unshift(histItem);
      renderContinuousHistory();

      if (window.playBeep) window.playBeep();
      showToast(`✔ 成功存入【${newComp.name}】(${addQty}件) ➔ [${locStr}]`);

      if (isContinuous) {
        resetEntryFormForNext();
      } else {
        closeDrawer('drawer-entry-backdrop');
      }
      loadInventory();
      loadFrequentLocations();
    } else {
      alert('存入失败: ' + (result.error || '未知错误'));
    }
  } catch (err) {
    alert('网络异常: ' + err.message);
  }
}

// 兼容别名
const submitEntryItem = submitCurrentCard;

// 连续录入时为下一项清空并继承上下文 (位置图钉、序号自增与封装锁定)
function resetEntryFormForNext() {
  const pinLoc = document.getElementById('chk-pin-location') && document.getElementById('chk-pin-location').checked;
  const autoIncLoc = document.getElementById('chk-auto-inc-location') && document.getElementById('chk-auto-inc-location').checked;

  let currentLoc = (document.getElementById('card-loc-text') ? document.getElementById('card-loc-text').innerText.trim() : '') || (document.getElementById('input-location') ? document.getElementById('input-location').value.trim() : '');

  if (pinLoc && autoIncLoc && currentLoc) {
    currentLoc = incrementLocationString(currentLoc);
  }

  // 重置表单字段
  const form = document.getElementById('form-entry');
  if (form) form.reset();
  const omniInput = document.getElementById('entry-text-input');
  if (omniInput) omniInput.value = '';

  const emptyCard = document.getElementById('entry-card-empty');
  const activeCard = document.getElementById('entry-card-active');
  if (emptyCard) emptyCard.style.display = 'block';
  if (activeCard) activeCard.style.display = 'none';

  renderOmniboxChips(null);
  renderSmdCandidates(null);
  duplicateTarget = null;
  lastParsedOmniData = null;

  // 上下文回填
  if (pinLoc && currentLoc) {
    const cardLocText = document.getElementById('card-loc-text');
    if (cardLocText) cardLocText.innerText = currentLoc;
    const inputLoc = document.getElementById('input-location');
    if (inputLoc) inputLoc.value = currentLoc;
  }
  const qtyEl = document.getElementById('card-qty-display');
  if (qtyEl) qtyEl.innerText = '100';
  const inputQty = document.getElementById('input-quantity');
  if (inputQty) inputQty.value = 100;

  // 光标自动复位回到全能速记输入框并获得焦点
  if (omniInput) {
    omniInput.focus();
    omniInput.select();
  }
}

// 面板打开时的初始化重置
function resetEntryForm() {
  const form = document.getElementById('form-entry');
  if (form) form.reset();
  const omniInput = document.getElementById('entry-text-input');
  if (omniInput) omniInput.value = '';

  const scannerBox = document.getElementById('scanner-box');
  if (scannerBox) scannerBox.style.display = 'none';

  const emptyCard = document.getElementById('entry-card-empty');
  const activeCard = document.getElementById('entry-card-active');
  if (emptyCard) emptyCard.style.display = 'block';
  if (activeCard) activeCard.style.display = 'none';

  renderOmniboxChips(null);
  renderSmdCandidates(null);
  duplicateTarget = null;
  lastParsedOmniData = null;

  const qtyEl = document.getElementById('card-qty-display');
  if (qtyEl) qtyEl.innerText = '100';
  const inputQty = document.getElementById('input-quantity');
  if (inputQty) inputQty.value = 100;
}

function adjustInputQty(delta) {
  stepCardQty(delta);
}

function initEntryDrawer() {
  const btnOpen = document.getElementById('btn-open-entry-drawer');
  if (btnOpen) {
    btnOpen.addEventListener('click', () => {
      resetEntryForm();
      switchEntryMode('single');
      openDrawer('drawer-entry-backdrop');
      setTimeout(() => {
        const el = document.getElementById('entry-text-input');
        if (el) el.focus();
      }, 200);
    });
  }

  // 随手记文本框 Ctrl+Enter 键盘快捷键 (未拆解则拆解，已拆解则全部存入)
  const scratchpadArea = document.getElementById('scratchpad-textarea');
  if (scratchpadArea) {
    scratchpadArea.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (scratchpadQueue && scratchpadQueue.length > 0) {
          submitScratchpadQueue();
        } else {
          triggerParseScratchpad();
        }
      }
    });
  }

  // 摄像头扫码开关
  const btnCamera = document.getElementById('btn-toggle-camera');
  if (btnCamera) {
    btnCamera.addEventListener('click', () => {
      const box = document.getElementById('scanner-box');
      if (box.style.display === 'block') {
        if (window.stopScanner) window.stopScanner();
        box.style.display = 'none';
      } else {
        box.style.display = 'block';
        if (window.startScanner) {
          window.startScanner((text) => {
            const input = document.getElementById('entry-text-input');
            if (input) input.value = text;
            box.style.display = 'none';
            triggerParseText(text);
          });
        }
      }
    });
  }

  // 识别按钮
  const btnParse = document.getElementById('btn-entry-parse');
  if (btnParse) {
    btnParse.addEventListener('click', () => {
      const text = document.getElementById('entry-text-input').value.trim();
      if (text) triggerParseText(text);
    });
  }

  // 全能速记框纯键盘快捷键支持 (Enter 解析 / Ctrl+Enter 存入 / 1~9 切丝印 / Alt+N 另存)
  const entryInput = document.getElementById('entry-text-input');
  if (entryInput) {
    entryInput.addEventListener('keydown', (e) => {
      // 1. 快捷存入 Ctrl+Enter 或 Cmd+Enter
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        submitCurrentCard(false);
        return;
      }

      // 2. 另存为新盒快捷键 Alt+N
      if (e.altKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        submitCurrentCard(true);
        return;
      }

      // 3. 数字键秒切 SMD 丝印候选 (当存在多个候选时)
      if (currentSmdCandidates && currentSmdCandidates.length > 1 && !e.ctrlKey && !e.altKey) {
        const num = parseInt(e.key, 10);
        if (!isNaN(num) && num >= 1 && num <= currentSmdCandidates.length && entryInput.selectionStart === entryInput.value.length) {
          e.preventDefault();
          selectSmdCandidate(num - 1);
          return;
        }
      }

      // 4. 普通 Enter 键流
      if (e.key === 'Enter') {
        e.preventDefault();
        const text = entryInput.value.trim();
        if (!text) return;

        // 如果当前已经解析激活且输入未变，再次敲 Enter 直接存入！
        const activeCard = document.getElementById('entry-card-active');
        const isCardActive = activeCard && activeCard.style.display !== 'none';
        if (isCardActive && lastParsedOmniData && lastParsedOmniData.raw === text) {
          submitCurrentCard(false);
        } else {
          triggerParseText(text, true);
        }
      }
    });
  }

  // 查重另存为新盒按钮点击 (若界面存在)
  const btnCardNewBox = document.getElementById('btn-card-new-box');
  if (btnCardNewBox) {
    btnCardNewBox.addEventListener('click', () => {
      submitCurrentCard(true);
    });
  }

  // 表单回车或提交
  const formEntry = document.getElementById('form-entry');
  if (formEntry) {
    formEntry.addEventListener('submit', (e) => {
      e.preventDefault();
      submitCurrentCard(false);
    });
  }
}

// 触发智能解析并驱动元器件大字确认卡片
async function triggerParseText(text, isAutoSubmitOnSecondEnter = false) {
  try {
    const res = await fetch('/api/components/query-official', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const result = await res.json();
    if (!result.success || !result.data) return;

    const d = result.data;
    lastParsedOmniData = { raw: text, data: d };

    // 渲染切词胶囊与 SMD 候选胶囊
    renderOmniboxChips(d);
    if (d.candidates && d.candidates.length > 1) {
      renderSmdCandidates(d.candidates);
    } else {
      renderSmdCandidates(null);
    }

    // 驱动核心大字身份确认卡片
    updateEntryIdentityCard(d);

  } catch (err) {
    console.error('解析异常:', err);
  }
}

// ==================== 4. 侧滑抽屉: 物料详情与编辑 ====================

function initDetailDrawer() {
  // 详情抽屉分类切换联动
  const detailCatInput = document.getElementById('detail-category');
  detailCatInput.addEventListener('input', (e) => {
    updateCategorySpecsVisibility(e.target.value.trim(), 'detail');
  });

  // 详情阻值实时解析
  document.getElementById('detail-res-val').addEventListener('input', (e) => {
    const p = parseResInput(e.target.value);
    const hint = document.getElementById('detail-res-hint');
    if (p) hint.innerText = p.hint;
    else hint.innerText = '';
  });

  // 详情容值实时解析
  document.getElementById('detail-cap-val').addEventListener('input', (e) => {
    const p = parseCapInput(e.target.value);
    const hint = document.getElementById('detail-cap-hint');
    if (p) hint.innerText = p.hint;
    else hint.innerText = '';
  });

  // 绑定保存按钮与表单提交
  const btnSaveComp = document.getElementById('btn-save-comp');
  if (btnSaveComp) {
    btnSaveComp.addEventListener('click', (e) => {
      e.preventDefault();
      saveComponentDetail();
    });
  }

  const formEditComp = document.getElementById('form-edit-comp');
  if (formEditComp) {
    formEditComp.addEventListener('submit', (e) => {
      e.preventDefault();
      saveComponentDetail();
    });
  }

  const btnDeleteComp = document.getElementById('btn-delete-comp');
  if (btnDeleteComp) {
    btnDeleteComp.addEventListener('click', (e) => {
      e.preventDefault();
      deleteCurrentComponent();
    });
  }
}

async function saveComponentDetail() {
  const saveBtn = document.getElementById('btn-save-comp');
  let origText = '保存更改';
  if (saveBtn) {
    origText = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerText = '保存中...';
  }

  try {
    const idEl = document.getElementById('detail-id');
    const id = idEl ? idEl.value : null;
    if (!id) {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = origText; }
      showToast('⚠️ 未找到当前编辑的物料ID');
      alert('⚠️ 未找到当前编辑的物料ID，请重新点击物料行打开抽屉');
      return;
    }

    const nameEl = document.getElementById('detail-name');
    const name = nameEl ? nameEl.value.trim() : '';
    if (!name) {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = origText; }
      showToast('⚠️ 请填写元器件型号或品名');
      if (nameEl) nameEl.focus();
      return;
    }

    const catEl = document.getElementById('detail-category');
    const cat = catEl ? catEl.value.trim() : '';
    const minStockInput = (document.getElementById('detail-min-stock')?.value || '').trim();

    let valStr = '';
    let stdVal = null;
    let unitStr = '';
    let tolStr = '';
    let voltVal = null;

    if (cat === '电阻') {
      valStr = (document.getElementById('detail-res-val')?.value || '').trim();
      tolStr = (document.getElementById('detail-res-tol')?.value || '').trim() || '1%';
      unitStr = 'Ω';
      const p = parseResInput(valStr);
      if (p) { stdVal = p.standard_value; valStr = p.display; }
    } else if (cat === '电容') {
      valStr = (document.getElementById('detail-cap-val')?.value || '').trim();
      voltVal = parseFloat(document.getElementById('detail-cap-volt')?.value) || null;
      tolStr = (document.getElementById('detail-cap-tol')?.value || '').trim() || '';
      unitStr = 'pF';
      const p = parseCapInput(valStr);
      if (p) { stdVal = p.standard_value; valStr = p.display; }
    } else if (cat === '电感') {
      valStr = (document.getElementById('detail-ind-val')?.value || '').trim();
      tolStr = (document.getElementById('detail-ind-current')?.value || '').trim();
      unitStr = 'H';
    } else {
      valStr = (document.getElementById('detail-other-val')?.value || '').trim();
    }

    const pkgVal = (document.getElementById('detail-package')?.value || '').trim();
    const qtyVal = parseInt(document.getElementById('detail-quantity')?.value, 10) || 0;
    const lcscVal = (document.getElementById('detail-lcsc')?.value || '').trim();
    const locVal = (document.getElementById('detail-location')?.value || '').trim();
    const notesVal = (document.getElementById('detail-notes')?.value || '').trim();

    const body = {
      name: name,
      category: cat || '其他',
      package: pkgVal,
      value: valStr,
      standard_value: stdVal,
      unit: unitStr,
      voltage: voltVal,
      tolerance: tolStr,
      quantity: qtyVal,
      min_stock: minStockInput === '' ? null : parseInt(minStockInput, 10),
      lcsc_part: lcscVal,
      location: locVal,
      notes: notesVal
    };

    console.log('[Component] 正在保存物料详情:', id, body);

    const res = await fetch(`/api/components/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.success) {
      if (saveBtn) {
        saveBtn.innerText = '✔ 已保存！';
      }
      showToast('<span style="color: #34c759; font-size: 15px;">✔</span> 元器件信息已成功保存更新！');

      const compIdx = allComponents.findIndex(c => c.id == id);
      if (compIdx !== -1) {
        allComponents[compIdx] = { ...allComponents[compIdx], ...body };
      }

      setTimeout(() => {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerHTML = origText;
        }
        closeDrawer('drawer-detail-backdrop');
        loadInventory();
        loadFrequentLocations();
      }, 400);
    } else {
      throw new Error(data.error || '保存未成功');
    }
  } catch (err) {
    console.error('[Component] 保存失败:', err);
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = origText;
    }
    showToast('❌ 保存失败: ' + err.message);
    alert('❌ 保存失败: ' + err.message);
  }
}

async function deleteCurrentComponent() {
  const idEl = document.getElementById('detail-id');
  const id = idEl ? idEl.value : null;
  if (!id) return;
  if (!confirm('确定从库存中彻底删除该元器件吗？')) return;
  try {
    const res = await fetch(`/api/components/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('🗑️ 元器件已成功删除');
      closeDrawer('drawer-detail-backdrop');
      loadInventory();
      loadFrequentLocations();
    } else {
      throw new Error(data.error || '删除失败');
    }
  } catch (err) {
    showToast('❌ 删除失败: ' + err.message);
    alert('❌ 删除失败: ' + err.message);
  }
}

function getCategoryIconDataUrl(cat) {
  const icon = getCategoryIcon(cat);
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="12" fill="%23f2f2f0"/><text x="50" y="58" font-size="44" text-anchor="middle" dominant-baseline="middle">${icon}</text></svg>`;
}

async function openDetailDrawer(id) {
  const comp = allComponents.find(c => c.id === id);
  if (!comp) return;

  // 1. 顶部卡片基本信息
  document.getElementById('detail-drawer-title').innerText = comp.name;
  document.getElementById('detail-card-name').innerText = comp.name;
  document.getElementById('detail-card-brand').innerText = comp.manufacturer ? `生产厂商: ${comp.manufacturer}` : `分类: ${comp.category}`;

  const img = document.getElementById('detail-comp-img');
  img.src = comp.image_url ? comp.image_url : getCategoryIconDataUrl(comp.category);

  // 2. 官方规格书 (Datasheet) 直达链接配置
  const datasheetBtn = document.getElementById('detail-datasheet-btn');
  const cNum = comp.lcsc_part ? comp.lcsc_part.toUpperCase().trim() : '';
  if (comp.datasheet_url) {
    datasheetBtn.href = comp.datasheet_url;
  } else if (cNum) {
    datasheetBtn.href = `https://item.szlcsc.com/${cNum.replace('C','')}.html`;
  } else {
    datasheetBtn.href = `https://so.szlcsc.com/global.html?k=${encodeURIComponent(comp.name)}`;
  }

  // 3. 填充结构化技术规格表格
  document.getElementById('spec-lcsc').innerText = cNum || '暂未绑定立创编号';
  document.getElementById('spec-category').innerText = comp.category || '其他';
  document.getElementById('spec-package').innerText = comp.package || '标准规格';
  document.getElementById('spec-value').innerText = comp.value || comp.name;

  // 标准等效数值换算展示 (如 100nF = 0.1µF = 104)
  let stdDisplay = '-';
  if (comp.category === '电阻' && comp.standard_value !== null) {
    const ohms = comp.standard_value;
    stdDisplay = `${ohms} Ω (${ohms >= 1000000 ? (ohms/1000000)+'MΩ' : (ohms >= 1000 ? (ohms/1000)+'kΩ' : ohms+'Ω')})`;
  } else if (comp.category === '电容' && comp.standard_value !== null) {
    const pF = comp.standard_value;
    const nF = pF / 1000;
    const uF = pF / 1000000;
    stdDisplay = `${nF} nF  /  ${uF} µF  (${pF} pF)`;
  }
  document.getElementById('spec-std-value').innerText = stdDisplay;

  // 耐压与精度
  const ratings = [];
  if (comp.voltage) ratings.push(`耐压 ${comp.voltage}V`);
  if (comp.tolerance) ratings.push(`精度 ${comp.tolerance}`);
  document.getElementById('spec-rating').innerText = ratings.length ? ratings.join(' / ') : '标准通用';

  document.getElementById('spec-location').innerText = comp.location || '随手存放 (未标具体箱)';
  document.getElementById('spec-qty').innerText = `${comp.quantity} 件`;

  // 安全库存阈值显示
  const effMin = comp.effective_min_stock !== undefined
    ? comp.effective_min_stock
    : (['电阻', '电容', '电感'].includes(comp.category) ? 20 : 3);
  if (comp.min_stock !== null && comp.min_stock !== undefined && comp.min_stock !== '') {
    document.getElementById('spec-min-stock').innerText = `${comp.min_stock} 件 (已设专用阈值)`;
  } else {
    document.getElementById('spec-min-stock').innerText = `${effMin} 件 (品类智能默认)`;
  }

  document.getElementById('spec-notes').innerText = comp.notes || '无自由备注';

  // 4. 底部的基础编辑表单
  document.getElementById('detail-id').value = comp.id;
  document.getElementById('detail-name').value = comp.name || '';
  document.getElementById('detail-category').value = comp.category || '其他';
  document.getElementById('detail-package').value = comp.package || '';
  document.getElementById('detail-quantity').value = comp.quantity || 0;
  document.getElementById('detail-min-stock').value = (comp.min_stock !== null && comp.min_stock !== undefined) ? comp.min_stock : '';
  document.getElementById('detail-lcsc').value = comp.lcsc_part || '';
  document.getElementById('detail-location').value = comp.location || '';
  document.getElementById('detail-notes').value = comp.notes || '';

  // 联动展开详情编辑的品类动态参数面板与回填
  updateCategorySpecsVisibility(comp.category || '其他', 'detail');
  const dResHint = document.getElementById('detail-res-hint');
  const dCapHint = document.getElementById('detail-cap-hint');
  if (dResHint) dResHint.innerText = '';
  if (dCapHint) dCapHint.innerText = '';

  if (comp.category === '电阻') {
    document.getElementById('detail-res-val').value = comp.value || '';
    document.getElementById('detail-res-tol').value = comp.tolerance || '1%';
    const p = parseResInput(comp.value);
    if (p && dResHint) dResHint.innerText = p.hint;
  } else if (comp.category === '电容') {
    document.getElementById('detail-cap-val').value = comp.value || '';
    document.getElementById('detail-cap-volt').value = comp.voltage || '';
    document.getElementById('detail-cap-tol').value = comp.tolerance || '';
    const p = parseCapInput(comp.value);
    if (p && dCapHint) dCapHint.innerText = p.hint;
  } else if (comp.category === '电感') {
    document.getElementById('detail-ind-val').value = comp.value || '';
    document.getElementById('detail-ind-current').value = comp.tolerance || '';
  } else {
    document.getElementById('detail-other-val').value = comp.value || '';
  }

  // 5. 绑定「⚡ 同步官方」刷新按钮
  const refreshBtn = document.getElementById('btn-detail-refresh-official');
  refreshBtn.onclick = async () => {
    refreshBtn.innerText = '同步中...';
    try {
      const qText = cNum || comp.name;
      const res = await fetch('/api/components/query-official', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: qText })
      });
      const json = await res.json();
      if (json.success && json.data) {
        const d = json.data;
        const updateBody = {
          name: d.name || comp.name,
          manufacturer: d.manufacturer || comp.manufacturer,
          package: d.package || comp.package,
          image_url: d.image_url || comp.image_url,
          datasheet_url: d.datasheet_url || comp.datasheet_url,
          notes: d.notes || comp.notes,
          voltage: d.voltage || comp.voltage,
          tolerance: d.tolerance || comp.tolerance,
          standard_value: d.standard_value !== undefined ? d.standard_value : comp.standard_value
        };
        await fetch(`/api/components/${comp.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateBody)
        });
        alert('✔ 官方参数与规格书链接已同步更新！');
        await loadInventory();
        openDetailDrawer(comp.id);
      }
    } catch(e) {
      alert('同步失败: ' + e.message);
    } finally {
      refreshBtn.innerText = '⚡ 同步官方';
    }
  };

  // 6. 异步加载该元件的出入库流水日志
  loadComponentLogs(comp.id);

  openDrawer('drawer-detail-backdrop');
}

async function loadComponentLogs(componentId) {
  const timeline = document.getElementById('detail-logs-timeline');
  const countText = document.getElementById('detail-logs-count-text');
  if (!timeline) return;
  timeline.innerHTML = '<div style="color: var(--text-dim); font-size: 12px; text-align: center; padding: 12px;">加载流水中...</div>';
  try {
    const res = await fetch(`/api/logs?component_id=${componentId}&limit=20`);
    const result = await res.json();
    if (result.success && result.data && result.data.length > 0) {
      if (countText) countText.innerText = `最近 ${result.data.length} 条记录`;
      timeline.innerHTML = result.data.map(log => renderLogItem(log, false)).join('');
    } else {
      if (countText) countText.innerText = '暂无历史记录';
      timeline.innerHTML = '<div style="color: var(--text-dim); font-size: 12px; text-align: center; padding: 14px;">暂无变更流水</div>';
    }
  } catch (err) {
    timeline.innerHTML = '<div style="color: var(--badge-lack-text); font-size: 12px; text-align: center; padding: 12px;">获取流水失败</div>';
  }
}

async function loadGlobalLogs() {
  const container = document.getElementById('global-logs-container');
  if (!container) return;
  container.innerHTML = '<div style="color: var(--text-dim); font-size: 13px; text-align: center; padding: 24px;">加载全库出入库流水中...</div>';
  try {
    const res = await fetch('/api/logs?limit=50');
    const result = await res.json();
    if (result.success && result.data && result.data.length > 0) {
      container.innerHTML = result.data.map(log => renderLogItem(log, true)).join('');
    } else {
      container.innerHTML = '<div style="color: var(--text-dim); font-size: 13px; text-align: center; padding: 30px;">全库暂无出入库流水记录</div>';
    }
  } catch (err) {
    container.innerHTML = '<div style="color: var(--badge-lack-text); font-size: 13px; text-align: center; padding: 24px;">加载全库流水失败</div>';
  }
}

function renderLogItem(log, isGlobal = false) {
  const actionMap = {
    'ENTRY': { title: '初始录入', icon: '📦' },
    'STEPPER': { title: '手动微调', icon: '🤏' },
    'RESTOCK': { title: '增补入库', icon: '➕' },
    'BOM_DEDUCT': { title: 'BOM投产扣减', icon: '🚀' }
  };
  const actionInfo = actionMap[log.action_type] || { title: log.action_type || '数量变更', icon: '📝' };

  const changeQty = log.change_qty || 0;
  let changeText = '0';
  let changeClass = '';
  if (changeQty > 0) {
    changeText = `+${changeQty}`;
    changeClass = 'plus';
  } else if (changeQty < 0) {
    changeText = `${changeQty}`;
    changeClass = 'minus';
  }

  const compName = log.component_name || (log.component_id ? `物料 #${log.component_id}` : '未指定物料');
  const noteText = log.note ? escapeHtml(log.note) : '';

  let timeStr = log.created_at || '';
  if (timeStr.includes('T')) {
    timeStr = timeStr.replace('T', ' ').slice(0, 16);
  }

  const clickAttr = (isGlobal && log.component_id)
    ? `style="cursor: pointer;" onclick="closeDrawer('modal-global-logs-backdrop'); openDetailDrawer(${log.component_id});" title="点击查看【${escapeAttr(compName)}】规格详情"`
    : '';

  return `
    <div class="log-item-row" ${clickAttr}>
      <div class="log-item-main">
        <div class="log-item-title">
          <span>${actionInfo.icon}</span>
          <span>${actionInfo.title}</span>
          ${isGlobal ? `<span class="sub-tag-pill" style="font-weight: 500;">${escapeHtml(compName)}</span>` : ''}
        </div>
        <div class="log-item-meta">
          <span>🕒 ${timeStr}</span>
          ${noteText ? `<span>· ${noteText}</span>` : ''}
        </div>
      </div>
      <div style="text-align: right; flex-shrink: 0;">
        <div class="log-qty-change ${changeClass}">${changeText}</div>
        <div style="font-size: 11px; color: var(--text-dim); margin-top: 1px;">结存 ${log.balance_qty} 件</div>
      </div>
    </div>
  `;
}

// ==================== 5. 常用位置胶囊与备份 ====================

async function loadFrequentLocations() {
  try {
    const res = await fetch('/api/components/frequent-locations');
    const result = await res.json();
    if (!result.success || !result.data) return;

    const container = document.getElementById('entry-location-capsules');
    container.innerHTML = '';
    result.data.forEach(loc => {
      const cap = document.createElement('span');
      cap.className = 'location-capsule';
      cap.innerText = `+ ${loc}`;
      cap.addEventListener('click', () => {
        document.getElementById('input-location').value = loc;
      });
      container.appendChild(cap);
    });
  } catch (err) {
    console.error('加载常用位置失败:', err);
  }
}

function initPresetAndBackup() {
  document.getElementById('btn-seed-presets').addEventListener('click', async () => {
    if (!confirm('确定导入常用基础阻容（E24常用系列）与常用芯片预设吗？')) return;
    try {
      const res = await fetch('/api/components/seed-presets', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(`✔ 导入成功！已预置 ${data.data.seeded} 项元器件。`);
        loadInventory();
        loadFrequentLocations();
      }
    } catch (e) {
      alert('导入失败: ' + e.message);
    }
  });

  document.getElementById('btn-export-excel').addEventListener('click', () => {
    window.location.href = '/api/components/export?format=excel';
  });

  // 全量备份下载
  document.getElementById('btn-backup-full').addEventListener('click', () => {
    window.location.href = '/api/backup/export';
  });

  // 恢复备份 — 触发文件选择
  const inputRestoreFile = document.getElementById('input-restore-file');
  document.getElementById('btn-restore-backup').addEventListener('click', () => {
    inputRestoreFile.value = '';
    inputRestoreFile.click();
  });

  inputRestoreFile.addEventListener('change', async () => {
    const file = inputRestoreFile.files[0];
    if (!file) return;

    const confirmed = confirm(
      `⚠️ 恢复备份将【清空当前所有数据】并还原为备份文件内容！\n\n` +
      `备份文件：${file.name}\n` +
      `文件大小：${(file.size / 1024).toFixed(1)} KB\n\n` +
      `此操作不可撤销，请确认你已知晓风险。\n是否继续？`
    );
    if (!confirmed) return;

    const formData = new FormData();
    formData.append('backupFile', file);

    try {
      const res = await fetch('/api/backup/restore', { method: 'POST', body: formData });
      const result = await res.json();
      if (result.success) {
        const s = result.stats;
        alert(
          `✅ 数据恢复成功！\n\n` +
          `备份时间：${result.exported_at ? result.exported_at.replace('T', ' ').slice(0, 19) : '未知'}\n` +
          `─────────────────\n` +
          `元器件：${s.components || 0} 条\n` +
          `出入库日志：${s.stock_logs || 0} 条\n` +
          `导入批次：${s.import_batches || 0} 条\n` +
          `项目：${s.projects || 0} 个\n` +
          `项目物料明细：${s.project_items || 0} 条\n` +
          `─────────────────\n` +
          `即将刷新页面以加载最新数据...`
        );
        location.reload();
      } else {
        alert('❌ 恢复失败：' + result.error);
      }
    } catch (e) {
      alert('❌ 网络请求失败：' + e.message);
    }
  });
}

async function loadNetworkInfo() {
  try {
    const res = await fetch('/api/info');
    const info = await res.json();
    if (info.mobileUrl) {
      document.getElementById('qr-url-text').innerText = info.mobileUrl;
      const box = document.getElementById('qr-image-wrapper');
      box.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(info.mobileUrl)}" style="border-radius: 8px; border: 1px solid var(--border-subtle); width: 180px; height: 180px;" alt="QR Code">`;
    }
  } catch (err) {
    console.warn('获取网络信息失败:', err);
  }
}

// ==================== 6. 淘宝订单智能批量导入 ====================

let currentTaobaoParsedList = [];
let currentTaobaoFilter = 'all'; // 'all' | 'new' | 'dup' | 'ignored'
let currentTaobaoFilename = '订单数据.xlsx';

function resetTaobaoImportModal() {
  const dropzone = document.getElementById('taobao-dropzone');
  const resultArea = document.getElementById('taobao-result-area');
  const elBadge = document.getElementById('taobao-stat-summary-badge');
  const fileInput = document.getElementById('taobao-file-input');
  const tbody = document.getElementById('taobao-pro-table-tbody');
  const summaryEl = document.getElementById('taobao-selection-summary');
  const selectAllCb = document.getElementById('taobao-select-all');
  const btnConfirm = document.getElementById('btn-taobao-confirm-import');

  if (dropzone) dropzone.style.display = 'flex';
  if (resultArea) resultArea.style.display = 'none';
  if (elBadge) elBadge.style.display = 'none';
  if (fileInput) fileInput.value = '';
  if (tbody) tbody.innerHTML = '';
  if (summaryEl) summaryEl.innerHTML = '已选中 0 项 · 共计 0 件';
  if (selectAllCb) {
    selectAllCb.checked = false;
    selectAllCb.indeterminate = false;
    selectAllCb.disabled = false;
    selectAllCb.title = '全选 / 取消全选';
  }
  if (btnConfirm) {
    btnConfirm.disabled = false;
    btnConfirm.innerText = '✔ 确认批量入库';
    btnConfirm.style.opacity = '';
    btnConfirm.style.cursor = '';
    btnConfirm.title = '';
  }

  // 重置快捷筛选胶囊
  currentTaobaoFilter = 'all';
  document.querySelectorAll('#taobao-filter-pill-group .filter-tab-pill').forEach(btn => {
    btn.classList.remove('active');
  });
  const tabAll = document.getElementById('tab-filter-all');
  if (tabAll) {
    tabAll.classList.add('active');
    tabAll.innerText = '全部';
  }
  const tabNew = document.getElementById('tab-filter-new');
  if (tabNew) tabNew.innerText = '待入库';
  const tabDup = document.getElementById('tab-filter-dup');
  if (tabDup) {
    tabDup.style.display = 'none';
    tabDup.innerText = '⚠️ 已入库过 (0)';
  }
  const tabIgnored = document.getElementById('tab-filter-ignored');
  if (tabIgnored) {
    tabIgnored.style.display = 'none';
    tabIgnored.innerText = '🚫 已忽略 (0)';
  }

  currentTaobaoParsedList = [];
  currentTaobaoFilename = '订单数据.xlsx';
}

function initTaobaoImport() {
  const btnOpen = document.getElementById('btn-open-taobao-import');
  if (btnOpen) {
    btnOpen.addEventListener('click', () => {
      // 关键：若上次已入库完成或当前未在解析中，重新打开时彻底重置为干净初始上传页
      if (currentTaobaoParsedList.length === 0 || currentTaobaoParsedList.every(i => i.already_imported)) {
        resetTaobaoImportModal();
      }
      openDrawer('modal-taobao-backdrop');
    });
  }

  const dropzone = document.getElementById('taobao-dropzone');
  const fileInput = document.getElementById('taobao-file-input');
  const btnPick = document.getElementById('btn-taobao-pick-file');
  const btnLoadDefault = document.getElementById('btn-taobao-load-default');
  const btnConfirm = document.getElementById('btn-taobao-confirm-import');

  if (btnPick && fileInput) {
    btnPick.addEventListener('click', () => fileInput.click());
  }

  if (dropzone && fileInput) {
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--accent)';
      dropzone.style.background = 'var(--bg-surface-hover)';
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.style.borderColor = 'var(--border-subtle)';
      dropzone.style.background = 'var(--bg-surface)';
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--border-subtle)';
      dropzone.style.background = 'var(--bg-surface)';
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        uploadTaobaoOrderFile(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        uploadTaobaoOrderFile(e.target.files[0]);
      }
    });
  }

  if (btnLoadDefault) {
    btnLoadDefault.addEventListener('click', () => {
      fetchTaobaoPreview(null, true);
    });
  }

  const btnReupload = document.getElementById('btn-taobao-reupload');
  if (btnReupload) {
    btnReupload.addEventListener('click', () => {
      resetTaobaoImportModal();
    });
  }

  const selectAllCb = document.getElementById('taobao-select-all');
  if (selectAllCb) {
    selectAllCb.addEventListener('change', (e) => {
      toggleAllTaobaoItems(e.target.checked);
    });
  }

  const btnToggleAll = document.getElementById('btn-taobao-toggle-all');
  if (btnToggleAll) {
    btnToggleAll.addEventListener('click', () => {
      invertTaobaoSelection();
    });
  }

  const globalLocInput = document.getElementById('taobao-import-location');
  if (globalLocInput) {
    globalLocInput.addEventListener('input', (e) => {
      syncTaobaoGlobalLocation(e.target.value.trim());
    });
  }

  if (btnConfirm) {
    btnConfirm.addEventListener('click', () => {
      confirmTaobaoImport();
    });
  }

  const btnHistory = document.getElementById('btn-taobao-open-history');
  if (btnHistory) {
    btnHistory.addEventListener('click', () => openTaobaoBatchHistory());
  }

  const btnRules = document.getElementById('btn-taobao-open-rules');
  if (btnRules) {
    btnRules.addEventListener('click', () => openTaobaoRulesModal());
  }

  const btnSaveRules = document.getElementById('btn-taobao-rule-save');
  if (btnSaveRules) {
    btnSaveRules.addEventListener('click', () => saveTaobaoRules());
  }

  const btnResetRules = document.getElementById('btn-taobao-rule-reset');
  if (btnResetRules) {
    btnResetRules.addEventListener('click', () => resetTaobaoRules());
  }
}

function uploadTaobaoOrderFile(file) {
  fetchTaobaoPreview(file, false);
}

async function fetchTaobaoPreview(file, isDefault = false) {
  const btnDefault = document.getElementById('btn-taobao-load-default');
  const origBtnText = btnDefault ? btnDefault.innerText : '';
  if (btnDefault && isDefault) {
    btnDefault.innerText = '正在读取与智能解析...';
    btnDefault.disabled = true;
  }

  try {
    let res;
    if (isDefault) {
      res = await fetch('/api/taobao/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loadDefault: true })
      });
    } else {
      const formData = new FormData();
      formData.append('orderFile', file);
      res = await fetch('/api/taobao/preview', {
        method: 'POST',
        body: formData
      });
    }

    const result = await res.json();
    if (!result.success) {
      alert(`解析失败: ${result.error}`);
      return;
    }

    currentTaobaoFilename = result.filename || (file ? file.name : '订单数据.xlsx');

    // 初始化每项状态 (自动防重与黑名单默认不勾选并加锁保护)
    currentTaobaoParsedList = (result.data || []).map(item => {
      const isUnchecked = item.already_imported || item.is_ignored;
      return {
        ...item,
        _selected: !isUnchecked,
        _allowForceReimport: false, // 默认锁定防重
        _customQty: item.quantity || 1,
        _customLocation: item.will_merge ? '' : (item.suggested_location || '')
      };
    });

    renderTaobaoPreviewArea(result);
  } catch (err) {
    alert(`网络或解析异常: ${err.message}`);
  } finally {
    if (btnDefault && isDefault) {
      btnDefault.innerText = origBtnText;
      btnDefault.disabled = false;
    }
  }
}

let taobaoAvailableBoxes = ['淘宝待整理散料盒', '默认电阻盒', '默认电容盒', '芯片收纳袋', '接插件盒', '三极管袋', '二极管袋', '桌底收纳箱A'];

async function refreshTaobaoAvailableBoxes() {
  try {
    const res = await fetch('/api/boxes');
    const result = await res.json();
    if (result.success && result.data) {
      const names = result.data.map(b => b.box_name).filter(Boolean);
      const set = new Set([...taobaoAvailableBoxes, ...names]);
      taobaoAvailableBoxes = Array.from(set);
    }
  } catch (e) {
    // ignore
  }

  const datalist = document.getElementById('taobao-location-datalist');
  if (datalist) {
    datalist.innerHTML = taobaoAvailableBoxes.map(b => `<option value="${escapeHtml(b)}"></option>`).join('');
  }
}

async function renderTaobaoPreviewArea(result) {
  const dropzone = document.getElementById('taobao-dropzone');
  const resultArea = document.getElementById('taobao-result-area');
  if (dropzone) dropzone.style.display = 'none';
  if (resultArea) resultArea.style.display = 'flex';

  const filename = currentTaobaoFilename;
  const filenameBadge = document.getElementById('taobao-filename-badge');
  if (filenameBadge) filenameBadge.innerText = filename;

  await refreshTaobaoAvailableBoxes();
  renderTaobaoLocationCapsules();
  renderTaobaoTableRows();
  updateTaobaoStats();
}

function setTaobaoFilter(type) {
  currentTaobaoFilter = type;
  document.querySelectorAll('#taobao-filter-pill-group .filter-tab-pill').forEach(btn => {
    btn.classList.remove('active');
  });
  const activeBtn = document.getElementById(`tab-filter-${type}`);
  if (activeBtn) activeBtn.classList.add('active');
  renderTaobaoTableRows();
}

function doesItemMatchFilter(item) {
  if (currentTaobaoFilter === 'new') {
    return !item.already_imported && !item.is_ignored;
  }
  if (currentTaobaoFilter === 'dup') {
    return !!item.already_imported;
  }
  if (currentTaobaoFilter === 'ignored') {
    return !!item.is_ignored;
  }
  return true;
}

function getBoxDisplayLabel(item, globalLoc) {
  if (item._customLocation) {
    return item._customLocation;
  }
  if (item.will_merge && item.existing_location) {
    return `${item.existing_location} (原盒)`;
  }
  return `${globalLoc} (全局)`;
}

function renderTaobaoTableRows() {
  const tbody = document.getElementById('taobao-pro-table-tbody');
  if (!tbody) return;

  const globalLoc = (document.getElementById('taobao-import-location')?.value || '淘宝待整理散料盒').trim();

  tbody.innerHTML = currentTaobaoParsedList.map((item, idx) => {
    const matchesFilter = doesItemMatchFilter(item);
    const icon = getCategoryIcon(item.category);
    const isExcluded = !item._selected;
    const isLocked = item.already_imported && !item._allowForceReimport;

    let paramBadge = '';
    if (item.category === '电阻' && item.standard_value !== null) {
      paramBadge = `<span class="param-badge-res">${formatResValue(item)}</span>`;
    } else if (item.category === '电容' && item.standard_value !== null) {
      paramBadge = `<span class="param-badge-cap">${formatCapValue(item)}</span>`;
    }

    let actionBadge = '';
    if (item.already_imported) {
      actionBadge = `
        <div class="linear-status-item" title="该订单已入库过，默认锁定只读防重。若确需补录，请点击右侧【解锁】">
          <span class="linear-status-dot red"></span>
          <span class="linear-status-text" style="color: #dc2626;">已入库过</span>
        </div>
      `;
    } else if (item.will_merge) {
      const targetQty = (item.existing_qty || 0) + (parseInt(item._customQty, 10) || 0);
      const matchTip = `已精准匹配库存同款：[${escapeHtml(item.existing_name || item.name)}]&#10;当前存量: ${item.existing_qty}件 ➔ 入库后: ${targetQty}件&#10;原存放于: [${escapeHtml(item.existing_location || '未标注')}]`;
      actionBadge = `
        <div class="linear-status-item" title="${matchTip}">
          <span class="linear-status-dot amber"></span>
          <span class="linear-status-text">累加</span>
          <span id="row-merge-sub-${idx}" class="linear-status-qty">+${item._customQty}</span>
        </div>
      `;
    } else {
      actionBadge = `
        <div class="linear-status-item" title="现有库存中无同款，将作为新物料录入">
          <span class="linear-status-dot green"></span>
          <span class="linear-status-text" style="color: var(--text-muted);">新入库</span>
        </div>
      `;
    }

    const rawTitleTip = item.raw_title ? escapeHtml(item.raw_title) : '';
    const boxDisplay = getBoxDisplayLabel(item, globalLoc);

    // 行样式类
    let rowClasses = [];
    if (isExcluded) rowClasses.push('row-excluded');
    if (item.already_imported) {
      rowClasses.push('row-already-imported');
      if (item._allowForceReimport) rowClasses.push('unlocked');
    }

    // 操作按钮
    let opBtnHtml = '';
    if (item.already_imported) {
      if (isLocked) {
        opBtnHtml = `<button type="button" class="icon-btn-minimal" style="font-size: 11px; width: auto; height: 22px; padding: 1px 6px; border: 1px solid var(--border-subtle); border-radius: 4px; color: var(--text-muted);" title="解除锁定，允许本次补录重复入库" onclick="toggleTaobaoItemLock(${idx})">🔒 解锁</button>`;
      } else {
        opBtnHtml = `<button type="button" class="icon-btn-minimal" style="font-size: 11px; width: auto; height: 22px; padding: 1px 6px; border: 1px solid #ef4444; border-radius: 4px; color: #ef4444;" title="重新锁定防重" onclick="toggleTaobaoItemLock(${idx})">🔓 锁定</button>`;
      }
    } else {
      opBtnHtml = `<button type="button" class="icon-btn-minimal" style="color: #ef4444; font-size: 13px; width: 24px; height: 24px; margin: 0 auto;" title="${item._selected ? '排除该项入库' : '恢复勾选'}" onclick="toggleTaobaoItem(${idx})">${item._selected ? '✕' : '↺'}</button>`;
    }

    return `
      <tr id="taobao-row-${idx}" class="${rowClasses.join(' ')}" style="${matchesFilter ? '' : 'display: none;'}">
        <td style="text-align: center;">
          <input type="checkbox" id="taobao-item-cb-${idx}" ${item._selected ? 'checked' : ''} ${isLocked ? 'disabled title="该订单已入库过，默认锁定防重。点击右侧【解锁】后方可勾选入库"' : ''} onchange="toggleTaobaoItem(${idx})" style="cursor: ${isLocked ? 'not-allowed' : 'pointer'};">
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 17px; flex-shrink: 0;">${icon}</span>
            <div style="min-width: 0;">
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <span style="font-weight: 600; color: var(--text-main); font-size: 13px; line-height: 1.3;" title="${rawTitleTip}">
                  ${escapeHtml(item.name)}
                </span>
                ${item.already_imported ? `<span class="tag-duplicate-badge" title="订单[${escapeHtml(item.order_id || '')}]已于 ${escapeHtml(item.imported_at || '')} 导入过 (批次: ${escapeHtml(item.imported_batch_id || '')})">⚠️ 已入库过</span>` : ''}
                ${item.is_ignored ? `<span class="tag-ignored-badge" title="${escapeHtml(item.ignore_reason || '已忽略')}">🚫 已忽略</span>` : ''}
              </div>
              <div style="display: flex; align-items: center; gap: 8px; margin-top: 2px;">
                ${item.raw_sku && item.raw_sku !== '暂无' ? `<span style="font-size: 11px; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px;" title="${escapeHtml(item.raw_sku)}">规格: ${escapeHtml(item.raw_sku)}</span>` : ''}
                ${item.order_id ? `<span style="font-size: 11px; font-family: var(--font-mono); color: var(--text-dim);" title="完整订单号: ${escapeHtml(item.order_id)}">单号:${escapeHtml(item.order_id.slice(-8))}</span>` : ''}
                ${item.store ? `<span style="font-size: 11px; color: var(--text-dim);">[${escapeHtml(item.store)}]</span>` : ''}
              </div>
            </div>
          </div>
        </td>
        <td>
          <div style="display: flex; gap: 4px; align-items: center; flex-wrap: wrap;">
            <span class="sub-tag-pill">${escapeHtml(item.category)}</span>
            <span class="sub-tag-pill pro-td-mono">${escapeHtml(item.package)}</span>
          </div>
        </td>
        <td>
          <div style="display: flex; gap: 4px; align-items: center; flex-wrap: wrap;">
            ${paramBadge}
            ${item.voltage ? `<span class="sub-tag-pill">${item.voltage}V</span>` : ''}
            ${item.tolerance ? `<span class="sub-tag-pill">${escapeHtml(item.tolerance)}</span>` : ''}
          </div>
        </td>
        <td>
          <span class="pro-td-mono" style="font-size: 12px; color: var(--text-muted);">
            ${item.buy_count || 1}包 × ${item.unit_multiplier || 1}只
          </span>
        </td>
        <td style="text-align: right;">
          <input type="number" min="1" class="taobao-input-qty" value="${item._customQty}" ${isLocked ? 'disabled style="opacity: 0.6; cursor: not-allowed;"' : ''} onchange="updateTaobaoItemQty(${idx}, this.value)" oninput="updateTaobaoItemQty(${idx}, this.value)">
        </td>
        <td style="text-align: center;">
          ${actionBadge}
        </td>
        <td>
          <button type="button" id="notion-box-btn-${idx}" class="notion-box-trigger" ${isLocked ? 'disabled style="opacity: 0.6; cursor: not-allowed;"' : ''} onclick="openBoxPopover(event, ${idx})" title="点击切换收纳盒">
            <span class="box-title-text">📦 ${escapeHtml(boxDisplay)}</span>
            <span class="caret-arrow">▾</span>
          </button>
        </td>
        <td style="text-align: center;">
          ${opBtnHtml}
        </td>
      </tr>
    `;
  }).join('');
}

let currentPopoverIdx = null;

function openBoxPopover(e, idx) {
  e.stopPropagation();
  const popover = document.getElementById('box-custom-popover');
  if (!popover) return;

  if (currentPopoverIdx === idx && popover.classList.contains('active')) {
    closeBoxPopover();
    return;
  }

  currentPopoverIdx = idx;
  const triggerBtn = document.getElementById(`notion-box-btn-${idx}`);
  if (!triggerBtn) return;

  const item = currentTaobaoParsedList[idx];
  const globalLoc = (document.getElementById('taobao-import-location')?.value || '淘宝待整理散料盒').trim();

  let html = '';

  // 1. 全局配置选项
  const isGlobalSelected = !item._customLocation && !(item.will_merge && item.existing_location);
  html += `
    <div class="popover-item ${isGlobalSelected ? 'selected' : ''}" onclick="selectBoxForCurrentItem('')">
      <span>🌐 跟随全局 (${escapeHtml(globalLoc)})</span>
      ${isGlobalSelected ? '<span class="check-icon">✓</span>' : ''}
    </div>
  `;

  // 2. 如果是合并项且有原盒，提供原盒选项
  if (item.will_merge && item.existing_location) {
    const isOriginalSelected = !item._customLocation;
    html += `
      <div class="popover-item ${isOriginalSelected ? 'selected' : ''}" onclick="selectBoxForCurrentItem('${escapeHtml(item.existing_location)}')">
        <span>📍 存入同款原盒 (${escapeHtml(item.existing_location)})</span>
        ${isOriginalSelected ? '<span class="check-icon">✓</span>' : ''}
      </div>
    `;
  }

  html += `<div class="popover-divider"></div>`;

  // 3. 库中所有可用收纳盒
  taobaoAvailableBoxes.forEach(b => {
    const isSel = item._customLocation === b;
    html += `
      <div class="popover-item ${isSel ? 'selected' : ''}" onclick="selectBoxForCurrentItem('${escapeHtml(b)}')">
        <span>📦 ${escapeHtml(b)}</span>
        ${isSel ? '<span class="check-icon">✓</span>' : ''}
      </div>
    `;
  });

  html += `<div class="popover-divider"></div>`;

  // 4. 新建自定义收纳盒选项
  html += `
    <div class="popover-item action-create" onclick="createNewBoxForCurrentItem()">
      <span>＋ 新建收纳盒...</span>
    </div>
  `;

  popover.innerHTML = html;

  // 定位计算
  const rect = triggerBtn.getBoundingClientRect();
  const popoverEstimatedHeight = 220;
  const spaceBelow = window.innerHeight - rect.bottom;

  popover.style.left = `${Math.min(window.innerWidth - 240, Math.max(10, rect.left))}px`;
  if (spaceBelow >= popoverEstimatedHeight || spaceBelow > rect.top) {
    popover.style.top = `${rect.bottom + 4}px`;
  } else {
    popover.style.top = `${Math.max(10, rect.top - popoverEstimatedHeight - 4)}px`;
  }

  document.querySelectorAll('.notion-box-trigger').forEach(b => b.classList.remove('open'));
  triggerBtn.classList.add('open');
  popover.classList.add('active');
}

function closeBoxPopover() {
  const popover = document.getElementById('box-custom-popover');
  if (popover) popover.classList.remove('active');
  document.querySelectorAll('.notion-box-trigger').forEach(b => b.classList.remove('open'));
  currentPopoverIdx = null;
}

function selectBoxForCurrentItem(boxName) {
  if (currentPopoverIdx === null || !currentTaobaoParsedList[currentPopoverIdx]) return;
  currentTaobaoParsedList[currentPopoverIdx]._customLocation = boxName;
  
  const globalLoc = (document.getElementById('taobao-import-location')?.value || '淘宝待整理散料盒').trim();
  const btn = document.getElementById(`notion-box-btn-${currentPopoverIdx}`);
  if (btn) {
    const textSpan = btn.querySelector('.box-title-text');
    if (textSpan) {
      textSpan.innerText = `📦 ${getBoxDisplayLabel(currentTaobaoParsedList[currentPopoverIdx], globalLoc)}`;
    }
  }
  closeBoxPopover();
}

function createNewBoxForCurrentItem() {
  const idx = currentPopoverIdx;
  closeBoxPopover();
  if (idx === null || !currentTaobaoParsedList[idx]) return;

  const newName = prompt('请输入新收纳盒名称（如：螺栓五金盒、ESP32模块盒）：');
  if (newName && newName.trim()) {
    const trimmed = newName.trim();
    if (!taobaoAvailableBoxes.includes(trimmed)) {
      taobaoAvailableBoxes.push(trimmed);
      const datalist = document.getElementById('taobao-location-datalist');
      if (datalist) {
        datalist.innerHTML = taobaoAvailableBoxes.map(b => `<option value="${escapeHtml(b)}"></option>`).join('');
      }
    }
    currentTaobaoParsedList[idx]._customLocation = trimmed;
    renderTaobaoTableRows();
    showToast(`已添加新收纳盒: 📦 ${trimmed}`);
  }
}

function syncTaobaoGlobalLocation(newLoc) {
  const globalLoc = newLoc || '淘宝待整理散料盒';
  currentTaobaoParsedList.forEach((item, idx) => {
    const btn = document.getElementById(`notion-box-btn-${idx}`);
    if (btn) {
      const textSpan = btn.querySelector('.box-title-text');
      if (textSpan) {
        textSpan.innerText = `📦 ${getBoxDisplayLabel(item, globalLoc)}`;
      }
    }
  });
}

async function renderTaobaoLocationCapsules() {
  const container = document.getElementById('taobao-location-capsules');
  if (!container) return;
  try {
    const res = await fetch('/api/components/frequent-locations');
    const result = await res.json();
    if (!result.success || !result.data) return;

    container.innerHTML = '';
    result.data.forEach(loc => {
      const cap = document.createElement('span');
      cap.className = 'location-capsule';
      cap.innerText = `+ ${loc}`;
      cap.addEventListener('click', () => {
        const input = document.getElementById('taobao-import-location');
        if (input) {
          input.value = loc;
          syncTaobaoGlobalLocation(loc);
        }
      });
      container.appendChild(cap);
    });
  } catch (e) {
    // ignore
  }
}

function updateTaobaoStats() {
  const selectedItems = currentTaobaoParsedList.filter(i => i._selected);
  const totalItems = currentTaobaoParsedList.length;
  const selectedCount = selectedItems.length;
  const selectedPieces = selectedItems.reduce((acc, cur) => acc + (parseInt(cur._customQty, 10) || 0), 0);
  const mergedCount = selectedItems.filter(i => i.will_merge).length;
  const createdCount = selectedCount - mergedCount;

  const newCount = currentTaobaoParsedList.filter(i => !i.already_imported && !i.is_ignored).length;
  const dupCount = currentTaobaoParsedList.filter(i => i.already_imported).length;
  const ignoredCount = currentTaobaoParsedList.filter(i => i.is_ignored).length;

  const tabAll = document.getElementById('tab-filter-all');
  const tabNew = document.getElementById('tab-filter-new');
  const tabDup = document.getElementById('tab-filter-dup');
  const tabIgnored = document.getElementById('tab-filter-ignored');

  if (tabAll) tabAll.innerText = `全部 (${totalItems})`;
  if (tabNew) tabNew.innerText = `待入库 (${newCount})`;
  if (tabDup) {
    if (dupCount > 0) {
      tabDup.style.display = 'inline-block';
      tabDup.innerText = `⚠️ 已入库过 (${dupCount})`;
    } else {
      tabDup.style.display = 'none';
    }
  }
  if (tabIgnored) {
    if (ignoredCount > 0) {
      tabIgnored.style.display = 'inline-block';
      tabIgnored.innerText = `🚫 已忽略 (${ignoredCount})`;
    } else {
      tabIgnored.style.display = 'none';
    }
  }

  const elItems = document.getElementById('taobao-stat-items');
  const elTotalItems = document.getElementById('taobao-stat-total-items');
  const elPieces = document.getElementById('taobao-stat-pieces');
  const elMerged = document.getElementById('taobao-stat-merged');
  const elCreated = document.getElementById('taobao-stat-created');
  const elSummary = document.getElementById('taobao-selection-summary');
  const btnConfirm = document.getElementById('btn-taobao-confirm-import');
  const selectAllCb = document.getElementById('taobao-select-all');

  if (elItems) elItems.innerText = selectedCount;
  if (elTotalItems) elTotalItems.innerText = totalItems;
  if (elPieces) elPieces.innerText = selectedPieces;
  if (elMerged) elMerged.innerText = mergedCount;
  if (elCreated) elCreated.innerText = createdCount;

  const elBadge = document.getElementById('taobao-stat-summary-badge');
  if (elBadge) {
    if (totalItems > 0) {
      elBadge.style.display = 'inline-block';
      elBadge.innerText = `已选 ${selectedCount}/${totalItems} 项 (${selectedPieces}件)`;
    } else {
      elBadge.style.display = 'none';
    }
  }

  if (selectAllCb) {
    const selectableItems = currentTaobaoParsedList.filter(i => (!i.already_imported || i._allowForceReimport) && !i.is_ignored);
    const hasSelectable = selectableItems.length > 0;

    if (!hasSelectable) {
      selectAllCb.checked = false;
      selectAllCb.indeterminate = false;
      selectAllCb.disabled = true;
      selectAllCb.title = '全部物料均已入库锁定或被忽略，无法全选';
    } else {
      selectAllCb.disabled = false;
      selectAllCb.title = '全选 / 取消全选';
      selectAllCb.checked = (selectedCount === selectableItems.length && selectableItems.length > 0);
      selectAllCb.indeterminate = (selectedCount > 0 && selectedCount < selectableItems.length);
    }
  }

  const excludedCount = totalItems - selectedCount;
  if (elSummary) {
    if (selectedCount === 0) {
      if (dupCount === totalItems && totalItems > 0) {
        elSummary.innerHTML = `<span style="color: #64748b; font-weight: 500;">🔒 该文件所有订单物料此前已全部入库，系统已开启防重保护</span>`;
      } else {
        elSummary.innerHTML = `<span style="color: #ef4444; font-weight: 500;">⚠️ 请至少勾选 1 项待入库物料</span>`;
      }
    } else {
      elSummary.innerHTML = `已选中 <strong>${selectedCount}</strong> 项 · 共计 <strong>${selectedPieces}</strong> 件 ${excludedCount > 0 ? `<span style="color: var(--text-dim); margin-left: 6px;">(${excludedCount} 项已排除)</span>` : ''}`;
    }
  }

  if (btnConfirm) {
    if (dupCount === totalItems && totalItems > 0 && selectedCount === 0) {
      btnConfirm.disabled = true;
      btnConfirm.innerText = '🔒 订单已全部入库 (已防重锁定)';
      btnConfirm.title = '该订单文件此前已入库过，已为您自动全部锁定只读。如需补录，请在行右侧点击【解锁】。';
      btnConfirm.style.opacity = '0.65';
      btnConfirm.style.cursor = 'not-allowed';
    } else {
      btnConfirm.disabled = (selectedCount === 0);
      btnConfirm.innerText = selectedCount > 0 ? `✔ 确认批量入库 (${selectedCount}项)` : '✔ 确认批量入库';
      btnConfirm.title = '';
      btnConfirm.style.opacity = '';
      btnConfirm.style.cursor = '';
    }
  }
}

function toggleTaobaoItem(idx) {
  if (!currentTaobaoParsedList[idx]) return;
  const item = currentTaobaoParsedList[idx];
  // 严格防御：若已入库且未解锁，禁止变更选择态
  if (item.already_imported && !item._allowForceReimport) {
    showToast(`🔒 [${item.name}] 此前已入库，如需再次入库请先点击行右侧【解锁】`);
    return;
  }
  item._selected = !item._selected;

  const cb = document.getElementById(`taobao-item-cb-${idx}`);
  if (cb) cb.checked = item._selected;

  const row = document.getElementById(`taobao-row-${idx}`);
  if (row) {
    if (item._selected) row.classList.remove('row-excluded');
    else row.classList.add('row-excluded');
  }

  updateTaobaoStats();
}

function toggleTaobaoItemLock(idx) {
  if (!currentTaobaoParsedList[idx]) return;
  const item = currentTaobaoParsedList[idx];
  item._allowForceReimport = !item._allowForceReimport;
  if (!item._allowForceReimport) {
    item._selected = false;
    showToast(`已重新锁定防重 [${item.name}]`);
  } else {
    item._selected = true;
    showToast(`⚠️ 已解锁 [${item.name}]，允许本次重复入库`);
  }
  renderTaobaoTableRows();
  updateTaobaoStats();
}

function toggleAllTaobaoItems(checked) {
  currentTaobaoParsedList.forEach((item, idx) => {
    // 智能防重全选：锁定的已入库物料与黑名单忽略项受保护，绝不被全选强行选中
    if (checked && item.already_imported && !item._allowForceReimport) {
      return;
    }
    if (checked && item.is_ignored) {
      return;
    }
    item._selected = checked;
    const cb = document.getElementById(`taobao-item-cb-${idx}`);
    if (cb && !cb.disabled) cb.checked = checked;
    const row = document.getElementById(`taobao-row-${idx}`);
    if (row) {
      if (checked) row.classList.remove('row-excluded');
      else row.classList.add('row-excluded');
    }
  });
  updateTaobaoStats();
}

function invertTaobaoSelection() {
  currentTaobaoParsedList.forEach((item, idx) => {
    // 锁定的已入库项和黑名单项不参与反选
    if (item.already_imported && !item._allowForceReimport) {
      return;
    }
    if (item.is_ignored) {
      return;
    }
    item._selected = !item._selected;
    const cb = document.getElementById(`taobao-item-cb-${idx}`);
    if (cb && !cb.disabled) cb.checked = item._selected;
    const row = document.getElementById(`taobao-row-${idx}`);
    if (row) {
      if (item._selected) row.classList.remove('row-excluded');
      else row.classList.add('row-excluded');
    }
  });
  updateTaobaoStats();
}

function updateTaobaoItemQty(idx, val) {
  if (!currentTaobaoParsedList[idx]) return;
  const item = currentTaobaoParsedList[idx];
  const num = Math.max(1, parseInt(val, 10) || 1);
  item._customQty = num;

  if (item.will_merge) {
    const subEl = document.getElementById(`row-merge-sub-${idx}`);
    if (subEl) {
      subEl.innerText = `+${num}`;
    }
  }

  updateTaobaoStats();
}

function updateTaobaoItemLoc(idx, val) {
  if (!currentTaobaoParsedList[idx]) return;
  currentTaobaoParsedList[idx]._customLocation = val.trim();
}

// 点击页面任意空白处自动关闭 Popover
document.addEventListener('click', (e) => {
  const popover = document.getElementById('box-custom-popover');
  if (popover && popover.classList.contains('active')) {
    if (!popover.contains(e.target)) {
      closeBoxPopover();
    }
  }
});

// ESC 按键关闭 Popover
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeBoxPopover();
  }
});

async function confirmTaobaoImport() {
  const selectedItems = currentTaobaoParsedList.filter(i => i._selected);
  if (selectedItems.length === 0) {
    showToast('⚠️ 请至少勾选一项待入库物料');
    return;
  }

  // 二次拦截：如果用户勾选了已入库过的物料，进行强警示确认
  const dupSelected = selectedItems.filter(i => i.already_imported);
  if (dupSelected.length > 0) {
    const listNames = dupSelected.slice(0, 3).map(i => `• ${i.name}`).join('\n');
    const moreNotice = dupSelected.length > 3 ? `\n...等共 ${dupSelected.length} 项` : '';
    const ok = confirm(`⚠️ 订单防重拦截警示：\n\n检测到您勾选了 ${dupSelected.length} 项【已经入库过】的订单物料：\n\n${listNames}${moreNotice}\n\n继续入库将导致上述物料在仓库中被【重复累加库存】！\n\n您确定要强制再次入库吗？`);
    if (!ok) {
      return;
    }
  }

  const btnConfirm = document.getElementById('btn-taobao-confirm-import');
  const globalLocation = (document.getElementById('taobao-import-location')?.value || '淘宝待整理散料盒').trim();
  const origText = btnConfirm ? btnConfirm.innerText : '';

  if (btnConfirm) {
    btnConfirm.disabled = true;
    btnConfirm.innerText = '正在写入数据库...';
  }

  const payloadItems = selectedItems.map(item => {
    let loc = globalLocation;
    if (item._customLocation) {
      loc = item._customLocation;
    } else if (item.will_merge && item.existing_location) {
      loc = item.existing_location;
    }
    return {
      ...item,
      quantity: Math.max(1, parseInt(item._customQty, 10) || item.quantity),
      location: loc
    };
  });

  try {
    const res = await fetch('/api/taobao/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: payloadItems,
        defaultLocation: globalLocation,
        filename: currentTaobaoFilename || '淘宝订单导入.xlsx'
      })
    });

    const result = await res.json();
    if (!result.success) {
      throw new Error(result.error || '入库失败');
    }

    const sum = result.summary;
    if (btnConfirm) {
      btnConfirm.innerText = '✔ 批量入库完成！';
    }

    // 关键：立即同步当前内存数据，将已入库项标记为已入库，防止关闭动画或重入时出现可点击态
    currentTaobaoParsedList.forEach(item => {
      if (item._selected) {
        item.already_imported = true;
        item.imported_batch_id = sum.batchId;
        item.imported_at = '刚刚';
        item._selected = false;
        item._allowForceReimport = false;
      }
    });
    renderTaobaoTableRows();
    updateTaobaoStats();

    const batchId = sum.batchId || '';
    const undoButtonHtml = batchId
      ? `<button onclick="rollbackTaobaoBatch('${batchId}')" style="margin-left: 10px; background: rgba(255,255,255,0.25); border: 1px solid rgba(255,255,255,0.45); color: #fff; padding: 2px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;">↩ 撤销本批</button>`
      : '';

    showToast(`<span style="color: #34c759; font-size: 15px;">✔</span> 成功批量入库 ${sum.total} 项 (折算实得 ${sum.totalPieces} 件，合并累加 ${sum.mergedCount} 项)！${undoButtonHtml}`, 6000);

    setTimeout(() => {
      closeDrawer('modal-taobao-backdrop');
      // 关键：入库完成后立刻彻底重置弹窗，下一次打开必定是全新的干净卡片，绝不残留旧状态
      resetTaobaoImportModal();
      loadInventory();
      loadFrequentLocations();
      refreshLowStockBadge();
    }, 450);
  } catch (err) {
    if (btnConfirm) {
      btnConfirm.disabled = false;
      btnConfirm.innerText = origText;
    }
    showToast(`❌ 批量入库失败: ${err.message}`);
    alert(`❌ 批量入库失败: ${err.message}`);
  }
}

// ==================== 批次管理与撤销回滚 ====================

async function openTaobaoBatchHistory() {
  openDrawer('modal-taobao-history-backdrop');
  const container = document.getElementById('taobao-batches-list');
  if (!container) return;
  container.innerHTML = `<div style="text-align: center; color: var(--text-dim); padding: 24px;">正在读取批次记录...</div>`;

  try {
    const res = await fetch('/api/taobao/batches');
    const result = await res.json();
    if (!result.success || !result.data || result.data.length === 0) {
      container.innerHTML = `<div style="text-align: center; color: var(--text-dim); padding: 36px;">暂无历史导入批次</div>`;
      return;
    }

    container.innerHTML = result.data.map(b => {
      const isRolledBack = b.status === 'rolled_back';
      const timeStr = b.created_at || '';
      const orderTags = (b.order_ids || []).slice(0, 3).map(ord => `<span class="sub-tag-pill pro-td-mono" style="font-size: 10px;">单号: ${escapeHtml(ord.slice(-8))}</span>`).join('');
      const moreOrders = (b.order_ids && b.order_ids.length > 3) ? `<span style="font-size: 10px; color: var(--text-dim);">+${b.order_ids.length - 3}笔</span>` : '';

      return `
        <div class="batch-history-card ${isRolledBack ? 'rolled-back' : ''}">
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
              <span style="font-weight: 600; font-size: 13px; color: var(--text-main); font-family: var(--font-mono);">${escapeHtml(b.id)}</span>
              <span class="sub-tag-pill" style="font-size: 11px;">${escapeHtml(b.filename || '表格文件')}</span>
              ${isRolledBack
                ? `<span class="sub-tag-pill" style="color: var(--text-dim);">已撤销回滚</span>`
                : `<span class="sub-tag-pill" style="color: #16a34a; background: rgba(22, 163, 74, 0.08); border-color: rgba(22, 163, 74, 0.2);">生效中</span>`
              }
            </div>
            <div style="font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <span>📅 ${escapeHtml(timeStr)}</span>
              <span>📦 ${b.total_items} 项 · ${b.total_pieces} 件</span>
              <div style="display: inline-flex; align-items: center; gap: 4px;">
                ${orderTags} ${moreOrders}
              </div>
            </div>
          </div>
          <div style="flex-shrink: 0;">
            ${isRolledBack
              ? `<span style="font-size: 12px; color: var(--text-dim);">已退回</span>`
              : `<button type="button" class="btn-apple-secondary" style="color: #dc2626; font-size: 12px; padding: 5px 12px;" onclick="rollbackTaobaoBatch('${escapeHtml(b.id)}')">↩ 撤销此批</button>`
            }
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<div style="text-align: center; color: #dc2626; padding: 24px;">读取批次异常: ${err.message}</div>`;
  }
}

async function rollbackTaobaoBatch(batchId) {
  if (!confirm(`确定要撤销并回滚导入批次 [${batchId}] 吗？\n将原子扣回本次增加的库存，并恢复流水记录。`)) {
    return;
  }
  try {
    const res = await fetch(`/api/taobao/batches/${batchId}/rollback`, { method: 'POST' });
    const result = await res.json();
    if (!result.success) {
      throw new Error(result.error || '回滚失败');
    }
    showToast(`<span style="color: #34c759; font-size: 15px;">✔</span> 批次 [${batchId}] 已成功撤销回滚，扣减 ${result.data.revertedCount} 项物料！`);
    loadInventory();
    loadFrequentLocations();
    refreshLowStockBadge();
    openTaobaoBatchHistory();
  } catch (err) {
    showToast(`❌ 撤销回滚失败: ${err.message}`);
    alert(`❌ 撤销回滚失败: ${err.message}`);
  }
}

// ==================== 智能解析与规则配置 ====================

async function openTaobaoRulesModal() {
  openDrawer('modal-taobao-rules-backdrop');
  try {
    const res = await fetch('/api/taobao/rules');
    const result = await res.json();
    if (result.success && result.data) {
      const inputIgnore = document.getElementById('rule-input-ignore');
      const inputClean = document.getElementById('rule-input-clean');
      const grid = document.getElementById('rule-category-box-grid');

      if (inputIgnore) inputIgnore.value = (result.data.ignoreKeywords || []).join(', ');
      if (inputClean) inputClean.value = (result.data.cleanGarbageWords || []).join(', ');

      if (grid) {
        const catMap = result.data.categoryDefaultLocations || {};
        const categories = Object.keys(catMap);
        grid.innerHTML = categories.map(cat => `
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; background: var(--bg-subtle); padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border-subtle);">
            <span style="font-size: 12px; font-weight: 500; color: var(--text-main);">${escapeHtml(cat)}:</span>
            <input type="text" class="drawer-input rule-cat-box-input" data-category="${escapeHtml(cat)}" value="${escapeHtml(catMap[cat] || '')}" style="width: 120px; font-size: 11px; padding: 3px 6px; height: 24px;" list="taobao-location-datalist">
          </div>
        `).join('');
      }
    }
  } catch (err) {
    showToast(`读取规则失败: ${err.message}`);
  }
}

async function saveTaobaoRules() {
  const inputIgnore = document.getElementById('rule-input-ignore');
  const inputClean = document.getElementById('rule-input-clean');
  const catInputs = document.querySelectorAll('.rule-cat-box-input');

  const ignoreWords = (inputIgnore ? inputIgnore.value : '').split(/[,，\n\s]+/).map(s => s.trim()).filter(Boolean);
  const cleanWords = (inputClean ? inputClean.value : '').split(/[,，\n\s]+/).map(s => s.trim()).filter(Boolean);
  const catMap = {};
  catInputs.forEach(inp => {
    const cat = inp.dataset.category;
    if (cat) catMap[cat] = inp.value.trim();
  });

  try {
    const res = await fetch('/api/taobao/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ignoreKeywords: ignoreWords,
        cleanGarbageWords: cleanWords,
        categoryDefaultLocations: catMap
      })
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.error || '保存规则失败');
    showToast('✔ 淘宝解析规则已保存生效！');
    closeDrawer('modal-taobao-rules-backdrop');

    // 若当前正在预览结果，自动重新触发解析预览以应用新规则
    const resultArea = document.getElementById('taobao-result-area');
    if (resultArea && resultArea.style.display !== 'none') {
      fetchTaobaoPreview(null, true);
    }
  } catch (err) {
    showToast(`保存规则失败: ${err.message}`);
  }
}

async function resetTaobaoRules() {
  if (!confirm('确定要恢复解析规则与黑名单至系统初始默认值吗？')) return;
  try {
    const res = await fetch('/api/taobao/rules/reset', { method: 'POST' });
    const result = await res.json();
    if (!result.success) throw new Error(result.error || '重置失败');
    showToast('✔ 规则已重置为初始默认配置！');
    openTaobaoRulesModal();
  } catch (err) {
    showToast(`重置规则失败: ${err.message}`);
  }
}

window.toggleTaobaoItem = toggleTaobaoItem;
window.toggleAllTaobaoItems = toggleAllTaobaoItems;
window.invertTaobaoSelection = invertTaobaoSelection;
window.updateTaobaoItemQty = updateTaobaoItemQty;
window.updateTaobaoItemLoc = updateTaobaoItemLoc;
window.openBoxPopover = openBoxPopover;
window.closeBoxPopover = closeBoxPopover;
window.selectBoxForCurrentItem = selectBoxForCurrentItem;
window.createNewBoxForCurrentItem = createNewBoxForCurrentItem;
window.setTaobaoFilter = setTaobaoFilter;
window.openTaobaoBatchHistory = openTaobaoBatchHistory;
window.rollbackTaobaoBatch = rollbackTaobaoBatch;
window.openTaobaoRulesModal = openTaobaoRulesModal;
window.saveTaobaoRules = saveTaobaoRules;
window.resetTaobaoRules = resetTaobaoRules;
window.toggleTaobaoItemLock = toggleTaobaoItemLock;
window.resetTaobaoImportModal = resetTaobaoImportModal;

window.switchNavTab = switchNavTab;
window.openDrawer = openDrawer;
window.closeDrawer = closeDrawer;
window.adjustInputQty = adjustInputQty;
window.stepQuantity = stepQuantity;
window.openDetailDrawer = openDetailDrawer;
window.loadInventory = loadInventory;
window.filterByLocation = filterByLocation;
window.renderProTable = renderProTable;
window.getCategoryIcon = getCategoryIcon;
window.formatSpec = formatSpec;
window.refreshLowStockBadge = refreshLowStockBadge;
window.loadGlobalLogs = loadGlobalLogs;
window.loadComponentLogs = loadComponentLogs;
window.saveComponentDetail = saveComponentDetail;
window.deleteCurrentComponent = deleteCurrentComponent;
window.initTaobaoImport = initTaobaoImport;
window.toggleWorkshopDashboard = toggleWorkshopDashboard;
window.initWorkshopDashboard = initWorkshopDashboard;
window.refreshWorkshopDashboard = refreshWorkshopDashboard;
window.selectCategoryFilter = selectCategoryFilter;
window.resetCategoryFilter = resetCategoryFilter;
window.filterByLowStock = filterByLowStock;
window.undoContinuousHistory = undoContinuousHistory;
window.clearContinuousHistory = clearContinuousHistory;
window.selectSmdCandidate = selectSmdCandidate;
window.submitEntryItem = submitEntryItem;
window.submitCurrentCard = submitCurrentCard;
window.resetEntryFormForNext = resetEntryFormForNext;
window.resetEntryForm = resetEntryForm;
window.fillQuickExample = fillQuickExample;
window.toggleAdvancedDrawer = toggleAdvancedDrawer;
window.stepCardQty = stepCardQty;
window.promptChangeLocation = promptChangeLocation;
window.updateEntryIdentityCard = updateEntryIdentityCard;
window.switchEntryMode = switchEntryMode;
window.fillScratchpadExample = fillScratchpadExample;
window.clearScratchpad = clearScratchpad;
window.triggerParseScratchpad = triggerParseScratchpad;
window.renderScratchpadQueue = renderScratchpadQueue;
window.stepQueueItemQty = stepQueueItemQty;
window.updateQueueItemQty = updateQueueItemQty;
window.updateQueueItemLoc = updateQueueItemLoc;
window.toggleQueueItemForceNew = toggleQueueItemForceNew;
window.removeQueueItem = removeQueueItem;
window.submitScratchpadQueue = submitScratchpadQueue;



