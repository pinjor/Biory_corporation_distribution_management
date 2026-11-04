/** The unsaved New Order form, kept on the device so a reload or dropped connection doesn't lose it. */
export const ORDER_DRAFT_KEY = "pf-order-draft";

export interface OrderDraft {
  chemist: string;
  qty: Record<string, number>;
  so: string;
  extra: string;
  remarks: string;
}
