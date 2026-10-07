import React, { useEffect, useState, useRef } from 'react';
import { useInventoryStore } from '../../store/useInventoryStore';
import { useToastStore } from '../../store/useToastStore';
import { backupApi } from '../../api/backupApi';
import { DatabaseSnapshot } from '../../types/backup';
import { Modal } from '../ui/Modal';
import { Download, Upload, RotateCcw, Plus, Database, ShieldCheck } from 'lucide-react';

export const BackupModal: React.FC = () => {
  const { isBackupModalOpen, setBackupModalOpen, fetchComponents, fetchStats } = useInventoryStore();
  const { showToast } = useToastStore();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [snapshots, setSnapshots] = useState<DatabaseSnapshot[]>([]);
  const [loading, setLoading] = useState(false);

  const loadSnapshots = async () => {
    setLoading(true);
    try {
      const res = await backupApi.getSnapshots();
      if (res.success && res.data) {
        setSnapshots(res.data);
      }
    } catch (err: any) {
      showToast('获取快照列表失败: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isBackupModalOpen) {
      loadSnapshots();
    }
  }, [isBackupModalOpen]);

  // 手动创建快照
  const handleCreateSnapshot = async () => {
    try {
      const res = await backupApi.createSnapshot('manual_ui');
      if (res.success) {
        showToast('✔ 本地保护快照已生成', 'success');
        loadSnapshots();
      }
    } catch (err: any) {
      showToast('生成快照失败: ' + err.message, 'error');
    }
  };

  // 一键安全回滚
  const handleRollback = async (filename: string) => {
    if (!window.confirm(`⚠️ 警告：确认回滚到快照 "${filename}" 吗？系统将在回滚前自动对当前数据创建保护备份。`)) {
      return;
    }

    try {
      const res = await backupApi.rollback(filename);
      if (res.success) {
        showToast('✔ 已成功回滚至指定快照！', 'success');
        fetchComponents();
        fetchStats();
        loadSnapshots();
      }
    } catch (err: any) {
      showToast('回滚异常: ' + err.message, 'error');
    }
  };

  // 导入全量 JSON 备份
  const handleImportFile = async (file: File) => {
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (!window.confirm(`确认从备份文件 "${file.name}" 恢复数据吗？系统将自动在恢复前生成快照保底。`)) {
        return;
      }

      const res = await backupApi.restoreBackup(json);
      if (res.success) {
        showToast(`✔ 恢复成功！恢复了 ${res.counts?.components || 0} 项物料`, 'success');
        fetchComponents();
        fetchStats();
        loadSnapshots();
      }
    } catch (err: any) {
      showToast('恢复备份失败: ' + err.message, 'error');
    }
  };

  return (
    <Modal
      isOpen={isBackupModalOpen}
      onClose={() => setBackupModalOpen(false)}
      title={
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-accent" />
          <span>🛡️ 数据安全与备份中心</span>
        </div>
      }
      maxWidth="max-w-xl"
    >
      <div className="space-y-5 text-xs">
        {/* 全量导出与导入区域 */}
        <div className="p-4 bg-canvas border border-border-subtle rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            <div className="font-semibold text-text-main flex items-center gap-1.5">
              <Database className="w-4 h-4 text-accent" />
              <span>全量数据备份 (JSON)</span>
            </div>
            <div className="text-[11px] text-text-dim mt-0.5">
              包含元器件、物理收纳盒、BOM及出入库流水，安全无锁导出
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <a
              href="/api/backup/export"
              download
              className="flex-1 sm:flex-none px-3.5 py-2 bg-surface hover:bg-surface-hover border border-border-subtle rounded-xl font-medium text-text-main flex items-center justify-center gap-1.5 shadow-sm transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>下载备份</span>
            </a>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={(e) => e.target.files?.[0] && handleImportFile(e.target.files[0])}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 sm:flex-none px-3.5 py-2 bg-surface hover:bg-surface-hover border border-border-subtle rounded-xl font-medium text-accent flex items-center justify-center gap-1.5 shadow-sm transition-all"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>恢复备份</span>
            </button>
          </div>
        </div>

        {/* 本地自动/手动快照时间胶囊 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="font-semibold text-text-main flex items-center gap-1.5">
                <span>⏳ 本地 SQLite 热快照列表</span>
                <span className="text-[10px] text-text-dim">({snapshots.length} 份可用)</span>
              </div>
              <div className="text-[11px] text-text-dim mt-0.5">
                基于 SQLite VACUUM INTO 机制，零锁表、零脏读，支持一键安全回滚
              </div>
            </div>

            <button
              type="button"
              onClick={handleCreateSnapshot}
              className="px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-semibold flex items-center gap-1 hover:opacity-90 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>创建快照</span>
            </button>
          </div>

          {loading ? (
            <div className="py-12 text-center text-text-dim">加载快照清单中...</div>
          ) : snapshots.length === 0 ? (
            <div className="py-8 text-center text-text-dim bg-canvas border border-dashed border-border-subtle rounded-xl">
              暂无历史快照，点击右上角「创建快照」即可存入第一份保护副本
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {snapshots.map((snap) => (
                <div
                  key={snap.filename}
                  className="p-3 bg-canvas border border-border-subtle rounded-xl flex items-center justify-between text-xs hover:border-border-hover transition-colors"
                >
                  <div>
                    <div className="font-mono font-semibold text-text-main text-[11px]">
                      {snap.filename}
                    </div>
                    <div className="text-[10px] text-text-dim mt-0.5 flex items-center gap-2">
                      <span>{snap.sizeFormatted}</span>
                      <span>·</span>
                      <span>{new Date(snap.createdAt).toLocaleString()}</span>
                      <span>·</span>
                      <span className="text-accent">{snap.reason}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRollback(snap.filename)}
                    className="px-2.5 py-1 bg-surface hover:bg-amber-50 text-text-muted hover:text-amber-700 border border-border-subtle rounded-lg text-xs font-medium flex items-center gap-1 shadow-sm transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>回滚此版本</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
