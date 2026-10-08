export type BoxType = 'GRID' | 'BOOK' | 'BIN';
export type SlotNaming = 'LETTER_NUM' | 'NUM_NUM' | 'NUM' | 'FREE';

export interface StorageBoxConfig {
  id: number | null;
  name: string;
  box_type: BoxType;
  rows?: number | null;
  cols?: number | null;
  pages?: number | null;
  slot_naming?: SlotNaming;
  color?: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

export interface StorageBoxSummary extends StorageBoxConfig {
  total_slots: number | null;
  occupied_slots: number;
  empty_slots: number | null;
  occupancy_rate: number | null;
  item_count: number;
  total_quantity: number;
  low_stock_count: number;
  categories: string[];
  packages: string[];
  has_unassigned: boolean;
  // Backward compatibility fields
  totalTypes?: number;
  totalPieces?: number;
  lowStockTypes?: number;
  topCategories?: string[];
}

// 兼容别名
export type StorageBox = StorageBoxSummary;

export interface BoxComponentDetail {
  id: number;
  name: string;
  category: string;
  package?: string;
  value?: string;
  quantity: number;
  lcsc_part?: string;
  manufacturer?: string;
  image_url?: string;
  location?: string;
  notes?: string;
  min_stock?: number;
  tolerance?: string;
  voltage?: string;
}

export interface BoxGridSlot {
  slot: string;
  row?: number;
  col?: number;
  page?: number;
  index?: number;
  components: BoxComponentDetail[];
  isOccupied: boolean;
}

export interface BoxGridResponseData {
  box: StorageBoxConfig;
  page?: number;
  totalPages?: number;
  grid: BoxGridSlot[];
  unassigned: BoxComponentDetail[];
}

export interface BoxLocatorData {
  location: string;
  box_name: string;
  slot: string | null;
  box_config: StorageBoxConfig | null;
  parsed: {
    baseName: string;
    slot: string | null;
    page?: number;
  };
}

