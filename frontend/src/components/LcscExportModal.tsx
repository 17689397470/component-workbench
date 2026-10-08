import React, { useState } from 'react';
import { ShortageItem } from '../types/bom';
import { useToastStore } from '../store/useToastStore';
import { ShoppingCart, Copy, Download, X, Check, FileText } from 'lucide-react';

interface LcscExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  shortages: ShortageItem[];
  lcscBatchText: string;
  humanReadableText: string;
}

export const LcscExportModal: React.FC<LcscExportModalProps> = ({
  isOpen,
  onClose,
  shortages,
  lcscBatchText,
  humanReadableText,
}) => {
  const { showToast } = useToastStore();
  const [copiedLcsc, setCopiedLcsc] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [activeTab, setActiveTab] = useState<'lcsc' | 'all'>('lcsc');

  if (!isOpen) return null;

  const handleCopyLcsc = () => {
    if (!lcscBatchText.trim()) {
      showToast('缺料项中暂无立创编号', 'warn');
      return;
    }
    navigator.clipboard.writeText(lcscBatchText);
    setCopiedLcsc(true);
    showToast('✔ 立创商城批量下单编码已复制，可在立创商城购物车直接粘贴！', 'success');
    setTimeout(() => setCopiedLcsc(false), 2000);
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(humanReadableText || lcscBatchText);
    setCopiedText(true);
    showToast('✔ 采购清单文本已复制', 'success');
    setTimeout(() => setCopiedText(false), 2000);
  };

  const handleDownloadCsv = () => {
    if (shortages.length === 0) return;
    const header = '行号,型号/规格,封装,位号,需买数量,立创商城编号,缺货原因\n';
    const rows = shortages
      .map(
        (s) =>
          `${s.rowIndex},"${s.partName.replace(/"/g, '""')}","${(s.footprint || '').replace(/"/g, '""')}","${(s.designators || '').replace(/"/g, '""')}",${s.missingQty},"${s.lcscPart || ''}","${s.reason.replace(/"/g, '""')}"`
      )
      .join('\n');
    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `缺料采购清单_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('✔ 采购 CSV 文件已开始下载', 'success');
  };

  const lcscCount = shortages.filter((s) => s.lcscPart && s.lcscPart.trim()).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface border border-border-subtle rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* 顶部标题栏 */}
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between bg-canvas/40">
          <div>
            <h3 className="text-sm font-bold text-text-main flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-accent" />
              <span>缺料采购与立创一键配单</span>
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              共 <strong className="text-rose-600 font-mono">{shortages.length}</strong> 项缺料待采 (其中 <strong className="text-accent font-mono">{lcscCount}</strong> 项含立创编号)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 切换 Tab 与快捷操作 */}
        <div className="p-4 border-b border-border-subtle bg-surface flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 bg-subtle p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('lcsc')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'lcsc'
                  ? 'bg-surface text-accent shadow-sm'
                  : 'text-text-muted hover:text-text-main'
              }`}
            >
              立创商城一键下单编码 ({lcscCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'all'
                  ? 'bg-surface text-accent shadow-sm'
                  : 'text-text-muted hover:text-text-main'
              }`}
            >
              全量采购文本清单 ({shortages.length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="px-3 py-1.5 bg-subtle hover:bg-surface-hover border border-border-subtle rounded-xl text-xs font-medium text-text-main flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>导出采购 CSV</span>
            </button>
            {activeTab === 'lcsc' ? (
              <button
                type="button"
                onClick={handleCopyLcsc}
                className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-xs font-medium flex items-center gap-1.5 shadow-sm transition-colors"
              >
                {copiedLcsc ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLcsc ? '已复制！' : '复制立创编码'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCopyText}
                className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-xs font-medium flex items-center gap-1.5 shadow-sm transition-colors"
              >
                {copiedText ? <Check className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                <span>{copiedText ? '已复制！' : '复制完整清单'}</span>
              </button>
            )}
          </div>
        </div>

        {/* 文本预览展示区 */}
        <div className="flex-1 overflow-y-auto p-4 bg-canvas/60">
          {activeTab === 'lcsc' ? (
            <div>
              <div className="mb-2 text-[11px] text-text-muted">
                💡 <strong>使用指南:</strong> 点击上方【复制立创编码】，打开「立创商城」电脑网页端，进入购物车点击「BOM配单/批量加入购物车」，直接粘贴即可将所有缺料一键加入购物车！
              </div>
              <textarea
                readOnly
                value={lcscBatchText || '（无可导出的立创编号物料）'}
                rows={12}
                className="w-full font-mono text-xs p-3.5 rounded-xl border border-border-subtle bg-surface text-text-main focus:outline-none"
              />
            </div>
          ) : (
            <div>
              <div className="mb-2 text-[11px] text-text-muted">
                💡 包含所有缺货物料的规格型号、封装、采购差额与位号，方便发给供应商报价或淘宝逐个采购：
              </div>
              <textarea
                readOnly
                value={humanReadableText || '（暂无缺料数据）'}
                rows={12}
                className="w-full font-mono text-xs p-3.5 rounded-xl border border-border-subtle bg-surface text-text-main focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="p-4 border-t border-border-subtle bg-canvas/40 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-subtle hover:bg-surface-hover rounded-xl text-xs font-medium text-text-main transition-colors"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};
