// src/models/dispatch.models.ts

export interface DispatchItem {
  id?:        number;
  headerId?:  number;
  channel:    string;
  courier:    string;
  quantity:   number;
  sortOrder?: number;
}

export interface ReturnItem {
  id?:        number;
  headerId?:  number;
  channel:    string;
  courier:    string;
  rto:        number;
  cus:        number;
  sortOrder?: number;
}

export interface DispatchRecord {
  id?:            number;
  dispatchDate:   string;   // YYYY-MM-DD
  totalPersons:   number;
  pendingOrders:  number;
  onlyInvoiced:   string;
  createdAt?:     string;
  updatedAt?:     string;
  dispatchItems:  DispatchItem[];
  returnItems:    ReturnItem[];
}

// ── Default row templates (matching the image exactly) ──────────────────────

export const DEFAULT_DISPATCH_ROWS: DispatchItem[] = [
  { channel: 'Shopfiy',  courier: 'Bluedart',   quantity: 0 },
  { channel: '',         courier: 'Delivery',    quantity: 0 },
  { channel: '',         courier: 'ekart',       quantity: 0 },
  { channel: '',         courier: 'Speed Post',  quantity: 0 },
  { channel: 'Amazon',   courier: 'Flex',        quantity: 0 },
  { channel: '',         courier: 'Easy Ship',   quantity: 0 },
  { channel: 'Flipkart', courier: 'ekart',       quantity: 0 },
  { channel: '',         courier: 'Delivery',    quantity: 0 },
  { channel: '',         courier: 'MYNTRA',      quantity: 0 },
  { channel: '',         courier: 'Ecom',        quantity: 0 },
  { channel: 'MYNTRA',   courier: 'ekart',       quantity: 0 },
  { channel: 'JioMart',  courier: 'Xpressbee',  quantity: 0 },
  { channel: '',         courier: 'Ecom',        quantity: 0 },
  { channel: '',         courier: 'Delivery',    quantity: 0 },
  { channel: 'Ajio',     courier: 'Xpressbee',  quantity: 0 },
  { channel: '',         courier: 'Ecom',        quantity: 0 },
  { channel: '',         courier: 'Delivery',    quantity: 0 },
];

export const DEFAULT_RETURN_ROWS: ReturnItem[] = [
  { channel: 'Shopfiy',  courier: 'Bluedart',              rto: 0, cus: 0 },
  { channel: '',         courier: 'Delivery(Xpresssair)',   rto: 0, cus: 0 },
  { channel: '',         courier: 'ekart',                  rto: 0, cus: 0 },
  { channel: '',         courier: 'Delivery',               rto: 0, cus: 0 },
  { channel: '',         courier: 'Speed Post',             rto: 0, cus: 0 },
  { channel: 'Amazon',   courier: 'Flex',                   rto: 0, cus: 0 },
  { channel: '',         courier: 'Easy Ship',              rto: 0, cus: 0 },
  { channel: 'Flipkart', courier: 'ekart',                  rto: 0, cus: 0 },
  { channel: '',         courier: 'Ecom',                   rto: 0, cus: 0 },
  { channel: 'JioMart',  courier: 'Xpressbee',             rto: 0, cus: 0 },
  { channel: 'Ajio',     courier: 'Xpressbee',             rto: 0, cus: 0 },
];