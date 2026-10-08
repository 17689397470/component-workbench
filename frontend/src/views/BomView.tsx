import React, { useState, useRef, useEffect, useMemo } from 'react';
import { bomApi } from '../api/bomApi';
import { projectApi } from '../api/projectApi';
import {
  BomMatchResult,
  BomSummary,
  BomParsedData,
  BomColumnMapping,
  PickListEntry,
  ShortageItem,
} from '../types/bom';
import { useToastStore } from '../store/useToastStore';
import { ManualSubstituteModal } from '../components/ManualSubstituteModal';
import { SubstituteRulesModal } from '../components/SubstituteRulesModal';
import { LcscExportModal } from '../components/LcscExportModal';
import { LocationLocatorModal } from '../components/boxes/LocationLocatorModal';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  RefreshCw,
  AlertTriangle,
  XCircle,
  X,
  Copy,
  Download,
  ClipboardPaste,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  Layers,
  Sparkles,
  Search,
  ShoppingCart,
  Box,
  CheckSquare,
  Square,
  ShieldCheck,
  FolderPlus,
  ArrowRight,
  RotateCcw,
  Compass,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { ComponentItem } from '../types/component';

// 嘉立创EDA标准格式示例数据
const SAMPLE_BOM_TEXT = `器件\t位号\t封装\t数量\t立创编号
100nF 50V\tC1, C2, C3, C4\t0603\t4\tC2057
10µF 16V\tC5, C6\t0805\t2\tC15849
10k 1%\tR1, R2, R3, R4\t0805\t4\tC17414
1k 1%\tR5, R6\t0805\t2\tC17513
4.7k 5%\tR7\t0805\t1\t
AMS1117-3.3\tU1\tSOT-223\t1\tC6186
CH340C\tU2\tSOP-16\t1\tC84681
STM32F103C8T6\tU3\tLQFP-48\t1\tC8734
SS34\tD1\tSMA\t1\tC8678`;

