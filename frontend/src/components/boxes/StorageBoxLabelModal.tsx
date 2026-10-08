import React, { useState, useEffect, useMemo, useRef } from 'react';
import QRCode from 'qrcode';
import {
  StorageBoxSummary,
  StorageBoxConfig,
  BoxGridResponseData,
  BoxGridSlot,
  BoxComponentDetail,
} from '../../types/box';
import { boxApi } from '../../api/boxApi';
import { useToastStore } from '../../store/useToastStore';
import { Modal } from '../ui/Modal';
import {
  Printer,
  Sliders,
  Check,
  CheckSquare,
  Square,
  Sparkles,
  Download,
  Copy,
  Layers,
  QrCode,
  Tag,
  Grid,
  FileText,
  HelpCircle,
  Eye,
  RefreshCw,
} from 'lucide-react';

interface StorageBoxLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  boxSummary: StorageBoxSummary | StorageBoxConfig | null;
  zIndex?: number;
}

type MediaLayout = 'THERMAL_40x30' | 'THERMAL_40x20' | 'A4_SHEET' | 'COVER_CARD';
type LabelTemplate = 'STANDARD' | 'BIG_TEXT' | 'FULL_SPEC';
type PrintRange = 'ALL' | 'OCCUPIED_ONLY' | 'SELECTED';

interface PrintableLabelItem {
  slot: string;
  isOccupied: boolean;
  component: BoxComponentDetail | null;
  qrDataUrl?: string;
}

