import React, { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { TransactionPrintPage, TransactionPrintTemplate } from "../../../../components/Print";
import {
  DOCUMENT_PRINT_TYPES,
  GL_JOURNAL_PRINT_COLUMNS,
} from "../../../../utils/transactionPrintColumns";
import { formatPrintDate, formatPrintMoney } from "../../../../utils/formatPrintDocument";

type JournalLine = {
  journalDate?: string;
  accountCode?: string;
  accountName?: string;
  costCenter?: string;
  debit?: string | number;
  credit?: string | number;
  memo?: string;
};

export default function ViewJournalEntry() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const {
    reference,
    date,
    lines = [],
    autoPrint = false,
  } = state || {};

  const journalEntries: JournalLine[] = useMemo(() => {
    if (Array.isArray(lines) && lines.length > 0) {
      return lines;
    }
    return [
      {
        journalDate: date || "2025-11-14",
        accountCode: "1001",
        accountName: "Cash at Bank",
        costCenter: "",
        debit: "1500.00",
        credit: "",
        memo: "Payment processed",
      },
      {
        journalDate: date || "2025-11-14",
        accountCode: "2001",
        accountName: "Accounts Payable",
        costCenter: "",
        debit: "",
        credit: "1500.00",
        memo: "Vendor payment",
      },
    ];
  }, [lines, date]);

  const printLines = useMemo(
    () =>
      journalEntries.map((entry) => ({
        date: entry.journalDate || date || "—",
        account: entry.accountCode || "—",
        description: entry.accountName || "—",
        costCenter: entry.costCenter || "—",
        debit: entry.debit ? formatPrintMoney(entry.debit) : "—",
        credit: entry.credit ? formatPrintMoney(entry.credit) : "—",
        memo: entry.memo || "—",
      })),
    [journalEntries, date]
  );

  const totalDebit = journalEntries.reduce(
    (sum, entry) => sum + (parseFloat(String(entry.debit)) || 0),
    0
  );
  const totalCredit = journalEntries.reduce(
    (sum, entry) => sum + (parseFloat(String(entry.credit)) || 0),
    0
  );

  const docNumber = reference ? String(reference).split("/")[0] : undefined;

  const breadcrumbItems = [
    { title: "Home", href: "/dashboard" },
    { title: "Journal Entry" },
  ];

  return (
    <TransactionPrintPage
      pageTitle={`Journal Entry - ${docNumber || reference || "—"}`}
      breadcrumbs={breadcrumbItems}
      onBack={() => navigate(-1)}
      autoPrint={Boolean(autoPrint)}
      ready={printLines.length > 0}
      printContent={
        <TransactionPrintTemplate
          documentType={DOCUMENT_PRINT_TYPES.journalEntry}
          documentNumber={docNumber}
          reference={reference}
          documentDate={date}
          documentFields={[
            { label: "Transaction Date", value: formatPrintDate(date) },
            { label: "Total Debit", value: totalDebit.toFixed(2) },
            { label: "Total Credit", value: totalCredit.toFixed(2) },
          ]}
          columns={GL_JOURNAL_PRINT_COLUMNS}
          lines={printLines}
          totals={{
            total: totalDebit,
          }}
          footerNote="General ledger journal entry."
        />
      }
    />
  );
}
