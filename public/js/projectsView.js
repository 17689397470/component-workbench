/**
 * 制作项目与套料包管理工作台驱动 (public/js/projectsView.js)
 * 具备：
 * - 极简高密度看板：数量融入状态胶囊、秒搜项目与自封袋、卡片正面透视核心物料与自封袋位置
 * - BOM 存为制作项目清晰核对面板：套数步进调节、动态实时对账、一键预留锁库开关
 * - 两阶段库存管理 (智能预留锁库 ➔ 正式完工消库)
 */

let allProjects = [];
let currentProjectFilter = 'all';
let currentDetailProject = null;
let projectsSearchQuery = '';

// BOM 存入项目模态框临时数据
let currentBOMModalFilename = '';
let currentBOMModalResults = [];

// 项目明细中添加物料的模式与联想状态
let currentProjectAddMode = 'stock';
let addSuggestDebounceTimer = null;
let addSuggestItems = [];
let addSuggestActiveIndex = -1;

document.addEventListener('DOMContentLoaded', () => {
  initProjectsView();
});

function initProjectsView() {
  const btnNewProject = document.getElementById('btn-new-project');
  if (btnNewProject) {
    btnNewProject.addEventListener('click', () => {
      openCreateProjectModal();
    });
  }

  const btnRefreshProjects = document.getElementById('btn-refresh-projects');
  if (btnRefreshProjects) {
    btnRefreshProjects.addEventListener('click', () => {
      loadProjects();
    });
  }

  // 项目秒搜框
  const searchInput = document.getElementById('projects-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      projectsSearchQuery = e.target.value.trim().toLowerCase();
      const clearBtn = document.getElementById('btn-projects-search-clear');
      if (clearBtn) clearBtn.style.display = projectsSearchQuery ? 'block' : 'none';
      renderProjectsGrid();
    });
  }

  // 初始化添加物料库存联想与快捷键
  initProjectAddListeners();

  // 侦测 URL Hash: 手机扫码直达项目套料明细抽屉
  checkProjectHashRoute();
  window.addEventListener('hashchange', checkProjectHashRoute);

  loadProjects();
}

function checkProjectHashRoute() {
  const hash = window.location.hash;
  if (hash && hash.startsWith('#project=')) {
    const projId = parseInt(hash.slice(9), 10);
    if (projId) {
      setTimeout(() => {
        if (window.switchNavTab) window.switchNavTab('tab-projects');
        openProjectDetailModal(projId);
      }, 150);
    }
  }
}

function initProjectAddListeners() {
  const stockSearchInput = document.getElementById('project-add-search-input');
  const suggestionsBox = document.getElementById('project-add-suggestions');

  if (stockSearchInput) {
    stockSearchInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      // 用户一旦手动修改，重置之前选定的 component_id
      const compIdInput = document.getElementById('project-add-comp-id');
      if (compIdInput) compIdInput.value = '';

      if (addSuggestDebounceTimer) clearTimeout(addSuggestDebounceTimer);
      addSuggestDebounceTimer = setTimeout(() => {
        fetchProjectAddSuggestions(val);
      }, 180);
    });

    stockSearchInput.addEventListener('keydown', (e) => {
      if (!suggestionsBox || suggestionsBox.style.display === 'none') {
        if (e.key === 'Enter') {
          const qtyInput = document.getElementById('project-add-unit-qty');
          if (qtyInput) {
            qtyInput.focus();
            qtyInput.select();
          }
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        addSuggestActiveIndex = Math.min(addSuggestActiveIndex + 1, addSuggestItems.length - 1);
        highlightActiveSuggestion();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        addSuggestActiveIndex = Math.max(addSuggestActiveIndex - 1, 0);
        highlightActiveSuggestion();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (addSuggestActiveIndex >= 0 && addSuggestActiveIndex < addSuggestItems.length) {
          selectProjectAddSuggestion(addSuggestActiveIndex);
        } else {
          closeProjectAddSuggestions();
          const qtyInput = document.getElementById('project-add-unit-qty');
          if (qtyInput) {
            qtyInput.focus();
            qtyInput.select();
          }
        }
      } else if (e.key === 'Escape') {
        closeProjectAddSuggestions();
      }
    });
  }

  // 点击外部隐藏下拉框
  document.addEventListener('click', (e) => {
    const addSection = document.getElementById('project-detail-add-section');
    if (addSection && !addSection.contains(e.target)) {
      closeProjectAddSuggestions();
    }
  });

  // 单板用量 & 位号回车快捷添加
  const unitQtyInput = document.getElementById('project-add-unit-qty');
  if (unitQtyInput) {
    unitQtyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitAddProjectItemStock();
      }
    });
  }

  const desigInput = document.getElementById('project-add-desig');
  if (desigInput) {
    desigInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitAddProjectItemStock();
      }
    });
  }

  // 自由手打回车快捷添加
  const freeTextInput = document.getElementById('project-add-free-text');
  if (freeTextInput) {
    freeTextInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitAddProjectItemFree();
      }
    });
  }
}

function clearProjectsSearch() {
  const input = document.getElementById('projects-search-input');
  if (input) input.value = '';
  projectsSearchQuery = '';
  const clearBtn = document.getElementById('btn-projects-search-clear');
  if (clearBtn) clearBtn.style.display = 'none';
  renderProjectsGrid();
}

async function loadProjects() {
  try {
    const res = await fetch('/api/projects');
    const result = await res.json();
    if (result.success) {
      allProjects = result.data || [];
      updateProjectsFilterCounts(allProjects);
      renderProjectsGrid();
    }
  } catch (err) {
    console.error('加载制作项目列表失败:', err);
  }
}

/**
 * 将数量直接融入状态过滤胶囊中 (砍掉顶部4个空洞大方块)
 */
function updateProjectsFilterCounts(projects) {
  const countAll = projects.length;
  const countReady = projects.filter(p => p.status === 'READY').length;
  const countPrep = projects.filter(p => p.status === 'PREPARING').length;
  const countBuild = projects.filter(p => p.status === 'BUILDING').length;
  const countDone = projects.filter(p => p.status === 'COMPLETED').length;

  const elAll = document.getElementById('pill-count-all');
  const elReady = document.getElementById('pill-count-ready');
  const elPrep = document.getElementById('pill-count-prep');
  const elBuild = document.getElementById('pill-count-build');
  const elDone = document.getElementById('pill-count-done');

  if (elAll) elAll.innerText = countAll;
  if (elReady) elReady.innerText = countReady;
  if (elPrep) elPrep.innerText = countPrep;
  if (elBuild) elBuild.innerText = countBuild;
  if (elDone) elDone.innerText = countDone;
}

