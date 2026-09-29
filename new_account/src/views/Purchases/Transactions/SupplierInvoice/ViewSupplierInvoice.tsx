import React, { useMemo } from "react";
import { Button } from "@mui/material";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSuppliers } from "../../../../api/Supplier/SupplierApi";
import { getSuppInvoiceItems } from "../../../../api/SuppInvoiceItems/SuppInvoiceItemsApi";
import { getGrnItems } from "../../../../api/GRN/GrnItemsApi";
import { getSuppTrans } from "../../../../api/SuppTrans/SuppTransApi";
import {
  invalidatePurchasingQueries,
  voidPurchasingDocument,
} from "../../../../utils/voidPurchasingDocument";
import { TransactionPrintPage, TransactionPrintTemplate } from "../../../../components/Print";
import {
  DOCUMENT_PRINT_TYPES,
  PURCHASE_ITEM_PRINT_COLUMNS,
} from "../../../../utils/transactionPrintColumns";
import { formatPrintMoney } from "../../../../utils/formatPrintDocument";

export default function ViewSupplierInvoice() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    supplier,
    reference,
    supplierRef,
    invoiceDate,
    dueDate,
    items = [],
    subtotal,
    totalInvoice,
    transNo,
    transType,
    fromInquiry = false,
    autoPrint = false,
  } = state || {};

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: getSuppliers,
  });

  const { data: suppInvoiceItems = [] } = useQuery({
    queryKey: ["suppInvoiceItems"],
    queryFn: getSuppInvoiceItems,
    enabled: fromInquiry && Boolean(transNo),
  });

  const { data: grnItems = [] } = useQuery({
    queryKey: ["grnItems"],
    queryFn: getGrnItems,
    enabled: fromInquiry && Boolean(transNo),
  });

  const { data: suppTrans = [] } = useQuery({
    queryKey: ["suppTrans"],
    queryFn: getSuppTrans,
    enabled: fromInquiry && Boolean(transNo),
  });

  const headerTrans = useMemo(() => {
    if (!fromInquiry || !transNo) return null;
    return (suppTrans || []).find(
      (t: any) =>
        String(t.trans_no ?? t.id) === String(transNo) &&
        String(t.trans_type ?? t.type ?? 0) === String(transType ?? 20)
    );
  }, [fromInquiry, transNo, transType, suppTrans]);

  const displayItems = useMemo(() => {
    if (!fromInquiry || !transNo) return items;

    const grnMap = new Map(
      (grnItems || []).map((g: any) => [String(g.id ?? g.grn_item_id), g])
    );

    return (suppInvoiceItems || [])
      .filter(
        (item: any) =>
          String(item.supp_trans_no ?? item.trans_no) === String(transNo) &&
          String(item.supp_trans_type ?? item.trans_type) === String(transType ?? 20)
      )
      .map((item: any) => {
        const grnItemId = String(item.grn_item_id ?? "");
        const grnItem = grnMap.get(grnItemId) as any;
        const quantity = Number(item.quantity ?? 0);
        const price = Number(item.unit_price ?? 0);
        return {
          delivery: grnItem?.grn_batch_id ?? grnItem?.batch_id ?? "-",
          item: item.stock_id ?? "-",
          description: item.description ?? "-",
          quantity: Math.abs(quantity),
          price,
          lineValue: Math.abs(quantity * price),
        };
      });
  }, [fromInquiry, transNo, transType, items, suppInvoiceItems, grnItems]);

  const resolvedReference = reference ?? headerTrans?.reference ?? "-";
  const resolvedSupplierRef = supplierRef ?? headerTrans?.supp_reference ?? "-";
  const resolvedInvoiceDate = invoiceDate ?? headerTrans?.trans_date ?? "-";
  const resolvedDueDate = dueDate ?? headerTrans?.due_date ?? "-";

  const computedSubtotal = useMemo(() => {
    if (!fromInquiry) return subtotal;
    return displayItems.reduce(
      (sum: number, item: any) => sum + Number(item.lineValue ?? 0),
      0
    );
  }, [fromInquiry, displayItems, subtotal]);

  const computedTotal = useMemo(() => {
    if (!fromInquiry) return totalInvoice;
    if (headerTrans) {
      const raw =
        Number(headerTrans.ov_amount ?? 0) +
        Number(headerTrans.ov_gst ?? 0) +
        Number(headerTrans.ov_discount ?? 0);
      return Math.abs(raw);
    }
    return computedSubtotal;
  }, [fromInquiry, totalInvoice, headerTrans, computedSubtotal]);

  const supplierName = useMemo(() => {
    if (!supplier) return "-";
    const found = (suppliers || []).find(
      (s: any) => String(s.supplier_id) === String(supplier)
    );
    return found ? found.supp_name : supplier;
  }, [suppliers, supplier]);

  const supplierCurrency = useMemo(() => {
    if (!supplier) return undefined;
    const found = (suppliers || []).find(
      (s: any) => String(s.supplier_id) === String(supplier)
    );
    return found?.curr_code || undefined;
  }, [suppliers, supplier]);

  const lineSource = fromInquiry ? displayItems : items;
  const printLines = useMemo(
    () =>
      lineSource.map((row: any) => ({
        delivery: String(row.delivery ?? "—"),
        item: String(row.item ?? "—"),
        description: String(row.description ?? "—"),
        quantity: String(row.quantity ?? "—"),
        price: formatPrintMoney(row.price ?? 0),
        total: formatPrintMoney(
          row.lineValue != null
            ? row.lineValue
            : Number(row.quantity || 0) * Number(row.price || 0)
        ),
      })),
    [lineSource]
  );

  const breadcrumbItems = [
    { title: "Home", href: "/dashboard" },
    { title: "Supplier Invoice" },
  ];

  return (
    <TransactionPrintPage
      pageTitle={`Supplier Invoice - ${resolvedReference || "—"}`}
      breadcrumbs={breadcrumbItems}
      onBack={() => navigate(-1)}
      autoPrint={autoPrint}
      ready={lineSource.length > 0 || Boolean(resolvedReference)}
      extraActions={
        fromInquiry && transNo ? (
          <Button
            variant="outlined"
            color="error"
            onClick={async () => {
              if (!window.confirm(`Void invoice #${transNo}?`)) return;
              const memo = window.prompt("Void reason (optional):") ?? undefined;
              const result = await voidPurchasingDocument(
                Number(transType ?? 20),
                Number(transNo),
                memo || undefined
              );
              if (result.ok === false) {
                alert(result.message);
                return;
              }
              await invalidatePurchasingQueries(queryClient);
              navigate(-1);
            }}
          >
            Void Invoice
          </Button>
        ) : undefined
      }
      printContent={
        <TransactionPrintTemplate
          documentType={DOCUMENT_PRINT_TYPES.supplierInvoice}
          documentNumber={transNo}
          reference={resolvedReference}
          documentDate={resolvedInvoiceDate}
          dueDate={resolvedDueDate}
          currency={supplierCurrency}
          partyLabel="Supplier"
          partyName={supplierName}
          documentFields={[
            { label: "Supplier's Ref", value: resolvedSupplierRef || "—" },
          ]}
          columns={PURCHASE_ITEM_PRINT_COLUMNS}
          lines={printLines}
          totals={{
            subtotal: Number(computedSubtotal) || undefined,
            total: Number(computedTotal) || 0,
            currency: supplierCurrency,
          }}
          footerNote="Please remit payment by the due date. Quote our reference on all correspondence."
        />
      }
    />
  );
}
