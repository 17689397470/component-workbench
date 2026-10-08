export interface StorageBox {
  name: string;
  box_name?: string;
  totalTypes: number;
  item_count?: number;
  totalPieces: number;
  total_quantity?: number;
  lowStockTypes?: number;
  low_stock_count?: number;
  topCategories?: string[];
  categories_list?: string[];
  qr_data_url?: string;
}

export interface BoxComponentDetail {
  id: number;
  name: string;
  category: string;
  package?: string;
  value?: string;
  quantity: number;
  lcsc_part?: string;
  notes?: string;
}
