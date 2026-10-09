import React, { useState, useEffect } from 'react';
import { ProjectDetail, ProjectItemDetail } from '../types/project';
import { projectApi } from '../api/projectApi';
import { useToastStore } from '../store/useToastStore';
import { AddProjectItemModal } from './AddProjectItemModal';
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
  Box
} from 'lucide-react';
import { cn } from '../lib/utils';

interface ProjectDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number | null;
  onProjectUpdated?: () => void;
}

export const ProjectDetailModal: React.FC<ProjectDetailModalProps> = ({
  isOpen,
  onClose,
  projectId,
  onProjectUpdated,
}) => {
  const { showToast } = useToastStore();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // 添加物料弹窗
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // 修改目标套数
  const [isEditingQty, setIsEditingQty] = useState(false);
  const [targetQtyInput, setTargetQtyInput] = useState<number>(1);

  // 缺料采购清单弹窗
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [purchaseData, setPurchaseData] = useState<any>(null);

  useEffect(() => {
    if (isOpen && projectId) {
      loadProjectDetail(projectId);
    }
  }, [isOpen, projectId]);

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

  // 修改目标套数
  const handleUpdateTargetQty = async () => {
    if (!project) return;
    try {
      await projectApi.update(project.id, { target_qty: Math.max(1, targetQtyInput) });
      setIsEditingQty(false);
      showToast('✔ 已更新目标套数并重新计算用量', 'success');
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

  // 提取项目缺料采购清单
  const handleOpenPurchase = async () => {
    if (!project) return;
    try {
      const res = await projectApi.getPurchaseList(project.id);
      if (res.success && res.data) {
        setPurchaseData(res.data);
        setPurchaseModalOpen(true);
      }
    } catch (err: any) {
      showToast('获取采购清单失败: ' + err.message, 'error');
    }
  };

  if (!isOpen || !projectId) return null;

  const readiness = project?.readinessPercent || 0;
  const isCompleted = project?.status === 'COMPLETED';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface border border-border-subtle rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* 顶部标题与齐套大盘 */}
        <div className="px-6 py-4 border-b border-border-subtle bg-canvas/40 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center">
              <FolderGit2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-text-main">{project?.name || '项目套料管理'}</h3>
                {isCompleted ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 border border-emerald-500/30">
                    已完工消库
                  </span>
                ) : readiness >= 100 ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 border border-emerald-500/30">
                    齐套待焊
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 border border-amber-500/30">
                    备料中 ({readiness}%)
                  </span>
                )}
              </div>
              <p className="text-xs text-text-muted mt-0.5">{project?.description || '暂无项目说明'}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* 打样套数倍数显示与修改 */}
            <div className="flex items-center gap-1.5 text-xs text-text-muted bg-surface px-3 py-1.5 rounded-xl border border-border-subtle">
              <span>制作目标:</span>
              {isEditingQty ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    value={targetQtyInput}
                    onChange={(e) => setTargetQtyInput(parseInt(e.target.value, 10) || 1)}
                    className="w-12 bg-canvas border border-border-subtle rounded px-1.5 py-0.5 text-xs text-text-main text-center font-mono"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleUpdateTargetQty}
                    className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
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
                  className="font-bold font-mono text-accent cursor-pointer hover:underline flex items-center gap-1"
                  title="点击修改打样套数"
                >
                  <span>{project?.target_qty || 1} 套 (板)</span>
                  <Edit2 className="w-3 h-3 text-text-dim" />
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 齐套率进度大盘与操作按钮栏 */}
        <div className="p-4 border-b border-border-subtle bg-surface flex items-center justify-between gap-4 flex-wrap">
          {/* 进度条与指标 */}
          <div className="flex items-center gap-4 flex-1 min-w-[280px]">
            <div className="flex-1">
              <div className="flex justify-between text-xs mb-1 font-semibold">
                <span className="text-text-main">
                  齐套进度: {project?.ready_items_count || 0} / {project?.total_items_count || 0} 项
                </span>
                <span className={readiness >= 100 ? 'text-emerald-600 font-mono' : 'text-accent font-mono'}>
                  {readiness}%
                </span>
              </div>
              <div className="w-full bg-subtle rounded-full h-2.5 overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-300',
                    readiness >= 100 ? 'bg-emerald-500' : 'bg-accent'
                  )}
                  style={{ width: `${Math.min(100, readiness)}%` }}
                />
              </div>
            </div>

            <div className="text-xs text-text-dim border-l border-border-subtle pl-4 space-y-0.5">
              <div>需备总件数: <strong className="font-mono text-text-main">{project?.totalPiecesDemand || 0}</strong> 件</div>
              <div>已锁定现货: <strong className="font-mono text-emerald-600">{project?.totalPiecesLocked || 0}</strong> 件</div>
            </div>
          </div>

          {/* 快捷操作区 */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="px-3.5 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>添加物料</span>
            </button>

            {!isCompleted && (
              <>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleLockAll}
                  className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>一键智能锁库</span>
                </button>

                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleUnlockAll}
                  className="px-3 py-1.5 bg-subtle hover:bg-surface-hover border border-border-subtle rounded-xl text-xs font-semibold text-text-main flex items-center gap-1.5 transition-colors"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>释放锁定</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenPurchase}
                  className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  <span>缺料采购清单</span>
                </button>

                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleCompleteProject}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
                >
                  <Award className="w-3.5 h-3.5" />
                  <span>完工正式消库</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* 套料清单明细表格 */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="py-20 text-center text-xs text-text-dim flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-accent" />
              <span>加载项目套料明细...</span>
            </div>
          ) : !project?.items || project.items.length === 0 ? (
            <div className="py-20 text-center text-xs text-text-dim space-y-3">
              <div>该项目暂未添加任何元器件物料。</div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                className="px-4 py-2 bg-accent text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>现在添加第一批物料</span>
              </button>
            </div>
          ) : (
            <div className="bg-surface border border-border-subtle rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-canvas border-b border-border-subtle text-text-muted font-semibold">
                    <th className="py-3 px-4 w-[22%]">物料规格 / 型号</th>
                    <th className="py-3 px-3 w-[12%]">封装</th>
                    <th className="py-3 px-3 w-[16%]">原理图位号</th>
                    <th className="py-3 px-3 w-[14%] text-center">需求用量 (单板 x 套数)</th>
                    <th className="py-3 px-3 w-[14%] text-center">锁定 / 缺料状态</th>
                    <th className="py-3 px-4 w-[14%] text-right">在库货位 & 操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {project.items.map((it) => {
                    const isReady = it.is_ready;
                    const hasShortage = (it.shortage_qty || 0) > 0;

                    return (
                      <tr key={it.id} className="hover:bg-surface-hover/60 transition-colors">
                        {/* 型号 */}
                        <td className="py-3 px-4 font-semibold text-text-main align-top">
                          <div>{it.part_name}</div>
                          {it.comp_lcsc && (
                            <div className="text-[10px] text-text-dim font-mono mt-0.5">
                              C号: {it.comp_lcsc}
                            </div>
                          )}
                        </td>

                        {/* 封装 */}
                        <td className="py-3 px-3 font-mono text-text-muted align-top whitespace-nowrap">
                          {it.package ? (
                            <span
                              className="inline-block whitespace-nowrap max-w-[120px] truncate align-middle px-1.5 py-0.5 bg-canvas border border-border-subtle rounded-[2px] text-[11px] font-mono text-text-muted font-bold"
                              title={it.package}
                            >
                              {it.package}
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>

                        {/* 位号 */}
                        <td className="py-3 px-3 font-mono text-text-muted align-top break-all">
                          {it.designators || '-'}
                        </td>

                        {/* 用量 */}
                        <td className="py-3 px-3 text-center align-top">
                          <div className="font-mono font-bold text-text-main">
                            {it.total_demand_qty} 件
                          </div>
                          <div className="text-[10px] text-text-dim font-mono">
                            (单板: {it.unit_demand_qty})
                          </div>
                        </td>

                        {/* 状态徽标 */}
                        <td className="py-3 px-3 text-center align-top space-y-1">
                          {isReady ? (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 border border-emerald-500/30">
                              🟩 已齐套 (锁定 {it.locked_qty})
                            </span>
                          ) : it.locked_qty > 0 ? (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 border border-amber-500/30">
                              🟨 部分锁定 ({it.locked_qty}/{it.total_demand_qty})
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-700 border border-rose-500/30">
                              🟥 缺料 {it.shortage_qty} 件
                            </span>
                          )}
                          {hasShortage && it.locked_qty > 0 && (
                            <div className="text-[10px] text-rose-600 font-mono">
                              尚缺 {it.shortage_qty} 件
                            </div>
                          )}
                        </td>

                        {/* 货位 & 操作 */}
                        <td className="py-3 px-4 text-right align-top space-y-1">
                          <div className="text-[11px] text-text-dim">
                            📦 {it.comp_location || '未入库'}
                          </div>
                          <div className="flex items-center justify-end gap-1.5 pt-1">
                            {it.locked_qty > 0 && !isCompleted && (
                              <button
                                type="button"
                                onClick={() => handleUnlockSingle(it.component_id)}
                                className="p-1 rounded text-text-dim hover:text-amber-600 hover:bg-amber-50 transition-colors"
                                title="释放该项锁定"
                              >
                                <Unlock className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {!isCompleted && (
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(it.id)}
                                className="p-1 rounded text-text-dim hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                title="从项目移除该项"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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
          )}
        </div>
      </div>

      {/* 添加物料弹窗 */}
      <AddProjectItemModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        projectId={project?.id || 0}
        projectTargetQty={project?.target_qty || 1}
        onSuccess={() => {
          if (project) loadProjectDetail(project.id);
          onProjectUpdated?.();
        }}
      />

      {/* 缺料采购清单弹窗 */}
      {purchaseModalOpen && purchaseData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface border border-border-subtle rounded-2xl w-full max-w-xl p-5 shadow-2xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
              <h4 className="font-bold text-sm text-text-main flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-accent" />
                <span>「{purchaseData.projectName}」缺料采购清单</span>
              </h4>
              <button
                type="button"
                onClick={() => setPurchaseModalOpen(false)}
                className="p-1 rounded hover:bg-subtle text-text-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-text-muted">
              共缺 <strong className="text-rose-600 font-mono">{purchaseData.shortages?.length || 0}</strong> 种物料。可一键复制下方立创商城批量导入编码：
            </p>

            <textarea
              readOnly
              rows={8}
              value={purchaseData.batchOrderText || '（暂无缺料数据）'}
              className="w-full font-mono text-xs p-3 rounded-xl border border-border-subtle bg-canvas/40 text-text-main focus:outline-none"
            />

            <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(purchaseData.batchOrderText || '');
                  showToast('✔ 采购编码已复制到剪贴板！', 'success');
                }}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>复制立创采购编码</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
