import React, { useEffect, useState } from 'react';
import { boxApi } from '../api/boxApi';
import { StorageBox, BoxComponentDetail } from '../types/box';
import { useToastStore } from '../store/useToastStore';
import { Drawer } from '../components/ui/Drawer';
import { Layers, Box, Tag, ChevronRight, Printer } from 'lucide-react';

export const BoxesView: React.FC = () => {
  const { showToast } = useToastStore();
  const [boxes, setBoxes] = useState<StorageBox[]>([]);
  const [loading, setLoading] = useState(false);

  // 选中收纳盒透视
  const [selectedBox, setSelectedBox] = useState<string | null>(null);
  const [boxDetails, setBoxDetails] = useState<BoxComponentDetail[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const fetchBoxes = async () => {
    setLoading(true);
    try {
      const res = await boxApi.getAllBoxes();
      if (res.success && res.data) {
        setBoxes(res.data);
      }
    } catch (err: any) {
      showToast('获取收纳盒失败: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBoxes();
  }, []);

  const handleOpenBox = async (boxName: string) => {
    setSelectedBox(boxName);
    setDetailsLoading(true);
    try {
      const res = await boxApi.getBoxDetails(boxName);
      if (res.success && res.data) {
        setBoxDetails(res.data);
      }
    } catch (err: any) {
      showToast('获取盒内清单失败: ' + err.message, 'error');
    } finally {
      setDetailsLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5">
      {/* 顶部标题区 */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-text-main flex items-center gap-2">
            <Layers className="w-5 h-5 text-accent" />
            <span>物理收纳空间透视图</span>
          </h1>
          <p className="text-xs text-text-muted mt-0.5">
            立体透视每个收纳盒、料盒与抽屉内的元器件。点击卡片可透视盒内清单。
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-24 text-center text-xs text-text-dim">正在透视物理收纳盒...</div>
      ) : boxes.length === 0 ? (
        <div className="py-16 text-center text-sm text-text-dim bg-surface border border-dashed border-border-subtle rounded-2xl">
          暂无收纳空间数据，录入物料并指定存放位置即可自动聚合
        </div>
      ) : (
        /* 立体微抽屉卡片网格 */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {boxes.map((box) => (
            <div
              key={box.name}
              onClick={() => handleOpenBox(box.name)}
              className="bg-surface border border-border-subtle hover:border-border-hover rounded-2xl p-4 shadow-sm hover:shadow-md cursor-pointer transition-all flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-accent/10 text-accent flex items-center justify-center font-bold text-sm">
                      <Box className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-sm text-text-main group-hover:text-accent transition-colors">
                      {box.name}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-text-dim group-hover:translate-x-0.5 transition-transform" />
                </div>

                {/* 盒内主品类 */}
                <div className="flex flex-wrap gap-1 mb-3">
                  {box.topCategories?.slice(0, 3).map((cat: string) => (
                    <span
                      key={cat}
                      className="px-2 py-0.5 bg-subtle border border-border-subtle rounded-md text-[10px] text-text-muted"
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              </div>

              {/* 统计指标 */}
              <div className="pt-3 border-t border-dashed border-border-subtle flex items-center justify-between text-xs">
                <div>
                  <span className="text-text-dim text-[11px]">品类:</span>{' '}
                  <strong className="font-mono text-text-main">{box.totalTypes}</strong> 种
                </div>
                <div>
                  <span className="text-text-dim text-[11px]">总量:</span>{' '}
                  <strong className="font-mono text-accent font-bold">{box.totalPieces}</strong> 件
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 盒内元器件透视抽屉 */}
      <Drawer
        isOpen={!!selectedBox}
        onClose={() => setSelectedBox(null)}
        title={`🗄️ ${selectedBox || ''}`}
        subtitle={`共含有 ${boxDetails.length} 种元器件`}
      >
        {detailsLoading ? (
          <div className="py-20 text-center text-xs text-text-dim">正在提取盒内清单...</div>
        ) : boxDetails.length === 0 ? (
          <div className="py-12 text-center text-xs text-text-dim">该收纳盒当前暂无物料</div>
        ) : (
          <div className="space-y-2.5">
            {boxDetails.map((item) => (
              <div
                key={item.id}
                className="p-3 bg-canvas border border-border-subtle rounded-xl flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-semibold text-text-main">{item.name}</div>
                  <div className="text-[11px] text-text-dim mt-0.5">
                    {item.package || '-'} · {item.value || '-'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-sm text-text-main">{item.quantity}</div>
                  <span className="text-[10px] text-text-dim">件</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Drawer>
    </div>
  );
};
