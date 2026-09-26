import React, { useEffect } from "react";
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PrintIcon from "@mui/icons-material/Print";
import { useNavigate } from "react-router-dom";
import PageTitle from "../PageTitle";
import Breadcrumb from "../BreadCrumb";
import { flattenGlLines, GlTransactionGroup } from "../../utils/glJournalLinesCore";
import {
  formatJournalColumnAmount,
  journalColumnTotals,
} from "../../utils/journalAmount";
import "../../styles/transactionPrint.css";

export interface GLJournalEntriesPageProps {
  breadcrumbs: { title: string; href?: string }[];
  pageTitle: string;
  reference?: string;
  transactionDate?: string;
  transNo?: number | string | null;
  transTypeLabel?: string;
  orderNo?: number | string | null;
  orderNoLabel?: string;
  counterparty?: string;
  glNumber?: number | string | null;
  comments?: string;
  dimensionLabel?: string;
  groups: GlTransactionGroup[];
  emptyMessage?: string;
  isLoading?: boolean;
  autoPrint?: boolean;
  paymentSummary?: {
    amount?: number;
    allocations?: {
      type?: string;
      number?: number | string;
      date?: string;
      totalAmount?: number;
      leftToAllocate?: number;
      allocation?: number;
    }[];
  };
  /** Sales document value (invoice/delivery total) — distinct from GL column totals when COGS/prepaid lines differ. */
  documentAmount?: number;
}

