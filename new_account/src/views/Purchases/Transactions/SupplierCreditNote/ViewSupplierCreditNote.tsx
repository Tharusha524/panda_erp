import React, { useMemo } from "react";
import {
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  invalidatePurchasingQueries,
  voidPurchasingDocument,
} from "../../../../utils/voidPurchasingDocument";
import { getSuppliers } from "../../../../api/Supplier/SupplierApi";
import { getSuppTrans } from "../../../../api/SuppTrans/SuppTransApi";
import { getSuppInvoiceItems } from "../../../../api/SuppInvoiceItems/SuppInvoiceItemsApi";
import { getGrnItems } from "../../../../api/GRN/GrnItemsApi";
import { getTransTypes } from "../../../../api/Reflines/TransTypesApi";
import { TransactionPrintPage, TransactionPrintTemplate } from "../../../../components/Print";
import {
  DOCUMENT_PRINT_TYPES,
  PURCHASE_ITEM_PRINT_COLUMNS,
} from "../../../../utils/transactionPrintColumns";
import { formatPrintMoney } from "../../../../utils/formatPrintDocument";

export default function ViewSupplierCreditNote() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    transNo,
    transType,
    supplier,
    reference,
    supplierRef,
    date: invoiceDate,
    dueDate,
    items = [],
    subtotal,
    fromAllocations = false,
    autoPrint = false,
  } = state || {};

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: getSuppliers,
  });

  const { data: suppInvoiceItems = [] } = useQuery({
    queryKey: ["suppInvoiceItems"],
    queryFn: getSuppInvoiceItems,
    enabled: fromAllocations && !!transNo,
  });

  const { data: grnItems = [] } = useQuery({
    queryKey: ["grnItems"],
    queryFn: getGrnItems,
    enabled: fromAllocations && !!transNo,
  });

  const { data: suppTrans = [] } = useQuery({
    queryKey: ["suppTrans"],
    queryFn: getSuppTrans,
    enabled: fromAllocations && !!transNo,
  });

  const { data: transTypes = [] } = useQuery({
    queryKey: ["transTypes"],
    queryFn: getTransTypes,
    enabled: fromAllocations,
  });

  const supplierName = useMemo(() => {
    if (!supplier) return "—";
    const found = (suppliers || []).find(
      (s: any) => String(s.supplier_id) === String(supplier)
    );
    return found ? found.supp_name : String(supplier);
  }, [suppliers, supplier]);

  const supplierCurrency = useMemo(() => {
    if (!supplier) return undefined;
    const found = (suppliers || []).find(
      (s: any) => String(s.supplier_id) === String(supplier)
    );
    return found?.curr_code || undefined;
  }, [suppliers, supplier]);

  const displayItems = useMemo(() => {
    if (!fromAllocations || !transNo) return items;

    const grnMap = new Map(
      (grnItems || []).map((g: any) => [String(g.id ?? g.grn_item_id), g])
    );

    return (suppInvoiceItems || [])
      .filter(
        (item: any) =>
          String(item.supp_trans_no ?? item.trans_no) === String(transNo) &&
          String(item.supp_trans_type ?? item.trans_type) === String(transType)
      )
      .map((item: any) => {
        const grnItemId = String(item.grn_item_id ?? "");
        const grnItem = grnMap.get(grnItemId) as any;
        const quantity = Number(item.quantity ?? 0);
        const price = Number(item.unit_price ?? 0);
        return {
          delivery: grnItem?.grn_batch_id ?? grnItem?.batch_id ?? "—",
          item: item.stock_id ?? "—",
          description: item.description ?? "—",
          quantity: Math.abs(quantity),
          price,
          lineValue: Math.abs(quantity * price),
          grn_item_id: item.grn_item_id,
        };
      });
  }, [fromAllocations, transNo, transType, items, suppInvoiceItems, grnItems]);

  const allocations = useMemo(() => {
    if (!fromAllocations || !transNo || displayItems.length === 0) return [];

    const transTypeMap = new Map(
      (transTypes || []).map((t: any) => [String(t.trans_type), t])
    );

    const grnItemIds = displayItems
      .map((item: any) => String(item.grn_item_id ?? ""))
      .filter((id) => id !== "");

    const relatedInvoiceItems = (suppInvoiceItems || []).filter(
      (item: any) =>
        grnItemIds.includes(String(item.grn_item_id ?? "")) &&
        String(item.supp_trans_type ?? item.trans_type) === "20"
    );

    const transNos = [
      ...new Set(
        relatedInvoiceItems.map((item: any) =>
          String(item.supp_trans_no ?? item.trans_no)
        )
      ),
    ];

    return transNos
      .map((tNo) => {
        const trans = (suppTrans || []).find(
          (t: any) =>
            String(t.trans_no ?? t.transno) === tNo &&
            String(t.trans_type ?? t.type ?? 0) === "20"
        );
        if (!trans) return null;

        const transTypeId = String(trans.trans_type ?? trans.type ?? "");
        const transTypeRow = transTypeMap.get(transTypeId) as any;
        const ovAmount = Number(trans.ov_amount ?? 0);
        const alloc = Number(trans.alloc ?? 0);

        return {
          type: transTypeRow?.description ?? transTypeRow?.name ?? transTypeId,
          number: trans.trans_no ?? "—",
          date: trans.trans_date ?? "—",
          totalAmount: ovAmount,
          thisAllocation: alloc,
          leftToAllocate: ovAmount - alloc,
        };
      })
      .filter((a) => a !== null);
  }, [
    fromAllocations,
    transNo,
    displayItems,
    suppInvoiceItems,
    suppTrans,
    transTypes,
  ]);

  const computedSubtotal = useMemo(() => {
    if (!fromAllocations) return Number(subtotal ?? 0);
    return displayItems.reduce(
      (sum: number, item: any) => sum + Number(item.lineValue ?? 0),
      0
    );
  }, [fromAllocations, displayItems, subtotal]);

  const totalAllocated = useMemo(
    () =>
      allocations.reduce(
        (sum: number, a: any) => sum + Number(a.thisAllocation ?? 0),
        0
      ),
    [allocations]
  );

  const leftToAllocate = useMemo(
    () =>
      allocations.reduce(
        (sum: number, a: any) => sum + Number(a.leftToAllocate ?? 0),
        0
      ),
    [allocations]
  );

  const printLines = useMemo(
    () =>
      displayItems.map((row: any) => ({
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
    [displayItems]
  );

  const breadcrumbItems = [
    { title: "Home", href: "/dashboard" },
    { title: "Supplier Credit Note" },
  ];

  return (
    <TransactionPrintPage
      pageTitle={`Supplier Credit Note - ${reference || "—"}`}
      breadcrumbs={breadcrumbItems}
      onBack={() => navigate(-1)}
      autoPrint={autoPrint}
      ready={displayItems.length > 0 || Boolean(reference)}
      extraActions={
        transNo ? (
          <Button
            variant="outlined"
            color="error"
            onClick={async () => {
              if (!window.confirm(`Void credit note #${transNo}?`)) return;
              const memo = window.prompt("Void reason (optional):") ?? undefined;
              const result = await voidPurchasingDocument(
                Number(transType ?? 21),
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
            Void Credit Note
          </Button>
        ) : undefined
      }
      printContent={
        <TransactionPrintTemplate
          documentType={DOCUMENT_PRINT_TYPES.supplierCredit}
          documentNumber={transNo}
          reference={reference}
          documentDate={invoiceDate}
          dueDate={dueDate}
          currency={supplierCurrency}
          partyLabel="Supplier"
          partyName={supplierName}
          documentFields={[
            { label: "Supplier's Ref", value: supplierRef || "—" },
          ]}
          columns={PURCHASE_ITEM_PRINT_COLUMNS}
          lines={printLines}
          totals={{
            subtotal: computedSubtotal,
            total: computedSubtotal,
            currency: supplierCurrency,
          }}
          footerNote="Supplier credit note — credited amounts as listed above."
        />
      }
      screenExtras={
        allocations.length > 0 ? (
          <Paper sx={{ p: 2 }}>
            <Typography sx={{ mb: 1, fontWeight: 600 }}>Allocations</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Type</TableCell>
                    <TableCell>Number</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell align="right">Total Amount</TableCell>
                    <TableCell align="right">Left to Allocate</TableCell>
                    <TableCell align="right">This Allocation</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {allocations.map((alloc: any, idx: number) => (
                    <TableRow key={idx}>
                      <TableCell>{alloc.type}</TableCell>
                      <TableCell>{alloc.number}</TableCell>
                      <TableCell>{alloc.date}</TableCell>
                      <TableCell align="right">
                        {alloc.totalAmount?.toFixed(2)}
                      </TableCell>
                      <TableCell align="right">
                        {alloc.leftToAllocate?.toFixed(2)}
                      </TableCell>
                      <TableCell align="right">
                        {alloc.thisAllocation?.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <Typography variant="body2" sx={{ mt: 2 }}>
              Total Allocated: {totalAllocated.toFixed(2)} · Left to Allocate:{" "}
              {leftToAllocate.toFixed(2)}
            </Typography>
          </Paper>
        ) : undefined
      }
    />
  );
}