function setProjectFilter(filter) {
  currentProjectFilter = filter;
  const pills = document.querySelectorAll('#projects-filter-pills .filter-tab-pill');
  pills.forEach(p => {
    p.classList.toggle('active', p.getAttribute('data-filter') === filter);
  });
  renderProjectsGrid();
}

function renderProjectsGrid() {
  const container = document.getElementById('projects-cards-container');
  if (!container) return;

  let filtered = allProjects;
  if (currentProjectFilter !== 'all') {
    filtered = allProjects.filter(p => p.status === currentProjectFilter);
  }

  if (projectsSearchQuery) {
    filtered = filtered.filter(p => {
      const matchName = (p.name || '').toLowerCase().includes(projectsSearchQuery);
      const matchDesc = (p.description || '').toLowerCase().includes(projectsSearchQuery);
      const matchBom = (p.bom_filename || '').toLowerCase().includes(projectsSearchQuery);
      return matchName || matchDesc || matchBom;
    });
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 50px 20px; text-align: center; color: var(--text-dim); background: var(--bg-surface); border: 1px dashed var(--border-subtle); border-radius: 12px;">
        <div style="font-size: 28px; margin-bottom: 8px;">🛠️</div>
        <div style="font-size: 14.5px; font-weight: 600; color: var(--text-main);">${projectsSearchQuery ? '未找到匹配的制作项目' : '暂无制作项目'}</div>
        <div style="font-size: 12.5px; margin-top: 4px;">您可以点击右上角「＋ 新建项目」，或在「BOM 查重比对」完成后一键存为项目套料包。</div>
      </div>
    `;
    return;
  }

  let html = '';
  filtered.forEach(p => {
    let statusClass = 'status-preparing';
    let statusLabel = '⚠️ 缺料筹备中';
    let fillClass = 'fill-amber';

    if (p.status === 'READY') {
      statusClass = 'status-ready';
      statusLabel = '✨ 料已齐套';
      fillClass = 'fill-green';
    } else if (p.status === 'BUILDING') {
      statusClass = 'status-building';
      statusLabel = '⚡ 组装焊接中';
      fillClass = 'fill-purple';
    } else if (p.status === 'COMPLETED') {
      statusClass = 'status-completed';
      statusLabel = '✔ 已完工消库';
      fillClass = 'fill-green';
    }

    const percent = p.readiness_percent || 0;
    const isCompleted = p.status === 'COMPLETED';

    html += `
      <div class="project-card" onclick="openProjectDetailModal(${p.id})">
        <div>
          <div class="project-card-header">
            <div style="min-width: 0;">
              <div class="project-card-title" title="${escapeAttr(p.name)}">
                <span>🛠️</span>
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(p.name)}</span>
              </div>
              <div style="display: flex; gap: 6px; align-items: center; margin-top: 4px; flex-wrap: wrap;">
                <span class="project-target-badge">制作 ${p.target_qty} 套</span>
                ${p.bom_filename ? `<span class="sub-tag-pill" style="font-size: 10.5px;">📄 ${escapeHtml(p.bom_filename)}</span>` : ''}
              </div>
            </div>
            <span class="project-status-pill ${statusClass}">${statusLabel}</span>
          </div>

          ${p.description ? `<div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px; line-height: 1.4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(p.description)}</div>` : ''}

          <!-- 紧凑齐套进度标尺 -->
          <div class="project-progress-wrap" style="margin: 8px 0;">
            <div class="project-progress-meta">
              <span style="color: var(--text-muted); font-size: 11.5px;">齐套: <strong>${p.ready_items_count} / ${p.total_items_count} 项</strong> (${p.total_pieces_locked} / ${p.total_pieces_demand} 件)</span>
              <strong style="color: ${percent === 100 ? '#059669' : '#d97706'}; font-size: 12px;">${percent}%</strong>
            </div>
            <div class="project-progress-track">
              <div class="project-progress-fill ${fillClass}" style="width: ${percent}%;"></div>
            </div>
          </div>
        </div>

        <div>
          <div class="project-card-actions" onclick="event.stopPropagation()">
            <button type="button" class="btn-apple-secondary" style="font-size: 12px; padding: 5px 8px;" onclick="openProjectDetailModal(${p.id})">
              🔍 套料明细
            </button>
            ${!isCompleted ? `
              <button type="button" class="btn-apple-secondary" style="font-size: 12px; padding: 5px 8px; color: #0284c7;" onclick="handleLockProjectStock(${p.id})" title="根据现有可用库存自动锁定">
                🔒 预锁库存
              </button>
              <button type="button" class="btn-apple-primary" style="font-size: 12px; padding: 5px 10px; font-weight: 600;" onclick="handleCompleteProject(${p.id})" title="板子焊好后正式扣除库存并归档">
                ✔ 完工消库
              </button>
            ` : `
              <span style="font-size: 11.5px; color: var(--text-dim); text-align: center; line-height: 26px;">已于完工时消库归档</span>
            `}
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// ==================== 模态框 1: 新建制作项目 ====================

function openCreateProjectModal() {
  document.getElementById('input-project-name').value = '';
  document.getElementById('input-project-desc').value = '';
  document.getElementById('input-project-target-qty').value = '1';
  openDrawer('modal-create-project-backdrop');
}

async function submitCreateProjectForm() {
  const name = document.getElementById('input-project-name').value.trim();
  const description = document.getElementById('input-project-desc').value.trim();
  const target_qty = parseInt(document.getElementById('input-project-target-qty').value, 10) || 1;

  if (!name) {
    if (window.showAppleToast) window.showAppleToast('请输入项目名称', 'error');
    return;
  }

  try {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: { name, description, target_qty },
        items: [],
        auto_lock: true
      })
    });
    const result = await res.json();
    if (result.success) {
      if (window.showAppleToast) window.showAppleToast(`项目【${name}】创建成功！`, 'success');
      closeDrawer('modal-create-project-backdrop');
      await loadProjects();
    } else {
      alert('创建失败: ' + result.error);
    }
  } catch (err) {
    console.error('新建项目出错:', err);
  }
}

