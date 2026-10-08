import React, { useState, useEffect } from 'react';
import { BoxLocatorData } from '../../types/box';
import { boxApi } from '../../api/boxApi';
import { Modal } from '../ui/Modal';
import { Compass, Box, Navigation, CheckCircle2, AlertCircle } from 'lucide-react';

interface LocationLocatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  componentId?: number;
  locationStr?: string;
  componentName?: string;
}

export const LocationLocatorModal: React.FC<LocationLocatorModalProps> = ({
  isOpen,
  onClose,
  componentId,
  locationStr,
  componentName,
}) => {
  const [loading, setLoading] = useState(false);
  const [locatorData, setLocatorData] = useState<BoxLocatorData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && (componentId || locationStr)) {
      setLoading(true);
      setError(null);
      boxApi
        .locateSlot({
          component_id: componentId,
          location: locationStr,
        })
        .then((res) => {
          if (res.success && res.data) {
            setLocatorData(res.data);
          } else {
            setError('未能识别当前仓位的物理网格坐标');
          }
        })
        .catch((err) => {
          setError(err.message || '定位查询失败');
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, componentId, locationStr]);

  if (!isOpen) return null;

  const boxConfig = locatorData?.box_config;
  const parsed = locatorData?.parsed;
  const targetSlot = (parsed?.slot || '').toUpperCase();
  const boxName = locatorData?.box_name || locationStr || '未命名收纳处';

  // 矩阵规格
  const rows = boxConfig?.rows || 4;
  const cols = boxConfig?.cols || 6;
  const isBook = boxConfig?.box_type === 'BOOK';

  // 构造网格坐标列表
  const slots: string[] = [];
  if (isBook) {
    const total = rows * cols;
    for (let i = 1; i <= total; i++) {
      slots.push(String(i).padStart(2, '0'));
    }
  } else {
    for (let r = 0; r < rows; r++) {
      const rowLetter = String.fromCharCode(65 + r);
      for (let c = 1; c <= cols; c++) {
        slots.push(`${rowLetter}${c}`);
      }
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      zIndex={70}
      title={
        <div className="flex items-center gap-2">
          <Compass className="w-5 h-5 text-accent animate-spin-slow" />
          <span className="font-bold text-text-main text-base">物理仓位透视罗盘</span>
        </div>
      }
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        {loading ? (
          <div className="py-16 text-center text-xs text-text-dim">正在追踪现实网格坐标...</div>
        ) : error ? (
          <div className="py-8 text-center text-xs text-text-dim flex flex-col items-center gap-2">
            <AlertCircle className="w-8 h-8 text-amber-500" />
            <span>{error}</span>
            <div className="font-mono text-text-muted mt-1">原始仓位: {locationStr}</div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 顶部物料与坐标卡 */}
            <div className="p-3.5 bg-canvas border border-border-subtle rounded-2xl flex items-center justify-between">
              <div>
                <div className="text-[11px] text-text-dim mb-0.5">元器件目标</div>
                <div className="text-sm font-bold text-text-main">
                  {componentName || '元器件'}
                </div>
              </div>

              <div className="text-right">
                <div className="text-[11px] text-text-dim mb-0.5">目标物理格位</div>
                <div className="text-base font-black font-mono text-accent flex items-center gap-1 justify-end">
                  <Navigation className="w-4 h-4 fill-accent" />
                  <span>{targetSlot || '散料暂存区'}</span>
                </div>
              </div>
            </div>

            {/* 收纳盒基本信息 */}
            <div className="flex items-center justify-between text-xs px-1 text-text-muted">
              <div className="flex items-center gap-2">
                <Box className="w-4 h-4 text-accent" />
                <span className="font-semibold text-text-main">{boxName}</span>
                {parsed?.page && (
                  <span className="px-1.5 py-0.5 bg-subtle text-accent rounded font-mono text-[11px] border border-border-subtle">
                    第 {parsed.page} 页
                  </span>
                )}
              </div>
              <span className="text-[11px] text-text-dim">
                {rows}行 × {cols}列 矩阵
              </span>
            </div>

            {/* 2D 网格立体高亮投射 */}
            <div className="p-4 bg-canvas border border-border-subtle rounded-2xl shadow-inner">
              <div
                className="grid gap-1.5 max-h-[300px] overflow-auto p-1"
                style={{
                  gridTemplateColumns: `repeat(${cols}, minmax(40px, 1fr))`,
                }}
              >
                {slots.map((s) => {
                  // 匹配目标槽位
                  // 兼容格式判断：例如目标是 B3，或者 P01-05 的 05
                  const isTarget =
                    targetSlot &&
                    (s.toUpperCase() === targetSlot ||
                      targetSlot.endsWith(`-${s}`) ||
                      targetSlot.includes(s));

                  return (
                    <div
                      key={s}
                      className={`h-11 rounded-lg border flex flex-col items-center justify-center font-mono text-[10px] font-bold transition-all relative ${
                        isTarget
                          ? 'bg-accent text-white border-accent ring-4 ring-accent/30 shadow-lg scale-105 z-10 animate-pulse'
                          : 'bg-surface text-text-dim border-border-subtle/80 hover:border-border-hover'
                      }`}
                    >
                      <span>{s}</span>
                      {isTarget && (
                        <div className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {!targetSlot && (
                <div className="mt-3 p-2 text-center text-xs text-amber-500 bg-amber-500/10 rounded-xl border border-amber-500/20">
                  ⚠️ 该物料保存在【{boxName}】中，但尚未划分到网格抽屉内（待分配散料）
                </div>
              )}
            </div>

            {/* 现实操作提示 */}
            <div className="p-3 bg-surface border border-border-subtle rounded-xl text-xs text-text-muted flex items-start gap-2">
              <div className="w-4 h-4 rounded-full bg-accent/10 text-accent flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                i
              </div>
              <div>
                工坊拣料提示：请在现实中的<strong>【{boxName}】</strong>柜体中，找到高亮标识的{' '}
                <strong className="text-accent font-mono">{targetSlot || '散料袋'}</strong> 抽屉。
              </div>
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-border-subtle flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold bg-accent text-white hover:bg-accent-hover rounded-xl shadow-sm transition-all"
          >
            知道了
          </button>
        </div>
      </div>
    </Modal>
  );
};
