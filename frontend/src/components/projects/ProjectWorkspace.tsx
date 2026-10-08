import React, { useState, useEffect, useMemo } from 'react';
import { ProjectDetail, ProjectItemDetail, ProjectItem } from '../../types/project';
import { ComponentItem } from '../../types/component';
import { projectApi } from '../../api/projectApi';
import { componentApi } from '../../api/componentApi';
import { useToastStore } from '../../store/useToastStore';
import {
  FolderGit2,
  Lock,
  Unlock,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  ShoppingCart,
  Check,
  X,
  Edit2,
  Award,
  RefreshCw,
  Box,
  Layers,
  ChevronRight,
  Search,
  CheckSquare,
  Square,
  ArrowRight,
  ClipboardList,
  MapPin,
  ExternalLink,
  ArrowLeft,
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface ProjectWorkspaceProps {
  projectId: number | null;
  onProjectUpdated?: () => void;
  onDeleteProject?: (id: number) => void;
  onBackToList?: () => void;
}

export const ProjectWorkspace: React.FC<ProjectWorkspaceProps> = ({
  projectId,
  onProjectUpdated,
  onDeleteProject,
  onBackToList,
}) => {
  const { showToast } = useToastStore();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // 视图模式：'TABLE' 套料总表 | 'KITTING' 按货位拣料清单
  const [viewMode, setViewMode] = useState<'TABLE' | 'KITTING'>('TABLE');
  const [filterQuery, setFilterQuery] = useState('');

  // 拣料勾选状态 (本地记忆)
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});

  // 修改目标套数
  const [isEditingQty, setIsEditingQty] = useState(false);
  const [targetQtyInput, setTargetQtyInput] = useState<number>(1);

  // 内联快速加料栏状态
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [addPartName, setAddPartName] = useState('');
  const [addPkg, setAddPkg] = useState('');
  const [addUnitQty, setAddUnitQty] = useState<number>(1);
  const [addDesignators, setAddDesignators] = useState('');
  const [searchCandidates, setSearchCandidates] = useState<ComponentItem[]>([]);
  const [searchingCandidates, setSearchingCandidates] = useState(false);
  const [selectedComp, setSelectedComp] = useState<ComponentItem | null>(null);
  const [submittingAdd, setSubmittingAdd] = useState(false);

  // 缺料采购清单右侧抽屉
  const [isPurchaseDrawerOpen, setIsPurchaseDrawerOpen] = useState(false);
  const [purchaseData, setPurchaseData] = useState<any>(null);
  const [loadingPurchase, setLoadingPurchase] = useState(false);

  const loadProjectDetail = async (id: number) => {
    setLoading(true);
    try {
      const res = await projectApi.getDetail(id);
      if (res.success && res.data) {
        setProject(res.data);
        setTargetQtyInput(res.data.target_qty || 1);
      }
    } catch (err: any) {
      showToast('获取项目套料明细失败: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) {
      setIsQuickAddOpen(false);
      setIsPurchaseDrawerOpen(false);
      setFilterQuery('');
      loadProjectDetail(projectId);
    }
  }, [projectId]);

  // 修改目标套数
  const handleUpdateTargetQty = async () => {
    if (!project) return;
    try {
      await projectApi.update(project.id, { target_qty: Math.max(1, targetQtyInput) });
      setIsEditingQty(false);
      showToast('✔ 已更新打样套数并重新计算用量', 'success');
      loadProjectDetail(project.id);
      onProjectUpdated?.();
    } catch (err: any) {
      showToast('更新失败: ' + err.message, 'error');
    }
  };

  // 一键预锁库存
  const handleLockAll = async () => {
    if (!project) return;
    setActionLoading(true);
    try {
      const res = await projectApi.lock(project.id);
      if (res.success) {
        showToast('✔ 已为项目成功锁定现货库存！', 'success');
        loadProjectDetail(project.id);
        onProjectUpdated?.();
      }
    } catch (err: any) {
      showToast('锁库失败: ' + err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // 一键释放锁定
  const handleUnlockAll = async () => {
    if (!project) return;
    setActionLoading(true);
    try {
      await projectApi.unlock(project.id);
      showToast('✔ 已释放项目全部物料锁定', 'success');
      loadProjectDetail(project.id);
      onProjectUpdated?.();
    } catch (err: any) {
      showToast('释放失败: ' + err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // 单项物料解锁
  const handleUnlockSingle = async (componentId?: number | null) => {
    if (!project || !componentId) return;
    try {
      await projectApi.unlock(project.id, componentId);
      showToast('已释放该物料锁定', 'success');
      loadProjectDetail(project.id);
      onProjectUpdated?.();
    } catch (err: any) {
      showToast('释放失败: ' + err.message, 'error');
    }
  };

  // 从项目中移除元器件
  const handleRemoveItem = async (itemId: number) => {
    if (!project) return;
    try {
      await projectApi.removeItem(project.id, itemId);
      showToast('已从项目中移除该物料', 'success');
      loadProjectDetail(project.id);
      onProjectUpdated?.();
    } catch (err: any) {
      showToast('移除失败: ' + err.message, 'error');
    }
  };

  // 完工消库
  const handleCompleteProject = async () => {
    if (!project) return;
    if (!window.confirm(`确认将项目「${project.name}」标记为完工并真正消减在库库存吗？`)) {
      return;
    }
    setActionLoading(true);
    try {
      await projectApi.complete(project.id);
      showToast('🎉 项目已正式完工并完成出库消减！', 'success');
      loadProjectDetail(project.id);
      onProjectUpdated?.();
    } catch (err: any) {
      showToast('完工消库失败: ' + err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // 缺料采购清单
  const handleOpenPurchaseDrawer = async () => {
    if (!project) return;
    setIsPurchaseDrawerOpen(true);
    setLoadingPurchase(true);
    try {
      const res = await projectApi.getPurchaseList(project.id);
      if (res.success && res.data) {
        setPurchaseData(res.data);
      }
    } catch (err: any) {
      showToast('获取采购清单失败: ' + err.message, 'error');
    } finally {
      setLoadingPurchase(false);
    }
  };

  // 搜索已有物料联想
  const handleSearchCandidates = async (text: string) => {
    setAddPartName(text);
    if (!text.trim()) {
      setSearchCandidates([]);
      return;
    }
    setSearchingCandidates(true);
    try {
      const res = await componentApi.getAll({ q: text.trim() });
      if (res.success && res.data) {
        setSearchCandidates(res.data.slice(0, 8));
      }
    } catch {
      setSearchCandidates([]);
    } finally {
      setSearchingCandidates(false);
    }
  };

  // 选中已有物料自动填入
  const handleSelectCandidate = (comp: ComponentItem) => {
    setSelectedComp(comp);
    setAddPartName(comp.name);
    setAddPkg(comp.package || '');
    setSearchCandidates([]);
  };

  // 提交内联加料
  const handleQuickAddSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!project) return;
    if (!addPartName.trim()) {
      showToast('请输入物料规格/型号', 'warn');
      return;
    }
    if (addUnitQty <= 0) {
      showToast('单板需求用量必须大于 0', 'warn');
      return;
    }

    setSubmittingAdd(true);
    try {
      await projectApi.addItem(project.id, {
        part_name: addPartName.trim(),
        package: addPkg.trim(),
        unit_demand_qty: addUnitQty,
        total_demand_qty: addUnitQty * Math.max(1, project.target_qty || 1),
        component_id: selectedComp ? selectedComp.id : null,
        designators: addDesignators.trim(),
      });
      showToast(`✔ 成功添加物料「${addPartName}」`, 'success');
      // 重置输入
      setAddPartName('');
      setAddPkg('');
      setAddUnitQty(1);
      setAddDesignators('');
      setSelectedComp(null);
      setSearchCandidates([]);
      loadProjectDetail(project.id);
      onProjectUpdated?.();
    } catch (err: any) {
      showToast('添加失败: ' + err.message, 'error');
    } finally {
      setSubmittingAdd(false);
    }
  };

  // 拣料勾选切换
  const toggleCheckItem = (id: number) => {
    setCheckedItems((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // 过滤后的物料列表
  const filteredItems = useMemo(() => {
    if (!project?.items) return [];
    if (!filterQuery.trim()) return project.items;
    const q = filterQuery.toLowerCase().trim();
    return project.items.filter(
      (it) =>
        it.part_name.toLowerCase().includes(q) ||
        it.package?.toLowerCase().includes(q) ||
        it.designators?.toLowerCase().includes(q) ||
        it.comp_location?.toLowerCase().includes(q) ||
        it.comp_lcsc?.toLowerCase().includes(q)
    );
  }, [project?.items, filterQuery]);

  // 按物理收纳盒/货位分组数据 (Kitting Groups)
  const kittingGroups = useMemo(() => {
    const map = new Map<string, ProjectItemDetail[]>();
    for (const it of filteredItems) {
      const loc = it.comp_location?.trim() || '未指定货位 / 待入库';
      if (!map.has(loc)) {
        map.set(loc, []);
      }
      map.get(loc)!.push(it);
    }
    return Array.from(map.entries()).map(([location, items]) => ({
      location,
      items,
      totalCount: items.length,
      checkedCount: items.filter((i) => checkedItems[i.id]).length,
      totalDemandPieces: items.reduce((acc, i) => acc + (i.total_demand_qty || 0), 0),
    }));
  }, [filteredItems, checkedItems]);

  const totalCheckedCount = useMemo(() => {
    if (!project?.items) return 0;
    return project.items.filter((it) => checkedItems[it.id]).length;
  }, [project?.items, checkedItems]);

  if (!projectId || !project) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center text-text-muted border border-border-subtle rounded-md bg-canvas">
        <FolderGit2 className="w-14 h-14 text-border-hover mb-3 opacity-60" />
        <h3 className="text-base font-bold text-text-main">请在左侧选择一个制作项目</h3>
        <p className="text-xs sm:text-sm text-text-muted mt-1.5 max-w-sm">
          点击左侧正在进行的硬件打板项目，即可在右侧展开套料锁库看板与拣料清单。
        </p>
      </div>
    );
  }

  const readiness = project.readinessPercent || 0;
  const isCompleted = project.status === 'COMPLETED';

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-canvas border border-border-subtle rounded-md overflow-hidden relative">
      {/* 1. 顶部工业控制台 (大字号、齐套大盘指标) */}
      <div className="p-4 bg-surface border-b border-border-subtle shrink-0 space-y-3">
        {/* 第一行：项目名称、状态、套数调整、返回移动端 */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            {onBackToList && (
              <button
                onClick={onBackToList}
                className="md:hidden p-2 hover:bg-subtle rounded text-text-muted hover:text-text-main border border-border-subtle"
                title="返回项目列表"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}

            <div className="w-10 h-10 rounded-[2px] bg-accent/10 text-accent flex items-center justify-center font-bold shrink-0">
              <FolderGit2 className="w-5 h-5" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-text-main truncate tracking-tight">
                  {project.name}
                </h2>
                {isCompleted ? (
                  <span className="px-2 py-0.5 rounded-[2px] text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                    已完工消库
                  </span>
                ) : readiness >= 100 ? (
                  <span className="px-2 py-0.5 rounded-[2px] text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                    齐套待焊
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-[2px] text-xs font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                    备料中 ({readiness}%)
                  </span>
                )}
              </div>
              <p className="text-xs text-text-muted mt-0.5 truncate max-w-xl">
                {project.description || '暂无项目说明'}
              </p>
            </div>
          </div>

          {/* 打样套数修改与快捷动作 */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 text-xs font-mono text-text-muted bg-canvas px-3 py-1.5 rounded-[2px] border border-border-subtle">
              <span>制作目标:</span>
              {isEditingQty ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    value={targetQtyInput}
                    onChange={(e) => setTargetQtyInput(parseInt(e.target.value, 10) || 1)}
                    className="w-14 bg-surface border border-border-subtle rounded-[2px] px-1.5 py-0.5 text-xs text-text-main text-center font-mono font-bold"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleUpdateTargetQty}
                    className="p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingQty(false)}
                    className="p-1 text-text-muted hover:bg-subtle rounded"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => setIsEditingQty(true)}
                  className="font-bold text-accent cursor-pointer hover:underline flex items-center gap-1"
                  title="点击修改打样套数"
                >
                  <span>{project.target_qty || 1} 套 (板)</span>
                  <Edit2 className="w-3 h-3 text-text-muted" />
                </div>
              )}
            </div>

            {/* 刷新 */}
            <button
              onClick={() => loadProjectDetail(project.id)}
              disabled={loading}
              className="p-2 hover:bg-subtle text-text-muted hover:text-text-main border border-border-subtle rounded-[2px] transition-colors"
              title="刷新套料数据"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* 第二行：齐套率大盘标尺 + 核心操作工具栏 */}
        <div className="pt-2 border-t border-border-subtle/60 flex items-center justify-between gap-4 flex-wrap">
          {/* 进度条与指标 */}
          <div className="flex items-center gap-4 flex-1 min-w-[280px]">
            <div className="flex-1">
              <div className="flex justify-between text-xs sm:text-sm mb-1 font-bold">
                <span className="text-text-main">
                  齐套进度: {project.ready_items_count || 0} / {project.total_items_count || 0} 项
                </span>
                <span className={readiness >= 100 ? 'text-emerald-600 font-mono font-black' : 'text-accent font-mono font-black'}>
                  {readiness}%
                </span>
              </div>
              <div className="w-full bg-subtle rounded-full h-2 overflow-hidden border border-border-subtle/40">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-300',
                    readiness >= 100 ? 'bg-emerald-500' : 'bg-accent'
                  )}
                  style={{ width: `${Math.min(100, readiness)}%` }}
                />
              </div>
            </div>

            <div className="text-xs text-text-muted border-l border-border-subtle pl-4 space-y-0.5 font-mono shrink-0">
              <div>需备总用量: <strong className="text-text-main font-bold">{project.totalPiecesDemand || 0}</strong> 件</div>
              <div>已锁定现货: <strong className="text-emerald-600 dark:text-emerald-400 font-bold">{project.totalPiecesLocked || 0}</strong> 件</div>
            </div>
          </div>

          {/* 核心操作按钮组 */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setIsQuickAddOpen(!isQuickAddOpen)}
              className={cn(
                'px-3 py-1.5 rounded-[2px] text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-colors border',
                isQuickAddOpen
                  ? 'bg-accent text-white border-accent'
                  : 'bg-accent/10 hover:bg-accent hover:text-white text-accent border-accent/20'
              )}
            >
              <Plus className="w-4 h-4" />
              <span>{isQuickAddOpen ? '收起加料' : '添加物料'}</span>
            </button>

            {!isCompleted && (
              <>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleLockAll}
                  className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-700 dark:text-amber-400 rounded-[2px] text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-colors"
                  title="为项目一键预锁手头现货库存"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>一键智能锁库</span>
                </button>

                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleUnlockAll}
                  className="px-3 py-1.5 bg-subtle hover:bg-surface-hover border border-border-subtle rounded-[2px] text-xs sm:text-sm font-medium text-text-muted hover:text-text-main flex items-center gap-1.5 transition-colors"
                  title="释放该项目已锁定的所有物料"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>释放锁定</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenPurchaseDrawer}
                  className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-700 dark:text-rose-400 rounded-[2px] text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-colors"
                  title="提取并导出缺料采购清单"
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  <span>缺料采购清单</span>
                </button>

                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleCompleteProject}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[2px] text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-xs transition-colors"
                  title="标记完工并正式从在库库存中消减"
                >
                  <Award className="w-3.5 h-3.5" />
                  <span>完工消库</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* 第三行：视图切换 Tab + 即时检索框 */}
        <div className="pt-2 border-t border-border-subtle/40 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-canvas border border-border-subtle rounded-[2px] p-0.5 text-xs font-mono">
            <button
              onClick={() => setViewMode('TABLE')}
              className={cn(
                'px-3 py-1 rounded-[2px] transition-colors flex items-center gap-1.5 font-bold',
                viewMode === 'TABLE'
                  ? 'bg-surface text-accent border border-border-subtle shadow-2xs'
                  : 'text-text-muted hover:text-text-main'
              )}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span>套料总表明细 ({project.items?.length || 0})</span>
            </button>
            <button
              onClick={() => setViewMode('KITTING')}
              className={cn(
                'px-3 py-1 rounded-[2px] transition-colors flex items-center gap-1.5 font-bold',
                viewMode === 'KITTING'
                  ? 'bg-surface text-accent border border-border-subtle shadow-2xs'
                  : 'text-text-muted hover:text-text-main'
              )}
            >
              <Box className="w-3.5 h-3.5" />
              <span>按物理货位拣料 ({kittingGroups.length} 货位 · 已拣 {totalCheckedCount}/{project.items?.length || 0})</span>
            </button>
          </div>

          {/* 物料搜索过滤框 */}
          <div className="relative w-56 sm:w-64">
            <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="过滤型号/封装/位号/货位..."
              className="w-full pl-8 pr-6 py-1 text-xs font-mono bg-canvas border border-border-subtle rounded-[2px] text-text-main placeholder:text-text-muted/60 focus:outline-none focus:border-accent"
            />
            {filterQuery && (
              <button
                onClick={() => setFilterQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. 就地内联极速加料栏 (Inline Quick Add Bar) */}
      {isQuickAddOpen && (
        <form
          onSubmit={handleQuickAddSubmit}
          className="p-3.5 bg-surface border-b border-border-subtle shadow-xs space-y-3 shrink-0 animate-in slide-in-from-top duration-150"
        >
          <div className="flex items-center justify-between">
            <div className="text-xs sm:text-sm font-bold text-text-main flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-accent" />
              <span>就地添加项目套料物料</span>
            </div>
            <button
              type="button"
              onClick={() => setIsQuickAddOpen(false)}
              className="text-text-muted hover:text-text-main p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
            {/* 型号与联想搜索 */}
            <div className="sm:col-span-2 relative">
              <label className="block text-[11px] font-medium text-text-muted mb-1">
                物料规格 / 型号 * (输入即联想库存)
              </label>
              <input
                type="text"
                value={addPartName}
                onChange={(e) => handleSearchCandidates(e.target.value)}
                placeholder="例如: 0805 10kΩ, STM32F401, CH340C..."
                className="w-full px-2.5 py-1.5 bg-canvas border border-border-subtle rounded-[2px] text-text-main focus:outline-none focus:border-accent font-medium text-xs sm:text-sm"
                autoFocus
              />

              {/* 联想候选浮层 */}
              {searchCandidates.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-surface border border-border-subtle rounded-[2px] shadow-lg max-h-48 overflow-y-auto z-20 divide-y divide-border-subtle">
                  {searchCandidates.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => handleSelectCandidate(c)}
                      className="p-2 hover:bg-accent/10 cursor-pointer flex items-center justify-between text-xs transition-colors"
                    >
                      <div className="min-w-0 pr-2">
                        <span className="font-bold text-text-main block truncate">{c.name}</span>
                        <span className="text-[10px] text-text-muted font-mono truncate block">
                          {c.category} · {c.package || '无封装'} · 存量: {c.quantity}件 · 货位: {c.location || '未入库'}
                        </span>
                      </div>
                      <span className="text-accent font-mono text-xs shrink-0 font-bold">选择</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 封装 */}
            <div>
              <label className="block text-[11px] font-medium text-text-muted mb-1">
                封装形式 (可选)
              </label>
              <input
                type="text"
                value={addPkg}
                onChange={(e) => setAddPkg(e.target.value)}
                placeholder="例如: 0805, SOP-8"
                className="w-full px-2.5 py-1.5 bg-canvas border border-border-subtle rounded-[2px] text-text-main focus:outline-none focus:border-accent font-mono text-xs sm:text-sm"
              />
            </div>

            {/* 单板用量 */}
            <div>
              <label className="block text-[11px] font-medium text-text-muted mb-1">
                单板用量 * (总需求: {addUnitQty * (project.target_qty || 1)} 件)
              </label>
              <input
                type="number"
                min={1}
                value={addUnitQty}
                onChange={(e) => setAddUnitQty(parseInt(e.target.value, 10) || 1)}
                className="w-full px-2.5 py-1.5 bg-canvas border border-border-subtle rounded-[2px] text-text-main focus:outline-none focus:border-accent font-mono font-bold text-xs sm:text-sm"
              />
            </div>

            {/* 原理图位号 */}
            <div className="sm:col-span-3">
              <label className="block text-[11px] font-medium text-text-muted mb-1">
                原理图位号 Designators (可选，逗号分隔)
              </label>
              <input
                type="text"
                value={addDesignators}
                onChange={(e) => setAddDesignators(e.target.value)}
                placeholder="例如: R1, R2, R5, C10..."
                className="w-full px-2.5 py-1.5 bg-canvas border border-border-subtle rounded-[2px] text-text-main focus:outline-none focus:border-accent font-mono text-xs sm:text-sm"
              />
            </div>

            {/* 提交按键 */}
            <div className="flex items-end">
              <button
                type="submit"
                disabled={submittingAdd}
                className="w-full py-1.5 px-3 bg-accent hover:bg-accent-hover text-white font-bold rounded-[2px] transition-colors flex items-center justify-center gap-1.5 text-xs sm:text-sm h-[34px]"
              >
                <Plus className="w-4 h-4" />
                <span>确认存入套料</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* 3. 工作台主体内容区 (支持双重视图) */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="py-24 text-center text-xs sm:text-sm text-text-muted flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-accent" />
              <span>加载套料清单...</span>
            </div>
          ) : !project.items || project.items.length === 0 ? (
            <div className="py-20 text-center text-xs sm:text-sm text-text-muted space-y-3 bg-surface border border-dashed border-border-subtle rounded-md">
              <div>该项目暂未添加任何元器件物料。点击上方「添加物料」快速加料！</div>
              <button
                type="button"
                onClick={() => setIsQuickAddOpen(true)}
                className="px-4 py-2 bg-accent text-white rounded-[2px] text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 shadow-2xs"
              >
                <Plus className="w-4 h-4" />
                <span>立即添加第一批物料</span>
              </button>
            </div>
          ) : viewMode === 'TABLE' ? (
            /* 视图 A：套料明细大表 (高密度、高对比度、大字号) */
            <div className="bg-surface border border-border-subtle rounded-[2px] overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="bg-canvas border-b border-border-subtle text-text-muted font-bold font-mono">
                    <th className="py-3 px-4 w-[24%]">物料规格 / 型号</th>
                    <th className="py-3 px-3 w-[12%]">封装</th>
                    <th className="py-3 px-3 w-[16%]">原理图位号</th>
                    <th className="py-3 px-3 w-[14%] text-center">需求用量 (单板 x 套数)</th>
                    <th className="py-3 px-3 w-[16%] text-center">锁定 / 缺料状态</th>
                    <th className="py-3 px-4 w-[18%] text-right">在库货位 & 操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {filteredItems.map((it) => {
                    const isReady = it.is_ready;
                    const hasShortage = (it.shortage_qty || 0) > 0;

                    return (
                      <tr key={it.id} className="hover:bg-surface-hover/70 transition-colors">
                        {/* 型号 */}
                        <td className="py-3.5 px-4 font-bold text-text-main align-top">
                          <div className="leading-snug">{it.part_name}</div>
                          {it.comp_lcsc && (
                            <div className="text-xs text-accent font-mono mt-1 font-semibold">
                              立创: {it.comp_lcsc}
                            </div>
                          )}
                        </td>

                        {/* 封装 */}
                        <td className="py-3.5 px-3 font-mono text-text-muted align-top">
                          {it.package || '-'}
                        </td>

                        {/* 位号 */}
                        <td className="py-3.5 px-3 font-mono text-text-muted align-top break-all">
                          {it.designators || '-'}
                        </td>

                        {/* 用量 */}
                        <td className="py-3.5 px-3 text-center align-top">
                          <div className="font-mono font-bold text-text-main text-sm">
                            {it.total_demand_qty} 件
                          </div>
                          <div className="text-xs text-text-muted font-mono mt-0.5">
                            (单板: {it.unit_demand_qty})
                          </div>
                        </td>

                        {/* 状态徽标 */}
                        <td className="py-3.5 px-3 text-center align-top space-y-1">
                          {isReady ? (
                            <span className="inline-block px-2.5 py-0.5 rounded-[2px] text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                              🟩 已齐套 (锁定 {it.locked_qty})
                            </span>
                          ) : it.locked_qty > 0 ? (
                            <span className="inline-block px-2.5 py-0.5 rounded-[2px] text-xs font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                              🟨 部分锁定 ({it.locked_qty}/{it.total_demand_qty})
                            </span>
                          ) : (
                            <span className="inline-block px-2.5 py-0.5 rounded-[2px] text-xs font-bold bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30">
                              🟥 缺料 {it.shortage_qty} 件
                            </span>
                          )}
                          {hasShortage && it.locked_qty > 0 && (
                            <div className="text-xs text-rose-600 dark:text-rose-400 font-mono font-bold">
                              尚缺 {it.shortage_qty} 件
                            </div>
                          )}
                        </td>

                        {/* 货位 & 操作 */}
                        <td className="py-3.5 px-4 text-right align-top space-y-1.5 font-mono">
                          <div className="text-xs text-text-muted flex items-center justify-end gap-1">
                            <MapPin className="w-3.5 h-3.5 text-accent shrink-0" />
                            <span className="truncate max-w-[120px] font-medium" title={it.comp_location}>
                              {it.comp_location || '未入库'}
                            </span>
                          </div>

                          <div className="flex items-center justify-end gap-2 text-xs">
                            {it.locked_qty > 0 && !isCompleted && (
                              <button
                                type="button"
                                onClick={() => handleUnlockSingle(it.component_id)}
                                className="text-amber-600 dark:text-amber-400 hover:underline"
                                title="释放该项锁库"
                              >
                                解锁
                              </button>
                            )}

                            {!isCompleted && (
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(it.id)}
                                className="text-danger hover:underline flex items-center gap-0.5"
                                title="从项目中移除该物料"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>移除</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* 视图 B：按物理货位/收纳盒拣料清单 (Kitting Checklist) */
            <div className="space-y-4">
              <div className="p-3 bg-surface border border-border-subtle rounded-[2px] flex items-center justify-between text-xs sm:text-sm font-mono">
                <span className="text-text-muted">
                  总拣料进度: <strong className="text-text-main font-bold">{totalCheckedCount}</strong> / {project.items?.length || 0} 项
                </span>
                <span className="text-accent font-bold">
                  {project.items?.length ? Math.round((totalCheckedCount / project.items.length) * 100) : 0}% 备料就绪
                </span>
              </div>

              {kittingGroups.map((group) => {
                const groupAllDone = group.checkedCount === group.totalCount && group.totalCount > 0;

                return (
                  <div
                    key={group.location}
                    className="bg-surface border border-border-subtle rounded-[2px] overflow-hidden shadow-xs"
                  >
                    {/* 货位标题栏 */}
                    <div className="p-3 bg-canvas/60 border-b border-border-subtle flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-accent shrink-0" />
                        <h4 className="font-bold text-sm text-text-main font-mono">
                          {group.location}
                        </h4>
                        <span className="text-xs font-mono px-2 py-0.5 bg-subtle text-text-muted rounded-[2px] border border-border-subtle">
                          {group.totalCount} 种物料 · 需取 {group.totalDemandPieces} 件
                        </span>
                      </div>

                      <span className="text-xs font-mono font-medium text-text-muted">
                        已取: {group.checkedCount}/{group.totalCount}
                      </span>
                    </div>

                    {/* 组内物料列表 */}
                    <div className="divide-y divide-border-subtle">
                      {group.items.map((it) => {
                        const isChecked = !!checkedItems[it.id];

                        return (
                          <div
                            key={it.id}
                            onClick={() => toggleCheckItem(it.id)}
                            className={cn(
                              'p-3 flex items-center justify-between gap-3 cursor-pointer select-none transition-colors',
                              isChecked ? 'bg-emerald-500/[0.04]' : 'hover:bg-surface-hover/60'
                            )}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              {isChecked ? (
                                <CheckSquare className="w-5 h-5 text-emerald-600 shrink-0" />
                              ) : (
                                <Square className="w-5 h-5 text-text-muted shrink-0" />
                              )}

                              <div className="min-w-0 flex-1">
                                <div className={cn('text-sm font-bold text-text-main truncate', isChecked && 'line-through text-text-muted')}>
                                  {it.part_name}
                                </div>
                                <div className="text-xs text-text-muted font-mono mt-0.5 truncate">
                                  封装: {it.package || '-'} · 位号: {it.designators || '未标'}
                                </div>
                              </div>
                            </div>

                            <div className="text-right font-mono shrink-0">
                              <div className="text-sm font-black text-accent">
                                需取: {it.total_demand_qty} 件
                              </div>
                              <div className="text-[11px] text-text-muted">
                                (单板 x{it.unit_demand_qty})
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 4. 缺料采购清单右侧轻量滑出抽屉 (Purchase Drawer) */}
        {isPurchaseDrawerOpen && (
          <div className="w-88 md:w-96 border-l border-border-subtle bg-surface flex flex-col shrink-0 z-10 animate-in slide-in-from-right duration-200 shadow-md">
            <div className="p-3.5 border-b border-border-subtle flex items-center justify-between bg-canvas/40">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-rose-600" />
                <h3 className="font-bold text-sm text-text-main">缺料采购清单</h3>
              </div>
              <button
                onClick={() => setIsPurchaseDrawerOpen(false)}
                className="p-1.5 text-text-muted hover:text-text-main rounded hover:bg-subtle"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 p-4 space-y-4 overflow-y-auto text-xs sm:text-sm">
              {loadingPurchase ? (
                <div className="py-16 text-center text-text-muted">正在提取缺料项...</div>
              ) : !purchaseData || !purchaseData.items || purchaseData.items.length === 0 ? (
                <div className="py-16 text-center text-text-muted space-y-1">
                  <div className="text-base font-bold text-emerald-600">🎉 恭喜！无缺料项</div>
                  <div className="text-xs">该项目元器件库存现货已完全齐套！</div>
                </div>
              ) : (
                <>
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-[2px] text-rose-700 dark:text-rose-400 font-mono text-xs">
                    共发现 <strong>{purchaseData.items.length}</strong> 种元器件缺料，需补充采购。
                  </div>

                  {/* 快捷复制工具 */}
                  <div className="space-y-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        const lcscList = purchaseData.items
                          .filter((i: any) => i.comp_lcsc)
                          .map((i: any) => i.comp_lcsc)
                          .join(',');
                        navigator.clipboard.writeText(lcscList);
                        showToast('✔ 已复制立创零件编号列表到剪贴板！', 'success');
                      }}
                      className="w-full py-2 px-3 bg-canvas hover:bg-subtle border border-border-subtle rounded-[2px] font-mono text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5 text-accent" />
                      <span>复制立创零件号 (C1234, C5678)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const tsv = [
                          ['物料型号', '封装', '缺料数量', '单板用量', '立创编号'].join('\t'),
                          ...purchaseData.items.map((i: any) =>
                            [i.part_name, i.package || '', i.shortage_qty, i.unit_demand_qty, i.comp_lcsc || ''].join('\t')
                          ),
                        ].join('\n');
                        navigator.clipboard.writeText(tsv);
                        showToast('✔ 已复制 TSV 表格到剪贴板，可直接粘贴进 Excel！', 'success');
                      }}
                      className="w-full py-2 px-3 bg-canvas hover:bg-subtle border border-border-subtle rounded-[2px] font-mono text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5 text-emerald-600" />
                      <span>复制 TSV 采购表格 (粘贴至 Excel)</span>
                    </button>
                  </div>

                  {/* 缺料明细列表 */}
                  <div className="space-y-2 pt-2 border-t border-border-subtle">
                    {purchaseData.items.map((item: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-2.5 bg-canvas border border-border-subtle rounded-[2px] space-y-1"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-bold text-text-main text-xs sm:text-sm leading-snug">
                            {item.part_name}
                          </span>
                          <span className="font-mono text-sm font-black text-rose-600 dark:text-rose-400 shrink-0">
                            缺 {item.shortage_qty} 件
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-text-muted font-mono pt-1">
                          <span>封装: {item.package || '-'}</span>
                          {item.comp_lcsc && (
                            <span className="text-accent font-bold">LCSC: {item.comp_lcsc}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