// ==================== 模态框 2: 从 BOM 存为制作项目清晰核对面板 ====================

function openSaveBOMAsProjectModal(bomFilename, matchedResults) {
  if (!matchedResults || matchedResults.length === 0) {
    alert('暂无有效 BOM 比对数据');
    return;
  }

  currentBOMModalFilename = bomFilename || '新硬件工程';
  currentBOMModalResults = matchedResults;

  const defaultName = currentBOMModalFilename.replace(/\.[^/.]+$/, '');
  const inputName = document.getElementById('bom-project-name');
  const inputDesc = document.getElementById('bom-project-desc');
  const inputQty = document.getElementById('bom-project-target-qty');
  const chkLock = document.getElementById('bom-project-auto-lock');

  if (inputName) inputName.value = defaultName;
  if (inputDesc) inputDesc.value = `基于 BOM【${currentBOMModalFilename}】导入`;
  if (inputQty) inputQty.value = '1';
  if (chkLock) chkLock.checked = true;

  recalcSaveBOMModal();
  openDrawer('modal-save-bom-project-backdrop');
}

function changeBOMTargetQty(delta) {
  const input = document.getElementById('bom-project-target-qty');
  if (!input) return;
  let val = parseInt(input.value, 10) || 1;
  val = Math.max(1, val + delta);
  input.value = val;
  recalcSaveBOMModal();
}

function setBOMTargetQty(val) {
  const input = document.getElementById('bom-project-target-qty');
  if (!input) return;
  input.value = Math.max(1, parseInt(val, 10) || 1);
  recalcSaveBOMModal();
}

/**
 * 随套数变化实时动态对账计算
 */
function recalcSaveBOMModal() {
  const container = document.getElementById('bom-project-calc-summary');
  const inputQty = document.getElementById('bom-project-target-qty');
  if (!container) return;

  const targetQty = inputQty ? Math.max(1, parseInt(inputQty.value, 10) || 1) : 1;
  const totalItemsCount = currentBOMModalResults.length;

  let singlePiecesTotal = 0;
  let readyItemsCount = 0;
  let shortageItemsCount = 0;

  currentBOMModalResults.forEach(r => {
    const unitD = parseInt(r.demandQty || 1, 10) || 1;
    singlePiecesTotal += unitD;
    const totalD = unitD * targetQty;

    if (r.matchedComponent) {
      const avail = r.matchedComponent.available_quantity !== undefined 
        ? r.matchedComponent.available_quantity 
        : (r.matchedComponent.quantity || 0);
      if (avail >= totalD) {
        readyItemsCount++;
      } else {
        shortageItemsCount++;
      }
    } else {
      shortageItemsCount++;
    }
  });

  const totalDemandPieces = singlePiecesTotal * targetQty;
  const readinessPercent = totalItemsCount > 0 ? Math.round((readyItemsCount / totalItemsCount) * 100) : 0;

  container.innerHTML = `
    <div class="bom-calc-row">
      <span style="color: var(--text-muted);">物料总项数:</span>
      <strong style="color: var(--text-main);">${totalItemsCount} 种</strong>
    </div>
    <div class="bom-calc-row">
      <span style="color: var(--text-muted);">需用件数换算:</span>
      <span>单板 ${singlePiecesTotal} 件 ➔ 制作 ${targetQty} 套共需 <strong style="color: var(--accent); font-size: 13px;">${totalDemandPieces} 件</strong></span>
    </div>
    <div class="bom-calc-row" style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed var(--border-subtle);">
      <span style="color: var(--text-muted);">工坊现货对账:</span>
      <div>
        <span style="color: #059669; font-weight: 600; margin-right: 8px;">✨ 现货充足 ${readyItemsCount} 种</span>
        <span style="color: #dc2626; font-weight: 600;">⚠️ 需补采购 ${shortageItemsCount} 种</span>
      </div>
    </div>
    <div class="bom-calc-row" style="margin-top: 4px;">
      <span style="color: var(--text-muted);">预计首轮齐套率:</span>
      <strong style="color: ${readinessPercent === 100 ? '#059669' : '#d97706'}; font-size: 13px;">${readinessPercent}%</strong>
    </div>
  `;
}

async function submitSaveBOMProject() {
  const name = document.getElementById('bom-project-name').value.trim();
  const description = document.getElementById('bom-project-desc').value.trim();
  const inputQty = document.getElementById('bom-project-target-qty');
  const target_qty = inputQty ? Math.max(1, parseInt(inputQty.value, 10) || 1) : 1;
  const auto_lock = document.getElementById('bom-project-auto-lock') ? document.getElementById('bom-project-auto-lock').checked : true;

  if (!name) {
    if (window.showAppleToast) window.showAppleToast('请输入项目名称', 'error');
    return;
  }

  // 格式化 items
  const items = currentBOMModalResults.map(r => ({
    part_name: r.bomPart || r.demandPart || '',
    package: r.bomPackage || '',
    unit_demand_qty: r.demandQty || 1,
    designators: (r.designators || []).join(', '),
    component_id: r.matchedComponent ? r.matchedComponent.id : null
  }));

  try {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: {
          name,
          description,
          target_qty,
          bom_filename: currentBOMModalFilename
        },
        items,
        auto_lock
      })
    });
    const result = await res.json();
    if (result.success) {
      if (window.showAppleToast) {
        window.showAppleToast(`已成功建档项目【${name}】并完成预留锁库！`, 'success');
      }
      closeDrawer('modal-save-bom-project-backdrop');
      if (window.switchNavTab) {
        window.switchNavTab('tab-projects');
      }
      await loadProjects();
    } else {
      alert('存入项目失败: ' + result.error);
    }
  } catch (err) {
    console.error('提交 BOM 项目出错:', err);
  }
}

// ==================== 模态框 3: 项目套料明细抽屉 ====================

async function openProjectDetailModal(projectId) {
  try {
    const res = await fetch(`/api/projects/${projectId}`);
    const result = await res.json();
    if (result.success) {
      currentDetailProject = result.data;
      resetProjectAddInputs();
      renderProjectDetailModal(currentDetailProject);
      openDrawer('modal-project-detail-backdrop');
    }
  } catch (err) {
    console.error('获取项目详情失败:', err);
  }
}

