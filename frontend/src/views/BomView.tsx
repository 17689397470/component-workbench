import React, { useState, useRef } from 'react';
import { bomApi } from '../api/bomApi';
import { BomMatchResult, BomSummary, PickListItem } from '../types/bom';
import { useToastStore } from '../store/useToastStore';
import { UploadCloud, FileSpreadsheet, CheckCircle2, RefreshCw, AlertTriangle, XCircle, Copy, Download } from 'lucide-react';
import { cn } from '../lib/utils';

export const BomView: React.FC = () => {
  const { showToast } = useToastStore();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<BomMatchResult[]>([]);
  const [summary, setSummary] = useState<BomSummary | null>(null);
  const [pickList, setPickList] = useState<PickListItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [fileName, setFileName] = useState('');

  // 处理文件上传
  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setLoading(true);
    setFileName(file.name);

    try {
      const res = await bomApi.compareBomFile(file);
      if (res.success && res.data) {
        setResults(res.data.results);
        setSummary(res.data.summary);
        setPickList(res.data.pickList || []);
        showToast(`✔ BOM 比对完成：共解析 ${res.data.results.length} 项`, 'success');
      }
    } catch (err: any) {
      showToast('BOM 解析失败: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // 拖拽
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  // 过滤后的 BOM 结果
  const filteredResults = results.filter((item) => {
    if (activeFilter === 'EXACT_MATCH' && item.status !== 'EXACT_MATCH') return false;
    if (activeFilter === 'SUBSTITUTE_AVAILABLE' && item.status !== 'SUBSTITUTE_AVAILABLE') return false;
    if (activeFilter === 'LOW_STOCK' && item.status !== 'LOW_STOCK') return false;
    if (activeFilter === 'LACK' && item.status !== 'LACK') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchDes = item.bomItem.designator?.toLowerCase().includes(q);
      const matchCom = item.bomItem.comment?.toLowerCase().includes(q);
      const matchPkg = item.bomItem.footprint?.toLowerCase().includes(q);
      if (!matchDes && !matchCom && !matchPkg) return false;
    }

    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5">
      {/* 顶部标题区 */}
      <div className="mb-4">
        <h1 className="text-lg font-bold text-text-main flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-accent" />
          <span>BOM 智能查重比对工作台</span>
        </h1>
        <p className="text-xs text-text-muted mt-0.5">
          支持立创EDA、Altium、KiCad 导出文件。自动比对在库现货、容差替代、计算差额并生成拣料单。
        </p>
      </div>

      {/* 文件拖拽上传区域 */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className="mb-6 p-8 border-2 border-dashed border-border-subtle hover:border-accent hover:bg-accent/5 rounded-2xl bg-surface text-center cursor-pointer transition-all group"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.txt"
          onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
          className="hidden"
        />
        <div className="w-12 h-12 rounded-2xl bg-subtle group-hover:bg-accent/10 text-text-muted group-hover:text-accent flex items-center justify-center mx-auto mb-3 transition-colors">
          <UploadCloud className="w-6 h-6" />
        </div>
        <div className="text-sm font-semibold text-text-main mb-1">
          {fileName ? `当前文件: ${fileName}` : '点击选择或将 BOM 文件拖拽至此'}
        </div>
        <div className="text-xs text-text-dim">
          支持立创 EDA 导出的 CSV / Excel，或包含 Comment、Designator 的清单
        </div>
      </div>

      {loading && (
        <div className="py-16 text-center text-xs text-text-dim">正在极速比对现货库存与替代料...</div>
      )}

      {/* 比对结果看板与表格 */}
      {summary && !loading && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* 四色指标看板 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button
              type="button"
              onClick={() => setActiveFilter(activeFilter === 'EXACT_MATCH' ? 'all' : 'EXACT_MATCH')}
              className={cn(
                'p-3.5 rounded-xl border text-left transition-all',
                activeFilter === 'EXACT_MATCH'
                  ? 'bg-emerald-500/15 border-emerald-500 shadow-sm'
                  : 'bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10'
              )}
            >
              <div className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>现货充足 (免买)</span>
              </div>
              <div className="text-2xl font-bold font-mono text-emerald-800 mt-1 tabular-nums">
                {summary.exactMatchCount}
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                setActiveFilter(activeFilter === 'SUBSTITUTE_AVAILABLE' ? 'all' : 'SUBSTITUTE_AVAILABLE')
              }
              className={cn(
                'p-3.5 rounded-xl border text-left transition-all',
                activeFilter === 'SUBSTITUTE_AVAILABLE'
                  ? 'bg-blue-500/15 border-blue-500 shadow-sm'
                  : 'bg-blue-500/5 border-blue-500/20 hover:bg-blue-500/10'
              )}
            >
              <div className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" />
                <span>建议替代 (可复用)</span>
              </div>
              <div className="text-2xl font-bold font-mono text-blue-800 mt-1 tabular-nums">
                {summary.substituteCount}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter(activeFilter === 'LOW_STOCK' ? 'all' : 'LOW_STOCK')}
              className={cn(
                'p-3.5 rounded-xl border text-left transition-all',
                activeFilter === 'LOW_STOCK'
                  ? 'bg-amber-500/15 border-amber-500 shadow-sm'
                  : 'bg-amber-500/5 border-amber-500/20 hover:bg-amber-500/10'
              )}
            >
              <div className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>需补库存 (差额)</span>
              </div>
              <div className="text-2xl font-bold font-mono text-amber-800 mt-1 tabular-nums">
                {summary.lowStockCount}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter(activeFilter === 'LACK' ? 'all' : 'LACK')}
              className={cn(
                'p-3.5 rounded-xl border text-left transition-all',
                activeFilter === 'LACK'
                  ? 'bg-rose-500/15 border-rose-500 shadow-sm'
                  : 'bg-rose-500/5 border-rose-500/20 hover:bg-rose-500/10'
              )}
            >
              <div className="text-xs font-semibold text-rose-700 flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5" />
                <span>必须采购 (无货)</span>
              </div>
              <div className="text-2xl font-bold font-mono text-rose-800 mt-1 tabular-nums">
                {summary.lackCount}
              </div>
            </button>
          </div>

          {/* 搜索过滤条 */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索位号 (如 R1, C12)、型号或封装..."
              className="bg-surface border border-border-subtle rounded-xl px-3 py-1.5 text-xs text-text-main w-72 focus:outline-none focus:border-accent"
            />
            <div className="text-xs text-text-dim">
              当前展示 {filteredResults.length} / 共 {results.length} 项
            </div>
          </div>

          {/* BOM 详细比对表格 */}
          <div className="bg-surface border border-border-subtle rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-canvas border-b border-border-subtle text-text-muted font-semibold">
                    <th className="py-3 px-4 w-[16%]">BOM 位号</th>
                    <th className="py-3 px-3 w-[22%]">BOM 规格 / 型号</th>
                    <th className="py-3 px-3 w-[12%]">封装</th>
                    <th className="py-3 px-3 w-[10%] text-center">BOM 用量</th>
                    <th className="py-3 px-3 w-[14%] text-center">匹配状态</th>
                    <th className="py-3 px-4 w-[26%]">在库现货 / 替代推荐</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {filteredResults.map((r, i) => {
                    const statusBadgeMap: Record<string, React.ReactNode> = {
                      EXACT_MATCH: (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-700 border border-emerald-500/25">
                          🟩 现货免买
                        </span>
                      ),
                      SUBSTITUTE_AVAILABLE: (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/15 text-blue-700 border border-blue-500/25">
                          🟦 建议替代
                        </span>
                      ),
                      LOW_STOCK: (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/15 text-amber-700 border border-amber-500/25">
                          🟨 需补库存
                        </span>
                      ),
                      LACK: (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/15 text-rose-700 border border-rose-500/25">
                          🟥 必须采购
                        </span>
                      ),
                    };

                    return (
                      <tr key={i} className="hover:bg-surface-hover/60 transition-colors">
                        <td className="py-3 px-4 font-mono font-medium text-text-main">
                          {r.bomItem.designator || '-'}
                        </td>
                        <td className="py-3 px-3 font-semibold text-text-main">
                          {r.bomItem.comment || '-'}
                        </td>
                        <td className="py-3 px-3 font-mono text-text-muted">{r.bomItem.footprint || '-'}</td>
                        <td className="py-3 px-3 text-center font-mono font-bold text-text-main">
                          {r.bomItem.quantity}
                        </td>
                        <td className="py-3 px-3 text-center">{statusBadgeMap[r.status]}</td>
                        <td className="py-3 px-4">
                          {r.matchedComponent ? (
                            <div className="flex items-center justify-between text-xs">
                              <div>
                                <span className="font-medium text-text-main">
                                  {r.matchedComponent.name}
                                </span>
                                <div className="text-[11px] text-text-dim">
                                  📦 {r.matchedComponent.location} · 余量:{' '}
                                  <strong className="font-mono text-text-main">
                                    {r.matchedComponent.quantity}
                                  </strong>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <span className="text-text-dim">- 无现货 -</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 按盒拣料单预览 */}
          {pickList.length > 0 && (
            <div className="bg-surface border border-border-subtle rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-text-main flex items-center gap-2">
                  <span>📦 按收纳盒分组拣料单</span>
                  <span className="text-[11px] font-normal text-text-dim">
                    (直接对着盒子快速拣料，无需在多个盒子间往返)
                  </span>
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    const text = pickList
                      .map((p) => `【${p.location}】: ${p.name} x${p.quantity} (${p.designators?.join(',')})`)
                      .join('\n');
                    navigator.clipboard.writeText(text);
                    showToast('✔ 拣料单已复制到剪贴板', 'success');
                  }}
                  className="px-3 py-1.5 bg-subtle hover:bg-surface-hover border border-border-subtle rounded-lg text-xs font-medium text-text-main flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>复制拣料清单</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {pickList.map((p, idx) => (
                  <div key={idx} className="p-3 bg-canvas border border-border-subtle rounded-xl text-xs">
                    <div className="font-bold text-accent mb-1">📦 {p.location}</div>
                    <div className="font-semibold text-text-main">
                      {p.name} <span className="text-text-dim">x{p.quantity}</span>
                    </div>
                    {p.designators?.length > 0 && (
                      <div className="text-[11px] font-mono text-text-dim mt-1 break-all">
                        位号: {p.designators.join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
