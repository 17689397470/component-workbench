import React, { useEffect, useState } from 'react';
import { ComponentItem } from '../../types/component';
import { componentApi } from '../../api/componentApi';
import { useToastStore } from '../../store/useToastStore';
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  X,
  FileText,
  Image as ImageIcon,
  Layers,
  Tag,
  Cpu,
} from 'lucide-react';

interface LcscCalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  componentId: number;
  initialCPart?: string;
  onSuccess: (updated: ComponentItem) => void;
}

interface FieldDiff {
  key: string;
  label: string;
  icon?: any;
  currentVal: any;
  officialVal: any;
  isDifferent: boolean;
  isDirtyCorrection: boolean; // 是否是明显的脏数据纠偏 (如阻值误填为C编号)
}

export const LcscCalibrationModal: React.FC<LcscCalibrationModalProps> = ({
  isOpen,
  onClose,
  componentId,
  initialCPart,
  onSuccess,
}) => {
  const { showToast } = useToastStore();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cPartInput, setCPartInput] = useState('');
  const [current, setCurrent] = useState<ComponentItem | null>(null);
  const [official, setOfficial] = useState<any | null>(null);
  const [selectedFields, setSelectedFields] = useState<Record<string, boolean>>({});

  const loadPreview = async (overrideCPart?: string) => {
    setLoading(true);
    try {
      const res = await componentApi.getLcscPreview(componentId, overrideCPart);
      if (res.success && res.data) {
        setCurrent(res.data.current);
        setOfficial(res.data.official);
        if (!overrideCPart && res.data.current.lcsc_part) {
          setCPartInput(res.data.current.lcsc_part);
        }

        // 默认勾选有差异且官方有值的字段
        const off = res.data.official;
        const cur = res.data.current;
        const initSelected: Record<string, boolean> = {};

        const checkKeys = [
          'name',
          'manufacturer',
          'category',
          'package',
          'value',
          'voltage',
          'tolerance',
          'image_url',
          'datasheet_url',
          'notes',
        ];

        checkKeys.forEach((k) => {
          const offVal = off ? off[k] : undefined;
          const curVal = cur ? (cur as any)[k] : undefined;
          const isDiff =
            offVal !== undefined &&
            offVal !== null &&
            offVal !== '' &&
            String(offVal).trim() !== String(curVal || '').trim();

          // 如果官方有值，且不同，或者当前是脏数据，默认选中
          if (isDiff) {
            initSelected[k] = true;
          }
        });

        setSelectedFields(initSelected);
      }
    } catch (err: any) {
      showToast('获取立创官方数据失败: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && componentId) {
      setCPartInput(initialCPart || '');
      loadPreview(initialCPart);
    }
  }, [isOpen, componentId]);

  if (!isOpen) return null;

  // 计算比对列表
  const diffFields: FieldDiff[] = [];
  if (current && official) {
    const isValueDirty =
      current.value &&
      current.lcsc_part &&
      current.value.toUpperCase().trim() === current.lcsc_part.toUpperCase().trim();

    const fieldsConfig = [
      { key: 'name', label: '官方品名/描述', icon: Tag },
      { key: 'manufacturer', label: '原厂品牌', icon: Cpu },
      { key: 'category', label: '物料分类', icon: Layers },
      { key: 'package', label: '封装规格', icon: Layers },
      {
        key: 'value',
        label: '阻容值 / 芯片型号',
        icon: Tag,
        isDirty: isValueDirty,
      },
      { key: 'voltage', label: '额定耐压', icon: null },
      { key: 'tolerance', label: '精度容差', icon: null },
      { key: 'image_url', label: '实物图', icon: ImageIcon },
      { key: 'datasheet_url', label: '官方数据手册', icon: FileText },
      { key: 'notes', label: '功能描述与备注', icon: null },
    ];

    fieldsConfig.forEach((cfg) => {
      const curVal = (current as any)[cfg.key];
      const offVal = official[cfg.key];
      const isDiff =
        offVal !== undefined &&
        offVal !== null &&
        offVal !== '' &&
        String(offVal).trim() !== String(curVal || '').trim();

      diffFields.push({
        key: cfg.key,
        label: cfg.label,
        icon: cfg.icon,
        currentVal: curVal,
        officialVal: offVal,
        isDifferent: !!isDiff,
        isDirtyCorrection: !!cfg.isDirty,
      });
    });
  }

  const handleApply = async () => {
    if (!current || !official) return;
    setSaving(true);
    try {
      const payloadFields: Record<string, any> = {};
      Object.keys(selectedFields).forEach((key) => {
        if (selectedFields[key] && official[key] !== undefined && official[key] !== null) {
          payloadFields[key] = official[key];
        }
      });

      // 确保立创编号同步
      if (official.lcsc_part) {
        payloadFields.lcsc_part = official.lcsc_part;
      }

      const res = await componentApi.applyLcscCalibration(componentId, payloadFields);
      if (res.success && res.data) {
        showToast('已成功根据立创官方标准数据校准物料', 'success');
        onSuccess(res.data);
        onClose();
      }
    } catch (err: any) {
      showToast('校准保存失败: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const selectedCount = Object.values(selectedFields).filter(Boolean).length;
  const toggleSelectAll = () => {
    if (selectedCount === diffFields.length) {
      setSelectedFields({});
    } else {
      const all: Record<string, boolean> = {};
      diffFields.forEach((f) => {
        if (f.officialVal !== undefined && f.officialVal !== null && f.officialVal !== '') {
          all[f.key] = true;
        }
      });
      setSelectedFields(all);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface border border-border-subtle rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between bg-surface-subtle">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-text-main text-sm flex items-center gap-2">
                <span>立创官方规格校准与纠偏</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 text-accent font-mono font-medium">
                  智能比对
                </span>
              </h3>
              <p className="text-[11px] text-text-dim mt-0.5">
                对比当前录入数据与立创官方器件库，一键纠正错漏字段、补全原厂品牌与高清资料
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-dim hover:text-text-main hover:bg-subtle transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 顶部快速查询与物料识别条 */}
        <div className="p-4 bg-surface border-b border-border-subtle flex items-center gap-3">
          <div className="flex-1 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-accent">
              C编号:
            </span>
            <input
              type="text"
              value={cPartInput}
              onChange={(e) => setCPartInput(e.target.value.trim().toUpperCase())}
              placeholder="例如: C2934560, C2057"
              className="w-full bg-surface-subtle border border-border-subtle rounded-xl pl-16 pr-3 py-2 text-xs font-mono font-semibold text-text-main focus:outline-none focus:border-accent"
              onKeyDown={(e) => {
                if (e.key === 'Enter') loadPreview(cPartInput);
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => loadPreview(cPartInput)}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl bg-subtle hover:bg-surface-hover border border-border-subtle text-xs font-medium text-text-main flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-accent' : ''}`} />
            <span>重新拉取</span>
          </button>
        </div>

        {/* 官方行情情报看板 */}
        {official && (
          <div className="px-5 py-2.5 bg-accent/5 border-b border-accent/15 flex items-center justify-between text-xs">
            <div className="flex items-center gap-4">
              <span className="text-[11px] text-text-dim flex items-center gap-1">
                官方货源: <span className="font-semibold text-text-main">{official.manufacturer || '原厂直供'}</span>
              </span>
              {official.official_stock !== null && official.official_stock !== undefined && (
                <span className="text-[11px] text-text-dim">
                  立创实时库存: <span className="font-mono font-bold text-emerald-600">{official.official_stock.toLocaleString()} 件</span>
                </span>
              )}
              {official.official_price !== null && official.official_price !== undefined && (
                <span className="text-[11px] text-text-dim">
                  参考单价: <span className="font-mono font-bold text-accent">￥{official.official_price}</span>
                </span>
              )}
            </div>
            {official.datasheet_url && (
              <a
                href={official.datasheet_url}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-accent hover:underline flex items-center gap-1"
              >
                <span>查看规格书</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}

        {/* 主体比对列表 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {loading ? (
            <div className="py-20 text-center space-y-3">
              <RefreshCw className="w-7 h-7 text-accent animate-spin mx-auto opacity-80" />
              <p className="text-xs text-text-dim">正在从立创官方器件库同步最新规格数据...</p>
            </div>
          ) : !official ? (
            <div className="py-16 text-center text-text-dim text-xs">
              未能检索到官方物料数据，请检查立创 C 编号是否正确。
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-text-dim">
                  比对字段明细（勾选需同步覆盖的属性）：
                </span>
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="text-xs text-accent hover:underline font-medium"
                >
                  {selectedCount === diffFields.length ? '取消全选' : '全部勾选'}
                </button>
              </div>

              <div className="space-y-2.5">
                {diffFields.map((field) => {
                  const isChecked = !!selectedFields[field.key];
                  const hasOfficial =
                    field.officialVal !== undefined &&
                    field.officialVal !== null &&
                    field.officialVal !== '';

                  return (
                    <div
                      key={field.key}
                      onClick={() => {
                        if (hasOfficial) {
                          setSelectedFields((prev) => ({
                            ...prev,
                            [field.key]: !prev[field.key],
                          }));
                        }
                      }}
                      className={`p-3 rounded-xl border transition-all cursor-pointer ${
                        isChecked
                          ? 'bg-accent/5 border-accent/40 shadow-sm'
                          : 'bg-surface border-border-subtle hover:border-border-strong opacity-80'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={!hasOfficial}
                            onChange={() => {}} // handled by row click
                            className="rounded border-border-subtle text-accent focus:ring-accent"
                          />
                          <span className="font-semibold text-xs text-text-main flex items-center gap-1.5">
                            {field.label}
                          </span>
                          {field.isDirtyCorrection && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/10 text-rose-500 font-medium flex items-center gap-0.5">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              建议纠偏
                            </span>
                          )}
                          {field.isDifferent && !field.isDirtyCorrection && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-600 font-medium">
                              发现新数据
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 左右数值比对 */}
                      <div className="grid grid-cols-2 gap-3 mt-2 text-xs">
                        {/* 当前本地值 */}
                        <div className="bg-subtle/50 p-2 rounded-lg border border-border-subtle/60">
                          <span className="text-[10px] text-text-dim block mb-0.5">当前在库值:</span>
                          <div
                            className={`font-mono text-xs break-all ${
                              field.isDirtyCorrection ? 'text-rose-500 line-through' : 'text-text-dim'
                            }`}
                          >
                            {field.currentVal || (
                              <span className="italic text-text-dim/60 font-sans">（未填写/空）</span>
                            )}
                          </div>
                        </div>

                        {/* 立创官方值 */}
                        <div className="bg-accent/10 p-2 rounded-lg border border-accent/20">
                          <span className="text-[10px] text-accent font-medium block mb-0.5 flex items-center justify-between">
                            <span>立创官方值:</span>
                            {field.key === 'image_url' && field.officialVal && (
                              <a
                                href={field.officialVal}
                                target="_blank"
                                rel="noreferrer"
                                className="text-accent underline text-[10px]"
                                onClick={(e) => e.stopPropagation()}
                              >
                                查看原图
                              </a>
                            )}
                          </span>
                          <div className="font-mono text-xs font-semibold text-text-main break-all flex items-center gap-1.5">
                            {field.key === 'image_url' && field.officialVal ? (
                              <div className="flex items-center gap-2">
                                <img
                                  src={field.officialVal}
                                  alt="预览"
                                  className="w-8 h-8 rounded object-cover border border-border-subtle bg-white"
                                />
                                <span className="text-[10px] text-text-dim truncate max-w-[150px]">
                                  官方实物高清图
                                </span>
                              </div>
                            ) : field.officialVal ? (
                              <span>{String(field.officialVal)}</span>
                            ) : (
                              <span className="italic text-text-dim font-sans font-normal">
                                （官方未提供）
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-border-subtle bg-surface-subtle flex items-center justify-between">
          <div className="text-xs text-text-dim">
            已选择 <span className="font-bold text-accent font-mono">{selectedCount}</span> 项待校准字段
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-xs font-medium text-text-dim hover:text-text-main hover:bg-subtle transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={saving || selectedCount === 0}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-accent text-white hover:opacity-90 active:scale-95 transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>正在更新...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>确认校准覆盖 ({selectedCount})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