function resetProjectAddInputs() {
  const searchInput = document.getElementById('project-add-search-input');
  const compIdInput = document.getElementById('project-add-comp-id');
  const compNameInput = document.getElementById('project-add-comp-name');
  const compPkgInput = document.getElementById('project-add-comp-pkg');
  const unitQtyInput = document.getElementById('project-add-unit-qty');
  const desigInput = document.getElementById('project-add-desig');
  const freeTextInput = document.getElementById('project-add-free-text');

  if (searchInput) searchInput.value = '';
  if (compIdInput) compIdInput.value = '';
  if (compNameInput) compNameInput.value = '';
  if (compPkgInput) compPkgInput.value = '';
  if (unitQtyInput) unitQtyInput.value = '1';
  if (desigInput) desigInput.value = '';
  if (freeTextInput) freeTextInput.value = '';

  closeProjectAddSuggestions();
}

function renderProjectDetailModal(project) {
  document.getElementById('detail-project-title').innerText = `🛠️ ${project.name}`;
  document.getElementById('detail-project-target-text').innerText = `目标制作: ${project.target_qty} 套 · 齐套率: ${project.readiness_percent}%`;

  const tbody = document.getElementById('project-detail-items-tbody');
  if (!tbody) return;

  const isCompleted = project.status === 'COMPLETED';

  // 已完工项目隐藏加料工作区，未完工展示
  const addSection = document.getElementById('project-detail-add-section');
  if (addSection) {
    addSection.style.display = isCompleted ? 'none' : 'block';
  }

  const btnLock = document.getElementById('btn-detail-lock-stock');
  const btnUnlock = document.getElementById('btn-detail-unlock-stock');
  const btnComplete = document.getElementById('btn-detail-complete-project');

  if (btnLock) btnLock.style.display = isCompleted ? 'none' : 'inline-block';
  if (btnUnlock) btnUnlock.style.display = isCompleted ? 'none' : 'inline-block';
  if (btnComplete) btnComplete.style.display = isCompleted ? 'none' : 'inline-block';

  let html = '';
  (project.items || []).forEach((item, idx) => {
    const isReady = item.is_ready;
    const statusPill = isReady 
      ? `<span class="sub-tag-pill" style="color: #059669; background: rgba(16,185,129,0.1); border-color: rgba(16,185,129,0.3);">✔ 已锁足</span>`
      : `<span class="sub-tag-pill" style="color: #dc2626; background: rgba(220,38,38,0.1); border-color: rgba(220,38,38,0.2);">⚠️ 缺 ${item.shortage_qty} 件</span>`;

    let statusContent = `<div>${statusPill}</div>`;
    if (!isReady && !isCompleted) {
      statusContent += `
        <div style="margin-top: 5px;">
          <button type="button" class="btn-apple-secondary" style="font-size: 10.5px; padding: 2px 6px; color: #0284c7; border-color: rgba(2,132,199,0.3); border-radius: 4px; display: inline-flex; align-items: center; gap: 3px;" onclick="openProjectAlternativesModal(${project.id}, ${item.id})" title="在工坊现有库存中智能寻找可平替元器件">
            <span>💡</span> <span>查替代料</span>
          </button>
        </div>
      `;
    }

    html += `
      <tr>
        <td style="text-align: center; color: var(--text-dim);">${idx + 1}</td>
        <td>
          <div style="font-weight: 600; color: var(--text-main);">${escapeHtml(item.part_name)}</div>
          <div style="font-size: 11px; color: var(--text-dim);">${escapeHtml(item.package || '')} ${item.designators ? `· ${escapeHtml(item.designators)}` : ''}</div>
        </td>
        <td style="text-align: center; font-family: var(--font-mono);">
          ${!isCompleted ? `
            <span class="qty-editable-pill" style="cursor: pointer; padding: 2px 6px; border-radius: 4px; background: var(--bg-subtle);" onclick="handleUpdateProjectItemQty(${project.id}, ${item.id}, ${item.unit_demand_qty}, '${escapeAttr(item.part_name)}')" title="点击修改单板用量">
              ${item.unit_demand_qty} <span style="font-size: 9px; opacity: 0.6;">✏️</span>
            </span>
          ` : `
            <span>${item.unit_demand_qty}</span>
          `}
        </td>
        <td style="text-align: center; font-family: var(--font-mono); font-weight: 600;">${item.total_demand_qty}</td>
        <td style="text-align: center; font-family: var(--font-mono); color: var(--accent); font-weight: 700;">${item.locked_qty}</td>
        <td>
          ${item.component_id ? `
            <div style="font-size: 11.5px; font-weight: 600;">📦 ${escapeHtml(item.comp_location || '默认自封袋')}</div>
            <div style="font-size: 10.5px; color: var(--text-muted);">工坊总存: ${item.comp_total_stock} · 本项可锁: ${item.available_for_this}</div>
          ` : `
            <span style="font-size: 11px; color: #dc2626;">未关联库存物料</span>
          `}
        </td>
        <td style="text-align: center;">${statusContent}</td>
        <td style="text-align: center;">
          ${!isCompleted ? `
            <button type="button" class="icon-btn-minimal" style="color: #ef4444; font-size: 13px; padding: 2px 6px;" onclick="handleRemoveProjectItem(${project.id}, ${item.id}, '${escapeAttr(item.part_name)}')" title="从项目移除此物料">✕</button>
          ` : `
            <span style="color: var(--text-dim); font-size: 11px;">-</span>
          `}
        </td>
      </tr>
    `;
  });

  if ((project.items || []).length === 0) {
    html = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 36px 12px; color: var(--text-dim);">
          <div style="font-size: 22px; margin-bottom: 6px;">📦</div>
          <div style="font-size: 13px; font-weight: 500; color: var(--text-main);">本项目暂无所需元器件</div>
          <div style="font-size: 11.5px; margin-top: 4px;">可在上方输入框中挑选现有库存或快速手打录入</div>
        </td>
      </tr>
    `;
  }

  tbody.innerHTML = html;
}

// 切换添加模式
function switchProjectAddMode(mode) {
  currentProjectAddMode = mode;
  const btnStock = document.getElementById('btn-add-mode-stock');
  const btnFree = document.getElementById('btn-add-mode-free');
  const boxStock = document.getElementById('add-mode-stock-box');
  const boxFree = document.getElementById('add-mode-free-box');

  if (mode === 'stock') {
    if (btnStock) btnStock.classList.add('active');
    if (btnFree) btnFree.classList.remove('active');
    if (boxStock) boxStock.style.display = 'flex';
    if (boxFree) boxFree.style.display = 'none';
    const input = document.getElementById('project-add-search-input');
    if (input) input.focus();
  } else {
    if (btnFree) btnFree.classList.add('active');
    if (btnStock) btnStock.classList.remove('active');
    if (boxFree) boxFree.style.display = 'flex';
    if (boxStock) boxStock.style.display = 'none';
    const input = document.getElementById('project-add-free-text');
    if (input) input.focus();
  }
}

// 模糊拉取并渲染库存搜索联想菜单
async function fetchProjectAddSuggestions(query) {
  const suggestionsBox = document.getElementById('project-add-suggestions');
  if (!suggestionsBox) return;

  if (!query) {
    closeProjectAddSuggestions();
    return;
  }

  try {
    const res = await fetch(`/api/components?query=${encodeURIComponent(query)}`);
    const result = await res.json();
    if (result.success) {
      addSuggestItems = (result.data || []).slice(0, 12);
      addSuggestActiveIndex = -1;
      renderProjectAddSuggestions(addSuggestItems, query);
    }
  } catch (err) {
    console.error('搜索库存联想出错:', err);
  }
}

function renderProjectAddSuggestions(items, query) {
  const suggestionsBox = document.getElementById('project-add-suggestions');
  if (!suggestionsBox) return;

  if (!items || items.length === 0) {
    suggestionsBox.innerHTML = `
      <div style="padding: 10px 14px; color: var(--text-dim); font-size: 11.5px; text-align: center;">
        未在库存中找到匹配物料（直接回车仍可作为缺料项添加）
      </div>
    `;
    suggestionsBox.style.display = 'block';
    return;
  }

  let html = '';
  items.forEach((comp, idx) => {
    const avail = comp.available_quantity !== undefined ? comp.available_quantity : (comp.quantity || 0);
    const availColor = avail > 0 ? '#059669' : '#dc2626';

    html += `
      <div class="project-add-sug-item" data-index="${idx}" onclick="selectProjectAddSuggestion(${idx})">
        <div style="min-width: 0; flex: 1; padding-right: 8px;">
          <div style="font-weight: 600; color: var(--text-main); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${escapeHtml(comp.name)}
          </div>
          <div style="font-size: 10.5px; color: var(--text-dim); margin-top: 2px;">
            <span class="sub-tag-pill" style="font-size: 10px;">${escapeHtml(comp.category || '元件')}</span>
            ${comp.package ? `<span>${escapeHtml(comp.package)}</span>` : ''}
            ${comp.lcsc_part ? `<span>· ${escapeHtml(comp.lcsc_part)}</span>` : ''}
          </div>
        </div>
        <div style="text-align: right; flex-shrink: 0;">
          <div style="font-size: 11px; font-weight: 600; color: var(--text-main);">
            📦 ${escapeHtml(comp.location || '随手放置')}
          </div>
          <div style="font-size: 10.5px; margin-top: 2px;">
            <span style="color: ${availColor}; font-weight: 600;">可用 ${avail}</span>
            <span style="color: var(--text-muted);">/ 存量 ${comp.quantity || 0}</span>
          </div>
        </div>
      </div>
    `;
  });

  suggestionsBox.innerHTML = html;
  suggestionsBox.style.display = 'block';
}

function highlightActiveSuggestion() {
  const items = document.querySelectorAll('#project-add-suggestions .project-add-sug-item');
  items.forEach((item, idx) => {
    item.classList.toggle('active', idx === addSuggestActiveIndex);
    if (idx === addSuggestActiveIndex) {
      item.scrollIntoView({ block: 'nearest' });
    }
  });
}

function selectProjectAddSuggestion(index) {
  const comp = addSuggestItems[index];
  if (!comp) return;

  const searchInput = document.getElementById('project-add-search-input');
  const compIdInput = document.getElementById('project-add-comp-id');
  const compNameInput = document.getElementById('project-add-comp-name');
  const compPkgInput = document.getElementById('project-add-comp-pkg');
  const unitQtyInput = document.getElementById('project-add-unit-qty');

  if (searchInput) searchInput.value = comp.name;
  if (compIdInput) compIdInput.value = comp.id;
  if (compNameInput) compNameInput.value = comp.name;
  if (compPkgInput) compPkgInput.value = comp.package || '';

  closeProjectAddSuggestions();

  if (unitQtyInput) {
    unitQtyInput.focus();
    unitQtyInput.select();
  }
}

function closeProjectAddSuggestions() {
  const suggestionsBox = document.getElementById('project-add-suggestions');
  if (suggestionsBox) suggestionsBox.style.display = 'none';
  addSuggestActiveIndex = -1;
}

// 提交从库存挑选的物料
async function submitAddProjectItemStock() {
  if (!currentDetailProject) return;

  const searchInput = document.getElementById('project-add-search-input');
  const compIdInput = document.getElementById('project-add-comp-id');
  const compNameInput = document.getElementById('project-add-comp-name');
  const compPkgInput = document.getElementById('project-add-comp-pkg');
  const unitQtyInput = document.getElementById('project-add-unit-qty');
  const desigInput = document.getElementById('project-add-desig');

  const partName = (compNameInput && compNameInput.value.trim()) || (searchInput && searchInput.value.trim());
  if (!partName) {
    if (window.showAppleToast) window.showAppleToast('请输入或选择物料型号', 'error');
    if (searchInput) searchInput.focus();
    return;
  }

  const pkg = compPkgInput ? compPkgInput.value.trim() : '';
  const compId = compIdInput && compIdInput.value ? parseInt(compIdInput.value, 10) : null;
  const unitDemand = unitQtyInput ? Math.max(1, parseInt(unitQtyInput.value, 10) || 1) : 1;
  const designators = desigInput ? desigInput.value.trim() : '';

  try {
    const res = await fetch(`/api/projects/${currentDetailProject.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        part_name: partName,
        package: pkg,
        component_id: compId,
        unit_demand_qty: unitDemand,
        designators: designators
      })
    });
    const result = await res.json();
    if (result.success) {
      if (window.showAppleToast) {
        window.showAppleToast(`已为项目添加【${partName}】！`, 'success');
      }
      resetProjectAddInputs();
      currentDetailProject = result.data;
      renderProjectDetailModal(currentDetailProject);
      await loadProjects();
      if (searchInput) searchInput.focus();
    } else {
      alert('添加物料失败: ' + result.error);
    }
  } catch (err) {
    console.error('添加项目物料出错:', err);
  }
}