export const BomView: React.FC = () => {
  const { showToast } = useToastStore();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 输入模式：'paste' | 'file'
  const [inputMode, setInputMode] = useState<'paste' | 'file'>('paste');
  const [pasteText, setPasteText] = useState<string>('');
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [comparing, setComparing] = useState(false);

  // 解析与列映射状态
  const [parsedData, setParsedData] = useState<BomParsedData | null>(null);
  const [columnMapping, setColumnMapping] = useState<BomColumnMapping | null>(null);

  // 参数控制
  const [multiplier, setMultiplier] = useState<number>(1);
  const [isAggregated, setIsAggregated] = useState<boolean>(true);

  // 比对结果与状态
  const [results, setResults] = useState<BomMatchResult[]>([]);
  const [summary, setSummary] = useState<BomSummary | null>(null);
  const [pickingList, setPickingList] = useState<Record<string, PickListEntry[]>>({});
  const [shortageList, setShortageList] = useState<ShortageItem[]>([]);
  const [lcscBatchText, setLcscBatchText] = useState<string>('');
  const [humanReadableText, setHumanReadableText] = useState<string>('');

  // 交互与筛选状态
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [checkedPicks, setCheckedPicks] = useState<Set<string>>(new Set());

  // 弹窗状态
  const [manualSubstituteTarget, setManualSubstituteTarget] = useState<BomMatchResult | null>(null);
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const [isLcscModalOpen, setIsLcscModalOpen] = useState(false);
  const [isDeductConfirmOpen, setIsDeductConfirmOpen] = useState(false);
  const [createProjectModalOpen, setCreateProjectModalOpen] = useState(false);
  const [locatorTarget, setLocatorTarget] = useState<{
    location: string;
    name?: string;
    componentId?: number;
  } | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [autoLockStock, setAutoLockStock] = useState(true);

  // 转存为制作项目
  const handleSaveAsProject = async () => {
    if (!newProjectName.trim()) {
      showToast('请输入项目名称', 'warn');
      return;
    }
    const items = results.map((r) => ({
      part_name: r.partName,
      package: r.footprint || '',
      unit_demand_qty: r.unitQty,
      total_demand_qty: r.qtyNeeded,
      component_id: r.matchedStock?.id || r.substituteOption?.component?.id || null,
      designators: r.designators || '',
    }));

    try {
      await projectApi.create(
        {
          name: newProjectName.trim(),
          description: newProjectDesc.trim() || `基于 BOM 比对创建 (${multiplier}套)`,
          target_qty: multiplier,
        },
        items,
        autoLockStock
      );
      showToast(`✔ 成功创建项目「${newProjectName}」并完成自动锁库！`, 'success');
      setCreateProjectModalOpen(false);
      setNewProjectName('');
      setNewProjectDesc('');
    } catch (err: any) {
      showToast('转存项目失败: ' + err.message, 'error');
    }
  };

  // 1. 处理剪贴板文本一键解析
  const handleParseText = async (textToParse?: string) => {
    const text = textToParse !== undefined ? textToParse : pasteText;
    if (!text || !text.trim()) {
      showToast('请先输入或粘贴 BOM 文本内容', 'warn');
      return;
    }
    setParsing(true);
    try {
      const res = await bomApi.parseBomText(text);
      if (res.success && res.data) {
        setParsedData(res.data);
        setColumnMapping(res.data.autoMapping);
        showToast(`✔ 成功识别表头与数据：共 ${res.data.totalRows} 行 [${res.data.detectedTemplate}]`, 'success');
        // 自动立即执行比对
        await executeCompare(res.data.dataRows, res.data.autoMapping, multiplier, isAggregated);
      }
    } catch (err: any) {
      showToast('文本解析失败: ' + err.message, 'error');
    } finally {
      setParsing(false);
    }
  };

  // 2. 处理文件上传解析
  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setParsing(true);
    setFileName(file.name);
    try {
      const res = await bomApi.uploadBomFile(file);
      if (res.success && res.data) {
        setParsedData(res.data);
        setColumnMapping(res.data.autoMapping);
        showToast(`✔ 文件导入成功：共 ${res.data.totalRows} 行 [${res.data.detectedTemplate}]`, 'success');
        await executeCompare(res.data.dataRows, res.data.autoMapping, multiplier, isAggregated);
      }
    } catch (err: any) {
      showToast('文件解析失败: ' + err.message, 'error');
    } finally {
      setParsing(false);
    }
  };

  // 3. 执行比对引擎
  const executeCompare = async (
    rows: any[][],
    mapping: BomColumnMapping,
    mult: number,
    agg: boolean
  ) => {
    setComparing(true);
    try {
      const res = await bomApi.compareBom({
        rows,
        mapping,
        multiplier: mult,
        aggregate: agg,
      });
      if (res.success && res.data) {
        setResults(res.data.results);
        setSummary(res.data.summary);
        setPickingList(res.data.pickingList || {});
        setShortageList(res.data.shortageList || []);
        setLcscBatchText(res.data.lcscBatchText || '');
        setHumanReadableText(res.data.humanReadableListText || '');
        setCheckedPicks(new Set());
      }
    } catch (err: any) {
      showToast('BOM 比对失败: ' + err.message, 'error');
    } finally {
      setComparing(false);
    }
  };

  // 当倍数或聚合模式变化时，自动重新比对
  const handleMultiplierChange = (newMult: number) => {
    const val = Math.max(1, newMult);
    setMultiplier(val);
    if (parsedData && columnMapping) {
      executeCompare(parsedData.dataRows, columnMapping, val, isAggregated);
    }
  };

  const handleAggregateToggle = () => {
    const nextAgg = !isAggregated;
    setIsAggregated(nextAgg);
    if (parsedData && columnMapping) {
      executeCompare(parsedData.dataRows, columnMapping, multiplier, nextAgg);
    }
  };

  const handleMappingChange = (colKey: keyof BomColumnMapping, newIndex: number) => {
    if (!columnMapping || !parsedData) return;
    const updated = { ...columnMapping, [colKey]: newIndex };
    setColumnMapping(updated);
    executeCompare(parsedData.dataRows, updated, multiplier, isAggregated);
  };

  // 行内采纳推荐替代料
  const handleToggleAdoptSubstitute = (index: number) => {
    setResults((prev) => {
      const updated = [...prev];
      const item = { ...updated[index] };
      item.isAdoptedSubstitute = !item.isAdoptedSubstitute;
      updated[index] = item;
      return updated;
    });

    // 本地即时重算看板数据
    showToast('✔ 已更新物料替代采纳状态', 'info');
  };

  // 手动挑选替代料回调
  const handleManualSubstituteSelect = async (comp: ComponentItem, remember: boolean, note: string) => {
    if (!manualSubstituteTarget) return;
    const targetIdx = results.findIndex((r) => r.rowIndex === manualSubstituteTarget.rowIndex);
    if (targetIdx === -1) return;

    // 更新行状态
    setResults((prev) => {
      const updated = [...prev];
      const item = { ...updated[targetIdx] };
      item.isAdoptedSubstitute = true;
      item.substituteOption = {
        component: comp,
        reason: `手动指定在库替代: ${comp.name} (${comp.package || '通用'}) - 余量 ${comp.quantity}`,
        isFullSubstitute: true,
      };
      item.status = 'SUBSTITUTE_AVAILABLE';
      updated[targetIdx] = item;
      return updated;
    });

    // 若勾选了长期记忆规则，提交后端存储
    if (remember) {
      try {
        await bomApi.addRule({
          target_part: manualSubstituteTarget.partName,
          substitute_part_id: comp.id,
          substitute_name: comp.name,
          note: note || `由用户在 BOM 比对中手动绑定`,
        });
        showToast('✔ 已成功保存至长期替代规则库', 'success');
      } catch (err: any) {
        showToast('保存规则异常: ' + err.message, 'warn');
      }
    }

    setManualSubstituteTarget(null);
  };

  // 展开/收起行位号明细
  const toggleRowExpanded = (rowIdx: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowIdx)) next.delete(rowIdx);
      else next.add(rowIdx);
      return next;
    });
  };

  // 切换拣料复选打勾
  const togglePickCheck = (key: string) => {
    setCheckedPicks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // 执行领料出库扣减
  const handleExecuteDeduct = async () => {
    const deductItems: { id: number; deductQty: number }[] = [];
    for (const item of results) {
      let targetComp = null;
      if (item.status === 'EXACT_MATCH' || item.status === 'LOW_STOCK') {
        targetComp = item.matchedStock;
      } else if (item.status === 'SUBSTITUTE_AVAILABLE' && item.isAdoptedSubstitute) {
        targetComp = item.substituteOption ? item.substituteOption.component : null;
      }

      if (targetComp && targetComp.id) {
        const takeQty = item.status === 'LOW_STOCK'
          ? Math.min(item.qtyNeeded, targetComp.quantity)
          : item.qtyNeeded;
        deductItems.push({ id: targetComp.id, deductQty: takeQty });
      }
    }

    if (deductItems.length === 0) {
      showToast('当前没有可扣减的在库物料', 'warn');
      setIsDeductConfirmOpen(false);
      return;
    }

    try {
      const res = await bomApi.deductBom(deductItems);
      if (res.success) {
        showToast(`✔ 成功完成 ${deductItems.length} 项物料的领料出库与库存核减！`, 'success');
        setIsDeductConfirmOpen(false);
        // 重新比对以反映最新余量
        if (parsedData && columnMapping) {
          executeCompare(parsedData.dataRows, columnMapping, multiplier, isAggregated);
        }
      }
    } catch (err: any) {
      showToast('出库扣减失败: ' + err.message, 'error');
    }
  };

  // 动态重算 summary（采纳替代料后动态折抵）
  const computedSummary = useMemo(() => {
    if (!summary) return null;
    let exact = 0;
    let substitute = 0;
    let lowStock = 0;
    let lack = 0;
    let totalShortage = 0;

    for (const r of results) {
      if (r.status === 'EXACT_MATCH') {
        exact++;
      } else if (r.status === 'SUBSTITUTE_AVAILABLE') {
        if (r.isAdoptedSubstitute) {
          exact++; // 采纳后视同免买
        } else {
          substitute++;
        }
      } else if (r.status === 'LOW_STOCK') {
        lowStock++;
        totalShortage += r.shortageQty;
      } else {
        lack++;
        totalShortage += r.qtyNeeded;
      }
    }

    return {
      exactMatchCount: exact,
      substituteCount: substitute,
      lowStockCount: lowStock,
      lackCount: lack,
      totalItems: results.length,
      totalQtyNeeded: results.reduce((sum, r) => sum + r.qtyNeeded, 0),
      totalShortageQty: totalShortage,
    };
  }, [results, summary]);

  // 过滤后的 BOM 结果
  const filteredResults = useMemo(() => {
    return results.filter((item) => {
      if (activeFilter === 'EXACT_MATCH' && (item.status !== 'EXACT_MATCH' && !item.isAdoptedSubstitute)) return false;
      if (activeFilter === 'SUBSTITUTE_AVAILABLE' && (item.status !== 'SUBSTITUTE_AVAILABLE' || item.isAdoptedSubstitute)) return false;
      if (activeFilter === 'LOW_STOCK' && item.status !== 'LOW_STOCK') return false;
      if (activeFilter === 'LACK' && item.status !== 'LACK') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchDes = item.designators?.toLowerCase().includes(q);
        const matchName = item.partName?.toLowerCase().includes(q);
        const matchPkg = item.footprint?.toLowerCase().includes(q);
        const matchLcsc = item.lcscPart?.toLowerCase().includes(q);
        if (!matchDes && !matchName && !matchPkg && !matchLcsc) return false;
      }

      return true;
    });
  }, [results, activeFilter, searchQuery]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-5">
      {/* 顶部标题栏与全局快捷按钮 */}
      <div className="flex items-center justify-between gap-4 flex-wrap pb-2 border-b border-border-subtle">
        <div>
          <h1 className="text-lg font-bold text-text-main flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-accent" />
            <span>BOM 智能查重与全链路配料工作台</span>
          </h1>
          <p className="text-xs text-text-muted mt-0.5">
            剪贴板秒粘贴 / 表头自动纠偏 / 同类物料位号智能折叠 / 耐压精度高容差替代 / 立创一键下单 & 收纳盒拣料双闭环
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsRulesModalOpen(true)}
            className="px-3 py-1.5 bg-subtle hover:bg-surface-hover border border-border-subtle rounded-xl text-xs font-medium text-text-main flex items-center gap-1.5 transition-colors"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-accent" />
            <span>常用替代规则库</span>
          </button>

          {parsedData && (
            <button
              type="button"
              onClick={() => {
                setParsedData(null);
                setResults([]);
                setSummary(null);
                setPasteText('');
                setFileName('');
              }}
              className="px-3 py-1.5 text-text-muted hover:text-text-main hover:bg-surface-hover rounded-xl text-xs font-medium flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>清空重置</span>
            </button>
          )}
        </div>
      </div>

      {/* 1. 输入台区域 (剪贴板秒粘贴 vs 文件拖拽上传) */}
      {!parsedData && (
        <div className="bg-surface border border-border-subtle rounded-2xl shadow-sm overflow-hidden animate-in fade-in duration-200">
          {/* 输入模式切换 */}
          <div className="p-3 bg-canvas border-b border-border-subtle flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setInputMode('paste')}
                className={cn(
                  'px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all',
                  inputMode === 'paste'
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-text-muted hover:text-text-main hover:bg-surface'
                )}
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                <span>📋 直接粘贴表格文本 (免存文件)</span>
              </button>
              <button
                type="button"
                onClick={() => setInputMode('file')}
                className={cn(
                  'px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all',
                  inputMode === 'file'
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-text-muted hover:text-text-main hover:bg-surface'
                )}
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>📁 上传 CSV / Excel 文件</span>
              </button>
            </div>

            {inputMode === 'paste' && (
              <button
                type="button"
                onClick={() => {
                  setPasteText(SAMPLE_BOM_TEXT);
                  handleParseText(SAMPLE_BOM_TEXT);
                }}
                className="text-xs text-accent hover:underline flex items-center gap-1"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>⚡ 填入立创EDA示例测试</span>
              </button>
            )}
          </div>

          {/* 模式 A: 剪贴板文本输入 */}
          {inputMode === 'paste' && (
            <div className="p-5 space-y-3">
              <div className="relative">
                <textarea
                  rows={8}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={`从嘉立创EDA专业版/标准版、KiCad、Altium 或 Excel 表格中直接全选复制，在此按 Ctrl+V 粘贴...\n\n示例表头与格式：\n器件\t位号\t封装\t数量\t立创编号\n100nF 50V\tC1, C2, C3\t0603\t3\tC2057\n10k 1%\tR1, R2\t0805\t2\tC17414`}
                  className="w-full font-mono text-xs p-4 rounded-xl border border-border-subtle bg-canvas/40 text-text-main focus:outline-none focus:border-accent"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="text-xs text-text-dim">
                  {pasteText.trim() ? `已就绪 ${pasteText.split('\n').filter(Boolean).length} 行文本` : '支持 Tab制表符、逗号CSV、分号等任意表格格式'}
                </div>
                <button
                  type="button"
                  disabled={!pasteText.trim() || parsing}
                  onClick={() => handleParseText()}
                  className="px-5 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-sm transition-all"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{parsing ? '正在极速解析...' : '一键极速比对'}</span>
                </button>
              </div>
            </div>
          )}

          {/* 模式 B: 文件拖拽上传 */}
          {inputMode === 'file' && (
            <div className="p-6">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files?.[0]) handleFileUpload(e.dataTransfer.files[0]);
                }}
                onClick={() => fileInputRef.current?.click()}
                className="p-10 border-2 border-dashed border-border-subtle hover:border-accent hover:bg-accent/5 rounded-2xl bg-canvas/40 text-center cursor-pointer transition-all group"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,.tsv,.txt"
                  onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                  className="hidden"
                />
                <div className="w-12 h-12 rounded-2xl bg-subtle group-hover:bg-accent/10 text-text-muted group-hover:text-accent flex items-center justify-center mx-auto mb-3 transition-colors">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div className="text-sm font-semibold text-text-main mb-1">
                  {fileName ? `当前选择: ${fileName}` : '点击选择或将 BOM 文件拖拽至此'}
                </div>
                <div className="text-xs text-text-dim">
                  支持 .csv, .xlsx, .xls, .tsv。自动过滤说明注释行并精准对齐表头
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. 字段映射微调条与参数控制条 */}
      {parsedData && columnMapping && (
        <div className="bg-surface border border-border-subtle rounded-2xl p-4 shadow-sm space-y-3">
          {/* 顶部状态与打样套数控制 */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-accent/10 text-accent border border-accent/20 flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>{parsedData.detectedTemplate}</span>
              </span>
              <span className="text-xs text-text-muted font-mono">
                共 {parsedData.totalRows} 行数据
              </span>
            </div>

            {/* 打样套数倍数乘数 */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-text-muted">
                <span>打样套数倍数:</span>
                <div className="inline-flex items-center bg-canvas border border-border-subtle rounded-xl p-0.5">
                  {[1, 5, 10, 20].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => handleMultiplierChange(m)}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all',
                        multiplier === m
                          ? 'bg-accent text-white shadow-sm'
                          : 'text-text-muted hover:text-text-main'
                      )}
                    >
                      x{m}{m === 5 && ' (打板)'}
                    </button>
                  ))}
                  <input
                    type="number"
                    min={1}
                    value={multiplier}
                    onChange={(e) => handleMultiplierChange(parseInt(e.target.value, 10) || 1)}
                    className="w-14 bg-transparent text-center font-mono text-xs text-text-main focus:outline-none"
                    placeholder="套数"
                  />
                </div>
              </div>

              {/* 聚合模式开关 */}
              <button
                type="button"
                onClick={handleAggregateToggle}
                className={cn(
                  'px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all',
                  isAggregated
                    ? 'bg-accent/10 border-accent/30 text-accent'
                    : 'bg-canvas border-border-subtle text-text-muted hover:text-text-main'
                )}
                title="同规格器件自动累加数量并折叠位号 (如 C1-C8)"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{isAggregated ? '已开启同类物料聚合' : '逐行明细展示'}</span>
              </button>
            </div>
          </div>

          {/* 表头快速微调下拉条 */}
          <div className="pt-2 border-t border-border-subtle grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            {/* 型号列 */}
            <div className="space-y-1">
              <label className="text-[11px] text-text-muted font-medium">型号/规格列</label>
              <select
                value={columnMapping.partCol}
                onChange={(e) => handleMappingChange('partCol', parseInt(e.target.value, 10))}
                className="w-full bg-canvas border border-border-subtle rounded-lg px-2 py-1 text-xs text-text-main focus:outline-none focus:border-accent"
              >
                {parsedData.headers.map((h, idx) => (
                  <option key={idx} value={idx}>
                    列{idx + 1}: {h || `(第${idx + 1}列)`}
                  </option>
                ))}
              </select>
            </div>

            {/* 位号列 */}
            <div className="space-y-1">
              <label className="text-[11px] text-text-muted font-medium">位号列</label>
              <select
                value={columnMapping.designatorCol}
                onChange={(e) => handleMappingChange('designatorCol', parseInt(e.target.value, 10))}
                className="w-full bg-canvas border border-border-subtle rounded-lg px-2 py-1 text-xs text-text-main focus:outline-none focus:border-accent"
              >
                <option value={-1}>- 无位号列 -</option>
                {parsedData.headers.map((h, idx) => (
                  <option key={idx} value={idx}>
                    列{idx + 1}: {h || `(第${idx + 1}列)`}
                  </option>
                ))}
              </select>
            </div>

            {/* 封装列 */}
            <div className="space-y-1">
              <label className="text-[11px] text-text-muted font-medium">封装列</label>
              <select
                value={columnMapping.footprintCol}
                onChange={(e) => handleMappingChange('footprintCol', parseInt(e.target.value, 10))}
                className="w-full bg-canvas border border-border-subtle rounded-lg px-2 py-1 text-xs text-text-main focus:outline-none focus:border-accent"
              >
                <option value={-1}>- 无封装列 -</option>
                {parsedData.headers.map((h, idx) => (
                  <option key={idx} value={idx}>
                    列{idx + 1}: {h || `(第${idx + 1}列)`}
                  </option>
                ))}
              </select>
            </div>

            {/* 数量列 */}
            <div className="space-y-1">
              <label className="text-[11px] text-text-muted font-medium">用量/数量列</label>
              <select
                value={columnMapping.quantityCol}
                onChange={(e) => handleMappingChange('quantityCol', parseInt(e.target.value, 10))}
                className="w-full bg-canvas border border-border-subtle rounded-lg px-2 py-1 text-xs text-text-main focus:outline-none focus:border-accent"
              >
                {parsedData.headers.map((h, idx) => (
                  <option key={idx} value={idx}>
                    列{idx + 1}: {h || `(第${idx + 1}列)`}
                  </option>
                ))}
              </select>
            </div>

            {/* 立创编号列 */}
            <div className="space-y-1">
              <label className="text-[11px] text-text-muted font-medium">立创商城编号列</label>
              <select
                value={columnMapping.lcscCol}
                onChange={(e) => handleMappingChange('lcscCol', parseInt(e.target.value, 10))}
                className="w-full bg-canvas border border-border-subtle rounded-lg px-2 py-1 text-xs text-text-main focus:outline-none focus:border-accent"
              >
                <option value={-1}>- 无立创编号 -</option>
                {parsedData.headers.map((h, idx) => (
                  <option key={idx} value={idx}>
                    列{idx + 1}: {h || `(第${idx + 1}列)`}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* 加载提示 */}
      {comparing && (
        <div className="py-12 text-center text-xs text-text-dim flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-accent" />
          <span>正在极速核对在库库存、归一化阻容、容差替代及货位动线...</span>
        </div>
      )}

      {/* 3. 比对结果看板与主表格 */}
      {computedSummary && !comparing && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* 四色指标看板与汇总指标 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button
              type="button"
              onClick={() => setActiveFilter(activeFilter === 'EXACT_MATCH' ? 'all' : 'EXACT_MATCH')}
              className={cn(
                'p-3.5 rounded-xl border text-left transition-all relative overflow-hidden',
                activeFilter === 'EXACT_MATCH'
                  ? 'bg-emerald-500/15 border-emerald-500 shadow-sm'
                  : 'bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10'
              )}
            >
              <div className="text-xs font-semibold text-emerald-700 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>现货充足 (免买)</span>
                </span>
                <span className="text-[10px] bg-emerald-500/20 px-1.5 py-0.5 rounded text-emerald-800">
                  {Math.round((computedSummary.exactMatchCount / Math.max(1, computedSummary.totalItems)) * 100)}%
                </span>
              </div>
              <div className="text-2xl font-bold font-mono text-emerald-800 mt-1 tabular-nums">
                {computedSummary.exactMatchCount}
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                setActiveFilter(activeFilter === 'SUBSTITUTE_AVAILABLE' ? 'all' : 'SUBSTITUTE_AVAILABLE')
              }
              className={cn(
                'p-3.5 rounded-xl border text-left transition-all relative overflow-hidden',
                activeFilter === 'SUBSTITUTE_AVAILABLE'
                  ? 'bg-blue-500/15 border-blue-500 shadow-sm'
                  : 'bg-blue-500/5 border-blue-500/20 hover:bg-blue-500/10'
              )}
            >
              <div className="text-xs font-semibold text-blue-700 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>建议替代 (可复用)</span>
                </span>
                <span className="text-[10px] bg-blue-500/20 px-1.5 py-0.5 rounded text-blue-800">
                  高耐压/精度
                </span>
              </div>
              <div className="text-2xl font-bold font-mono text-blue-800 mt-1 tabular-nums">
                {computedSummary.substituteCount}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter(activeFilter === 'LOW_STOCK' ? 'all' : 'LOW_STOCK')}
              className={cn(
                'p-3.5 rounded-xl border text-left transition-all relative overflow-hidden',
                activeFilter === 'LOW_STOCK'
                  ? 'bg-amber-500/15 border-amber-500 shadow-sm'
                  : 'bg-amber-500/5 border-amber-500/20 hover:bg-amber-500/10'
              )}
            >
              <div className="text-xs font-semibold text-amber-700 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>需补库存 (差额)</span>
                </span>
                <span className="text-[10px] bg-amber-500/20 px-1.5 py-0.5 rounded text-amber-800">
                  余量吃紧
                </span>
              </div>
              <div className="text-2xl font-bold font-mono text-amber-800 mt-1 tabular-nums">
                {computedSummary.lowStockCount}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter(activeFilter === 'LACK' ? 'all' : 'LACK')}
              className={cn(
                'p-3.5 rounded-xl border text-left transition-all relative overflow-hidden',
                activeFilter === 'LACK'
                  ? 'bg-rose-500/15 border-rose-500 shadow-sm'
                  : 'bg-rose-500/5 border-rose-500/20 hover:bg-rose-500/10'
              )}
            >
              <div className="text-xs font-semibold text-rose-700 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5" />
                  <span>必须采购 (缺货)</span>
                </span>
                <span className="text-[10px] bg-rose-500/20 px-1.5 py-0.5 rounded text-rose-800">
                  零库存
                </span>
              </div>
              <div className="text-2xl font-bold font-mono text-rose-800 mt-1 tabular-nums">
                {computedSummary.lackCount}
              </div>
            </button>
          </div>

          {/* 搜索过滤与双闭环快捷入口 */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-text-dim absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索位号 (如 C1-C4)、型号、封装或立创号..."
                  className="bg-surface border border-border-subtle rounded-xl pl-8 pr-3 py-1.5 text-xs text-text-main w-72 focus:outline-none focus:border-accent"
                />
              </div>

              <div className="text-xs text-text-dim">
                展示 {filteredResults.length} / 共 {results.length} 项 (总需求量: {computedSummary.totalQtyNeeded} 件)
              </div>
            </div>

            {/* 双闭环操作按钮 */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCreateProjectModalOpen(true)}
                className="px-3 py-1.5 bg-accent/10 hover:bg-accent/20 border border-accent/30 text-accent rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>保存为制作项目并锁库</span>
              </button>

              <button
                type="button"
                onClick={() => setIsLcscModalOpen(true)}
                className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>立创一键配单采购 ({shortageList.length}项缺料)</span>
              </button>

              <button
                type="button"
                onClick={() => setIsDeductConfirmOpen(true)}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>领料出库并扣减库存</span>
              </button>
            </div>
          </div>

          {/* BOM 详细比对主表格 */}
          <div className="bg-surface border border-border-subtle rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-canvas border-b border-border-subtle text-text-muted font-semibold">
                    <th className="py-3 px-4 w-[18%]">BOM 位号</th>
                    <th className="py-3 px-3 w-[20%]">规格 / 器件型号</th>
                    <th className="py-3 px-3 w-[10%]">封装</th>
                    <th className="py-3 px-3 w-[11%] text-center">
                      用量 {multiplier > 1 && <span className="font-mono text-accent">({multiplier}套)</span>}
                    </th>
                    <th className="py-3 px-3 w-[13%] text-center">匹配状态</th>
                    <th className="py-3 px-4 w-[28%]">在库现货 / 智能替代决策</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {filteredResults.map((r, i) => {
                    const originalIdx = results.findIndex((item) => item.rowIndex === r.rowIndex);
                    const isAdopted = r.isAdoptedSubstitute;
                    const hasRawRows = r.rawRows && r.rawRows.length > 1;
                    const isExpanded = expandedRows.has(r.rowIndex);

                    return (
                      <React.Fragment key={r.rowIndex || i}>
                        <tr className="hover:bg-surface-hover/60 transition-colors">
                          {/* 位号列 */}
                          <td className="py-3 px-4 font-mono font-medium text-text-main align-top">
                            <div className="flex items-center gap-1.5">
                              {hasRawRows && (
                                <button
                                  type="button"
                                  onClick={() => toggleRowExpanded(r.rowIndex)}
                                  className="p-0.5 rounded text-text-muted hover:text-text-main hover:bg-subtle"
                                  title="查看原始分行明细"
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  ) : (
                                    <ChevronRight className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              )}
                              <span className="break-all">{r.designators || '-'}</span>
                            </div>
                            {r.lcscPart && (
                              <div className="text-[10px] text-text-dim font-mono mt-0.5">
                                C号: {r.lcscPart}
                              </div>
                            )}
                          </td>

                          {/* 规格/型号 */}
                          <td className="py-3 px-3 font-semibold text-text-main align-top">
                            <div>{r.partName}</div>
                            {r.parsed?.category && (
                              <div className="text-[10px] text-text-muted mt-0.5">
                                分类: {r.parsed.category}
                              </div>
                            )}
                          </td>

                          {/* 封装 */}
                          <td className="py-3 px-3 font-mono text-text-muted align-top">
                            {r.footprint || '-'}
                          </td>

                          {/* 用量 */}
                          <td className="py-3 px-3 text-center align-top">
                            <div className="font-mono font-bold text-text-main">
                              {r.qtyNeeded}
                            </div>
                            {multiplier > 1 && (
                              <div className="text-[10px] text-text-dim font-mono">
                                (单板: {r.unitQty})
                              </div>
                            )}
                          </td>

                          {/* 状态徽标 */}
                          <td className="py-3 px-3 text-center align-top">
                            {isAdopted ? (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-700 border border-emerald-500/25">
                                🟩 已采纳替代 (免买)
                              </span>
                            ) : r.status === 'EXACT_MATCH' ? (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-700 border border-emerald-500/25">
                                🟩 现货免买
                              </span>
                            ) : r.status === 'SUBSTITUTE_AVAILABLE' ? (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/15 text-blue-700 border border-blue-500/25">
                                🟦 建议替代
                              </span>
                            ) : r.status === 'LOW_STOCK' ? (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/15 text-amber-700 border border-amber-500/25">
                                🟨 需补差额 ({r.shortageQty})
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/15 text-rose-700 border border-rose-500/25">
                                🟥 必须采购 ({r.qtyNeeded})
                              </span>
                            )}
                          </td>

                          {/* 在库现货 / 决策操作 */}
                          <td className="py-3 px-4 align-top space-y-2">
                            {/* 1. 完全现货 */}
                            {r.matchedStock && r.status === 'EXACT_MATCH' && (
                              <div className="flex items-center justify-between text-xs bg-emerald-500/5 p-2 rounded-xl border border-emerald-500/20">
                                <div>
                                  <div className="font-semibold text-text-main">
                                    {r.matchedStock.name}
                                  </div>
                                  <div className="text-[11px] text-text-dim flex items-center gap-1.5 flex-wrap">
                                    <span>📦 货位: <strong className="font-mono text-text-main">{r.matchedStock.location || '未标注'}</strong></span>
                                    {r.matchedStock.location && (
                                      <button
                                        type="button"
                                        onClick={() => setLocatorTarget({
                                          location: r.matchedStock!.location!,
                                          name: r.matchedStock!.name,
                                          componentId: r.matchedStock!.id,
                                        })}
                                        className="text-accent hover:underline flex items-center gap-0.5 text-[10px]"
                                        title="定位现实物理格位"
                                      >
                                        <Compass className="w-3 h-3" />
                                        <span>透视</span>
                                      </button>
                                    )}
                                    <span>· 余量: <strong className="font-mono text-emerald-700">{r.matchedStock.quantity}</strong></span>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* 2. 建议替代料 */}
                            {r.substituteOption && (
                              <div className="p-2.5 rounded-xl border bg-blue-500/5 border-blue-500/20 space-y-1.5">
                                <div className="text-[11px] text-blue-800 font-medium">
                                  {r.substituteOption.reason}
                                </div>
                                <div className="flex items-center justify-between gap-2 pt-1 border-t border-blue-500/20">
                                  <div className="text-[11px] text-text-dim flex items-center gap-1">
                                    <span>📦 货位: <strong className="font-mono text-text-main">{r.substituteOption.component?.location || '未标注'}</strong></span>
                                    {r.substituteOption.component?.location && (
                                      <button
                                        type="button"
                                        onClick={() => setLocatorTarget({
                                          location: r.substituteOption!.component!.location!,
                                          name: r.substituteOption!.component!.name,
                                          componentId: r.substituteOption!.component!.id,
                                        })}
                                        className="text-accent hover:underline flex items-center gap-0.5 text-[10px]"
                                        title="定位现实物理格位"
                                      >
                                        <Compass className="w-3 h-3" />
                                        <span>透视</span>
                                      </button>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleAdoptSubstitute(originalIdx)}
                                    className={cn(
                                      'px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors',
                                      isAdopted
                                        ? 'bg-subtle text-text-muted hover:text-text-main'
                                        : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                                    )}
                                  >
                                    {isAdopted ? '取消采纳' : '✔ 采纳此替代'}
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* 3. 需补库存或完全缺料 */}
                            {(r.status === 'LOW_STOCK' || r.status === 'LACK') && !isAdopted && (
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-[11px] text-text-dim">
                                  {r.matchedStock ? (
                                    <span>
                                      现存 <strong className="font-mono">{r.matchedStock.quantity}</strong> 件 · 缺口{' '}
                                      <strong className="text-amber-700 font-mono">{r.shortageQty}</strong> 件
                                    </span>
                                  ) : (
                                    <span className="text-rose-600 font-medium">手头完全无现货</span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setManualSubstituteTarget(r)}
                                  className="px-2.5 py-1 bg-subtle hover:bg-surface-hover border border-border-subtle rounded-lg text-xs text-text-main font-medium flex items-center gap-1 transition-colors"
                                >
                                  <span>换料搜索</span>
                                  <ArrowRight className="w-3 h-3 text-text-dim" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>

                        {/* 展开的原始行明细 */}
                        {isExpanded && r.rawRows && (
                          <tr className="bg-canvas/50">
                            <td colSpan={6} className="p-3 pl-8">
                              <div className="text-[11px] font-semibold text-text-muted mb-1.5">
                                📋 聚合前的原始 BOM 明细行 ({r.rawRows.length} 行):
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                {r.rawRows.map((raw, idx) => (
                                  <div
                                    key={idx}
                                    className="p-2 bg-surface rounded-lg border border-border-subtle text-[11px]"
                                  >
                                    <div className="font-mono font-medium text-text-main">
                                      位号: {raw.designator || '-'}
                                    </div>
                                    <div className="text-text-dim">
                                      单行用量: {raw.quantity} 件
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 4. 按物理收纳盒仓位流转拣料单 */}
          {Object.keys(pickingList).length > 0 && (
            <div className="bg-surface border border-border-subtle rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-sm font-bold text-text-main flex items-center gap-2">
                    <Box className="w-4 h-4 text-accent" />
                    <span>按物理收纳盒仓位排序拣料流转清单</span>
                  </h3>
                  <p className="text-xs text-text-muted mt-0.5">
                    已按盒号与货位自然路径排序，无需往返跑动。对着盒子拿一件打勾一件。
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const lines: string[] = [];
                    for (const [loc, items] of Object.entries(pickingList)) {
                      lines.push(`【${loc}】:`);
                      items.forEach((it) => {
                        lines.push(`  - ${it.name} x${it.takeQty} (${it.designators || '-'})`);
                      });
                    }
                    navigator.clipboard.writeText(lines.join('\n'));
                    showToast('✔ 拣料单已复制到剪贴板', 'success');
                  }}
                  className="px-3 py-1.5 bg-subtle hover:bg-surface-hover border border-border-subtle rounded-lg text-xs font-medium text-text-main flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>复制流转清单</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {Object.entries(pickingList).map(([loc, items]) => (
                  <div
                    key={loc}
                    className="p-3 bg-canvas border border-border-subtle rounded-xl text-xs space-y-2"
                  >
                    <div className="font-bold text-accent flex items-center justify-between border-b border-border-subtle pb-1">
                      <div className="flex items-center gap-1.5 truncate">
                        <span>📦 货位: {loc}</span>
                        <button
                          type="button"
                          onClick={() => setLocatorTarget({ location: loc, name: `${loc} 拣料货位` })}
                          className="px-1.5 py-0.5 text-[10px] bg-accent/10 hover:bg-accent hover:text-white rounded flex items-center gap-0.5 transition-colors"
                          title="在物理网格柜中定位该格位"
                        >
                          <Compass className="w-3 h-3" />
                          <span>透视</span>
                        </button>
                      </div>
                      <span className="text-[10px] text-text-dim shrink-0">{items.length} 种物料</span>
                    </div>

                    <div className="space-y-1.5">
                      {items.map((it, idx) => {
                        const itemKey = `${loc}-${it.id}-${idx}`;
                        const isChecked = checkedPicks.has(itemKey);

                        return (
                          <div
                            key={itemKey}
                            onClick={() => togglePickCheck(itemKey)}
                            className={cn(
                              'p-2 rounded-lg border cursor-pointer transition-all flex items-start gap-2',
                              isChecked
                                ? 'bg-emerald-500/10 border-emerald-500/30 line-through text-text-dim'
                                : 'bg-surface border-border-subtle hover:border-accent/40'
                            )}
                          >
                            <div className="mt-0.5 text-accent">
                              {isChecked ? (
                                <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Square className="w-3.5 h-3.5 text-text-muted" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-text-main flex items-center justify-between">
                                <span className="truncate">{it.name}</span>
                                <span className="font-mono text-accent font-bold ml-1">
                                  x{it.takeQty}
                                </span>
                              </div>
                              <div className="text-[10px] text-text-dim mt-0.5 truncate">
                                位号: {it.designators || '-'} · 余量: {it.availableQty}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 手动替代挑选弹窗 */}
      <ManualSubstituteModal
        isOpen={!!manualSubstituteTarget}
        onClose={() => setManualSubstituteTarget(null)}
        targetPartName={manualSubstituteTarget?.partName || ''}
        targetFootprint={manualSubstituteTarget?.footprint || ''}
        qtyNeeded={manualSubstituteTarget?.qtyNeeded || 1}
        onSelect={handleManualSubstituteSelect}
      />

      {/* 常用替代偏好规则管理弹窗 */}
      <SubstituteRulesModal
        isOpen={isRulesModalOpen}
        onClose={() => setIsRulesModalOpen(false)}
        onRulesChanged={() => {
          if (parsedData && columnMapping) {
            executeCompare(parsedData.dataRows, columnMapping, multiplier, isAggregated);
          }
        }}
      />

      {/* 立创采购下单清单弹窗 */}
      <LcscExportModal
        isOpen={isLcscModalOpen}
        onClose={() => setIsLcscModalOpen(false)}
        shortages={shortageList}
        lcscBatchText={lcscBatchText}
        humanReadableText={humanReadableText}
      />

      {/* 出库核减确认弹窗 */}
      {isDeductConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface border border-border-subtle rounded-2xl w-full max-w-md p-5 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-text-main flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>确认领料出库并扣减库存</span>
            </h3>
            <p className="text-xs text-text-muted leading-relaxed">
              将根据当前 BOM 匹配结果，扣减所有已匹配现货及已采纳替代料对应的收纳盒物理库存，并生成出库流水审计日志。确认继续吗？
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsDeductConfirmOpen(false)}
                className="px-4 py-1.5 bg-subtle hover:bg-surface-hover rounded-xl text-xs font-medium text-text-main transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleExecuteDeduct}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
              >
                确认扣库出库
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 保存为制作项目弹窗 */}
      {createProjectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface border border-border-subtle rounded-2xl w-full max-w-md p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-border-subtle pb-2">
              <h3 className="text-sm font-bold text-text-main flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-accent" />
                <span>保存为制作项目并自动预锁库</span>
              </h3>
              <button
                type="button"
                onClick={() => setCreateProjectModalOpen(false)}
                className="p-1 rounded text-text-dim hover:text-text-main"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-text-muted leading-relaxed">
              将当前比对的 <strong className="text-text-main font-mono">{results.length}</strong> 项物料与用量打包创建为一个专属制作工程，以便长期跟踪齐套率。
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-text-muted font-medium mb-1">项目名称 *</label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="如: 我的智能时钟主板工程 v1.0"
                  className="w-full bg-canvas border border-border-subtle rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-accent"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-text-muted font-medium mb-1">项目说明</label>
                <textarea
                  rows={2}
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  placeholder="记录打板批次、调试注意事项等..."
                  className="w-full bg-canvas border border-border-subtle rounded-xl p-2.5 text-xs focus:outline-none focus:border-accent resize-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="autoLockCheck"
                  checked={autoLockStock}
                  onChange={(e) => setAutoLockStock(e.target.checked)}
                  className="rounded text-accent focus:ring-accent"
                />
                <label htmlFor="autoLockCheck" className="text-text-main cursor-pointer">
                  立即自动锁定在库现货库存 (防止被其他制作挪用)
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">
              <button
                type="button"
                onClick={() => setCreateProjectModalOpen(false)}
                className="px-4 py-1.5 bg-subtle hover:bg-surface-hover rounded-xl text-xs font-medium text-text-main transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveAsProject}
                className="px-4 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
              >
                确认创建并锁库
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 仓位现实网格透视罗盘 */}
      <LocationLocatorModal
        isOpen={!!locatorTarget}
        onClose={() => setLocatorTarget(null)}
        componentId={locatorTarget?.componentId}
        locationStr={locatorTarget?.location}
        componentName={locatorTarget?.name}
      />
    </div>
  );
};