export default function GLJournalEntriesPage({
  breadcrumbs,
  pageTitle,
  reference,
  transactionDate,
  transNo,
  transTypeLabel,
  orderNo,
  orderNoLabel = "Order #",
  counterparty,
  glNumber,
  comments,
  dimensionLabel,
  groups,
  emptyMessage,
  isLoading = false,
  autoPrint = false,
  paymentSummary,
  documentAmount,
}: GLJournalEntriesPageProps) {
  const navigate = useNavigate();
  const hasEntries = groups.length > 0;
  const hasPaymentAllocations = (paymentSummary?.allocations?.length ?? 0) > 0;
  const showHeader = hasEntries || Boolean(reference) || hasPaymentAllocations;
  const allLines = flattenGlLines(groups);
  const columnTotals = journalColumnTotals(
    allLines.map((l) => ({ debit: l.debit, credit: l.credit }))
  );
  const isJournalView = groups.some((g) => g.transType === 0);
  const glDiffersFromDocument =
    documentAmount != null &&
    Math.abs(columnTotals.debitTotal - Math.abs(documentAmount)) > 0.01;

  useEffect(() => {
    if (!autoPrint || isLoading || allLines.length === 0) return;
    const timer = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(timer);
  }, [autoPrint, isLoading, allLines.length]);

  return (
    <Stack spacing={2}>
      <Box
        sx={{
          padding: 2,
          boxShadow: 2,
          borderRadius: 1,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 1,
        }}
      >
        <Box>
          <PageTitle title={pageTitle} />
          <Box className="no-print">
            <Breadcrumb breadcrumbs={breadcrumbs} />
          </Box>
        </Box>
        <Button className="no-print" variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)}>
          Back
        </Button>
      </Box>

      {showHeader && (
        <Paper sx={{ p: 2 }}>
          <TableContainer>
            <Table size="small">
              <TableHead sx={{ backgroundColor: "var(--pallet-lighter-blue)" }}>
                <TableRow>
                  <TableCell colSpan={2}>General Ledger Transaction Details</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, width: "30%" }}>Reference</TableCell>
                  <TableCell>{reference || "—"}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Transaction Date</TableCell>
                  <TableCell>{transactionDate || "—"}</TableCell>
                </TableRow>
                {transNo != null && transNo !== "" && (
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Transaction #</TableCell>
                    <TableCell>{String(transNo)}</TableCell>
                  </TableRow>
                )}
                {transTypeLabel && (
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                    <TableCell>{transTypeLabel}</TableCell>
                  </TableRow>
                )}
                {orderNo != null && orderNo !== "" && (
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>{orderNoLabel}</TableCell>
                    <TableCell>{String(orderNo)}</TableCell>
                  </TableRow>
                )}
                {counterparty && (
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Counterparty</TableCell>
                    <TableCell>{counterparty}</TableCell>
                  </TableRow>
                )}
                {glNumber != null && glNumber !== "" && (
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>GL #</TableCell>
                    <TableCell>{String(glNumber)}</TableCell>
                  </TableRow>
                )}
                {comments && (
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Comments</TableCell>
                    <TableCell>{comments}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {hasPaymentAllocations && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
            Payment Allocations
          </Typography>
          {paymentSummary?.amount != null && (
            <Typography variant="body2" sx={{ mb: 1 }}>
              Payment amount: {formatJournalColumnAmount(paymentSummary.amount)}
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Allocations update supplier invoice balances; they do not create extra GL lines.
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead sx={{ backgroundColor: "var(--pallet-lighter-blue)" }}>
                <TableRow>
                  <TableCell>Type</TableCell>
                  <TableCell>Number</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell align="right">Total Amount</TableCell>
                  <TableCell align="right">This Allocation</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paymentSummary?.allocations?.map((row, index) => (
                  <TableRow key={`${row.type}-${row.number}-${index}`}>
                    <TableCell>{row.type ?? "—"}</TableCell>
                    <TableCell>{row.number ?? "—"}</TableCell>
                    <TableCell>{row.date ?? "—"}</TableCell>
                    <TableCell align="right">
                      {formatJournalColumnAmount(row.totalAmount ?? 0)}
                    </TableCell>
                    <TableCell align="right">
                      {formatJournalColumnAmount(row.allocation ?? 0)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {isLoading && groups.length === 0 ? (
        <Alert severity="info">Loading GL postings…</Alert>
      ) : groups.length === 0 ? (
        emptyMessage ? <Alert severity="info">{emptyMessage}</Alert> : null
      ) : (
        <>
          {isLoading && (
            <Alert severity="info" sx={{ mb: 1 }}>
              Refreshing GL postings…
            </Alert>
          )}
          {groups.map((group) => (
          <Paper key={`${group.transType}-${group.transNo}`} sx={{ p: 2 }}>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
              {group.title}
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead sx={{ backgroundColor: "var(--pallet-lighter-blue)" }}>
                  <TableRow>
                    <TableCell>Journal Date</TableCell>
                    <TableCell>Transaction</TableCell>
                    <TableCell>Account Code</TableCell>
                    <TableCell>Account Name</TableCell>
                    {dimensionLabel && <TableCell>Dimension</TableCell>}
                    <TableCell align="right">Debit</TableCell>
                    <TableCell align="right">Credit</TableCell>
                    <TableCell>Memo</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {group.lines.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{entry.journalDate || "—"}</TableCell>
                      <TableCell>{entry.transaction}</TableCell>
                      <TableCell>{entry.accountCode}</TableCell>
                      <TableCell>{entry.accountName}</TableCell>
                      {dimensionLabel && <TableCell>{dimensionLabel}</TableCell>}
                      <TableCell align="right">
                        {formatJournalColumnAmount(entry.debit)}
                      </TableCell>
                      <TableCell align="right">
                        {formatJournalColumnAmount(entry.credit)}
                      </TableCell>
                      <TableCell>{entry.memo || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
          ))}
        </>
      )}

      {allLines.length > 0 && (
        <Paper sx={{ p: 2 }}>
          <TableContainer>
            <Table size="small">
              <TableBody>
                {documentAmount != null && Math.abs(documentAmount) > 0.001 && (
                  <TableRow sx={{ backgroundColor: "#e3f2fd" }}>
                    <TableCell colSpan={4} sx={{ fontWeight: "bold" }}>
                      Document Total
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: "bold" }}>
                      {formatJournalColumnAmount(Math.abs(documentAmount))}
                    </TableCell>
                    <TableCell align="right">—</TableCell>
                    <TableCell />
                  </TableRow>
                )}
                <TableRow sx={{ backgroundColor: "#e8eaf6" }}>
                  <TableCell colSpan={4} sx={{ fontWeight: "bold" }}>
                    {isJournalView
                      ? "Grand Total (Σ Debit column = Σ Credit column)"
                      : glDiffersFromDocument
                        ? "GL Total (Σ Debits = Σ Credits)"
                        : groups.length === 1
                          ? "Document Total"
                          : "Grand Total (all entries)"}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: "bold" }}>
                    {formatJournalColumnAmount(columnTotals.debitTotal)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: "bold" }}>
                    {formatJournalColumnAmount(columnTotals.creditTotal)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {hasEntries && (
        <Box className="no-print" sx={{ display: "flex", justifyContent: "flex-end", p: 1 }}>
          <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>
            Print
          </Button>
        </Box>
      )}
    </Stack>
  );
}