// 提交自由手打模式
async function submitAddProjectItemFree() {
  if (!currentDetailProject) return;

  const freeInput = document.getElementById('project-add-free-text');
  const rawText = freeInput ? freeInput.value.trim() : '';
  if (!rawText) {
    if (window.showAppleToast) window.showAppleToast('请输入物料型号与用量速记', 'error');
    if (freeInput) freeInput.focus();
    return;
  }

  // 智能拆解手打文本 (例如: "10k 0805 2 R1,R2" 或 "AMS1117-3.3 1 U1")
  const tokens = rawText.split(/\s+/);
  let unitDemand = 1;
  let pkg = '';
  let desig = '';
  const nameTokens = [];

  const pkgRegex = /^(0[2468]0[135]|1206|1210|2512|sot-?23|sot-?223|sop-?8|sop-?16|qfn|tssop|dip-?[0-9]+|to-?220|sma|smb|smc|sod-?123|sod-?323|0402|0603|0805)$/i;
  const desigRegex = /^([RCLUDQJP]|CN|SW|LED)[0-9]+([,\-][A-Za-z0-9]+)*$/i;

  tokens.forEach(tok => {
    if (/^\*?[0-9]+(pcs|只|个|件)?$/i.test(tok) && !pkgRegex.test(tok) && !tok.startsWith('0')) {
      unitDemand = parseInt(tok.replace(/[^0-9]/g, ''), 10) || 1;
    } else if (pkgRegex.test(tok)) {
      pkg = tok.toUpperCase();
    } else if (tok.includes(',') || desigRegex.test(tok)) {
      desig = tok.toUpperCase();
    } else {
      nameTokens.push(tok);
    }
  });

  const partName = nameTokens.join(' ') || rawText;

  // 尝试在后台预先智能检索是否存在同名库存并自动关联
  let matchedCompId = null;
  try {
    const qRes = await fetch(`/api/components?query=${encodeURIComponent(partName)}`);
    const qData = await qRes.json();
    if (qData.success && qData.data && qData.data.length > 0) {
      const exact = qData.data.find(c => c.name.toLowerCase() === partName.toLowerCase());
      if (exact) matchedCompId = exact.id;
    }
  } catch (e) {}

  try {
    const res = await fetch(`/api/projects/${currentDetailProject.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        part_name: partName,
        package: pkg,
        component_id: matchedCompId,
        unit_demand_qty: unitDemand,
        designators: desig
      })
    });
    const result = await res.json();
    if (result.success) {
      if (window.showAppleToast) {
        window.showAppleToast(`已快速录入【${partName}】！`, 'success');
      }
      if (freeInput) freeInput.value = '';
      currentDetailProject = result.data;
      renderProjectDetailModal(currentDetailProject);
      await loadProjects();
      if (freeInput) freeInput.focus();
    } else {
      alert('添加物料失败: ' + result.error);
    }
  } catch (err) {
    console.error('手打添加项目物料出错:', err);
  }
}

// 移除单个物料
async function handleRemoveProjectItem(projectId, itemId, partName) {
  if (!confirm(`确定要从本项目中移除物料【${partName}】吗？`)) return;

  try {
    const res = await fetch(`/api/projects/${projectId}/items/${itemId}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      if (window.showAppleToast) window.showAppleToast(`已移除【${partName}】`, 'info');
      currentDetailProject = result.data;
      renderProjectDetailModal(currentDetailProject);
      await loadProjects();
    } else {
      alert('移除物料失败: ' + result.error);
    }
  } catch (err) {
    console.error('移除物料失败:', err);
  }
}

