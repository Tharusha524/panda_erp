import React, { useMemo } from "react";
import { Alert, Button, Paper, Typography } from "@mui/material";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getCustomers } from "../../../../api/Customer/AddCustomerApi";
import { getBankAccounts } from "../../../../api/BankAccount/BankAccountApi";
import { getDebtorTrans } from "../../../../api/DebtorTrans/DebtorTransApi";
import { getBankTrans } from "../../../../api/BankTrans/BankTransApi";
import { getSalesOrders } from "../../../../api/SalesOrders/SalesOrdersApi";
import { getCustAllocations } from "../../../../api/CustAllocation/CustAllocationApi";
import { TRANS_TYPE_LABELS } from "../../../../utils/salesGlJournalLines";
import { TransactionPrintPage, TransactionPrintTemplate } from "../../../../components/Print";
import {
  ALLOCATION_PRINT_COLUMNS,
  DOCUMENT_PRINT_TYPES,
} from "../../../../utils/transactionPrintColumns";
import { buildAllocationPrintLines } from "../../../../utils/transactionPrintHelpers";
import { formatPrintDate, formatPrintMoney } from "../../../../utils/formatPrintDocument";

function debtorDocumentTotal(dt: any): number {
  if (!dt) return 0;
  return (
    Number(dt.ov_amount ?? 0) +
    Number(dt.ov_gst ?? 0) +
    Number(dt.ov_freight ?? 0) +
    Number(dt.ov_freight_tax ?? 0) +
    Number(dt.ov_discount ?? 0)
  );
}

