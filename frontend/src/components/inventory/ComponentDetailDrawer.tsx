import React, { useEffect, useState } from 'react';
import { useInventoryStore } from '../../store/useInventoryStore';
import { useToastStore } from '../../store/useToastStore';
import { componentApi } from '../../api/componentApi';
import {
  ComponentItem,
  ComponentSubstituteItem,
  ProjectAllocationItem,
  StockLogItem,
} from '../../types/component';
import { Drawer } from '../ui/Drawer';
import { LcscCalibrationModal } from './LcscCalibrationModal';
import { BindSubstituteModal } from './BindSubstituteModal';
import {
  ExternalLink,
  Trash2,
  Plus,
  Minus,
  Save,
  Box,
  Sparkles,
  Link2,
  FileText,
  Clock,
  Layers,
  Cpu,
  Zap,
  Tag,
  CheckCircle2,
  AlertCircle,
  Unlink,
  Eye,
  RefreshCw,
  FolderGit2,
  History,
  ShieldAlert,
} from 'lucide-react';

export const ComponentDetailDrawer: React.FC = () => {
  const {
    selectedComponentId,
    setSelectedComponentId,
    fetchComponents,
    fetchStats,
    components,
  } = useInventoryStore();
  const { showToast } = useToastStore();

  const [item, setItem] = useState<ComponentItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'specs' | 'substitutes' | 'projects' | 'logs'>('specs');

  // 模态框控制
  const [isCalibrationOpen, setIsCalibrationOpen] = useState(false);
  const [isBindSubstituteOpen, setIsBindSubstituteOpen] = useState(false);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [item?.image_url]);

  // 表单编辑字段
  const [editingNotes, setEditingNotes] = useState('');
  const [editingLocation, setEditingLocation] = useState('');
  const [editingQty, setEditingQty] = useState(0);
  const [editingMinStock, setEditingMinStock] = useState<number | ''>('');
  const [adjustNote, setAdjustNote] = useState('');
  const [savingBasic, setSavingBasic] = useState(false);

  // 替代料数据
  const [substitutes, setSubstitutes] = useState<{
    pinned: ComponentSubstituteItem[];
    auto: ComponentSubstituteItem[];
  }>({ pinned: [], auto: [] });
  const [loadingSubs, setLoadingSubs] = useState(false);

  // 项目占用数据
  const [allocations, setAllocations] = useState<ProjectAllocationItem[]>([]);
  const [loadingAllocs, setLoadingAllocs] = useState(false);

  // 流转履历
  const [logs, setLogs] = useState<StockLogItem[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // 加载元器件核心信息
  const loadDetail = (id: number) => {
    setLoading(true);
    componentApi
      .getById(id)
      .then((res) => {
        if (res.success && res.data) {
          setItem(res.data);
          setEditingNotes(res.data.notes || '');
          setEditingLocation(res.data.location || '');
          setEditingQty(res.data.quantity);
          setEditingMinStock(
            res.data.min_stock !== null && res.data.min_stock !== undefined
              ? res.data.min_stock
              : ''
          );
        }
      })
      .catch((err) => {
        showToast('获取物料详情失败: ' + err.message, 'error');
      })
      .finally(() => setLoading(false));
  };

  // 加载替代料
  const loadSubstitutes = (id: number) => {
    setLoadingSubs(true);
    componentApi
      .getSubstitutes(id)
      .then((res) => {
        if (res.success && res.data) {
          setSubstitutes(res.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingSubs(false));
  };

  // 加载项目占用
  const loadAllocations = (id: number) => {
    setLoadingAllocs(true);
    componentApi
      .getProjectAllocations(id)
      .then((res) => {
        if (res.success && res.data) {
          setAllocations(res.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingAllocs(false));
  };

  // 加载出入库日志
  const loadLogs = (id: number) => {
    setLoadingLogs(true);
    componentApi
      .getLogs(id)
      .then((res) => {
        if (res.success && res.data) {
          setLogs(res.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingLogs(false));
  };

  useEffect(() => {
    if (!selectedComponentId) {
      setItem(null);
      return;
    }
    setActiveTab('specs');
    loadDetail(selectedComponentId);
    loadSubstitutes(selectedComponentId);
    loadAllocations(selectedComponentId);
    loadLogs(selectedComponentId);
  }, [selectedComponentId]);

  // 保存基础属性修改
  const handleSaveBasic = async () => {
    if (!item) return;
    setSavingBasic(true);
    try {
      await componentApi.update(item.id, {
        notes: editingNotes,
        location: editingLocation,
        quantity: editingQty,
        min_stock: editingMinStock === '' ? null : Number(editingMinStock),
      });

      // 如果修改了数量且输入了说明，记录一条日志
      if (editingQty !== item.quantity && adjustNote) {
        // 后端 update 会处理或者 adjust
      }

      showToast('已更新物料信息', 'success');
      fetchComponents();
      fetchStats();
      loadDetail(item.id);
      loadLogs(item.id);
    } catch (err: any) {
      showToast('保存失败: ' + err.message, 'error');
    } finally {
      setSavingBasic(false);
    }
  };

  // 就地微调库存
  const handleQuickAdjust = async (delta: number) => {
    if (!item) return;
    try {
      await componentApi.adjustQuantity(item.id, delta, adjustNote || undefined);
      showToast(`库存已调整 (${delta > 0 ? `+${delta}` : delta})`, 'success');
      setAdjustNote('');
      fetchComponents();
      fetchStats();
      loadDetail(item.id);
      loadLogs(item.id);
    } catch (err: any) {
      showToast('微调库存失败: ' + err.message, 'error');
    }
  };

  // 解绑替代料
  const handleUnbindSubstitute = async (subId: number) => {
    if (!item) return;
    try {
      await componentApi.unbindSubstitute(item.id, subId);
      showToast('已解绑平替物料', 'success');
      loadSubstitutes(item.id);
    } catch (err: any) {
      showToast('解绑失败: ' + err.message, 'error');
    }
  };

  // 将系统自动推荐平替设为固定平替
  const handlePinAutoSubstitute = async (cand: ComponentSubstituteItem) => {
    if (!item) return;
    try {
      const reasonNote = cand.match_reasons?.join('; ') || '系统推算电气兼容料';
      await componentApi.bindSubstitute(item.id, cand.id, reasonNote);
      showToast('已将该兼容料设为固定平替', 'success');
      loadSubstitutes(item.id);
    } catch (err: any) {
      showToast('设置失败: ' + err.message, 'error');
    }
  };

  // 删除物料
  const handleDelete = async () => {
    if (!item || !window.confirm(`确认删除元器件 "${item.name}" 吗？此操作无法撤销。`)) return;
    try {
      await componentApi.delete(item.id);
      showToast('已删除元器件', 'success');
      fetchComponents();
      fetchStats();
      setSelectedComponentId(null);
    } catch (err: any) {
      showToast('删除失败: ' + err.message, 'error');
    }
  };

  const cNum = item?.lcsc_part ? item.lcsc_part.toUpperCase().trim() : null;
  const lcscUrl =
    cNum ? `https://item.szlcsc.com/${cNum.replace('C', '')}.html` : null;

  // 收纳盒建议
  const existingLocations = Array.from(
    new Set(components.map((c) => c.location).filter(Boolean))
  ).slice(0, 6);

  // 格式化时间
  const formatTime = (timeStr?: string) => {
    if (!timeStr) return '-';
    return timeStr.replace('T', ' ').slice(0, 16);
  };

  const totalSubsCount = substitutes.pinned.length + substitutes.auto.length;

  return (
    <Drawer
      isOpen={!!selectedComponentId}
      onClose={() => setSelectedComponentId(null)}
      maxWidth="max-w-xl"
      title={
        <div className="flex items-center gap-2">
          <span className="truncate max-w-[280px]">{item?.name || '物料全生命周期档案'}</span>
          {item?.category && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-accent/15 text-accent flex-shrink-0">
              {item.category}
            </span>
          )}
        </div>
      }
      subtitle={
        <div className="flex items-center gap-2 text-[11px] text-text-dim">
          <span>ID: #{item?.id}</span>
          {item?.manufacturer && <span>• 品牌: {item.manufacturer}</span>}
          {item?.package && <span>• 封装: {item.package}</span>}
        </div>
      }
      footer={
        <div className="flex items-center justify-between w-full">
          <button
            type="button"
            onClick={handleDelete}
            className="text-xs text-rose-500 hover:text-rose-600 flex items-center gap-1.5 px-3 py-2 rounded-xl hover:bg-rose-500/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>删除物料</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedComponentId(null)}
              className="px-3 py-2 rounded-xl text-xs text-text-dim hover:text-text-main hover:bg-subtle transition-colors"
            >
              关闭
            </button>
            <button
              type="button"
              onClick={handleSaveBasic}
              disabled={savingBasic}
              className="bg-accent text-white font-semibold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-sm active:scale-95 transition-all disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingBasic ? '保存中...' : '保存变更'}</span>
            </button>
          </div>
        </div>
      }
    >
      {loading ? (
        <div className="py-24 text-center space-y-3">
          <RefreshCw className="w-7 h-7 text-accent animate-spin mx-auto opacity-70" />
          <p className="text-xs text-text-dim">加载物料规格与全维档案中...</p>
        </div>
      ) : item ? (
        <div className="space-y-4 text-xs">
          {/* 1. 顶部 Header 强化看板 */}
          <div className="p-4 bg-surface-subtle border border-border-subtle rounded-2xl space-y-3">
            <div className="flex items-start gap-3.5">
              {/* 实物缩略图 */}
              {item.image_url && !imgError ? (
                <div className="w-20 h-20 rounded-xl bg-white border border-border-subtle flex-shrink-0 flex items-center justify-center p-1 overflow-hidden relative group">
                  <img
                    src={item.image_url}
                    alt={item.name}
                    referrerPolicy="no-referrer"
                    onError={() => setImgError(true)}
                    className="max-h-full max-w-full object-contain mix-blend-multiply"
                  />
                  <a
                    href={item.image_url}
                    target="_blank"
                    rel="noreferrer"
                    className="absolute inset-0 bg-black/40 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-xl"
                  >
                    <Eye className="w-4 h-4" />
                  </a>
                </div>
              ) : (
                <div className="w-20 h-20 rounded-xl bg-subtle border border-border-subtle flex-shrink-0 flex items-center justify-center text-text-dim">
                  <Cpu className="w-8 h-8 opacity-40" />
                </div>
              )}

              {/* 核心型号与直通动作 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-semibold text-sm text-text-main leading-snug break-words">
                    {item.name}
                  </h4>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {cNum && (
                    <span className="font-mono font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-lg text-[11px] border border-accent/20">
                      {cNum}
                    </span>
                  )}
                  {item.manufacturer && (
                    <span className="px-2 py-0.5 rounded-lg bg-subtle border border-border-subtle text-[11px] text-text-dim font-medium">
                      {item.manufacturer}
                    </span>
                  )}
                  {item.package && (
                    <span className="px-2 py-0.5 rounded-lg bg-subtle border border-border-subtle text-[11px] text-text-dim font-mono">
                      {item.package}
                    </span>
                  )}
                </div>

                {/* 立创直通与官方规格书 */}
                <div className="flex items-center gap-2 mt-2.5">
                  {lcscUrl && (
                    <a
                      href={lcscUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-accent hover:underline flex items-center gap-1 font-medium"
                    >
                      <span>立创商城</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}

                  {item.datasheet_url && (
                    <a
                      href={item.datasheet_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-emerald-600 hover:underline flex items-center gap-1 font-medium"
                    >
                      <span>官方数据手册 (PDF)</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* ⚡ 立创官方校准按钮 */}
            <div className="pt-2 border-t border-border-subtle/80 flex items-center justify-between">
              <span className="text-[11px] text-text-dim">
                数据有误或信息单薄？可一键从立创官方库智能纠偏
              </span>
              <button
                type="button"
                onClick={() => setIsCalibrationOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-accent text-white font-semibold text-xs flex items-center gap-1.5 hover:opacity-95 active:scale-95 transition-all shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>立创官方校准</span>
              </button>
            </div>
          </div>

          {/* 2. 库存三色指标条 (总库存 / 锁定数 / 可用自由库存) */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="p-3 bg-subtle/60 rounded-xl border border-border-subtle text-center">
              <span className="text-[10px] text-text-dim block mb-0.5">现有在库总数</span>
              <div className="font-mono text-base font-bold text-text-main">
                {item.quantity.toLocaleString()}
              </div>
            </div>

            <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20 text-center">
              <span className="text-[10px] text-amber-700 dark:text-amber-400 block mb-0.5">制作项目预锁定</span>
              <div className="font-mono text-base font-bold text-amber-600 dark:text-amber-400">
                {(item.locked_quantity || 0).toLocaleString()}
              </div>
            </div>

            <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-center">
              <span className="text-[10px] text-emerald-700 dark:text-emerald-400 block mb-0.5">实际可用余量</span>
              <div className="font-mono text-base font-bold text-emerald-600 dark:text-emerald-400">
                {(item.available_quantity ?? item.quantity).toLocaleString()}
              </div>
            </div>
          </div>

          {/* 3. 现代化 Tabs 选项卡 */}
          <div className="flex items-center gap-1 p-1 bg-subtle/70 rounded-xl border border-border-subtle">
            <button
              type="button"
              onClick={() => setActiveTab('specs')}
              className={`flex-1 py-1.5 rounded-lg font-medium text-xs transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'specs'
                  ? 'bg-surface text-text-main shadow-xs font-semibold'
                  : 'text-text-dim hover:text-text-main'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>规格与仓位</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('substitutes')}
              className={`flex-1 py-1.5 rounded-lg font-medium text-xs transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'substitutes'
                  ? 'bg-surface text-text-main shadow-xs font-semibold'
                  : 'text-text-dim hover:text-text-main'
              }`}
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>替代料推荐</span>
              {totalSubsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-accent/20 text-accent font-mono font-bold">
                  {totalSubsCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('projects')}
              className={`flex-1 py-1.5 rounded-lg font-medium text-xs transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'projects'
                  ? 'bg-surface text-text-main shadow-xs font-semibold'
                  : 'text-text-dim hover:text-text-main'
              }`}
            >
              <FolderGit2 className="w-3.5 h-3.5" />
              <span>项目占用</span>
              {allocations.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/20 text-amber-600 font-mono font-bold">
                  {allocations.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('logs')}
              className={`flex-1 py-1.5 rounded-lg font-medium text-xs transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'logs'
                  ? 'bg-surface text-text-main shadow-xs font-semibold'
                  : 'text-text-dim hover:text-text-main'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>流转履历</span>
            </button>
          </div>

          {/* 4. Tab 内容渲染 */}

          {/* TAB 1: 规格与仓位微调 */}
          {activeTab === 'specs' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* 动态自适应参数网格 (区别阻容 vs 芯片/模块) */}
              <div>
                <span className="text-[11px] font-semibold text-text-dim block mb-2">
                  核心电气与物理参数
                </span>

                {item.category === '电阻' ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2.5 bg-surface rounded-xl border border-border-subtle">
                      <span className="text-[10px] text-text-dim">阻值</span>
                      <div className="font-mono font-semibold text-text-main mt-0.5">
                        {item.value || '-'}
                      </div>
                    </div>
                    <div className="p-2.5 bg-surface rounded-xl border border-border-subtle">
                      <span className="text-[10px] text-text-dim">封装</span>
                      <div className="font-mono font-semibold text-text-main mt-0.5">
                        {item.package || '-'}
                      </div>
                    </div>
                    <div className="p-2.5 bg-surface rounded-xl border border-border-subtle">
                      <span className="text-[10px] text-text-dim">精度容差</span>
                      <div className="text-text-main mt-0.5">{item.tolerance || '-'}</div>
                    </div>
                    <div className="p-2.5 bg-surface rounded-xl border border-border-subtle">
                      <span className="text-[10px] text-text-dim">额定功率/耐压</span>
                      <div className="text-text-main mt-0.5">
                        {item.voltage ? `${item.voltage}V` : '-'}
                      </div>
                    </div>
                  </div>
                ) : item.category === '电容' ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2.5 bg-surface rounded-xl border border-border-subtle">
                      <span className="text-[10px] text-text-dim">标称容值</span>
                      <div className="font-mono font-semibold text-text-main mt-0.5">
                        {item.value || '-'}
                      </div>
                    </div>
                    <div className="p-2.5 bg-surface rounded-xl border border-border-subtle">
                      <span className="text-[10px] text-text-dim">额定耐压</span>
                      <div className="font-mono font-semibold text-accent mt-0.5">
                        {item.voltage ? `${item.voltage}V` : '-'}
                      </div>
                    </div>
                    <div className="p-2.5 bg-surface rounded-xl border border-border-subtle">
                      <span className="text-[10px] text-text-dim">封装</span>
                      <div className="font-mono font-semibold text-text-main mt-0.5">
                        {item.package || '-'}
                      </div>
                    </div>
                    <div className="p-2.5 bg-surface rounded-xl border border-border-subtle">
                      <span className="text-[10px] text-text-dim">介质/容差</span>
                      <div className="text-text-main mt-0.5">{item.tolerance || '-'}</div>
                    </div>
                  </div>
                ) : ['芯片', '模块'].includes(item.category) ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2.5 bg-surface rounded-xl border border-border-subtle col-span-2">
                      <span className="text-[10px] text-text-dim">芯片原厂型号</span>
                      <div className="font-mono font-bold text-accent text-sm mt-0.5">
                        {item.value || item.name}
                      </div>
                    </div>
                    <div className="p-2.5 bg-surface rounded-xl border border-border-subtle">
                      <span className="text-[10px] text-text-dim">封装形式</span>
                      <div className="font-mono font-semibold text-text-main mt-0.5">
                        {item.package || '-'}
                      </div>
                    </div>
                    <div className="p-2.5 bg-surface rounded-xl border border-border-subtle">
                      <span className="text-[10px] text-text-dim">原厂品牌</span>
                      <div className="font-semibold text-text-main mt-0.5">
                        {item.manufacturer || '-'}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2.5 bg-surface rounded-xl border border-border-subtle">
                      <span className="text-[10px] text-text-dim">规格/特征值</span>
                      <div className="font-mono font-semibold text-text-main mt-0.5">
                        {item.value || '-'}
                      </div>
                    </div>
                    <div className="p-2.5 bg-surface rounded-xl border border-border-subtle">
                      <span className="text-[10px] text-text-dim">封装</span>
                      <div className="font-mono font-semibold text-text-main mt-0.5">
                        {item.package || '-'}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 存放收纳盒 */}
              <div>
                <label className="block text-text-dim mb-1 font-medium flex items-center justify-between">
                  <span>📦 存放收纳盒位置</span>
                </label>
                <input
                  type="text"
                  value={editingLocation}
                  onChange={(e) => setEditingLocation(e.target.value)}
                  className="w-full bg-surface border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-main focus:outline-none focus:border-accent"
                  placeholder="例如: 默认电阻盒, 抽屉A-01"
                />

                {/* 快速药丸 */}
                {existingLocations.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {existingLocations.map((loc) => (
                      <button
                        key={loc}
                        type="button"
                        onClick={() => setEditingLocation(loc)}
                        className={`text-[11px] px-2 py-0.5 rounded-lg border transition-all ${
                          editingLocation === loc
                            ? 'bg-accent/15 border-accent text-accent font-semibold'
                            : 'bg-subtle/50 border-border-subtle text-text-dim hover:text-text-main'
                        }`}
                      >
                        {loc}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 库存快速增减与就地调整 */}
              <div className="p-3 bg-surface rounded-xl border border-border-subtle space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text-main">库存数量管理</span>
                  <span className="text-[11px] text-text-dim">可点击步进或手动改写</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleQuickAdjust(-10)}
                    className="px-2.5 py-1.5 rounded-lg bg-subtle hover:bg-surface-hover border border-border-subtle font-mono text-xs font-semibold text-text-dim"
                  >
                    -10
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickAdjust(-1)}
                    className="px-2.5 py-1.5 rounded-lg bg-subtle hover:bg-surface-hover border border-border-subtle font-mono text-xs font-semibold text-text-dim"
                  >
                    -1
                  </button>

                  <input
                    type="number"
                    value={editingQty}
                    onChange={(e) => setEditingQty(parseInt(e.target.value, 10) || 0)}
                    className="flex-1 bg-surface-subtle border border-border-subtle rounded-xl px-2 py-1.5 text-center text-sm font-mono font-bold text-text-main focus:outline-none focus:border-accent"
                  />

                  <button
                    type="button"
                    onClick={() => handleQuickAdjust(1)}
                    className="px-2.5 py-1.5 rounded-lg bg-subtle hover:bg-surface-hover border border-border-subtle font-mono text-xs font-semibold text-text-dim"
                  >
                    +1
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickAdjust(10)}
                    className="px-2.5 py-1.5 rounded-lg bg-subtle hover:bg-surface-hover border border-border-subtle font-mono text-xs font-semibold text-text-dim"
                  >
                    +10
                  </button>
                </div>

                <input
                  type="text"
                  value={adjustNote}
                  onChange={(e) => setAdjustNote(e.target.value)}
                  placeholder="调整变动原因（选填，如：打样损耗 2 片、到货补仓）"
                  className="w-full bg-surface-subtle border border-border-subtle rounded-lg px-2.5 py-1 text-[11px] text-text-main focus:outline-none focus:border-accent"
                />
              </div>

              {/* 低库存安全阈值 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-text-dim mb-1 font-medium">
                    安全库存预警值
                  </label>
                  <input
                    type="number"
                    value={editingMinStock}
                    onChange={(e) =>
                      setEditingMinStock(e.target.value === '' ? '' : parseInt(e.target.value, 10))
                    }
                    placeholder="留空为系统默认"
                    className="w-full bg-surface border border-border-subtle rounded-xl px-3 py-2 text-xs font-mono text-text-main focus:outline-none focus:border-accent"
                  />
                </div>
                <div className="flex items-center text-[11px] text-text-dim pt-4">
                  当前预警阈值:{' '}
                  <span className="font-mono font-bold ml-1 text-text-main">
                    {item.effective_min_stock} 件
                  </span>
                </div>
              </div>

              {/* 备注与应用场景 */}
              <div>
                <label className="block text-text-dim mb-1 font-medium">应用场景与设计笔记</label>
                <textarea
                  rows={3}
                  value={editingNotes}
                  onChange={(e) => setEditingNotes(e.target.value)}
                  className="w-full bg-surface border border-border-subtle rounded-xl p-3 text-xs text-text-main focus:outline-none focus:border-accent resize-none"
                  placeholder="例如: 常用LED限流, I2C总线上拉电阻..."
                />
              </div>
            </div>
          )}

          {/* TAB 2: 🔄 替代料推荐与平替绑定 */}
          {activeTab === 'substitutes' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-text-main text-xs flex items-center gap-1.5">
                    <span>工坊平替与同系备料推荐</span>
                  </h4>
                  <p className="text-[11px] text-text-dim">
                    缺料或打样时，可在库直接替换使用，无需重复采购
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsBindSubstituteOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-accent text-white font-semibold text-xs flex items-center gap-1 shadow-sm hover:opacity-90 active:scale-95 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>绑定工坊平替</span>
                </button>
              </div>

              {loadingSubs ? (
                <div className="py-16 text-center text-text-dim text-xs">
                  正在检索工坊兼容替代料...
                </div>
              ) : (
                <div className="space-y-4">
                  {/* 用户已绑定的专属平替 */}
                  <div>
                    <span className="text-[11px] font-semibold text-text-dim block mb-2 flex items-center gap-1">
                      <Link2 className="w-3 h-3 text-accent" />
                      <span>已指定绑定的平替物料 ({substitutes.pinned.length})</span>
                    </span>

                    {substitutes.pinned.length === 0 ? (
                      <div className="p-3 bg-surface rounded-xl border border-dashed border-border-subtle text-center text-text-dim text-xs">
                        暂未指定专属平替，点击右上角「绑定工坊平替」可添加
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {substitutes.pinned.map((sub) => (
                          <div
                            key={sub.id}
                            className="p-3 bg-surface rounded-xl border border-accent/20 flex items-start justify-between gap-3 shadow-xs"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-xs text-text-main truncate">
                                  {sub.name}
                                </span>
                                {sub.lcsc_part && (
                                  <span className="font-mono text-[10px] text-accent bg-accent/10 px-1 rounded">
                                    {sub.lcsc_part}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-[11px] text-text-dim mt-1">
                                <span>封装: {sub.package || '-'}</span>
                                <span className="text-emerald-600 font-medium">
                                  可用: {sub.available_quantity ?? sub.quantity} 件
                                </span>
                                {sub.location && <span>盒位: {sub.location}</span>}
                              </div>
                              {sub.rule_note && (
                                <div className="mt-1.5 text-[11px] text-accent font-medium bg-accent/5 px-2 py-0.5 rounded-md inline-block">
                                  替代备注: {sub.rule_note}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setSelectedComponentId(sub.id)}
                                className="p-1.5 rounded-lg text-text-dim hover:text-accent hover:bg-accent/10 transition-colors"
                                title="查看物料档案"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUnbindSubstitute(sub.id)}
                                className="p-1.5 rounded-lg text-text-dim hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                                title="解除平替绑定"
                              >
                                <Unlink className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 系统智能推算兼容料 */}
                  <div>
                    <span className="text-[11px] font-semibold text-text-dim block mb-2 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-emerald-500" />
                      <span>系统智能推算兼容料 ({substitutes.auto.length})</span>
                    </span>

                    {substitutes.auto.length === 0 ? (
                      <div className="p-3 bg-surface rounded-xl border border-dashed border-border-subtle text-center text-text-dim text-xs">
                        未在工坊库存中匹配到符合电气规则的同类替代物料
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {substitutes.auto.map((cand) => (
                          <div
                            key={cand.id}
                            className="p-3 bg-surface rounded-xl border border-border-subtle hover:border-border-strong flex items-start justify-between gap-3 transition-colors"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-xs text-text-main truncate">
                                  {cand.name}
                                </span>
                                {cand.lcsc_part && (
                                  <span className="font-mono text-[10px] text-text-dim bg-subtle px-1 rounded">
                                    {cand.lcsc_part}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-[11px] text-text-dim mt-1">
                                <span>封装: {cand.package || '-'}</span>
                                <span className="text-emerald-600 font-semibold">
                                  可用: {cand.available_quantity ?? cand.quantity} 件
                                </span>
                                {cand.location && <span>盒位: {cand.location}</span>}
                              </div>

                              {cand.match_reasons && cand.match_reasons.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {cand.match_reasons.map((r, i) => (
                                    <span
                                      key={i}
                                      className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium"
                                    >
                                      {r}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handlePinAutoSubstitute(cand)}
                                className="px-2 py-1 rounded-lg bg-subtle hover:bg-accent/15 hover:text-accent border border-border-subtle text-[11px] font-medium transition-colors"
                                title="固定为常用平替"
                              >
                                设为平替
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedComponentId(cand.id)}
                                className="p-1.5 rounded-lg text-text-dim hover:text-accent hover:bg-subtle transition-colors"
                                title="切换查看"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: 📁 制作项目占用 */}
          {activeTab === 'projects' && (
            <div className="space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-text-main text-xs">制作项目占用清单</h4>
                  <p className="text-[11px] text-text-dim">
                    查看当前物料被哪些进行中的制作项目锁定与占用
                  </p>
                </div>
                <span className="text-xs text-text-dim">
                  共占用:{' '}
                  <span className="font-mono font-bold text-amber-600">
                    {item.locked_quantity || 0} 件
                  </span>
                </span>
              </div>

              {loadingAllocs ? (
                <div className="py-16 text-center text-text-dim text-xs">加载项目明细中...</div>
              ) : allocations.length === 0 ? (
                <div className="p-6 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl text-center space-y-1">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto opacity-80" />
                  <p className="font-semibold text-xs text-emerald-700 dark:text-emerald-400">
                    当前无项目占用此物料
                  </p>
                  <p className="text-[11px] text-text-dim">
                    全部现有库存（{item.quantity} 件）均可自由支配使用
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {allocations.map((alloc) => (
                    <div
                      key={alloc.item_id}
                      className="p-3 bg-surface rounded-xl border border-border-subtle space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-text-main">
                            {alloc.project_name}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              alloc.project_status === 'READY'
                                ? 'bg-emerald-500/15 text-emerald-600'
                                : 'bg-amber-500/15 text-amber-600'
                            }`}
                          >
                            {alloc.project_status === 'READY'
                              ? '已齐套'
                              : alloc.project_status === 'BUILDING'
                              ? '焊接制作中'
                              : '备料中'}
                          </span>
                        </div>
                        <span className="text-[11px] text-text-dim">
                          目标: {alloc.target_qty} 套
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] bg-subtle/50 p-2 rounded-lg">
                        <div>
                          <span className="text-text-dim">套料锁定: </span>
                          <span className="font-mono font-bold text-amber-600">
                            {alloc.locked_qty}
                          </span>
                          <span className="text-text-dim"> / {alloc.total_demand_qty} 件</span>
                        </div>
                        {alloc.designators && (
                          <div className="truncate text-text-dim">
                            位号: <span className="font-mono text-text-main">{alloc.designators}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: 📜 流转履历 */}
          {activeTab === 'logs' && (
            <div className="space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-text-main text-xs">出入库与操作流水</h4>
                  <p className="text-[11px] text-text-dim">完整的审计与变动历史</p>
                </div>
              </div>

              {loadingLogs ? (
                <div className="py-16 text-center text-text-dim text-xs">加载流水日志中...</div>
              ) : logs.length === 0 ? (
                <div className="py-16 text-center text-text-dim text-xs">暂无历史流转记录</div>
              ) : (
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {logs.map((log) => {
                    const isPositive = log.change_qty > 0;
                    const isZero = log.change_qty === 0;

                    return (
                      <div
                        key={log.id}
                        className="p-2.5 bg-surface rounded-xl border border-border-subtle flex items-start justify-between gap-3 text-xs"
                      >
                        <div className="space-y-0.5 min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                                log.action_type === 'ENTRY'
                                  ? 'bg-blue-500/15 text-blue-600'
                                  : log.action_type === 'CALIBRATE'
                                  ? 'bg-purple-500/15 text-purple-600'
                                  : log.action_type === 'RESTOCK'
                                  ? 'bg-emerald-500/15 text-emerald-600'
                                  : log.action_type === 'COMPLETED'
                                  ? 'bg-rose-500/15 text-rose-600'
                                  : 'bg-subtle text-text-dim'
                              }`}
                            >
                              {log.action_type === 'ENTRY'
                                ? '初始录入'
                                : log.action_type === 'CALIBRATE'
                                ? '官方校准'
                                : log.action_type === 'RESTOCK'
                                ? '入库补仓'
                                : log.action_type === 'COMPLETED'
                                ? '完工消库'
                                : log.action_type === 'STEPPER'
                                ? '就地调整'
                                : log.action_type}
                            </span>
                            <span className="text-[10px] text-text-dim">
                              {formatTime(log.created_at)}
                            </span>
                          </div>

                          <div className="text-[11px] text-text-main truncate mt-1">
                            {log.note || '无详细备注'}
                          </div>
                        </div>

                        <div className="text-right flex-shrink-0">
                          <div
                            className={`font-mono font-bold text-xs ${
                              isZero
                                ? 'text-text-dim'
                                : isPositive
                                ? 'text-emerald-600'
                                : 'text-rose-500'
                            }`}
                          >
                            {isZero ? '0' : isPositive ? `+${log.change_qty}` : log.change_qty}
                          </div>
                          <div className="text-[10px] text-text-dim">结存: {log.balance_qty}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}

      {/* 5. 模态框挂载 */}
      {item && (
        <>
          <LcscCalibrationModal
            isOpen={isCalibrationOpen}
            onClose={() => setIsCalibrationOpen(false)}
            componentId={item.id}
            initialCPart={item.lcsc_part || ''}
            onSuccess={(updated) => {
              setItem(updated);
              fetchComponents();
              fetchStats();
              loadLogs(updated.id);
            }}
          />

          <BindSubstituteModal
            isOpen={isBindSubstituteOpen}
            onClose={() => setIsBindSubstituteOpen(false)}
            component={item}
            onSuccess={() => loadSubstitutes(item.id)}
          />
        </>
      )}
    </Drawer>
  );
};