// 快速修改单板需求用量
async function handleUpdateProjectItemQty(projectId, itemId, currentQty, partName) {
  const promptVal = prompt(`修改【${partName}】的单板需求数量:`, currentQty);
  if (promptVal === null) return;

  const newQty = parseInt(promptVal.trim(), 10);
  if (isNaN(newQty) || newQty <= 0) {
    alert('请输入大于 0 的有效整数');
    return;
  }

  if (newQty === currentQty) return;

  try {
    const res = await fetch(`/api/projects/${projectId}/items/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unit_demand_qty: newQty })
    });
    const result = await res.json();
    if (result.success) {
      if (window.showAppleToast) window.showAppleToast(`已更新【${partName}】单板用量为 ${newQty}`, 'success');
      currentDetailProject = result.data;
      renderProjectDetailModal(currentDetailProject);
      await loadProjects();
    } else {
      alert('更新用量失败: ' + result.error);
    }
  } catch (err) {
    console.error('更新用量失败:', err);
  }
}

async function handleLockProjectStock(projectId) {
  try {
    const res = await fetch(`/api/projects/${projectId}/lock`, { method: 'POST' });
    const result = await res.json();
    if (result.success) {
      if (window.showAppleToast) window.showAppleToast('已根据现有库存完成智能预锁！', 'success');
      await loadProjects();
      if (currentDetailProject && currentDetailProject.id === projectId) {
        openProjectDetailModal(projectId);
      }
    }
  } catch (err) {
    console.error('预锁库存失败:', err);
  }
}

async function handleUnlockProjectStock(projectId) {
  if (!confirm('确定要释放该项目的所有预锁库存吗？释放后其他制作或单件领用可使用这些物料。')) return;

  try {
    const res = await fetch(`/api/projects/${projectId}/unlock`, { method: 'POST' });
    const result = await res.json();
    if (result.success) {
      if (window.showAppleToast) window.showAppleToast('已成功释放预锁库存', 'info');
      await loadProjects();
      if (currentDetailProject && currentDetailProject.id === projectId) {
        openProjectDetailModal(projectId);
      }
    }
  } catch (err) {
    console.error('释放库存失败:', err);
  }
}

async function handleCompleteProject(projectId) {
  if (!confirm('【完工消库确认】\n确定已完成制作并焊接？系统将从您的物理自封袋/库存真实扣减本次项目的已锁元器件，并记录出入库流水，将项目归档为已完工。')) return;

  try {
    const res = await fetch(`/api/projects/${projectId}/complete`, { method: 'POST' });
    const result = await res.json();
    if (result.success) {
      if (window.showAppleToast) window.showAppleToast('🎉 祝贺完工！已成功正式投产消库并归档！', 'success');
      await loadProjects();
      if (window.loadInventory) window.loadInventory();
      if (window.loadBoxes) window.loadBoxes();
      closeDrawer('modal-project-detail-backdrop');
    }
  } catch (err) {
    console.error('完工消库失败:', err);
  }
}

async function handleDeleteProject(projectId) {
  if (!confirm('确定要删除该项目吗？删除后预留锁定的库存将自动全部解除。')) return;

  try {
    const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      if (window.showAppleToast) window.showAppleToast('项目已删除', 'info');
      closeDrawer('modal-project-detail-backdrop');
      await loadProjects();
      if (window.loadInventory) window.loadInventory();
    }
  } catch (err) {
    console.error('删除项目失败:', err);
  }
}

async function handleExportProjectPurchase(projectId) {
  try {
    const res = await fetch(`/api/projects/${projectId}/purchase`);
    const result = await res.json();
    if (result.success) {
      const data = result.data;
      if (!data.shortages || data.shortages.length === 0) {
        alert('🎉 恭喜！该项目所需元器件均已齐套足额，无缺料项！');
        return;
      }
      const textarea = document.getElementById('bom-purchase-preview-textarea');
      const summaryText = document.getElementById('bom-purchase-summary-text');
      if (textarea) textarea.value = data.purchase_text;
      if (summaryText) summaryText.innerText = `项目【${data.project_name}】共缺 ${data.total_shortage_items} 项元器件`;
      openDrawer('modal-bom-purchase-backdrop');
    }
  } catch (err) {
    console.error('导出项目缺料失败:', err);
  }
}

// ==================== 模态框 4: 缺料智能替代料推荐 ====================

async function openProjectAlternativesModal(projectId, itemId) {
  const targetCard = document.getElementById('alt-target-item-card');
  const listContainer = document.getElementById('alt-candidates-list');
  const countBadge = document.getElementById('alt-modal-count-badge');

  if (targetCard) targetCard.innerHTML = '<div style="font-size: 12px; color: var(--text-dim);">正在查询物料属性...</div>';
  if (listContainer) listContainer.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-dim); font-size: 13px;">🔍 正在为您检索工坊全库可用同阻容与兼容元器件...</div>';
  if (countBadge) countBadge.innerText = '检索中...';

  openDrawer('modal-project-alternatives-backdrop');

  try {
    const res = await fetch(`/api/projects/${projectId}/items/${itemId}/alternatives`);
    const result = await res.json();
    if (result.success) {
      renderProjectAlternativesModal(result.data, projectId, itemId);
    } else {
      alert('查询替代料失败: ' + result.error);
    }
  } catch (err) {
    console.error('获取替代料出错:', err);
  }
}

function renderProjectAlternativesModal(data, projectId, itemId) {
  const targetCard = document.getElementById('alt-target-item-card');
  const listContainer = document.getElementById('alt-candidates-list');
  const countBadge = document.getElementById('alt-modal-count-badge');

  const item = data.item;
  const alternatives = data.alternatives || [];

  if (countBadge) {
    countBadge.innerText = alternatives.length > 0 ? `发现 ${alternatives.length} 种可用替代` : '暂无推荐替代';
  }

  if (targetCard) {
    targetCard.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
        <div>
          <div style="font-size: 13.5px; font-weight: 700; color: #b91c1c;">
            ⚠️ 原需缺料物料: ${escapeHtml(item.part_name)}
          </div>
          <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 3px;">
            规格封装: <strong>${escapeHtml(item.package || '未标')}</strong> · 单板需求: ${item.unit_demand_qty} 件
          </div>
        </div>
        <div style="text-align: right;">
          <span class="sub-tag-pill" style="color: #dc2626; background: rgba(220,38,38,0.1); border-color: rgba(220,38,38,0.3); font-size: 11px; font-weight: 700;">
            当前缺 ${item.shortage_qty} 件 / 总需 ${item.total_demand_qty}
          </span>
        </div>
      </div>
    `;
  }

  if (!listContainer) return;

  if (alternatives.length === 0) {
    listContainer.innerHTML = `
      <div style="padding: 36px 20px; text-align: center; color: var(--text-dim); background: var(--bg-surface); border: 1px dashed var(--border-subtle); border-radius: 8px;">
        <div style="font-size: 26px; margin-bottom: 6px;">📦</div>
        <div style="font-size: 13.5px; font-weight: 600; color: var(--text-main);">工坊库中暂无可用替代料</div>
        <div style="font-size: 12px; margin-top: 4px;">建议点击抽屉顶部的「🛒 导出缺料单」，前往立创商城或淘宝采购原规格元器件。</div>
      </div>
    `;
    return;
  }

  let html = '';
  alternatives.forEach(cand => {
    let badgeClass = 'alt-badge-a';
    if (cand.match_grade === 'B') badgeClass = 'alt-badge-b';
    if (cand.match_grade === 'C') badgeClass = 'alt-badge-c';

    html += `
      <div class="alt-candidate-card">
        <div style="min-width: 0; flex: 1;">
          <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <span class="${badgeClass}">${escapeHtml(cand.grade_label)}</span>
            <span style="font-size: 13.5px; font-weight: 700; color: var(--text-main);">${escapeHtml(cand.name)}</span>
            ${cand.package ? `<span class="sub-tag-pill" style="font-size: 10.5px;">${escapeHtml(cand.package)}</span>` : ''}
          </div>

          <div style="font-size: 11.5px; color: #047857; margin-top: 5px; line-height: 1.35; font-weight: 500;">
            ${escapeHtml(cand.reason)}
          </div>

          <div style="display: flex; gap: 12px; align-items: center; margin-top: 6px; font-size: 11px; color: var(--text-dim);">
            <span>📦 自封袋: <strong style="color: var(--text-main);">${escapeHtml(cand.location)}</strong></span>
            <span>当前可用: <strong style="color: ${cand.can_fully_cover ? '#059669' : '#d97706'};">${cand.available_quantity} 件</strong></span>
            <span>${cand.can_fully_cover ? '✨ 现货充足可全锁' : '⚠️ 现货部分覆盖'}</span>
          </div>
        </div>

        <div style="flex-shrink: 0;">
          <button type="button" class="btn-apple-primary" style="font-size: 12px; padding: 7px 14px; font-weight: 600; white-space: nowrap;" onclick="handleApplyProjectAlternative(${projectId}, ${itemId}, ${cand.id}, '${escapeAttr(cand.name)}')">
            ✔ 采用此平替
          </button>
        </div>
      </div>
    `;
  });

  listContainer.innerHTML = html;
}

async function handleApplyProjectAlternative(projectId, itemId, newCompId, compName) {
  if (!confirm(`确定为本项目采用替代料【${compName}】吗？\n采用后系统将自动从对应的自封袋预留锁定库存。`)) return;

  try {
    const res = await fetch(`/api/projects/${projectId}/items/${itemId}/apply-alternative`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ component_id: newCompId })
    });
    const result = await res.json();
    if (result.success) {
      if (window.showAppleToast) {
        window.showAppleToast(`已成功采用替代料【${compName}】并完成预留锁库！`, 'success');
      }
      closeDrawer('modal-project-alternatives-backdrop');
      currentDetailProject = result.data;
      renderProjectDetailModal(currentDetailProject);
      await loadProjects();
    } else {
      alert('采用替代料失败: ' + result.error);
    }
  } catch (err) {
    console.error('采用替代料出错:', err);
  }
}

