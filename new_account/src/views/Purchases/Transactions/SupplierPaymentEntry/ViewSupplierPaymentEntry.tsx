import React, { useMemo } from "react";
import { Button } from "@mui/material";
import { useLocation, useNavigate } from "react-router-dom";
import { purchasesGlJournalPath } from "../../../../utils/purchasesGlNavigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  invalidatePurchasingQueries,
  voidPurchasingDocument,
} from "../../../../utils/voidPurchasingDocument";
import { getSuppliers } from "../../../../api/Supplier/SupplierApi";
import { TransactionPrintPage, TransactionPrintTemplate } from "../../../../components/Print";
import {
  ALLOCATION_PRINT_COLUMNS,
  DOCUMENT_PRINT_TYPES,
} from "../../../../utils/transactionPrintColumns";
import { buildAllocationPrintLines } from "../../../../utils/transactionPrintHelpers";
import { formatPrintDate, formatPrintMoney } from "../../../../utils/formatPrintDocument";

export default function ViewSupplierPaymentEntry() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    supplier,
    bankAccount,
    datePaid,
    amount,
    discount,
    reference,
    paymentType,
    trans_no: transNo,
    trans_type: transType,
    autoPrint = false,
  } = state || {};
  const allocations = (state && state.allocations) || [];

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: getSuppliers,
  });

  const supplierName = useMemo(() => {
    const found = suppliers.find(
      (s: any) => String(s.supplier_id) === String(supplier)
    );
    return found ? found.supp_name : supplier || "—";
  }, [suppliers, supplier]);

  const supplierCurrency = useMemo(() => {
    const found = suppliers.find(
      (s: any) => String(s.supplier_id) === String(supplier)
    );
    return found?.curr_code || undefined;
  }, [suppliers, supplier]);

  const printLines = useMemo(
    () =>
      buildAllocationPrintLines(
        allocations.map((a: any) => ({
          type: a.type,
          number: a.number,
          ref: "—",
          date: a.date,
          total_amount: Number(a.totalAmount ?? 0),
          this_allocation: Number(a.allocation ?? a.thisAllocation ?? 0),
        }))
      ),
    [allocations]
  );

  const paymentAmount = Number(amount ?? 0);
  const allocatedTotal = allocations.reduce(
    (sum: number, a: any) => sum + Number(a.allocation ?? a.thisAllocation ?? 0),
    0
  );

  const breadcrumbItems = [
    { title: "Purchases", href: "/purchases" },
    { title: "Payment to Supplier" },
  ];

  return (
    <TransactionPrintPage
      pageTitle={`Payment to Supplier - ${reference || "—"}`}
      breadcrumbs={breadcrumbItems}
      onBack={() => navigate(-1)}
      autoPrint={autoPrint}
      ready={Boolean(reference || transNo)}
      extraActions={
        <>
          {transNo && (
            <Button
              variant="outlined"
              color="error"
              onClick={async () => {
                if (!window.confirm(`Void payment #${transNo}?`)) return;
                const memo = window.prompt("Void reason (optional):") ?? undefined;
                const result = await voidPurchasingDocument(
                  Number(transType ?? 22),
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
              Void Payment
            </Button>
          )}
          <Button
            variant="outlined"
            onClick={() =>
              navigate(
                purchasesGlJournalPath({
                  reference,
                  date: datePaid,
                  trans_type: transType ?? 22,
                  trans_no: transNo,
                }),
                {
                  state: {
                    reference,
                    date: datePaid,
                    trans_type: transType ?? 22,
                    trans_no: transNo,
                    amount,
                    allocations,
                  },
                }
              )
            }
          >
            View GL Journal Entries
          </Button>
        </>
      }
      printContent={
        <TransactionPrintTemplate
          documentType={DOCUMENT_PRINT_TYPES.supplierPayment}
          documentNumber={transNo}
          reference={reference}
          documentDate={datePaid}
          currency={supplierCurrency}
          partyLabel="Supplier"
          partyName={supplierName}
          documentFields={[
            { label: "Bank Account", value: bankAccount || "—" },
            { label: "Date Paid", value: formatPrintDate(datePaid) },
            { label: "Payment Amount", value: formatPrintMoney(paymentAmount) },
            { label: "Discount", value: formatPrintMoney(discount ?? 0) },
            { label: "Payment Type", value: paymentType || "—" },
            { label: "Total Allocated", value: formatPrintMoney(allocatedTotal) },
          ]}
          columns={ALLOCATION_PRINT_COLUMNS}
          lines={printLines}
          totals={{
            total: paymentAmount,
            currency: supplierCurrency,
          }}
          footerNote="Remittance advice — payment applied as listed above."
        />
      }
    />
  );
}