export default function ViewCustomerPayments() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const {
    reference,
    amount,
    dateOfDeposit,
    discount,
    paymentType,
    allocations = [],
    totalAllocated,
    transNo,
    trans_no: stateTransNo,
    autoPrint,
  } = state || {};

  const paymentTransNo = transNo ?? stateTransNo ?? searchParams.get("trans_no");

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: getCustomers,
  });

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["bankAccounts"],
    queryFn: getBankAccounts,
  });

  const { data: debtorTransList = [], isLoading: debtorTransLoading } = useQuery({
    queryKey: ["debtorTrans"],
    queryFn: getDebtorTrans,
  });

  const { data: bankTransList = [] } = useQuery({
    queryKey: ["bankTrans"],
    queryFn: getBankTrans,
  });

  const { data: salesOrders = [] } = useQuery({
    queryKey: ["salesOrders"],
    queryFn: getSalesOrders,
  });

  const { data: custAllocations = [], isLoading: custAllocLoading } = useQuery({
    queryKey: ["custAllocations"],
    queryFn: getCustAllocations,
  });

  const debtorTrans = useMemo(() => {
    const list = debtorTransList || [];
    return list.find((dt: any) => {
      if (Number(dt.trans_type) !== 12) return false;
      if (paymentTransNo != null && Number(dt.trans_no) === Number(paymentTransNo)) {
        return true;
      }
      if (reference && String(dt.reference) === String(reference)) {
        return true;
      }
      return false;
    });
  }, [debtorTransList, paymentTransNo, reference]);

  const bankTrans = bankTransList.find(
    (bt: any) =>
      Number(bt.type) === 12 &&
      Number(bt.trans_no) === Number(debtorTrans?.trans_no)
  );

  const isLoading = debtorTransLoading || custAllocLoading;
  const paymentNotFound =
    !isLoading && !debtorTrans && (paymentTransNo != null || reference);

  const customerName = useMemo(() => {
    if (!debtorTrans?.debtor_no) return "—";
    const found = (customers || []).find(
      (c: any) => String(c.debtor_no) === String(debtorTrans.debtor_no)
    );
    return found ? found.name : String(debtorTrans.debtor_no);
  }, [customers, debtorTrans]);

  const customerCurrency = useMemo(() => {
    if (!debtorTrans?.debtor_no) return undefined;
    const found = (customers || []).find(
      (c: any) => String(c.debtor_no) === String(debtorTrans.debtor_no)
    );
    return found?.curr_code || found?.currency || undefined;
  }, [customers, debtorTrans]);

  const bankAccountName = useMemo(() => {
    if (!bankTrans?.bank_act) return "—";
    const found = (bankAccounts || []).find(
      (b: any) => String(b.id) === String(bankTrans.bank_act)
    );
    return found ? found.bank_account_name || found.account_name : String(bankTrans.bank_act);
  }, [bankAccounts, bankTrans]);

  const derivedAllocations = useMemo(() => {
    if (allocations && allocations.length > 0) {
      return allocations.map((a: any) => ({
        type: a.type || "Sales Order",
        number: a.number ?? a.trans_no_to ?? a.trans_no_from ?? "—",
        ref: a.ref ?? a.reference ?? "—",
        date: a.date || a.date_alloc || "—",
        total_amount: Number(a.total_amount ?? a.amt ?? 0),
        this_allocation: Number(a.this_allocation ?? a.amt ?? 0),
      }));
    }

    if (!debtorTrans?.trans_no) return [];

    const custAllocsForPayment = (custAllocations || []).filter(
      (ca: any) =>
        Number(ca.trans_no_from) === Number(debtorTrans.trans_no) &&
        Number(ca.trans_type_from) === 12
    );

    if (custAllocsForPayment.length === 0) return [];

    return custAllocsForPayment.map((ca: any) => {
      const transTypeTo = Number(ca.trans_type_to);
      const typeLabel = TRANS_TYPE_LABELS[transTypeTo] ?? `Type ${transTypeTo}`;

      if (transTypeTo === 10) {
        const invoice = (debtorTransList || []).find(
          (d: any) =>
            Number(d.trans_type) === 10 &&
            Number(d.trans_no) === Number(ca.trans_no_to)
        );
        const docTotal = debtorDocumentTotal(invoice);
        return {
          type: typeLabel,
          number: ca.trans_no_to,
          ref: invoice?.reference ?? "—",
          date: ca.date_alloc || invoice?.tran_date || "—",
          total_amount: docTotal,
          this_allocation: Number(ca.amt ?? 0),
        };
      }

      if (transTypeTo === 30) {
        const so = (salesOrders || []).find(
          (s: any) => Number(s.order_no) === Number(ca.trans_no_to)
        );
        const docTotal = Number(so?.prep_amount ?? so?.total ?? ca.amt ?? 0);
        return {
          type: typeLabel,
          number: ca.trans_no_to,
          ref: so?.reference ?? "—",
          date: ca.date_alloc || so?.ord_date || so?.delivery_date || "—",
          total_amount: docTotal,
          this_allocation: Number(ca.amt ?? 0),
        };
      }

      return {
        type: typeLabel,
        number: ca.trans_no_to,
        ref: "—",
        date: ca.date_alloc || "—",
        total_amount: Number(ca.amt ?? 0),
        this_allocation: Number(ca.amt ?? 0),
      };
    });
  }, [
    allocations,
    custAllocations,
    debtorTrans,
    debtorTransList,
    salesOrders,
  ]);

  const printLines = useMemo(
    () => buildAllocationPrintLines(derivedAllocations),
    [derivedAllocations]
  );

  const paymentAmount = Number(debtorTrans?.ov_amount ?? amount ?? 0);
  const allocatedTotal = Number(
    totalAllocated ??
      derivedAllocations.reduce(
        (sum, row) => sum + Number(row.this_allocation ?? 0),
        0
      )
  );

  const breadcrumbItems = [
    { title: "Home", href: "/dashboard" },
    { title: "Customer Payments" },
  ];

  if (isLoading) {
    return (
      <TransactionPrintPage
        pageTitle="Customer Payment"
        breadcrumbs={breadcrumbItems}
        onBack={() => navigate(-1)}
        ready={false}
        printContent={<Typography>Loading…</Typography>}
      />
    );
  }

  if (paymentNotFound) {
    return (
      <TransactionPrintPage
        pageTitle="Customer Payment"
        breadcrumbs={breadcrumbItems}
        onBack={() => navigate(-1)}
        ready={false}
        screenExtras={
          <Alert severity="error">
            Customer payment not found
            {paymentTransNo != null ? ` (#${paymentTransNo})` : reference ? ` (${reference})` : ""}.
            Open this screen from the payment success page or customer inquiry so the payment number is passed.
          </Alert>
        }
        printContent={<Typography>Payment not found.</Typography>}
      />
    );
  }

  return (
    <TransactionPrintPage
      pageTitle={`Customer Payment - ${debtorTrans?.trans_no || reference || "—"}`}
      breadcrumbs={breadcrumbItems}
      onBack={() => navigate(-1)}
      autoPrint={Boolean(autoPrint)}
      ready={Boolean(debtorTrans)}
      extraActions={
        <Button
          variant="outlined"
          onClick={() =>
            navigate("/sales/transactions/gl-journal-entries", {
              state: {
                reference: debtorTrans?.reference ?? reference,
                date: debtorTrans?.tran_date ?? dateOfDeposit,
                trans_no: debtorTrans?.trans_no ?? paymentTransNo,
                trans_type: 12,
              },
            })
          }
        >
          View GL Journal Entries
        </Button>
      }
      printContent={
        <TransactionPrintTemplate
          documentType={DOCUMENT_PRINT_TYPES.receipt}
          documentNumber={debtorTrans?.trans_no}
          reference={debtorTrans?.reference ?? reference}
          documentDate={debtorTrans?.tran_date ?? dateOfDeposit}
          currency={customerCurrency}
          partyName={customerName}
          documentFields={[
            { label: "Bank Account", value: bankAccountName },
            {
              label: "Deposit Date",
              value: formatPrintDate(debtorTrans?.tran_date ?? dateOfDeposit),
            },
            {
              label: "Payment Amount",
              value: formatPrintMoney(paymentAmount),
            },
            {
              label: "Bank Amount",
              value: formatPrintMoney(bankTrans?.amount ?? paymentAmount),
            },
            {
              label: "Discount",
              value: formatPrintMoney(debtorTrans?.ov_discount ?? discount ?? 0),
            },
            { label: "Payment Type", value: paymentType || "—" },
            { label: "Total Allocated", value: formatPrintMoney(allocatedTotal) },
          ]}
          columns={ALLOCATION_PRINT_COLUMNS}
          lines={printLines}
          totals={{
            total: paymentAmount,
            currency: customerCurrency,
          }}
          footerNote="Payment receipt — thank you for your payment."
        />
      }
      screenExtras={
        derivedAllocations.length === 0 ? (
          <Paper sx={{ p: 2 }}>
            <Typography variant="body2">No allocations for this payment.</Typography>
          </Paper>
        ) : undefined
      }
    />
  );
}
