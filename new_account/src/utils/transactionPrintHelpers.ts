import type { TransactionPrintLine, TransactionPrintTaxLine } from "../types/transactionPrint";
import { formatPrintMoney } from "./formatPrintDocument";

export function salesLineTotal(item: {
  unit_price?: number | string;
  quantity?: number | string;
  discount_percent?: number | string;
}): number {
  return (
    Number(item.unit_price || 0) *
    Number(item.quantity || 0) *
    (1 - Number(item.discount_percent || 0) / 100)
  );
}

export function buildSalesOrderPrintLines(
  orderDetails: any[],
  stockMasters: any[],
  itemUnits: any[]
): TransactionPrintLine[] {
  return orderDetails.map((item) => {
    const itemData = stockMasters.find((i) => i.stock_id === item.stk_code);
    const unitData = itemUnits.find((u) => u.id === itemData?.units);
    const unitName = unitData?.abbr || item.units || "—";
    return {
      item: item.stk_code || "—",
      description: item.description || "—",
      quantity: item.quantity ?? "—",
      unit: unitName,
      price: formatPrintMoney(item.unit_price || 0),
      discount: item.discount_percent ? `${item.discount_percent}%` : "—",
      total: formatPrintMoney(salesLineTotal(item)),
    };
  });
}

export function computeSalesTaxLines(
  subtotal: number,
  taxGroupItems: any[],
  taxTypes: any[],
  taxIncluded: boolean
): TransactionPrintTaxLine[] {
  if (taxGroupItems.length === 0) {
    return [];
  }

  return taxGroupItems.map((item) => {
    const taxTypeData = taxTypes.find((t) => t.id === item.tax_type_id);
    const taxRate = Number(taxTypeData?.default_rate || 0);
    const taxName = taxTypeData?.description || "Tax";
    const taxAmount = taxIncluded
      ? subtotal - subtotal / (1 + taxRate / 100)
      : subtotal * (taxRate / 100);

    return {
      label: `${taxName} (${taxRate}%)`,
      amount: taxAmount,
    };
  });
}

export function buildPurchaseOrderPrintLines(
  rows: Array<{
    itemCode?: string;
    description?: string;
    quantity?: number | string;
    unit?: string;
    price?: number | string;
    lineTotal?: number | string;
  }>,
  resolveUnit?: (row: any) => string
): TransactionPrintLine[] {
  return rows.map((row) => ({
    item: row.itemCode || "—",
    description: row.description || "—",
    quantity: row.quantity ?? "—",
    unit: resolveUnit?.(row) || row.unit || "—",
    price: formatPrintMoney(row.price || 0),
    total: formatPrintMoney(row.lineTotal ?? Number(row.quantity || 0) * Number(row.price || 0)),
  }));
}

export function buildDebtorDetailPrintLines(
  details: any[],
  stockMasters: any[],
  itemUnits: any[],
  includePricing = true
): TransactionPrintLine[] {
  return details.map((detail) => {
    const itemFound = stockMasters.find(
      (item) => String(item.stock_id) === String(detail.stock_id)
    );
    const unitFound = itemUnits.find(
      (unit) => String(unit.id) === String(itemFound?.units)
    );
    const qty = Number(detail.quantity || 0);
    const price = Number(detail.unit_price || 0);
    const disc = Number(detail.discount_percent || 0);
    const line: TransactionPrintLine = {
      item: detail.stock_id || "—",
      description: detail.description || "—",
      quantity: detail.quantity ?? "—",
      unit: unitFound?.abbr || "—",
    };
    if (includePricing) {
      line.price = formatPrintMoney(price);
      line.discount = disc ? `${disc}%` : "—";
      line.total = formatPrintMoney(qty * price * (1 - disc / 100));
    }
    return line;
  });
}

export function buildAllocationPrintLines(
  rows: Array<{
    type?: string;
    number?: string | number;
    ref?: string;
    date?: string;
    total_amount?: number;
    this_allocation?: number;
  }>
): TransactionPrintLine[] {
  return rows.map((row) => ({
    type: row.type || "—",
    number: String(row.number ?? "—"),
    ref: row.ref || "—",
    date: row.date || "—",
    total: formatPrintMoney(row.total_amount ?? 0),
    allocated: formatPrintMoney(row.this_allocation ?? 0),
  }));
}

export function buildGrnPrintLines(
  rows: Array<{
    itemCode?: string;
    description?: string;
    quantity?: number | string;
    unit?: string;
    price?: number | string;
    lineTotal?: number | string;
  }>
): TransactionPrintLine[] {
  return buildPurchaseOrderPrintLines(rows);
}
