// src/customer-entry.models.ts

export interface CustomerEntry {
  id?:          number;
  entryDate:    string;   // YYYY-MM-DD

  // ── Ownership ─────────────────────────────────────────────────────────────
  createdByUserId?: number;  // FK → Users.Id (set automatically from JWT on create)

  // ── Employee ──────────────────────────────────────────────────────────────
  employeeName: string;
  employeeId:   string;

  // ── Verification (Qty) ───────────────────────────────────────────────────
  avcQty:             number;
  pvcQty:             number;
  emailWhatsappQty:   number;

  // ── Engati (Checkbox) ────────────────────────────────────────────────────
  engatiAriser:    boolean;
  engatiUdhayam:   boolean;

  // ── Exchange (Qty) ───────────────────────────────────────────────────────
  exchangePickupQty:            number;
  exchangeCallQty:              number;
  exchangeOrderReplacementQty:  number;

  // ── Purchase Order (Qty) ─────────────────────────────────────────────────
  poQty: number;

  // ── Mail (Checkbox) ──────────────────────────────────────────────────────
  mailAriser:   boolean;
  mailUdhayam:  boolean;

  // ── Loox (Checkbox) ──────────────────────────────────────────────────────
  looxAriser:   boolean;
  looxUdhayam:  boolean;

  // ── Facebook (Checkbox) ──────────────────────────────────────────────────
  facebookAriser:   boolean;
  facebookUdhayam:  boolean;

  // ── Single Checkboxes ────────────────────────────────────────────────────
  ndr:           boolean;
  mis:           boolean;
  postOfficeMail: boolean;

  // ── Refund (Amount) ──────────────────────────────────────────────────────
  refundPrepaidAmount: number;
  refundCodAmount:     number;

  // ── Payment Link (Amount) ────────────────────────────────────────────────
  paymentLinkAmount: number;

  // ── Offline Order (Qty + Amount) ─────────────────────────────────────────
  offlineOrderQty:    number;
  offlineOrderAmount: number;

  // ── Manual Order (Qty + Amount) ──────────────────────────────────────────
  manualOrderQty:    number;
  manualOrderAmount: number;

  createdAt?: string;
  updatedAt?: string;
}

export function emptyCustomerEntry(): Omit<CustomerEntry, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    entryDate:    new Date().toISOString().split('T')[0],
    employeeName: '',
    employeeId:   '',
    avcQty:             0,
    pvcQty:             0,
    emailWhatsappQty:   0,
    engatiAriser:    false,
    engatiUdhayam:   false,
    exchangePickupQty:            0,
    exchangeCallQty:              0,
    exchangeOrderReplacementQty:  0,
    poQty: 0,
    mailAriser:   false,
    mailUdhayam:  false,
    looxAriser:   false,
    looxUdhayam:  false,
    facebookAriser:   false,
    facebookUdhayam:  false,
    ndr:           false,
    mis:           false,
    postOfficeMail: false,
    refundPrepaidAmount: 0,
    refundCodAmount:     0,
    paymentLinkAmount:   0,
    offlineOrderQty:    0,
    offlineOrderAmount: 0,
    manualOrderQty:    0,
    manualOrderAmount: 0,
  };
}