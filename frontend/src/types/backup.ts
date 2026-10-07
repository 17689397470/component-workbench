export interface DatabaseSnapshot {
  filename: string;
  size: number;
  sizeFormatted: string;
  mtime: string;
  createdAt: string;
  reason: string;
}

export interface BackupExportData {
  version: string;
  exportedAt: string;
  counts: {
    components: number;
    projects: number;
    stock_logs: number;
  };
}