export const StorageBoxLabelModal: React.FC<StorageBoxLabelModalProps> = ({
  isOpen,
  onClose,
  boxSummary,
  zIndex = 85,
}) => {
  const { showToast } = useToastStore();

  const [loading, setLoading] = useState(false);
  const [gridData, setGridData] = useState<BoxGridResponseData | null>(null);

  // 打印配置状态
  const [mediaLayout, setMediaLayout] = useState<MediaLayout>('THERMAL_40x30');
  const [template, setTemplate] = useState<LabelTemplate>('STANDARD');
  const [printRange, setPrintRange] = useState<PrintRange>('OCCUPIED_ONLY');
  const [includeCoverCard, setIncludeCoverCard] = useState<boolean>(true);
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set());

  // 封面大二维码
  const [coverQrUrl, setCoverQrUrl] = useState<string>('');

  // 缓存每个物料的二维码
  const [qrMap, setQrMap] = useState<Record<string, string>>({});

  // 加载收纳盒网格物料数据
  const loadBoxData = async () => {
    if (!boxSummary?.name) return;
    setLoading(true);
    try {
      const res = await boxApi.getBoxGrid(boxSummary.name, 1);
      if (res.success && res.data) {
        setGridData(res.data);

        // 默认将所有占用的槽位勾选
        const occupied = new Set<string>();
        res.data.grid.forEach((s) => {
          if (s.isOccupied) occupied.add(s.slot);
        });
        setSelectedSlots(occupied);
      }
    } catch (err: any) {
      showToast('获取收纳盒网格数据失败: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && boxSummary) {
      loadBoxData();
    }
  }, [isOpen, boxSummary?.name]);

  // 生成封面大二维码
  useEffect(() => {
    if (!boxSummary?.name) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const boxUrl = `${origin}/?box=${encodeURIComponent(boxSummary.name)}`;
    QRCode.toDataURL(boxUrl, { width: 180, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => setCoverQrUrl(url))
      .catch((e) => console.error(e));
  }, [boxSummary?.name]);

  // 为每个格位生成快捷盘点二维码
  useEffect(() => {
    if (!gridData?.grid) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const newQrMap: Record<string, string> = {};

    const generateQrs = async () => {
      for (const slotItem of gridData.grid) {
        const comp = slotItem.components[0];
        if (comp) {
          // 手机扫码直达盘点下账 URL
          const targetUrl = `${origin}/?quick_adjust=1&cid=${comp.id}&slot=${encodeURIComponent(
            slotItem.slot
          )}`;
          try {
            const dataUrl = await QRCode.toDataURL(targetUrl, {
              width: 120,
              margin: 1,
              errorCorrectionLevel: 'M',
            });
            newQrMap[slotItem.slot] = dataUrl;
          } catch (e) {
            console.error(e);
          }
        }
      }
      setQrMap(newQrMap);
    };

    generateQrs();
  }, [gridData?.grid]);

  // 计算当前要打印的标签项列表
  const printableItems: PrintableLabelItem[] = useMemo(() => {
    if (!gridData?.grid) return [];

    return gridData.grid
      .filter((s) => {
        if (printRange === 'ALL') return true;
        if (printRange === 'OCCUPIED_ONLY') return s.isOccupied;
        if (printRange === 'SELECTED') return selectedSlots.has(s.slot);
        return true;
      })
      .map((s) => ({
        slot: s.slot,
        isOccupied: s.isOccupied,
        component: s.components[0] || null,
        qrDataUrl: qrMap[s.slot],
      }));
  }, [gridData?.grid, printRange, selectedSlots, qrMap]);

  // 计算盒内品类标签
  const boxCategories = useMemo(() => {
    if ((boxSummary as any)?.categories && Array.isArray((boxSummary as any).categories)) {
      return (boxSummary as any).categories as string[];
    }
    const set = new Set<string>();
    gridData?.grid?.forEach((s) => s.components.forEach((c) => set.add(c.category)));
    return Array.from(set);
  }, [boxSummary, gridData]);

  // 全选 / 全不选
  const handleToggleSelectAll = () => {
    if (!gridData?.grid) return;
    if (selectedSlots.size === gridData.grid.length) {
      setSelectedSlots(new Set());
    } else {
      const all = new Set<string>();
      gridData.grid.forEach((s) => all.add(s.slot));
      setSelectedSlots(all);
    }
  };

  const handleToggleSlot = (slot: string) => {
    const next = new Set(selectedSlots);
    if (next.has(slot)) {
      next.delete(slot);
    } else {
      next.add(slot);
    }
    setSelectedSlots(next);
  };

  // 执行浏览器原生打印
  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  const totalSlotsCount = gridData?.grid.length || 0;
  const occupiedSlotsCount = gridData?.grid.filter((s) => s.isOccupied).length || 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      zIndex={zIndex}
      maxWidth="max-w-6xl"
      title={
        <div className="flex items-center gap-2">
          <Printer className="w-5 h-5 text-accent" />
          <span className="font-bold text-text-main text-base">
            物理标签纸与二维码打印工作台 (Label Studio)
          </span>
          <span className="text-xs px-2 py-0.5 rounded-md bg-subtle text-text-muted border border-border-subtle font-mono">
            {boxSummary?.name}
          </span>
        </div>
      }
    >
      <div className="space-y-4">
        {/* 控制面板与参数选择栏 */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 p-3.5 bg-canvas border border-border-subtle rounded-2xl text-xs">
          {/* 1. 介质与尺寸 */}
          <div className="space-y-1.5">
            <label className="font-semibold text-text-muted flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-accent" />
              <span>打印介质与尺寸</span>
            </label>
            <select
              value={mediaLayout}
              onChange={(e) => setMediaLayout(e.target.value as MediaLayout)}
              className="w-full px-2.5 py-1.5 bg-surface border border-border-subtle rounded-xl text-text-main font-medium focus:outline-none focus:border-accent"
            >
              <option value="THERMAL_40x30">40×30 mm 标准热敏标签</option>
              <option value="THERMAL_40x20">40×20 mm 紧凑热敏标签</option>
              <option value="A4_SHEET">普通 A4 纸整板排版 (带裁切线)</option>
              <option value="COVER_CARD">收纳盒封面总览大铭牌 (80×50mm)</option>
            </select>
          </div>

          {/* 2. 票面设计模板 */}
          <div className="space-y-1.5">
            <label className="font-semibold text-text-muted flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-accent" />
              <span>票面展示模板</span>
            </label>
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value as LabelTemplate)}
              className="w-full px-2.5 py-1.5 bg-surface border border-border-subtle rounded-xl text-text-main font-medium focus:outline-none focus:border-accent"
            >
              <option value="STANDARD">工业标准版 (带微型二维码+立创号)</option>
              <option value="BIG_TEXT">极简大字版 (超大字号远距看清)</option>
              <option value="FULL_SPEC">全参数工坊版 (含备注与安全库存)</option>
            </select>
          </div>

          {/* 3. 打印范围 */}
          <div className="space-y-1.5">
            <label className="font-semibold text-text-muted flex items-center gap-1.5">
              <Grid className="w-3.5 h-3.5 text-accent" />
              <span>打印格位范围</span>
            </label>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setPrintRange('OCCUPIED_ONLY')}
                className={`flex-1 py-1 px-1.5 rounded-lg border text-[11px] transition-all truncate ${
                  printRange === 'OCCUPIED_ONLY'
                    ? 'bg-accent/15 border-accent text-accent font-bold'
                    : 'bg-surface border-border-subtle text-text-muted'
                }`}
                title={`仅打印在用格位 (${occupiedSlotsCount}格)`}
              >
                仅在用 ({occupiedSlotsCount})
              </button>
              <button
                type="button"
                onClick={() => setPrintRange('ALL')}
                className={`flex-1 py-1 px-1.5 rounded-lg border text-[11px] transition-all truncate ${
                  printRange === 'ALL'
                    ? 'bg-accent/15 border-accent text-accent font-bold'
                    : 'bg-surface border-border-subtle text-text-muted'
                }`}
                title={`打印全部格位 (${totalSlotsCount}格)`}
              >
                全量 ({totalSlotsCount})
              </button>
              <button
                type="button"
                onClick={() => setPrintRange('SELECTED')}
                className={`flex-1 py-1 px-1.5 rounded-lg border text-[11px] transition-all truncate ${
                  printRange === 'SELECTED'
                    ? 'bg-accent/15 border-accent text-accent font-bold'
                    : 'bg-surface border-border-subtle text-text-muted'
                }`}
                title={`自定义勾选 (${selectedSlots.size}格)`}
              >
                勾选 ({selectedSlots.size})
              </button>
            </div>
          </div>

          {/* 4. 附加选项与快速动作 */}
          <div className="flex flex-col justify-end space-y-1.5">
            <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-text-main pt-1">
              <input
                type="checkbox"
                checked={includeCoverCard}
                onChange={(e) => setIncludeCoverCard(e.target.checked)}
                className="rounded text-accent focus:ring-accent"
              />
              <span>首张附带收纳柜封面大铭牌</span>
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="w-full py-2 px-3 bg-accent hover:bg-accent-hover text-white rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all"
              >
                <Printer className="w-4 h-4" />
                <span>立即调用系统打印</span>
              </button>
            </div>
          </div>
        </div>

        {/* 勾选模式下的辅助选择条 */}
        {printRange === 'SELECTED' && (
          <div className="p-2.5 bg-subtle/60 border border-border-subtle rounded-xl flex items-center justify-between text-xs">
            <span className="text-text-dim">
              请在下方预览卡片中点击勾选需要打印的具体格位（已选{' '}
              <strong className="text-accent font-mono">{selectedSlots.size}</strong> 格）
            </span>
            <button
              type="button"
              onClick={handleToggleSelectAll}
              className="text-xs text-accent hover:underline font-semibold"
            >
              {selectedSlots.size === totalSlotsCount ? '取消全选' : '全部勾选'}
            </button>
          </div>
        )}

        {/* 标签高保真预览区 (支持屏幕显示与 @media print) */}
        <div className="relative border border-border-subtle rounded-2xl bg-canvas p-6 max-h-[520px] overflow-y-auto">
          {loading ? (
            <div className="py-24 text-center text-xs text-text-dim flex flex-col items-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-accent" />
              <span>正在排版高精度物理标签纸...</span>
            </div>
          ) : (
            <div id="print-sheet-container" className="space-y-6">
              {/* 1. 收纳柜外壳封面大铭牌 (可选) */}
              {(includeCoverCard || mediaLayout === 'COVER_CARD') && (
                <div className="print-label-page flex justify-center">
                  <div
                    className="w-[340px] h-[210px] bg-white border-2 border-slate-800 rounded-xl p-4 text-slate-900 shadow-md flex flex-col justify-between relative overflow-hidden select-none print:shadow-none print:border-black"
                    style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
                  >
                    {/* 顶部色彩色块 */}
                    <div
                      className="absolute top-0 left-0 right-0 h-3"
                      style={{ backgroundColor: boxSummary?.color || '#3B82F6' }}
                    />

                    <div>
                      <div className="flex items-start justify-between gap-2 pt-1 mb-2">
                        <div>
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            WORKSHOP STORAGE BOX
                          </div>
                          <h2 className="text-xl font-black text-slate-900 tracking-tight">
                            {boxSummary?.name}
                          </h2>
                          <div className="text-xs text-slate-600 mt-0.5">
                            {boxSummary?.description || '工坊物理元件存放柜'}
                          </div>
                        </div>

                        {coverQrUrl && (
                          <div className="text-center shrink-0">
                            <img
                              src={coverQrUrl}
                              alt="Box QR"
                              className="w-16 h-16 border border-slate-300 rounded-lg p-0.5"
                            />
                            <div className="text-[9px] text-slate-500 font-mono mt-0.5">扫码开网格</div>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1 my-2">
                        {boxCategories.slice(0, 4).map((c) => (
                          <span
                            key={c}
                            className="px-2 py-0.5 bg-slate-100 text-slate-800 rounded text-[10px] font-semibold"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-300 flex items-center justify-between text-[11px] font-mono text-slate-600">
                      <span>
                        规格: {boxSummary?.rows || 4}行 × {boxSummary?.cols || 6}列 ({totalSlotsCount}格)
                      </span>
                      <span>已入库: {occupiedSlotsCount} 种</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. 独立抽屉小标签列表 (按所选介质排版) */}
              {mediaLayout !== 'COVER_CARD' && (
                <div
                  className={
                    mediaLayout === 'A4_SHEET'
                      ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 justify-center'
                      : 'flex flex-wrap gap-3 justify-center'
                  }
                >
                  {printableItems.map((item) => {
                    const isSelected = selectedSlots.has(item.slot);
                    const comp = item.component;

                    // 标签尺寸样式
                    const isCompact = mediaLayout === 'THERMAL_40x20';
                    const labelWidth = isCompact ? 'w-[240px]' : 'w-[260px]';
                    const labelHeight = isCompact ? 'h-[130px]' : 'h-[160px]';

                    return (
                      <div
                        key={item.slot}
                        onClick={() => {
                          if (printRange === 'SELECTED') handleToggleSlot(item.slot);
                        }}
                        className={`print-label-item relative bg-white border-2 rounded-lg p-2.5 text-slate-900 shadow-sm flex flex-col justify-between transition-all select-none print:shadow-none print:border-black ${labelWidth} ${labelHeight} ${
                          item.isOccupied ? 'border-slate-800' : 'border-dashed border-slate-400'
                        } ${
                          printRange === 'SELECTED' && isSelected
                            ? 'ring-2 ring-accent border-accent'
                            : ''
                        } ${
                          printRange === 'SELECTED' && !isSelected ? 'opacity-40' : ''
                        }`}
                        style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
                      >
                        {/* 勾选模式指示图标 */}
                        {printRange === 'SELECTED' && (
                          <div className="absolute top-1 right-1 print:hidden text-accent">
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-accent fill-accent/20" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-400" />
                            )}
                          </div>
                        )}

                        {/* 顶栏：格位编号与官方立创编号 */}
                        <div className="flex items-center justify-between border-b border-slate-200 pb-1">
                          <span className="font-mono font-black text-sm text-slate-900 tracking-tight bg-slate-100 px-1.5 py-0.2 rounded border border-slate-300">
                            {item.slot}
                          </span>

                          {comp?.lcsc_part && (
                            <span className="font-mono font-bold text-[10px] text-slate-700">
                              {comp.lcsc_part}
                            </span>
                          )}
                        </div>

                        {/* 中间核心内容 */}
                        {comp ? (
                          <div className="my-auto flex items-center justify-between gap-1.5">
                            <div className="min-w-0 flex-1 pr-1">
                              {/* 规格阻容值 / 芯片名称 */}
                              <div
                                className={`font-black text-slate-900 leading-tight truncate ${
                                  template === 'BIG_TEXT' ? 'text-base font-extrabold' : 'text-xs'
                                }`}
                                title={comp.name}
                              >
                                {comp.value || comp.name}
                              </div>

                              {/* 封装形式与精度 */}
                              <div className="flex items-center gap-1 font-mono text-[10px] text-slate-600 mt-0.5 truncate">
                                {comp.package && (
                                  <span className="font-bold border border-slate-300 px-1 rounded bg-slate-50">
                                    {comp.package}
                                  </span>
                                )}
                                {comp.tolerance && <span>{comp.tolerance}</span>}
                                {comp.voltage && <span>{comp.voltage}V</span>}
                              </div>

                              {/* 全参数工坊版额外说明 */}
                              {template === 'FULL_SPEC' && (
                                <div className="text-[9px] text-slate-500 mt-1 truncate">
                                  {comp.notes ? `📝 ${comp.notes}` : `现存: ${comp.quantity}件`}
                                </div>
                              )}
                            </div>

                            {/* 微型二维码 (仅在标准版与全参数版展示) */}
                            {template !== 'BIG_TEXT' && item.qrDataUrl && (
                              <div className="shrink-0 text-center">
                                <img
                                  src={item.qrDataUrl}
                                  alt={item.slot}
                                  className="w-12 h-12 border border-slate-200 rounded p-0.2"
                                />
                                <div className="text-[8px] text-slate-400 font-mono scale-90 -mt-0.5">
                                  扫码盘点
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs py-2">
                            <span className="font-mono font-bold text-slate-500">{item.slot}</span>
                            <span className="text-[10px] mt-0.5">空白格位 (待填料)</span>
                          </div>
                        )}

                        {/* 底部信息条 */}
                        <div className="pt-1 border-t border-slate-200 flex items-center justify-between text-[9px] text-slate-500 font-mono">
                          <span className="truncate max-w-[130px]">{boxSummary?.name}</span>
                          {comp ? (
                            <span className="font-bold text-slate-700">{comp.quantity} 件</span>
                          ) : (
                            <span>EMPTY</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部按钮栏与打印提示 */}
        <div className="pt-2 border-t border-border-subtle flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
          <div className="text-text-dim flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-accent" />
            <span>
              打印技巧：在浏览器打印设置中，将<strong>边距设为「无」</strong>，并勾选<strong>「背景图形」</strong>以确保完整矢量输出。
            </span>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-text-muted hover:bg-subtle rounded-xl border border-border-subtle transition-colors"
            >
              关闭
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-1.5 bg-accent hover:bg-accent-hover text-white font-bold rounded-xl shadow-sm transition-all flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" />
              <span>开始打印 ({printableItems.length} 张标签)</span>
            </button>
          </div>
        </div>
      </div>

      {/* 注入浏览器高精度物理打印专属 CSS 规则 */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #print-sheet-container, #print-sheet-container * {
            visibility: visible !important;
          }
          #print-sheet-container {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: transparent !important;
          }
          .print-label-item, .print-label-page {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            margin-bottom: 8mm !important;
          }
        }
      `}</style>
    </Modal>
  );
};
