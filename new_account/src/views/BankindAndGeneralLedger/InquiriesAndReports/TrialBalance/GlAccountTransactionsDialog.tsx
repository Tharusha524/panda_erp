import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Box,
  CircularProgress,
  IconButton,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useQuery } from "@tanstack/react-query";
import { getGlAccountTransactions } from "../../../../api/GLAccounts/GlAccountInquiryApi";
import { useGlReportMoney } from "../../../../hooks/useGlReportMoney";

interface Props {
  open: boolean;
  onClose: () => void;
  accountCode: string | null;
  accountName?: string;
}

export default function GlAccountTransactionsDialog({
  open,
  onClose,
  accountCode,
  accountName,
}: Props) {
  const { formatAmount } = useGlReportMoney();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["glAccountTransactions", accountCode],
    queryFn: () => getGlAccountTransactions(accountCode as string),
    enabled: open && !!accountCode,
  });

  const rows: any[] = data?.rows ?? [];
  const summary = data?.summary ?? null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Box>
          Transactions — {accountCode}
          {accountName ? ` (${accountName})` : ""}
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {isLoading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {isError && (
          <Typography color="error">
            Failed to load transactions for this account.
          </Typography>
        )}

        {!isLoading && !isError && (
          <>
            {summary && (
              <Box sx={{ mb: 2, display: "flex", gap: 3, flexWrap: "wrap" }}>
                <Typography variant="body2">
                  Opening Balance: <b>{formatAmount(summary.opening_balance)}</b>
                </Typography>
                <Typography variant="body2">
                  Period Debit: <b>{formatAmount(summary.period_debit)}</b>
                </Typography>
                <Typography variant="body2">
                  Period Credit: <b>{formatAmount(summary.period_credit)}</b>
                </Typography>
                <Typography variant="body2">
                  Closing Balance: <b>{formatAmount(summary.closing_balance)}</b>
                </Typography>
              </Box>
            )}

            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Number</TableCell>
                    <TableCell>Reference</TableCell>
                    <TableCell>Memo</TableCell>
                    <TableCell align="right">Debit</TableCell>
                    <TableCell align="right">Credit</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} align="center">
                        No transactions found for this account.
                      </TableCell>
                    </TableRow>
                  )}
                  {rows.map((r: any) => (
                    <TableRow key={r.id} hover>
                      <TableCell>{r.date}</TableCell>
                      <TableCell>{r.type}</TableCell>
                      <TableCell>{r.number}</TableCell>
                      <TableCell>{r.reference}</TableCell>
                      <TableCell>{r.memo}</TableCell>
                      <TableCell align="right">{formatAmount(r.debit)}</TableCell>
                      <TableCell align="right">{formatAmount(r.credit)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
