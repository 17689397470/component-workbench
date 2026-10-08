import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  MoreVertical,
  CheckCheck,
  Sparkles,
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface ProjectWorkspaceProps {
  projectId: number | null;
  onProjectUpdated?: () => void;
  onDeleteProject?: (id: number) => void;
  onBackToList?: () => void;
}

type PipelineStep = 'BOM' | 'LOCK' | 'PROCURE' | 'KITTING';

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

  // 当前工序流水线步骤 (默认由项目状态智能推导，用户可自由点击切换)
  const [activeStep, setActiveStep] = useState<PipelineStep>('BOM');

  // 搜索过滤框
  const [filterQuery, setFilterQuery] = useState('');

  // 拣料勾选状态 (本地记忆)
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});

  // 打样套数微调
  const [isEditingQty, setIsEditingQty] = useState(false);
  const [targetQtyInput, setTargetQtyInput] = useState<number>(1);

  // 内联快速加料栏状态 (在 Step 1 中使用)
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [addPartName, setAddPartName] = useState('');
  const [addPkg, setAddPkg] = useState('');
  const [addUnitQty, setAddUnitQty] = useState<number>(1);
  const [addDesignators, setAddDesignators] = useState('');
  const [searchCandidates, setSearchCandidates] = useState<ComponentItem[]>([]);
  const [searchingCandidates, setSearchingCandidates] = useState(false);
  const [selectedComp, setSelectedComp] = useState<ComponentItem | null>(null);
  const [submittingAdd, setSubmittingAdd] = useState(false);

  // 采购清单数据缓存 (在 Step 3 中使用)
  const [purchaseData, setPurchaseData] = useState<any>(null);
  const [loadingPurchase, setLoadingPurchase] = useState(false);

  // 更多操作下拉菜单
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadProjectDetail = async (id: number, autoSelectStep: boolean = false) => {
    setLoading(true);
    try {
      const res = await projectApi.getDetail(id);
      if (res.success && res.data) {
        const proj = res.data;
        setProject(proj);
        setTargetQtyInput(proj.target_qty || 1);

        // 如果需要智能推导步骤
        if (autoSelectStep) {
          const readiness = proj.readinessPercent || 0;
          if (proj.status === 'COMPLETED') {
            setActiveStep('KITTING');
          } else if (!proj.items || proj.items.length === 0) {
            setActiveStep('BOM');
          } else if (readiness >= 100) {
            setActiveStep('KITTING');
          } else if ((proj.totalPiecesLocked || 0) === 0) {
            setActiveStep('LOCK');
          } else {
            setActiveStep('PROCURE');
          }
        }
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
      setFilterQuery('');
      loadProjectDetail(projectId, true);
    }
  }, [projectId]);

  // 当切换到采购步骤时，自动加载缺料采购清单
  useEffect(() => {
    if (activeStep === 'PROCURE' && project?.id) {
      fetchPurchaseList(project.id);
    }
  }, [activeStep, project?.id]);

  const fetchPurchaseList = async (id: number) => {
    setLoadingPurchase(true);
    try {
      const res = await projectApi.getPurchaseList(id);
      if (res.success && res.data) {
        setPurchaseData(res.data);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingPurchase(false);
    }
  };

  // 修改目标套数
  const handleUpdateTargetQty = async () => {
    if (!project) return;
    try {
      await projectApi.update(project.id, { target_qty: Math.max(1, targetQtyInput) });
      setIsEditingQty(false);
      showToast('✔ 已更新打样套数并重新计算全板用量', 'success');
      loadProjectDetail(project.id, false);
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
        loadProjectDetail(project.id, false);
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
      loadProjectDetail(project.id, false);
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
      loadProjectDetail(project.id, false);
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
      loadProjectDetail(project.id, false);
      onProjectUpdated?.();
    } catch (err: any) {
      showToast('移除失败: ' + err.message, 'error');
    }
  };

  // 完工消库
  const handleCompleteProject = async () => {
    if (!project) return;
    if (!window.confirm(`确认将项目「${project.name}」标记为完工并真正从工坊库存中扣减消库吗？`)) {
      return;
    }
    setActionLoading(true);
    try {
      await projectApi.complete(project.id);
      showToast('🎉 项目已正式完工并完成出库消减！', 'success');
      loadProjectDetail(project.id, false);
      onProjectUpdated?.();
    } catch (err: any) {
      showToast('完工消库失败: ' + err.message, 'error');
    } finally {
      setActionLoading(false);
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
      setAddPartName('');
      setAddPkg('');
      setAddUnitQty(1);
      setAddDesignators('');
      setSelectedComp(null);
      setSearchCandidates([]);
      loadProjectDetail(project.id, false);
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
  const hasShortage = (project.shortage_items_count || 0) > 0 || readiness < 100;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-canvas border border-border-subtle rounded-md overflow-hidden relative">
      {/* 1. 顶部控制台大盘：项目标牌 + 右上角更多操作 */}
      <div className="p-4 bg-surface border-b border-border-subtle shrink-0 space-y-3.5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* 左侧：返回按键(移动端) + 项目主标题与目标套数 */}
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

                {/* 状态徽标 */}
                {isCompleted ? (
                  <span className="px-2 py-0.5 rounded-[2px] text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                    已完工消库
                  </span>
                ) : readiness >= 100 ? (
                  <span className="px-2 py-0.5 rounded-[2px] text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                    现货齐套待焊
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

          {/* 右侧：目标套数就地微调 + 更多选项菜单 */}
          <div className="flex items-center gap-2 font-mono">
            {/* 目标套数 */}
            <div className="flex items-center gap-1.5 text-xs text-text-muted bg-canvas px-3 py-1.5 rounded-[2px] border border-border-subtle">
              <span>制作目标:</span>
              {isEditingQty ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    value={targetQtyInput}
                    onChange={(e) => setTargetQtyInput(parseInt(e.target.value, 10) || 1)}
                    className="w-14 bg-surface border border-border-subtle rounded-[2px] px-1.5 py-0.5 text-xs text-text-main text-center font-bold"
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
              onClick={() => loadProjectDetail(project.id, false)}
              disabled={loading}
              className="p-2 hover:bg-subtle text-text-muted hover:text-text-main border border-border-subtle rounded-[2px] transition-colors"
              title="刷新数据"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {/* 更多菜单 (收拢次要操作) */}
            <div className="relative" ref={moreMenuRef}>
              <button
                type="button"
                onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                className="p-2 hover:bg-subtle text-text-muted hover:text-text-main border border-border-subtle rounded-[2px] transition-colors"
                title="更多项目操作"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {moreMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-44 bg-surface border border-border-subtle rounded-[2px] shadow-lg z-30 py-1 text-xs divide-y divide-border-subtle">
                  <div className="py-1">
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => {
                        setMoreMenuOpen(false);
                        handleUnlockAll();
                      }}
                      className="w-full px-3 py-1.5 text-left text-text-muted hover:text-text-main hover:bg-subtle flex items-center gap-2"
                    >
                      <Unlock className="w-3.5 h-3.5 text-amber-600" />
                      <span>释放项目全部锁定</span>
                    </button>
                  </div>

                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setMoreMenuOpen(false);
                        if (onDeleteProject) onDeleteProject(project.id);
                      }}
                      className="w-full px-3 py-1.5 text-left text-danger hover:bg-danger/10 flex items-center gap-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>删除此制作项目</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 2. 核心工序流水线导航器 (Pipeline Stepper - 专业工规分段流水线，克制沉稳无彩色大框) */}
        <div className="pt-2 border-t border-border-subtle">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 p-1 bg-subtle/50 rounded-[3px] border border-border-subtle">
            {/* 步骤 ①：配料准备 */}
            <button
              type="button"
              onClick={() => setActiveStep('BOM')}
              className={cn(
                'px-3 py-2 rounded-[2px] text-left transition-all relative flex flex-col justify-between select-none',
                activeStep === 'BOM'
                  ? 'bg-surface text-text-main shadow-2xs border border-border-hover'
                  : 'hover:bg-surface/70 text-text-muted hover:text-text-main border border-transparent'
              )}
            >
              <div className="flex items-center justify-between text-xs sm:text-sm font-mono">
                <span className={cn('flex items-center gap-1.5 font-bold', activeStep === 'BOM' ? 'text-accent font-black' : '')}>
                  <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', activeStep === 'BOM' ? 'bg-accent' : 'bg-text-muted/40')} />
                  ① 配料准备
                </span>
                <span className="text-[11px] font-mono px-1.5 py-0.2 bg-canvas rounded-[2px] border border-border-subtle text-text-muted font-bold">
                  {project.items?.length || 0} 种
                </span>
              </div>
              <div className="text-[11px] mt-1 font-sans text-text-muted font-medium truncate">
                单板需求与规格清单
              </div>
            </button>

            {/* 步骤 ②：现货锁库 */}
            <button
              type="button"
              onClick={() => setActiveStep('LOCK')}
              className={cn(
                'px-3 py-2 rounded-[2px] text-left transition-all relative flex flex-col justify-between select-none',
                activeStep === 'LOCK'
                  ? 'bg-surface text-text-main shadow-2xs border border-border-hover'
                  : 'hover:bg-surface/70 text-text-muted hover:text-text-main border border-transparent'
              )}
            >
              <div className="flex items-center justify-between text-xs sm:text-sm font-mono">
                <span className={cn('flex items-center gap-1.5 font-bold', activeStep === 'LOCK' ? 'text-accent font-black' : '')}>
                  <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', activeStep === 'LOCK' ? 'bg-accent' : 'bg-text-muted/40')} />
                  ② 现货锁库
                </span>
                <span className="text-[11px] font-mono px-1.5 py-0.2 bg-canvas rounded-[2px] border border-border-subtle text-text-main font-bold">
                  已锁 {project.totalPiecesLocked || 0}
                </span>
              </div>
              <div className="text-[11px] mt-1 font-sans text-text-muted font-medium truncate">
                在库现货独占锁定
              </div>
            </button>

            {/* 步骤 ③：缺料补购 */}
            <button
              type="button"
              onClick={() => setActiveStep('PROCURE')}
              className={cn(
                'px-3 py-2 rounded-[2px] text-left transition-all relative flex flex-col justify-between select-none',
                activeStep === 'PROCURE'
                  ? 'bg-surface text-text-main shadow-2xs border border-border-hover'
                  : 'hover:bg-surface/70 text-text-muted hover:text-text-main border border-transparent'
              )}
            >
              <div className="flex items-center justify-between text-xs sm:text-sm font-mono">
                <span className={cn('flex items-center gap-1.5 font-bold', activeStep === 'PROCURE' ? 'text-accent font-black' : '')}>
                  <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', activeStep === 'PROCURE' ? 'bg-accent' : 'bg-text-muted/40')} />
                  ③ 缺料补购
                </span>
                <span className={cn('text-[11px] font-mono px-1.5 py-0.2 rounded-[2px] border font-bold', readiness >= 100 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-500/30' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-500/30')}>
                  {readiness >= 100 ? '已齐套' : `缺 ${project.shortage_items_count || 0}`}
                </span>
              </div>
              <div className="text-[11px] mt-1 font-sans text-text-muted font-medium truncate">
                LCSC / Excel 采购单
              </div>
            </button>

            {/* 步骤 ④：拣料完工 */}
            <button
              type="button"
              onClick={() => setActiveStep('KITTING')}
              className={cn(
                'px-3 py-2 rounded-[2px] text-left transition-all relative flex flex-col justify-between select-none',
                activeStep === 'KITTING'
                  ? 'bg-surface text-text-main shadow-2xs border border-border-hover'
                  : 'hover:bg-surface/70 text-text-muted hover:text-text-main border border-transparent'
              )}
            >
              <div className="flex items-center justify-between text-xs sm:text-sm font-mono">
                <span className={cn('flex items-center gap-1.5 font-bold', activeStep === 'KITTING' ? 'text-accent font-black' : '')}>
                  <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', activeStep === 'KITTING' ? 'bg-accent' : 'bg-text-muted/40')} />
                  ④ 拣料完工
                </span>
                <span className="text-[11px] font-mono px-1.5 py-0.2 bg-canvas rounded-[2px] border border-border-subtle text-text-muted font-bold">
                  {totalCheckedCount}/{project.items?.length || 0}
                </span>
              </div>
              <div className="text-[11px] mt-1 font-sans text-text-muted font-medium truncate">
                按位拣料打卡与消库
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* 3. 步骤专属工作台与动作区 (当前聚焦的单一流程) */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        {/* ======================= 【步骤 ①：配料准备 (BOM)】 ======================= */}
        {activeStep === 'BOM' && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* 步骤工具条 */}
            <div className="p-3 bg-surface border-b border-border-subtle flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-accent" />
                <span className="font-bold text-xs sm:text-sm text-text-main">
                  套料物料清单 ({project.items?.length || 0} 种)
                </span>
                <span className="text-xs text-text-muted hidden sm:inline">
                  — 单板需备物料与用量
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsQuickAddOpen(!isQuickAddOpen)}
                  className={cn(
                    'px-3 py-1.5 rounded-[2px] text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-colors border shadow-2xs',
                    isQuickAddOpen
                      ? 'bg-accent text-white border-accent'
                      : 'bg-accent/10 hover:bg-accent hover:text-white text-accent border-accent/20'
                  )}
                >
                  <Plus className="w-4 h-4" />
                  <span>{isQuickAddOpen ? '收起录入' : '添加物料'}</span>
                </button>
              </div>
            </div>

            {/* 内联极速录入栏 */}
            {isQuickAddOpen && (
              <form
                onSubmit={handleQuickAddSubmit}
                className="p-3.5 bg-surface border-b border-border-subtle shadow-xs space-y-3 shrink-0 animate-in slide-in-from-top duration-150"
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs sm:text-sm font-bold text-text-main flex items-center gap-1.5">
                    <Plus className="w-4 h-4 text-accent" />
                    <span>就地添加元器件至套料清单</span>
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
                  <div className="sm:col-span-2 relative">
                    <label className="block text-[11px] font-medium text-text-muted mb-1">
                      物料规格 / 型号 * (输入即模糊联想工坊库存)
                    </label>
                    <input
                      type="text"
                      value={addPartName}
                      onChange={(e) => handleSearchCandidates(e.target.value)}
                      placeholder="例如: 0805 10kΩ, STM32F401, CH340C..."
                      className="w-full px-2.5 py-1.5 bg-canvas border border-border-subtle rounded-[2px] text-text-main focus:outline-none focus:border-accent font-medium text-xs sm:text-sm"
                      autoFocus
                    />

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

                  <div>
                    <label className="block text-[11px] font-medium text-text-muted mb-1">
                      单板用量 * (全项目总需: {addUnitQty * (project.target_qty || 1)} 件)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={addUnitQty}
                      onChange={(e) => setAddUnitQty(parseInt(e.target.value, 10) || 1)}
                      className="w-full px-2.5 py-1.5 bg-canvas border border-border-subtle rounded-[2px] text-text-main focus:outline-none focus:border-accent font-mono font-bold text-xs sm:text-sm"
                    />
                  </div>

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

                  <div className="flex items-end">
                    <button
                      type="submit"
                      disabled={submittingAdd}
                      className="w-full py-1.5 px-3 bg-accent hover:bg-accent-hover text-white font-bold rounded-[2px] transition-colors flex items-center justify-center gap-1.5 text-xs sm:text-sm h-[34px]"
                    >
                      <Plus className="w-4 h-4" />
                      <span>确认录入</span>
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* 物料清单明细表格 */}
            <div className="flex-1 overflow-y-auto p-4">
              {!project.items || project.items.length === 0 ? (
                <div className="py-20 text-center text-xs sm:text-sm text-text-muted space-y-3 bg-surface border border-dashed border-border-subtle rounded-md">
                  <div>该项目暂无元器件清单。请点击上方「添加物料」开始录入。</div>
                  <button
                    type="button"
                    onClick={() => setIsQuickAddOpen(true)}
                    className="px-4 py-2 bg-accent text-white rounded-[2px] text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 shadow-2xs"
                  >
                    <Plus className="w-4 h-4" />
                    <span>立即录入第一批物料</span>
                  </button>
                </div>
              ) : (
                <div className="bg-surface border border-border-subtle rounded-[2px] overflow-hidden shadow-xs">
                  <table className="w-full text-left text-xs sm:text-sm border-collapse">
                    <thead>
                      <tr className="bg-canvas border-b border-border-subtle text-text-muted font-bold font-mono">
                        <th className="py-3 px-4 w-[28%]">物料规格 / 型号</th>
                        <th className="py-3 px-3 w-[15%]">封装形式</th>
                        <th className="py-3 px-3 w-[20%]">原理图位号</th>
                        <th className="py-3 px-3 w-[18%] text-center">需求用量 (单板 x 套数)</th>
                        <th className="py-3 px-4 w-[19%] text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {project.items.map((it) => (
                        <tr key={it.id} className="hover:bg-surface-hover/70 transition-colors">
                          <td className="py-3 px-4 font-bold text-text-main align-middle">
                            <div className="leading-snug">{it.part_name}</div>
                            {it.comp_lcsc && (
                              <div className="text-xs text-accent font-mono mt-0.5 font-semibold">
                                立创: {it.comp_lcsc}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 font-mono text-text-muted align-middle">
                            {it.package || '-'}
                          </td>
                          <td className="py-3 px-3 font-mono text-text-muted align-middle break-all">
                            {it.designators || '-'}
                          </td>
                          <td className="py-3 px-3 text-center align-middle font-mono">
                            <div className="font-bold text-text-main text-sm">
                              {it.total_demand_qty} 件
                            </div>
                            <div className="text-xs text-text-muted">
                              (单板: {it.unit_demand_qty})
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right align-middle">
                            {!isCompleted && (
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(it.id)}
                                className="text-danger hover:underline text-xs flex items-center gap-1 ml-auto font-mono"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>移除</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======================= 【步骤 ②：现货锁库 (LOCK)】 ======================= */}
        {activeStep === 'LOCK' && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* 步骤工具条 */}
            <div className="p-3 bg-surface border-b border-border-subtle flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-600" />
                <span className="font-bold text-xs sm:text-sm text-text-main">
                  工坊在库现货匹配与预锁
                </span>
                <span className="text-xs text-text-muted hidden sm:inline">
                  — 防止物料被其他日常项目挪用
                </span>
              </div>

              {!isCompleted && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={handleLockAll}
                    className="px-3.5 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-700 dark:text-amber-400 rounded-[2px] text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-colors shadow-2xs"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>智能一键锁库</span>
                  </button>

                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={handleUnlockAll}
                    className="px-3 py-1.5 bg-subtle hover:bg-surface-hover border border-border-subtle rounded-[2px] text-xs sm:text-sm font-medium text-text-muted hover:text-text-main flex items-center gap-1.5 transition-colors"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>释放全部</span>
                  </button>
                </div>
              )}
            </div>

            {/* 锁定分析表格 */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="bg-surface border border-border-subtle rounded-[2px] overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs sm:text-sm border-collapse">
                  <thead>
                    <tr className="bg-canvas border-b border-border-subtle text-text-muted font-bold font-mono">
                      <th className="py-3 px-4 w-[28%]">物料型号</th>
                      <th className="py-3 px-3 w-[16%]">需求总量</th>
                      <th className="py-3 px-3 w-[18%]">手头现货存量</th>
                      <th className="py-3 px-3 w-[20%] text-center">锁定状态</th>
                      <th className="py-3 px-4 w-[18%] text-right">单项管理</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle font-mono">
                    {project.items?.map((it) => {
                      const isLockedFull = it.is_ready;

                      return (
                        <tr key={it.id} className="hover:bg-surface-hover/70 transition-colors">
                          <td className="py-3 px-4 font-bold text-text-main align-middle font-sans">
                            <div>{it.part_name}</div>
                            <div className="text-xs text-text-muted font-mono">{it.package || '-'}</div>
                          </td>
                          <td className="py-3 px-3 align-middle font-bold text-text-main">
                            {it.total_demand_qty} 件
                          </td>
                          <td className="py-3 px-3 align-middle text-text-muted">
                            {it.comp_total_stock !== undefined ? `${it.comp_total_stock} 件` : '未入库'}
                          </td>
                          <td className="py-3 px-3 align-middle text-center">
                            {isLockedFull ? (
                              <span className="inline-block px-2.5 py-0.5 rounded-[2px] text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                                🟩 现货已锁足 ({it.locked_qty}件)
                              </span>
                            ) : it.locked_qty > 0 ? (
                              <span className="inline-block px-2.5 py-0.5 rounded-[2px] text-xs font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                                🟨 部分锁定 ({it.locked_qty}/{it.total_demand_qty})
                              </span>
                            ) : (
                              <span className="inline-block px-2.5 py-0.5 rounded-[2px] text-xs font-bold bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30">
                                🟥 未锁定 (缺 {it.total_demand_qty}件)
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right align-middle">
                            {it.locked_qty > 0 && !isCompleted ? (
                              <button
                                type="button"
                                onClick={() => handleUnlockSingle(it.component_id)}
                                className="text-amber-600 dark:text-amber-400 hover:underline text-xs"
                              >
                                释放该项
                              </button>
                            ) : (
                              <span className="text-text-muted/40 text-xs">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ======================= 【步骤 ③：缺料补购 (PROCURE)】 ======================= */}
        {activeStep === 'PROCURE' && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* 步骤工具条 */}
            <div className="p-3 bg-surface border-b border-border-subtle flex items-center justify-between gap-3 shrink-0 flex-wrap">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-rose-600" />
                <span className="font-bold text-xs sm:text-sm text-text-main">
                  缺料采购补给
                </span>
                <span className="text-xs text-text-muted">
                  — 快速提取并导出缺料，方便立创或淘宝一键加车
                </span>
              </div>

              {/* 一键快捷复制工具 */}
              {purchaseData?.items && purchaseData.items.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const lcscList = purchaseData.items
                        .filter((i: any) => i.comp_lcsc)
                        .map((i: any) => i.comp_lcsc)
                        .join(',');
                      navigator.clipboard.writeText(lcscList);
                      showToast('✔ 已复制立创零件编号列表！可直接在嘉立创BOM导入中粘贴', 'success');
                    }}
                    className="px-3 py-1.5 bg-canvas hover:bg-subtle border border-border-subtle rounded-[2px] text-xs font-mono font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5 text-accent" />
                    <span>复制立创编号</span>
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
                      showToast('✔ 已复制 TSV 采购表格！可直接粘贴至 Excel/在线文档', 'success');
                    }}
                    className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 rounded-[2px] text-xs font-mono font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>复制 Excel 采购单</span>
                  </button>
                </div>
              )}
            </div>

            {/* 缺料清单主视图 */}
            <div className="flex-1 overflow-y-auto p-4">
              {loadingPurchase ? (
                <div className="py-20 text-center text-xs sm:text-sm text-text-muted flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-accent" />
                  <span>正在计算当前缺料缺口...</span>
                </div>
              ) : !purchaseData || !purchaseData.items || purchaseData.items.length === 0 ? (
                <div className="py-24 text-center text-text-muted space-y-3 bg-surface border border-dashed border-emerald-500/40 rounded-md">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 mx-auto flex items-center justify-center">
                    <CheckCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-text-main">太棒了！现货完全齐套</h4>
                    <p className="text-xs sm:text-sm text-text-muted mt-1">
                      本项目所需的所有元器件均已成功在工坊现货中锁定，无需额外补购！
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveStep('KITTING')}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-[2px] text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 shadow-2xs"
                  >
                    <span>直接进入 ④ 拣料与完工</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-[2px] text-rose-700 dark:text-rose-400 font-mono text-xs flex items-center justify-between">
                    <span>
                      共发现 <strong>{purchaseData.items.length}</strong> 种元器件存在缺口，采购到货入库后可自动锁定。
                    </span>
                  </div>

                  <div className="bg-surface border border-border-subtle rounded-[2px] overflow-hidden shadow-xs">
                    <table className="w-full text-left text-xs sm:text-sm border-collapse">
                      <thead>
                        <tr className="bg-canvas border-b border-border-subtle text-text-muted font-bold font-mono">
                          <th className="py-3 px-4 w-[35%]">缺料规格 / 型号</th>
                          <th className="py-3 px-3 w-[18%]">封装</th>
                          <th className="py-3 px-3 w-[18%] text-center">缺口数量</th>
                          <th className="py-3 px-4 w-[29%] text-right">推荐采购参考</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-subtle">
                        {purchaseData.items.map((item: any, idx: number) => (
                          <tr key={idx} className="hover:bg-surface-hover/70 transition-colors">
                            <td className="py-3 px-4 font-bold text-text-main align-middle leading-snug">
                              {item.part_name}
                            </td>
                            <td className="py-3 px-3 font-mono text-text-muted align-middle">
                              {item.package || '-'}
                            </td>
                            <td className="py-3 px-3 text-center align-middle font-mono">
                              <span className="font-black text-rose-600 dark:text-rose-400 text-sm">
                                需购 {item.shortage_qty} 件
                              </span>
                              <div className="text-[11px] text-text-muted">
                                (单板: {item.unit_demand_qty})
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right align-middle font-mono">
                              {item.comp_lcsc ? (
                                <span className="font-bold text-accent">
                                  立创: {item.comp_lcsc}
                                </span>
                              ) : (
                                <span className="text-text-muted/60">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======================= 【步骤 ④：拣料完工 (KITTING)】 ======================= */}
        {activeStep === 'KITTING' && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* 步骤工具条 */}
            <div className="p-3 bg-surface border-b border-border-subtle flex items-center justify-between gap-3 shrink-0 flex-wrap">
              <div className="flex items-center gap-2">
                <Box className="w-4 h-4 text-emerald-600" />
                <span className="font-bold text-xs sm:text-sm text-text-main">
                  按物理货位拣料打卡清单
                </span>
                <span className="text-xs text-text-muted font-mono hidden sm:inline">
                  — 已取 {totalCheckedCount}/{project.items?.length || 0} 项
                </span>
              </div>

              {!isCompleted && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={handleCompleteProject}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[2px] text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-2xs transition-colors"
                    title="全部物料已焊接/装配完毕，正式从在库库存扣减"
                  >
                    <Award className="w-4 h-4" />
                    <span>完工正式消库</span>
                  </button>
                </div>
              )}
            </div>

            {/* 按货位分组清单 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
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
          </div>
        )}
      </div>
    </div>
  );
};
