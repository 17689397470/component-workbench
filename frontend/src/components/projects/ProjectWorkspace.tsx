import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ProjectDetail, ProjectItemDetail } from '../../types/project';
import { ComponentItem } from '../../types/component';
import {
  BomMatchResult,
  BomSummary,
  BomParsedData,
  BomColumnMapping,
  ShortageItem,
} from '../../types/bom';
import { projectApi } from '../../api/projectApi';
import { componentApi } from '../../api/componentApi';
import { bomApi } from '../../api/bomApi';
import { useToastStore } from '../../store/useToastStore';
import { KittingMaterial } from './KittingBoxSandbox';
import { ImmersiveKittingModal } from './ImmersiveKittingModal';
import { ProjectMaterialDrawer } from './ProjectMaterialDrawer';
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
  Edit3,
  RefreshCw,
  Box,
  Layers,
  Search,
  CheckSquare,
  Square,
  ArrowRight,
  ClipboardPaste,
  UploadCloud,
  FileSpreadsheet,
  ArrowLeft,
  Sparkles,
  Target,
  SlidersHorizontal,
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { cn } from '../../lib/utils';

interface ProjectWorkspaceProps {
  projectId: number | null;
  onProjectUpdated?: () => void;
  onDeleteProject?: (id: number) => void;
  onBackToList?: () => void;
  onNavigateToBoxes?: (boxName: string) => void;
  onProjectCreated?: (newId: number) => void;
}