// ==================== 模态框 5: 项目套料袋专属标签打印 ====================

let currentKitLabelData = null;

async function openProjectKitLabelModal(projectId) {
  try {
    const res = await fetch(`/api/projects/${projectId}/label`);
    const result = await res.json();
    if (result.success) {
      currentKitLabelData = result.data;
      const copiesInput = document.getElementById('kit-label-print-copies');
      if (copiesInput) {
        copiesInput.value = Math.max(1, currentKitLabelData.target_qty || 1);
      }
      renderKitLabelCopies();
      openDrawer('modal-print-kit-label-backdrop');
    } else {
      alert('获取项目标签数据失败: ' + result.error);
    }
  } catch (err) {
    console.error('打开项目标签模态框出错:', err);
  }
}

function renderKitLabelCopies() {
  const container = document.getElementById('kit-label-preview-wrapper');
  const copiesInput = document.getElementById('kit-label-print-copies');
  if (!container || !currentKitLabelData) return;

  const copies = copiesInput ? Math.max(1, Math.min(50, parseInt(copiesInput.value, 10) || 1)) : 1;
  const p = currentKitLabelData;

  const statusLabel = p.readiness_percent === 100 
    ? `✨ 齐套 100% (${p.ready_items_count}/${p.total_items_count}项)`
    : `⚠️ 齐套 ${p.readiness_percent}% (${p.ready_items_count}/${p.total_items_count}项)`;

  const keyItemsStr = (p.key_items || []).join(' · ') || '标准硬件散料';

  let html = '';
  for (let i = 1; i <= copies; i++) {
    const bagNumText = copies > 1 ? `第 ${i}/${copies} 套料袋` : `制作 ${p.target_qty} 套专属套料`;

    html += `
      <div class="kit-bag-label-card">
        <div class="kit-label-header">
          <div style="min-width: 0; flex: 1;">
            <div class="kit-label-title" title="${escapeAttr(p.project_name)}">
              🛠️ ${escapeHtml(p.project_name)}
            </div>
            <div style="font-size: 11px; color: #4b5563; margin-top: 3px;">
              ${bagNumText} · 项目编号 #${p.project_id}
            </div>
          </div>
          <span class="kit-label-badge">${p.target_qty} 套</span>
        </div>

        <div class="kit-label-body">
          <div class="kit-label-info">
            <div class="kit-label-stat-line">
              ${statusLabel} · 共需 ${p.total_pieces_demand} 件
            </div>
            <div class="kit-label-chips-box">
              <span style="font-weight: 700; color: #111111;">核心物料:</span> ${escapeHtml(keyItemsStr)}
            </div>
          </div>

          <div class="kit-label-qr-box">
            ${p.qr_data_url ? `
              <img src="${p.qr_data_url}" class="kit-label-qr-img" alt="二维码">
            ` : ''}
            <div class="kit-label-qr-tip">扫码查位号/配料</div>
          </div>
        </div>

        <div class="kit-label-footer">
          <span>📦 工坊自封袋物料套料包</span>
          <span>打包日期: ${p.pack_date}</span>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

function triggerKitLabelPrint() {
  window.print();
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

// 导出全局
window.loadProjects = loadProjects;
window.setProjectFilter = setProjectFilter;
window.clearProjectsSearch = clearProjectsSearch;
window.openCreateProjectModal = openCreateProjectModal;
window.submitCreateProjectForm = submitCreateProjectForm;
window.openProjectDetailModal = openProjectDetailModal;
window.handleLockProjectStock = handleLockProjectStock;
window.handleUnlockProjectStock = handleUnlockProjectStock;
window.handleCompleteProject = handleCompleteProject;
window.handleDeleteProject = handleDeleteProject;
window.handleExportProjectPurchase = handleExportProjectPurchase;
window.openSaveBOMAsProjectModal = openSaveBOMAsProjectModal;
window.changeBOMTargetQty = changeBOMTargetQty;
window.setBOMTargetQty = setBOMTargetQty;
window.recalcSaveBOMModal = recalcSaveBOMModal;
window.submitSaveBOMProject = submitSaveBOMProject;
// 新增加料与操作导出
window.switchProjectAddMode = switchProjectAddMode;
window.submitAddProjectItemStock = submitAddProjectItemStock;
window.submitAddProjectItemFree = submitAddProjectItemFree;
window.handleRemoveProjectItem = handleRemoveProjectItem;
window.handleUpdateProjectItemQty = handleUpdateProjectItemQty;
window.selectProjectAddSuggestion = selectProjectAddSuggestion;
// 新增替代料与套料袋标签导出
window.openProjectAlternativesModal = openProjectAlternativesModal;
window.handleApplyProjectAlternative = handleApplyProjectAlternative;
window.openProjectKitLabelModal = openProjectKitLabelModal;
window.renderKitLabelCopies = renderKitLabelCopies;
window.triggerKitLabelPrint = triggerKitLabelPrint;

