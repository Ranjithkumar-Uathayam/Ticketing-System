export type HWCategory     = 'Desktop' | 'Laptop' | 'Printer' | 'Scanner' | 'Other';
export type HWStatus       = 'Active' | 'Spare' | 'Faulty' | 'In Repair' | 'Disposed' | 'New';
export type WarrantyStatus = 'In Warranty' | 'Out of Warranty' | 'Expired' | 'Unknown';
export type HWLocation     = 'BandB' | 'BandR Thindal' | 'BandR Nasiyanur';
export type HWFloor        = 'Ground Floor' | 'I st Floor' | 'II nd Floor' | 'III rd Floor' | 'Office' | 'Security';
export type OSVersion      = 'Windows 10' | 'Windows 11' | 'N/A';
 
export const HW_CATEGORIES: HWCategory[]       = ['Desktop', 'Laptop', 'Printer', 'Scanner', 'Other'];
export const HW_STATUSES: HWStatus[]            = ['Active', 'Spare', 'Faulty', 'In Repair', 'Disposed', 'New'];
export const WARRANTY_STATUSES: WarrantyStatus[] = ['In Warranty', 'Out of Warranty', 'Expired', 'Unknown'];
export const HW_LOCATIONS: HWLocation[]         = ['BandB', 'BandR Thindal', 'BandR Nasiyanur'];
export const HW_FLOORS: HWFloor[]               = ['Ground Floor', 'I st Floor', 'II nd Floor', 'III rd Floor', 'Office', 'Security'];
export const OS_VERSIONS: OSVersion[]           = ['Windows 10', 'Windows 11', 'N/A'];
 
export const HW_DEPARTMENTS = [
  'Accessories', 'Accounts', 'Admin', 'AO', 'AP CC', 'B2B', 'B2B CC', 'Billing',
  'CAD', 'Cashier', 'Cashier Assist', 'Common PC', 'Designer', 'Dhoti', 'Dispatch',
  'EDP', 'Ecommerce', 'Electrical Team', 'Fabric', 'Factory Manager', 'Garments',
  'GM', 'Greige', 'HR', 'HR Manager', 'HR Team', 'IE', 'ISO', 'IT Manager',
  'IT-HW', 'Internal Audit', 'Inventory', 'KA CC', 'KA-AP-TS CC', 'KL CC', 'LAB',
  'MIS', 'MMD', 'Meeting Room', 'OTC', 'Online', 'Online CC', 'Readymade',
  'Reception', 'Sample Team', 'Security', 'Security Room', 'TN CC', 'TS CC',
  'Transport', 'Warehouse',
] as const;
 
export interface HWAsset {
  id?:              number;
  assetId:          string;
  category:         HWCategory;
  manufacturer:     string;
  model:            string;
  serialNumber:     string;
  location:         HWLocation;
  floor?:           HWFloor | null;
  department?:      string | null;
  assignedTo?:      string | null;
  place?:           string | null;
  processor?:       string | null;
  ramGb?:           string | null;
  hddGbTb?:         string | null;
  ssdGbTb?:         string | null;
  os?:              OSVersion | null;
  ipAddress?:       string | null;
  status:           HWStatus;
  warrantyStatus:   WarrantyStatus;
  warrantyExpiry?:  string | null;
  antivirusActive?: boolean | null;
  remarks?:         string | null;
  createdAt?:       string;
  updatedAt?:       string;
}
 
export interface HWInventorySummary {
  total:                number;
  byCategory:           Record<HWCategory, number>;
  byStatus:             Record<HWStatus, number>;
  byLocation:           Record<HWLocation, number>;
  warrantyExpiringSoon: number;
  warrantyExpired:      number;
}