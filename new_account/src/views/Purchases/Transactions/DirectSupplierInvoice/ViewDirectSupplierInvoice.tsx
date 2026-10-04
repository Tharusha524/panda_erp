import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getSuppliers } from "../../../../api/Supplier/SupplierApi";
import { formatPrintMoney } from "../../../../utils/formatPrintDocument";
import { TransactionPrintPage, TransactionPrintTemplate } from "../../../../components/Print";
import { PURCHASE_ITEM_PRINT_COLUMNS } from "../../../../utils/transactionPrintColumns";

export default function ViewDirectSupplierInvoice() {
  const { state } = useLocation();
  const navigate = useNavigate();

  const {
    supplier,
    reference,
    supplierRef,
    invoiceDate,
    dueDate,
    items = [],
    subtotal,
    totalInvoice,
    autoPrint = false,
  } = state || {};

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: getSuppliers,
  });

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

  const printLines = useMemo(
    () =>
      (items as any[]).map((row: any) => ({
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
    [items]
  );

  const breadcrumbItems = [
    { title: "Home", href: "/dashboard" },
    { title: "Direct Supplier Invoice" },
  ];

  return (
    <TransactionPrintPage
      pageTitle={`Direct Supplier Invoice - ${reference || "—"}`}
      breadcrumbs={breadcrumbItems}
      onBack={() => navigate(-1)}
      autoPrint={autoPrint}
      ready={items.length > 0 || Boolean(reference)}
      printContent={
        <TransactionPrintTemplate
          documentType="Direct Supplier Invoice"
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
            subtotal: Number(subtotal) || undefined,
            total: Number(totalInvoice) || 0,
            currency: supplierCurrency,
          }}
        />
      }
    />
  );
}