export const ProjectWorkspace: React.FC<ProjectWorkspaceProps> = ({
  projectId,
  onProjectUpdated,
  onDeleteProject,
  onBackToList,
  onNavigateToBoxes,
  onProjectCreated,
}) => {
  const { showToast } = useToastStore();

  // 当前工程数据
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // 极速 BOM 草稿模式相关状态
  const [isFastBomMode, setIsFastBomMode] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [fileName, setFileName] = useState('');
  const [parsingBom, setParsingBom] = useState(false);
  const [comparingBom, setComparingBom] = useState(false);
  const [bomMultiplier, setBomMultiplier] = useState(1);
  const [bomResults, setBomResults] = useState<BomMatchResult[]>([]);
  const [bomSummary, setBomSummary] = useState<BomSummary | null>(null);
  const [bomShortages, setBomShortages] = useState<ShortageItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 转存工程弹窗
  const [saveAsProjectModalOpen, setSaveAsProjectModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [autoLockStock, setAutoLockStock] = useState(true);

  // 拣料打卡记忆状态
  const [checkedPicks, setCheckedPicks] = useState<Record<string, boolean>>({});
  const [filterQuery, setFilterQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SHORTAGE' | 'SUFFICIENT'>('ALL');

  // 打样套数微调
  const [isEditingQty, setIsEditingQty] = useState(false);
  const [targetQtyInput, setTargetQtyInput] = useState<number>(1);

  // 全屏沉浸拿料沙盘模态框
  const [isKittingSandboxOpen, setIsKittingSandboxOpen] = useState(false);

  // 内联快速加料表单
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [addPartName, setAddPartName] = useState('');
  const [addPkg, setAddPkg] = useState('');
  const [addUnitQty, setAddUnitQty] = useState(1);
  const [addDesignators, setAddDesignators] = useState('');
  const [searchCandidates, setSearchCandidates] = useState<ComponentItem[]>([]);
  const [selectedComp, setSelectedComp] = useState<ComponentItem | null>(null);
  const [submittingAdd, setSubmittingAdd] = useState(false);

  // 物料规格与配料纠偏抽屉状态
  const [drawerItem, setDrawerItem] = useState<ProjectItemDetail | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const handleOpenMaterialDrawer = (mat: KittingMaterial, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (isFastBomMode || !project?.items) return;
    const found = project.items.find((it) => it.id === mat.id);
    if (found) {
      setDrawerItem(found);
      setIsDrawerOpen(true);
    }
  };

  // 加载项目详情
  const loadProjectDetail = async (id: number) => {
    setLoading(true);
    try {
      const res = await projectApi.getDetail(id);
      if (res.success && res.data) {
        setProject(res.data);
        setTargetQtyInput(res.data.target_qty || 1);
        setIsFastBomMode(false);
      }
    } catch (err: any) {
      showToast('获取项目详情失败: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) {
      setIsFastBomMode(false);
      loadProjectDetail(projectId);
    } else {
      setIsFastBomMode(true);
      setProject(null);
    }
  }, [projectId]);

  // 更新目标套数
  const handleUpdateTargetQty = async () => {
    if (!project) return;
    const val = Math.max(1, targetQtyInput);
    setActionLoading(true);
    try {
      await projectApi.update(project.id, { target_qty: val });
      showToast(`已将制作目标套数更新为 ${val} 套`, 'success');
      setIsEditingQty(false);
      loadProjectDetail(project.id);
      onProjectUpdated?.();
    } catch (err: any) {
      showToast('更新套数失败: ' + err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // 一键锁库
  const handleLockStock = async () => {
    if (!project) return;
    setActionLoading(true);
    try {
      const res = await projectApi.lock(project.id);
      if (res.success) {
        showToast(`✔ 成功锁定物料库存！共锁定 ${res.data?.totalPiecesLocked || 0} 件现货`, 'success');
        loadProjectDetail(project.id);
        onProjectUpdated?.();
      }
    } catch (err: any) {
      showToast('锁定库存失败: ' + err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // 释放锁库
  const handleUnlockStock = async () => {
    if (!project) return;
    if (!window.confirm('确定要释放此项目锁定的库存吗？释放后其他项目可以使用这些物料。')) {
      return;
    }
    setActionLoading(true);
    try {
      const res = await projectApi.unlock(project.id);
      if (res.success) {
        showToast('已释放此项目锁定的库存', 'info');
        loadProjectDetail(project.id);
        onProjectUpdated?.();
      }
    } catch (err: any) {
      showToast('释放锁库失败: ' + err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // 完工出库消库
  const handleCompleteProject = async () => {
    if (!project) return;
    if (!window.confirm(`确认将项目「${project.name}」标记为完工并真正从工坊库存中扣减消库吗？`)) {
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

  // 解析并比对 BOM 文本
  const handleParseAndCompareBomText = async (textToParse?: string) => {
    const text = textToParse || pasteText;
    if (!text.trim()) {
      showToast('请先输入或粘贴 BOM 文本内容', 'warn');
      return;
    }
    setParsingBom(true);
    try {
      const parseRes = await bomApi.parseBomText(text);
      if (parseRes.success && parseRes.data) {
        const { dataRows, autoMapping, totalRows, detectedTemplate } = parseRes.data;
        showToast(`✔ 成功识别 ${totalRows} 行数据 [${detectedTemplate}]`, 'success');
        setComparingBom(true);
        const compRes = await bomApi.compareBom({
          rows: dataRows,
          mapping: autoMapping,
          multiplier: bomMultiplier,
          aggregate: true,
        });
        if (compRes.success && compRes.data) {
          setBomResults(compRes.data.results);
          setBomSummary(compRes.data.summary);
          setBomShortages(compRes.data.shortageList || []);
          setCheckedPicks({});
          const sum = compRes.data.summary;
          const matchPercent =
            sum.totalItems > 0
              ? Math.round(((sum.exactMatchCount + sum.substituteCount) / sum.totalItems) * 100)
              : 100;
          showToast(`✔ 比对完成：齐套率 ${matchPercent}%`, 'success');
        }
      }
    } catch (err: any) {
      showToast('BOM 解析比对失败: ' + err.message, 'error');
    } finally {
      setParsingBom(false);
      setComparingBom(false);
    }
  };

  // 文件上传比对
  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setParsingBom(true);
    setFileName(file.name);
    try {
      const upRes = await bomApi.uploadBomFile(file);
      if (upRes.success && upRes.data) {
        showToast(`✔ 导入 ${file.name} 成功：共 ${upRes.data.totalRows} 行`, 'success');
        setComparingBom(true);
        const compRes = await bomApi.compareBom({
          rows: upRes.data.dataRows,
          mapping: upRes.data.autoMapping,
          multiplier: bomMultiplier,
          aggregate: true,
        });
        if (compRes.success && compRes.data) {
          setBomResults(compRes.data.results);
          setBomSummary(compRes.data.summary);
          setBomShortages(compRes.data.shortageList || []);
          setCheckedPicks({});
        }
      }
    } catch (err: any) {
      showToast('文件解析失败: ' + err.message, 'error');
    } finally {
      setParsingBom(false);
      setComparingBom(false);
    }
  };

  // 转存为正式工程
  const handleSaveAsOfficialProject = async () => {
    if (!newProjectName.trim()) {
      showToast('请输入工程名称', 'warn');
      return;
    }
    setActionLoading(true);
    try {
      const items = bomResults.map((r) => ({
        part_name: r.partName,
        package: r.footprint || '',
        unit_demand_qty: r.unitQty,
        total_demand_qty: r.qtyNeeded,
        component_id: r.matchedStock?.id || r.substituteOption?.component?.id || null,
        designators: r.designators || '',
      }));

      const res = await projectApi.create(
        {
          name: newProjectName.trim(),
          description: newProjectDesc.trim() || `由极速 BOM 比对草稿生成，共 ${items.length} 种物料`,
          target_qty: bomMultiplier,
        },
        items,
        autoLockStock
      );

      if (res.success && res.data) {
        const createdProj = res.data;
        showToast(`✔ 成功保存为硬件工程「${createdProj.name}」！`, 'success');
        setSaveAsProjectModalOpen(false);
        onProjectCreated?.(createdProj.id);
        onProjectUpdated?.();
      }
    } catch (err: any) {
      showToast('保存为工程失败: ' + err.message, 'error');
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
    try {
      const res = await componentApi.getAll({ q: text.trim() });
      if (res.success && res.data) {
        setSearchCandidates(res.data.slice(0, 8));
      }
    } catch {
      setSearchCandidates([]);
    }
  };

  // 提交内联加料
  const handleQuickAddSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!project) return;
    if (!addPartName.trim()) {
      showToast('请输入物料型号/规格', 'warn');
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
      setIsQuickAddOpen(false);
      loadProjectDetail(project.id);
      onProjectUpdated?.();
    } catch (err: any) {
      showToast('添加物料失败: ' + err.message, 'error');
    } finally {
      setSubmittingAdd(false);
    }
  };

  // 删除物料
  const handleRemoveItem = async (itemId: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!project) return;
    if (!window.confirm('确定从本项目中移除此物料吗？')) return;
    try {
      await projectApi.removeItem(project.id, itemId);
      showToast('已移除物料', 'info');
      loadProjectDetail(project.id);
      onProjectUpdated?.();
    } catch (err: any) {
      showToast('移除失败: ' + err.message, 'error');
    }
  };

  // 勾选打卡切换
  const handleTogglePick = (id: string | number, nextPicked?: boolean) => {
    const key = String(id);
    setCheckedPicks((prev) => ({
      ...prev,
      [key]: nextPicked !== undefined ? nextPicked : !prev[key],
    }));
  };

  // 全选或取消所有打卡
  const handleToggleSelectAllPicks = () => {
    const allMaterials = isFastBomMode ? bomMaterials : projectMaterials;
    const allPicked = allMaterials.every((m) => checkedPicks[String(m.id)]);
    const nextMap: Record<string, boolean> = {};
    allMaterials.forEach((m) => {
      nextMap[String(m.id)] = !allPicked;
    });
    setCheckedPicks(nextMap);
    showToast(!allPicked ? '✔ 已标记全部物料取料完成' : '已重置所有打卡标记', 'info');
  };

  // 统一映射物料供沙盘使用
  const projectMaterials: KittingMaterial[] = useMemo(() => {
    if (!project?.items) return [];
    return project.items.map((it) => ({
      id: it.id,
      componentId: it.component_id,
      name: it.part_name,
      package: it.package,
      location: it.comp_location,
      demandQty: it.total_demand_qty,
      stockQty: it.comp_total_stock,
      status: it.status,
      designators: it.designators,
      isPicked: !!checkedPicks[String(it.id)],
    }));
  }, [project?.items, checkedPicks]);

  const bomMaterials: KittingMaterial[] = useMemo(() => {
    return bomResults.map((r, idx) => {
      const loc = r.isAdoptedSubstitute
        ? r.substituteOption?.component?.location
        : r.matchedStock?.location;
      const stock = r.isAdoptedSubstitute
        ? r.substituteOption?.component?.quantity
        : r.matchedStock?.quantity;
      return {
        id: `bom-${idx}`,
        componentId: r.matchedStock?.id || r.substituteOption?.component?.id || null,
        name: r.partName,
        package: r.footprint,
        value: r.matchedStock?.value || '',
        location: loc,
        demandQty: r.qtyNeeded,
        stockQty: stock,
        status:
          r.status === 'EXACT_MATCH'
            ? 'SUFFICIENT'
            : r.status === 'SUBSTITUTE_AVAILABLE'
            ? 'SUBSTITUTE'
            : 'SHORTAGE',
        designators: r.designators,
        isPicked: !!checkedPicks[`bom-${idx}`],
      };
    });
  }, [bomResults, checkedPicks]);

  const currentMaterials = isFastBomMode ? bomMaterials : projectMaterials;

  // 过滤后的物料行
  const filteredMaterials = useMemo(() => {
    return currentMaterials.filter((m) => {
      if (statusFilter === 'SHORTAGE' && m.status !== 'SHORTAGE') return false;
      if (statusFilter === 'SUFFICIENT' && m.status === 'SHORTAGE') return false;

      if (filterQuery.trim()) {
        const q = filterQuery.toLowerCase().trim();
        const matchName = m.name.toLowerCase().includes(q);
        const matchPkg = m.package?.toLowerCase().includes(q);
        const matchLoc = m.location?.toLowerCase().includes(q);
        const matchDes = m.designators?.toLowerCase().includes(q);
        if (!matchName && !matchPkg && !matchLoc && !matchDes) return false;
      }
      return true;
    });
  }, [currentMaterials, statusFilter, filterQuery]);

  // 统计指标
  const totalCount = currentMaterials.length;
  const pickedCount = currentMaterials.filter((m) => m.isPicked).length;
  const readyCount = currentMaterials.filter((m) => m.status !== 'SHORTAGE').length;
  const readinessRate =
    totalCount > 0
      ? Math.round((readyCount / totalCount) * 100)
      : isFastBomMode && bomSummary && bomSummary.totalItems > 0
      ? Math.round(
          ((bomSummary.exactMatchCount + bomSummary.substituteCount) / bomSummary.totalItems) * 100
        )
      : 100;

  const currentProjectName = isFastBomMode ? '极速 BOM 草稿' : project?.name || '制作工程';
  const currentTargetQty = isFastBomMode ? bomMultiplier : project?.target_qty || 1;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-canvas border border-border-subtle rounded-none overflow-hidden select-none">
      {/* 1. 顶部工规状态与控制台标牌 */}
      <div className="p-3.5 bg-surface border-b border-border-subtle shrink-0 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* 左侧：返回按键(移动端) + 工程/BOM主标题 */}
          <div className="flex items-center gap-3 min-w-0">
            {onBackToList && (
              <button
                onClick={onBackToList}
                className="md:hidden p-1.5 hover:bg-subtle rounded-[2px] text-text-muted hover:text-text-main border border-border-subtle"
                title="返回项目列表"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}

            <div className="w-9 h-9 rounded-[2px] bg-accent/10 text-accent flex items-center justify-center font-bold shrink-0">
              {isFastBomMode ? <FileSpreadsheet className="w-5 h-5" /> : <FolderGit2 className="w-5 h-5" />}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-text-main truncate tracking-tight">
                  {currentProjectName}
                </h2>

                {/* 状态指示徽标 */}
                {isFastBomMode ? (
                  <span className="px-2 py-0.5 rounded-[2px] text-xs font-mono font-bold bg-accent/15 text-accent border border-accent/30">
                    草稿即时比对
                  </span>
                ) : project?.status === 'COMPLETED' ? (
                  <span className="px-2 py-0.5 rounded-[2px] text-xs font-mono font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                    已完工消库
                  </span>
                ) : readinessRate >= 100 ? (
                  <span className="px-2 py-0.5 rounded-[2px] text-xs font-mono font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                    现货齐套待焊
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-[2px] text-xs font-mono font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                    备料中 ({readinessRate}%)
                  </span>
                )}
              </div>

              {!isFastBomMode && project?.description && (
                <p className="text-xs text-text-muted truncate max-w-2xl mt-0.5">
                  {project.description}
                </p>
              )}
            </div>
          </div>

          {/* 右侧：套数微调 + 核心工规操作按钮组 */}
          <div className="flex items-center gap-2.5 font-mono ml-auto">
            {/* 打样套数微调 */}
            <div className="flex items-center gap-1.5 text-xs text-text-muted bg-canvas px-3 py-1.5 rounded-[2px] border border-border-subtle">
              <span>制作目标:</span>
              {isFastBomMode ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    value={bomMultiplier}
                    onChange={(e) => {
                      const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                      setBomMultiplier(val);
                      if (bomResults.length > 0) {
                        handleParseAndCompareBomText();
                      }
                    }}
                    className="w-14 bg-surface border border-border-subtle rounded-[2px] px-1 py-0.5 text-xs font-bold text-center text-text-main"
                  />
                  <span>套</span>
                </div>
              ) : isEditingQty ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    value={targetQtyInput}
                    onChange={(e) => setTargetQtyInput(parseInt(e.target.value, 10) || 1)}
                    className="w-14 bg-surface border border-border-subtle rounded-[2px] px-1 py-0.5 text-xs font-bold text-center text-text-main"
                    autoFocus
                  />
                  <button
                    onClick={handleUpdateTargetQty}
                    className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setIsEditingQty(false)}
                    className="p-1 text-text-muted hover:bg-subtle rounded"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => setIsEditingQty(true)}
                  className="font-black text-accent cursor-pointer hover:underline flex items-center gap-1"
                  title="点击修改打板套数"
                >
                  <span>{project?.target_qty || 1} 套 (板)</span>
                  <Edit2 className="w-3 h-3 text-text-muted" />
                </div>
              )}
            </div>

            {/* 极速模式下的“保存为正式工程”按钮 */}
            {isFastBomMode && bomResults.length > 0 && (
              <button
                onClick={() => {
                  setNewProjectName(`BOM工程-${new Date().toLocaleDateString()}`);
                  setSaveAsProjectModalOpen(true);
                }}
                className="px-3 py-1.5 text-xs font-bold bg-accent text-white hover:bg-accent-hover rounded-[2px] shadow-2xs flex items-center gap-1.5 transition-colors"
              >
                <FolderGit2 className="w-3.5 h-3.5" />
                <span>保存为此工程</span>
              </button>
            )}

            {/* 正式工程下的锁库与完工操作 */}
            {!isFastBomMode && project && (
              <>
                {(project.totalPiecesLocked || 0) === 0 ? (
                  <button
                    onClick={handleLockStock}
                    disabled={actionLoading}
                    className="px-3 py-1.5 text-xs font-bold bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 rounded-[2px] flex items-center gap-1.5 transition-colors"
                    title="锁定当前可用库存，防止被其他工程占用"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>锁定库存</span>
                  </button>
                ) : (
                  <button
                    onClick={handleUnlockStock}
                    disabled={actionLoading}
                    className="px-3 py-1.5 text-xs font-bold bg-canvas text-text-muted border border-border-subtle hover:text-danger rounded-[2px] flex items-center gap-1.5 transition-colors"
                    title="释放已锁定库存"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>释放锁库</span>
                  </button>
                )}

                {project.status !== 'COMPLETED' && (
                  <button
                    onClick={handleCompleteProject}
                    disabled={actionLoading}
                    className="px-3 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-[2px] shadow-2xs flex items-center gap-1.5 transition-colors"
                    title="制作完工并真正从库存中扣减消库"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>完工消库</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* 2. 工规 KPI 分段条 + 全屏拿料沙盘主行动大按钮 (醒目聚焦，拒绝拥挤) */}
        <div className="flex items-center justify-between gap-3 text-xs font-mono bg-canvas px-4 py-2 border border-border-subtle rounded-[2px] flex-wrap">
          <div className="flex items-center gap-5 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-text-muted font-bold">现货齐套率:</span>
              <span
                className={cn(
                  'font-black text-sm',
                  readinessRate >= 100 ? 'text-emerald-600' : 'text-accent'
                )}
              >
                {readinessRate}%
              </span>
              <span className="text-[11px] text-text-muted">
                ({readyCount}/{totalCount} 项充足)
              </span>
            </div>

            <span className="text-border-subtle">|</span>

            <div className="flex items-center gap-2">
              <span className="text-text-muted font-bold">取料打卡:</span>
              <span className="font-black text-sm text-text-main">
                {pickedCount}/{totalCount}
              </span>
              <span className="text-[11px] text-text-muted">已就位</span>
            </div>
          </div>

          {/* 核心主行动大按钮：进入现场全屏拿料沙盘！ */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleToggleSelectAllPicks}
              className="text-xs font-bold text-text-muted hover:text-text-main flex items-center gap-1"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>{pickedCount === totalCount ? '取消全选' : '全部打卡'}</span>
            </button>

            {totalCount > 0 && (
              <button
                onClick={() => setIsKittingSandboxOpen(true)}
                className="px-4 py-1.5 text-xs font-black bg-accent text-white hover:bg-accent-hover rounded-[2px] shadow-sm flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-95 animate-pulse"
                title="全屏进入 2D 亚克力收纳柜大矩阵现场拿料"
              >
                <Target className="w-4 h-4" />
                <span>🚀 开始现场配料 / 进入拿料沙盘 ({pickedCount}/{totalCount})</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. 主体全宽物料工作区 (独占 100% 视口，通透开阔) */}
      <div className="flex-1 flex flex-col min-h-0 bg-surface overflow-hidden">
        {/* A. 极速 BOM 录入框 (在草稿模式下展开) */}
        {isFastBomMode && bomResults.length === 0 && (
          <div className="p-4 bg-canvas/60 border-b border-border-subtle space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-black text-text-main">
                <ClipboardPaste className="w-4 h-4 text-accent" />
                <span>粘贴或导入 BOM 数据</span>
              </div>
              {pasteText && (
                <button
                  type="button"
                  onClick={() => setPasteText('')}
                  className="text-xs text-text-muted hover:text-text-main flex items-center gap-1 transition-colors"
                >
                  <span>清空输入</span>
                </button>
              )}
            </div>

            <textarea
              rows={5}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="直接从立创EDA、Excel、Altium Designer等复制表格并在此处粘贴（支持制表符 Tab 分隔）..."
              className="w-full bg-canvas border border-border-subtle rounded-[2px] p-3 font-mono text-xs text-text-main focus:outline-none focus:border-accent"
            />

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
                  }}
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 text-xs font-mono font-bold text-text-muted hover:text-text-main border border-border-subtle rounded-[2px] bg-canvas flex items-center gap-1.5"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>上传 Excel/CSV</span>
                </button>
                {fileName && <span className="text-xs font-mono text-text-muted">{fileName}</span>}
              </div>

              <button
                onClick={() => handleParseAndCompareBomText()}
                disabled={parsingBom || comparingBom}
                className="px-5 py-2 text-xs font-black bg-accent text-white hover:bg-accent-hover rounded-[2px] shadow-xs flex items-center gap-1.5"
              >
                {parsingBom || comparingBom ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>立即解析 BOM 并比对库存</span>
              </button>
            </div>
          </div>
        )}

        {/* B. 清单搜索与过滤工具栏 */}
        <div className="px-4 py-2.5 bg-surface border-b border-border-subtle flex items-center justify-between gap-3 shrink-0">
          {/* 紧凑搜索框 */}
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="搜索型号、封装、货位、位号..."
              className="w-full pl-8 pr-6 py-1.5 text-xs font-mono bg-canvas border border-border-subtle rounded-[2px] text-text-main placeholder:text-text-muted/60 focus:outline-none focus:border-accent"
            />
            {filterQuery && (
              <button
                onClick={() => setFilterQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* 状态过滤胶囊 */}
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={cn(
                'px-2.5 py-1 rounded-[2px] border transition-colors',
                statusFilter === 'ALL'
                  ? 'bg-accent/10 text-accent font-bold border-accent/30'
                  : 'bg-canvas text-text-muted border-border-subtle'
              )}
            >
              全部({totalCount})
            </button>
            <button
              onClick={() => setStatusFilter('SHORTAGE')}
              className={cn(
                'px-2.5 py-1 rounded-[2px] border transition-colors',
                statusFilter === 'SHORTAGE'
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 font-bold border-amber-500/40'
                  : 'bg-canvas text-text-muted border-border-subtle'
              )}
            >
              缺料({totalCount - readyCount})
            </button>
            <button
              onClick={() => setStatusFilter('SUFFICIENT')}
              className={cn(
                'px-2.5 py-1 rounded-[2px] border transition-colors',
                statusFilter === 'SUFFICIENT'
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-bold border-emerald-500/40'
                  : 'bg-canvas text-text-muted border-border-subtle'
              )}
            >
              充足({readyCount})
            </button>
          </div>

          {/* 追加物料 */}
          {!isFastBomMode && project && (
            <button
              onClick={() => setIsQuickAddOpen(!isQuickAddOpen)}
              className="px-3 py-1 text-xs font-bold text-accent hover:bg-accent/10 border border-accent/30 rounded-[2px] flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>追加物料</span>
            </button>
          )}
        </div>

        {/* C. 内联快速加料表单 */}
        {isQuickAddOpen && (
          <div className="p-3 bg-canvas border-b border-border-subtle space-y-2 animate-in slide-in-from-top duration-150">
            <div className="text-xs font-black text-text-main flex items-center justify-between">
              <span>追加单项物料到当前工程</span>
              <button
                onClick={() => setIsQuickAddOpen(false)}
                className="text-text-muted hover:text-text-main"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <div className="sm:col-span-2 relative">
                <input
                  type="text"
                  value={addPartName}
                  onChange={(e) => handleSearchCandidates(e.target.value)}
                  placeholder="输入物料型号/规格（自动联想库存）..."
                  className="w-full bg-surface border border-border-subtle rounded-[2px] px-2.5 py-1 text-xs font-mono text-text-main focus:outline-none focus:border-accent"
                />
                {searchCandidates.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border-subtle rounded-[2px] shadow-md z-30 max-h-40 overflow-y-auto divide-y divide-border-subtle text-xs font-mono">
                    {searchCandidates.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => {
                          setSelectedComp(c);
                          setAddPartName(c.name);
                          setAddPkg(c.package || '');
                          setSearchCandidates([]);
                        }}
                        className="p-1.5 hover:bg-subtle cursor-pointer flex items-center justify-between"
                      >
                        <span className="font-bold text-text-main">{c.name}</span>
                        <span className="text-text-muted text-[11px]">
                          {c.package} | 存{c.quantity}件 | {c.location || '无货位'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <input
                  type="text"
                  value={addPkg}
                  onChange={(e) => setAddPkg(e.target.value)}
                  placeholder="封装 (如 0805)"
                  className="w-full bg-surface border border-border-subtle rounded-[2px] px-2.5 py-1 text-xs font-mono text-text-main focus:outline-none focus:border-accent"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  value={addUnitQty}
                  onChange={(e) => setAddUnitQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  placeholder="单板用量"
                  className="w-16 bg-surface border border-border-subtle rounded-[2px] px-2 py-1 text-xs font-mono text-text-main font-bold focus:outline-none focus:border-accent text-center"
                />
                <button
                  onClick={handleQuickAddSubmit}
                  disabled={submittingAdd}
                  className="flex-1 py-1 bg-accent text-white text-xs font-bold rounded-[2px] hover:bg-accent-hover"
                >
                  确认添加
                </button>
              </div>
            </div>
          </div>
        )}

        {/* D. 全宽工规物料清单表格 (清晰通透、字号大、对齐规整) */}
        <div className="flex-1 overflow-y-auto bg-surface">
          {filteredMaterials.length === 0 ? (
            <div className="py-20 text-center text-xs text-text-muted flex flex-col items-center gap-2">
              <Box className="w-10 h-10 text-border-hover stroke-[1.5]" />
              <span className="font-bold text-sm">
                {isFastBomMode && bomResults.length === 0
                  ? '请在上方粘贴或上传 BOM 数据开始验料'
                  : '未找到匹配的物料项目'}
              </span>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-20 font-mono text-[11px] text-text-muted uppercase shadow-xs">
                <tr className="border-b border-border-subtle bg-surface">
                  <th className="py-2.5 px-3 w-10 text-center bg-surface">取料</th>
                  <th className="py-2.5 px-3 bg-surface">物料型号 / 规格</th>
                  <th className="py-2.5 px-3 w-28 min-w-[90px] bg-surface">封装</th>
                  <th className="py-2.5 px-3 bg-surface">电路位号</th>
                  <th className="py-2.5 px-3 w-28 bg-surface">需用 / 存量</th>
                  <th className="py-2.5 px-3 w-36 bg-surface">物理货位</th>
                  <th className="py-2.5 px-3 w-24 bg-surface">状态</th>
                  {!isFastBomMode && <th className="py-2.5 px-3 w-20 text-right bg-surface">操作</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {filteredMaterials.map((mat) => {
                  const isShortage = mat.status === 'SHORTAGE';
                  const hasLocation = !!mat.location;

                  return (
                    <tr
                      key={mat.id}
                      onClick={() => handleOpenMaterialDrawer(mat)}
                      className={cn(
                        'hover:bg-subtle/70 transition-colors',
                        !isFastBomMode && 'cursor-pointer',
                        mat.isPicked && 'bg-emerald-500/[0.03]'
                      )}
                    >
                      {/* 打卡复选框 */}
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTogglePick(mat.id);
                          }}
                          className={cn(
                            'p-1 rounded-[2px] border transition-colors inline-flex items-center justify-center',
                            mat.isPicked
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-canvas text-text-muted/40 border-border-subtle hover:border-accent'
                          )}
                          title={mat.isPicked ? '已取料' : '点击打卡'}
                        >
                          <Check className="w-3.5 h-3.5 stroke-[2.8]" />
                        </button>
                      </td>

                      {/* 物料型号 */}
                      <td className="py-2.5 px-3">
                        <div
                          className={cn(
                            'font-black text-xs sm:text-sm leading-snug',
                            mat.isPicked ? 'line-through text-text-muted' : 'text-text-main'
                          )}
                        >
                          {mat.name}
                        </div>
                      </td>

                      {/* 封装 */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {mat.package ? (
                          <span
                            className="inline-block whitespace-nowrap max-w-[120px] truncate align-middle px-1.5 py-0.5 bg-canvas border border-border-subtle text-[11px] font-mono text-text-muted rounded-[2px] font-bold"
                            title={mat.package}
                          >
                            {mat.package}
                          </span>
                        ) : (
                          <span className="text-text-muted/60 font-mono">-</span>
                        )}
                      </td>

                      {/* 位号 */}
                      <td className="py-2.5 px-3 font-mono text-xs text-text-muted">
                        {mat.designators ? (
                          <span className="text-accent font-bold" title={mat.designators}>
                            {mat.designators}
                          </span>
                        ) : (
                          <span className="text-text-muted/60">-</span>
                        )}
                      </td>

                      {/* 需用与存量 */}
                      <td className="py-2.5 px-3 font-mono text-xs">
                        <span className="font-black text-text-main">
                          {mat.demandQty} 件
                        </span>
                        <span className="text-text-muted text-[11px] ml-1.5">
                          (存 {mat.stockQty ?? 0})
                        </span>
                      </td>

                      {/* 物理货位 */}
                      <td className="py-2.5 px-3">
                        {hasLocation ? (
                          <span className="px-2 py-0.5 rounded-[2px] font-mono text-xs font-black bg-accent/10 text-accent border border-accent/30 inline-flex items-center gap-1">
                            <Box className="w-3 h-3" />
                            <span>{mat.location}</span>
                          </span>
                        ) : (
                          <span className="text-[11px] font-mono text-text-muted/60 px-1.5 py-0.5 border border-dashed border-border-subtle rounded-[2px]">
                            未入柜
                          </span>
                        )}
                      </td>

                      {/* 状态徽标 */}
                      <td className="py-2.5 px-3 font-mono text-xs font-bold">
                        {mat.isPicked ? (
                          <span className="text-emerald-600">✔ 已取件</span>
                        ) : isShortage ? (
                          <span className="text-amber-600 dark:text-amber-400">缺料</span>
                        ) : (
                          <span className="text-emerald-600">充足</span>
                        )}
                      </td>

                      {/* 操作 */}
                      {!isFastBomMode && (
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={(e) => handleOpenMaterialDrawer(mat, e)}
                              className="p-1 text-text-muted hover:text-accent hover:bg-accent/10 rounded transition-colors"
                              title="修改规格与配料"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => handleRemoveItem(mat.id as number, e)}
                              className="p-1 text-text-muted hover:text-danger hover:bg-danger/10 rounded transition-colors"
                              title="删除此物料"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 3. 全屏沉浸式现场拿料大沙盘模态框 */}
      <ImmersiveKittingModal
        isOpen={isKittingSandboxOpen}
        onClose={() => setIsKittingSandboxOpen(false)}
        projectName={currentProjectName}
        targetQty={currentTargetQty}
        materials={currentMaterials}
        checkedPicks={checkedPicks}
        onTogglePick={handleTogglePick}
      />

      {/* 极速 BOM 转存正式工程弹窗 */}
      <Modal
        isOpen={saveAsProjectModalOpen}
        onClose={() => setSaveAsProjectModalOpen(false)}
        title="保存为硬件制作工程"
        maxWidth="max-w-md"
      >
        <div className="space-y-4 text-xs sm:text-sm">
          <div>
            <label className="block text-text-muted mb-1 font-semibold">工程名称 *</label>
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="例如: 智能温湿度传感器 v1.2"
              className="w-full bg-canvas border border-border-subtle rounded-[2px] px-3 py-2 text-xs sm:text-sm text-text-main focus:outline-none focus:border-accent"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-text-muted mb-1 font-semibold">工程说明</label>
            <textarea
              rows={2}
              value={newProjectDesc}
              onChange={(e) => setNewProjectDesc(e.target.value)}
              placeholder="输入项目版本、打样批次等备注信息..."
              className="w-full bg-canvas border border-border-subtle rounded-[2px] p-2 text-xs text-text-main focus:outline-none focus:border-accent resize-none"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="autoLock"
              checked={autoLockStock}
              onChange={(e) => setAutoLockStock(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="autoLock" className="text-xs font-semibold text-text-main cursor-pointer">
              创建后自动锁定可用现货库存（防止被后续项目占用）
            </label>
          </div>

          <button
            onClick={handleSaveAsOfficialProject}
            disabled={actionLoading}
            className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white font-bold text-xs sm:text-sm rounded-[2px] shadow-xs transition-colors flex items-center justify-center gap-1.5"
          >
            {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FolderGit2 className="w-4 h-4" />}
            <span>确认保存并进入正式工程</span>
          </button>
        </div>
      </Modal>

      {/* 4. 物料规格与配料纠偏抽屉 */}
      <ProjectMaterialDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        projectId={projectId as number}
        targetQty={project?.target_qty || 1}
        item={drawerItem}
        onSaved={() => {
          if (projectId) {
            loadProjectDetail(projectId);
            onProjectUpdated?.();
          }
        }}
      />
    </div>
  );
};
