export type PriceMatchStatus = 'Matched' | 'Unmatched';

export interface PriceLabelTemplate {
  companyName: string;
  unitLine: string;
  website: string;
  email: string;
  customerCare: string;
  countryOfOrigin: string;
}

export interface ItemMasterMeta {
  hasData: boolean;
  totalItems: number;
  lastUploadFileName: string | null;
  lastUploadedAt: string | null;
}

export interface ItemMasterItem {
  id: number;
  skuCode: string;
  itemName: string;
  category: string;
  color: string;
  brand: string;
  hsnCode: string;
  tat: string;
  size: string;
  weight: string;
  costPrice: number;
  mrp: number;
  batchGroup: string;
  ean: string;
  dimensions: string;
  taxType: string;
  enabled: string;
  itemType: string;
  expirable: string;
  skuType: string;
  image: string;
  pageUrl: string;
  sourceFileName: string | null;
  updatedAt: string;
}

export interface ItemMasterPage {
  meta: ItemMasterMeta;
  data: ItemMasterItem[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface PickListSessionMeta {
  itemMasterFileName: string | null;
  itemMasterUploadedAt: string | null;
  pickListFileName: string | null;
}

export interface PriceConfigItem {
  serialNo: number;
  skuCode: string;
  pickListName: string;
  itemName: string;
  brand: string;
  category: string;
  shelfCode: string;
  size: string;
  color: string;
  qty: number;
  labelQty: number;
  costPrice: number;
  currentPrice: number;
  totalPrice: number;
  hsnCode: string;
  ean: string;
  weight: string;
  pageUrl: string;
  matchStatus: PriceMatchStatus;
  notes: string;
}

export interface PriceConfigPreview extends PickListSessionMeta {
  pickListNo: string;
  pickListCreatedAt: string | null;
  totalLines: number;
  totalQuantity: number;
  matchedCount: number;
  unmatchedCount: number;
  labelTemplate: PriceLabelTemplate;
  items: PriceConfigItem[];
}

export interface PriceConfigRecordSummary {
  id: number;
  configurationNo: string;
  pickListNo: string;
  totalLines: number;
  totalQuantity: number;
  matchedCount: number;
  unmatchedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PriceConfigRecord extends PriceConfigPreview {
  id: number;
  configurationNo: string;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}
