import { FormPageLayout } from "../../../../components/Layout/FormPageLayout";
import React, { useState } from "react";
import {
  Box,
  Button,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  MenuItem,
  Grid,
  useMediaQuery,
  Theme,
  TableFooter,
  TablePagination,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getBankAccounts } from "../../../../api/BankAccount/BankAccountApi";
import { getAccountTypes } from "../../../../api/BankAccount/AccountTypesApi";
import Breadcrumb from "../../../../components/BreadCrumb";
import PageTitle from "../../../../components/PageTitle";
import theme from "../../../../theme";
import api from "../../../../api/apiClient";
import { notify } from "../../../../services/notificationService";

interface Row {
  id: number;
  type: string;
  number: string;
  transType?: string | number;
  transNo?: string | number;
  reference: string;
  date: string;
  debit: string;
  credit: string;
  balance: string;
  personItem: string;
  memo: string;
}

interface InquirySummary {
  opening_balance: number;
  ending_balance: number;
  period_debit: number;
  period_credit: number;
  book_balance: number;
}

export default function BankAccountInquiry() {
  const navigate = useNavigate();
  const isMobile = useMediaQuery((theme: Theme) => theme.breakpoints.down("md"));

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<InquirySummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["bankAccounts"],
    queryFn: getBankAccounts,
  });
  const { data: accountTypes = [] } = useQuery({
    queryKey: ["accountTypes"],
    queryFn: getAccountTypes,
  });

  const [selectedAccount, setSelectedAccount] = useState("");

  // Label the balance with the selected account's own name — "Cash book
  // balance" for Cash-style accounts (matched by type, not a hardcoded id),
  // otherwise "<Account Name> book balance", falling back to "Bank" when
  // nothing is selected yet.
  const selectedBankAccount = (bankAccounts as any[]).find((acc: any) => String(acc.id) === String(selectedAccount));
  const selectedAccountType = (accountTypes as any[]).find((t: any) => String(t.id) === String(selectedBankAccount?.account_type));
  const isCashAccount = (selectedAccountType?.type_name || "").toLowerCase().includes("cash");
  const bookBalanceLabel = isCashAccount
    ? "Cash book balance"
    : selectedBankAccount?.bank_account_name
      ? `${selectedBankAccount.bank_account_name} book balance`
      : "Bank book balance";
  const today = new Date().toISOString().split("T")[0];
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);

  const formatMoney = (n: number) =>
    Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleShow = async () => {
    if (!selectedAccount) {
      notify.warning("Please select an account");
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.post("/bank-account-inquiry/search", {
        selectedAccount,
        fromDate,
        toDate,
      });

      const payload = response.data;
      const list = Array.isArray(payload) ? payload : payload.rows ?? [];

      setSummary(
        Array.isArray(payload)
          ? null
          : {
              opening_balance: payload.opening_balance ?? 0,
              ending_balance: payload.ending_balance ?? 0,
              period_debit: payload.period_debit ?? 0,
              period_credit: payload.period_credit ?? 0,
              book_balance: payload.book_balance ?? 0,
            }
      );

      const transformedRows: Row[] = list.map((item: any, index: number) => ({
        id: item.id ?? index,
        type: item.type || "",
        number: item.number || "",
        transType: item.trans_type ?? item.type_code ?? item.type ?? "",
        transNo: item.trans_no ?? item.number ?? "",
        reference: item.reference || "",
        date: item.date || "",
        debit: item.debit?.toString() || "0",
        credit: item.credit?.toString() || "0",
        balance: item.balance?.toString() || "0",
        personItem: item.personItem || "",
        memo: item.memo || "",
      }));

      setRows(transformedRows);
      setPage(0);
    } catch (error: any) {
      console.error("Bank account inquiry search failed:", error);
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  };

  const paginatedRows = React.useMemo(() => {
    if (rowsPerPage === -1) return rows;
    return rows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  }, [rows, page, rowsPerPage]);

  const handleChangePage = (_event: unknown, newPage: number) => setPage(newPage);
  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const openingBalance = summary?.opening_balance ?? 0;
  const endingBalance = summary?.ending_balance ?? 0;
  const periodDebit = summary?.period_debit ?? rows.reduce((s, r) => s + (parseFloat(r.debit) || 0), 0);
  const periodCredit = summary?.period_credit ?? rows.reduce((s, r) => s + (parseFloat(r.credit) || 0), 0);

  return (
    <FormPageLayout>
      <Box sx={{ padding: theme.spacing(2), boxShadow: 2, borderRadius: 1, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
        <Box>
          <PageTitle title="Bank Account Inquiry" />
          <Breadcrumb breadcrumbs={[{ title: "Home", href: "/dashboard" }, { title: "Bank Account Inquiry" }]} />
        </Box>

        <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)}>Back</Button>
      </Box>
      <Paper sx={{ p: 2, borderRadius: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={3}>
            <TextField
              select
              fullWidth
              label="Account"
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              size="small"
            >
              <MenuItem value="">Select account</MenuItem>
              {(bankAccounts as any[]).map((acc: any) => (
                <MenuItem key={acc.id} value={String(acc.id)}>
                  {acc.bank_account_name ?? (`${acc.bank_name || ""} - ${acc.bank_account_number || ""}`)}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          <Grid item xs={12} sm={3}>
            <TextField
              fullWidth
              size="small"
              label="From"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          <Grid item xs={12} sm={3}>
            <TextField
              fullWidth
              size="small"
              label="To"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          <Grid item xs={12} sm={3}>
            <Button
              variant="contained"
              onClick={handleShow}
              disabled={isLoading}
              sx={{ height: '40px', width: '100%' }}
            >
              {isLoading ? "Loading..." : "Show"}
            </Button>
          </Grid>
        </Grid>

        {summary && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            {bookBalanceLabel} (all dates): <strong>{formatMoney(summary.book_balance)}</strong>
          </Typography>
        )}
      </Paper>
      <TableContainer component={Paper} sx={{ p: 1 }}>
        <Table>
          <TableHead sx={{ backgroundColor: "var(--pallet-lighter-blue)" }}>
            <TableRow>
              <TableCell>Type</TableCell>
              <TableCell>#</TableCell>
              <TableCell>Reference</TableCell>
              <TableCell>Date</TableCell>
              <TableCell align="right">Debit</TableCell>
              <TableCell align="right">Credit</TableCell>
              <TableCell align="right">Balance</TableCell>
              <TableCell>Person/Item</TableCell>
              <TableCell>Memo</TableCell>
              <TableCell align="center">GL</TableCell>
              <TableCell align="center">Action</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            <TableRow sx={{ backgroundColor: "action.hover" }}>
              <TableCell colSpan={4} sx={{ fontWeight: "bold", borderRight: "1px solid #e0e0e0" }}>
                Opening Balance — {fromDate || "start"}
              </TableCell>
              <TableCell />
              <TableCell />
              <TableCell align="right" sx={{ fontWeight: "bold" }}>
                {formatMoney(openingBalance)}
              </TableCell>
              <TableCell colSpan={4} />
            </TableRow>

            {paginatedRows.map((r) => (
              <TableRow key={r.id} hover>
                <TableCell>{r.type}</TableCell>
                <TableCell>{r.number}</TableCell>
                <TableCell>{r.reference}</TableCell>
                <TableCell>{r.date}</TableCell>
                <TableCell align="right">{formatMoney(parseFloat(r.debit))}</TableCell>
                <TableCell align="right">{formatMoney(parseFloat(r.credit))}</TableCell>
                <TableCell align="right">{formatMoney(parseFloat(r.balance))}</TableCell>
                <TableCell>{r.personItem}</TableCell>
                <TableCell>{r.memo}</TableCell>
                <TableCell align="center">
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() =>
                      navigate("/bankingandgeneralledger/transactions/gl-postings", {
                        state: {
                          trans_no: Number(r.transNo ?? r.number),
                          trans_type:
                            r.transType !== undefined && !Number.isNaN(Number(r.transType))
                              ? Number(r.transType)
                              : undefined,
                          reference: r.reference,
                          date: r.date,
                        },
                      })
                    }
                  >
                    GL
                  </Button>
                </TableCell>
                <TableCell align="center">
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => {
                      const transNo = Number(r.transNo ?? r.number);
                      const transType =
                        r.transType !== undefined && !Number.isNaN(Number(r.transType))
                          ? Number(r.transType)
                          : undefined;

                      // Bank Deposit (2) still has no edit screen/API.
                      if (transType === 0) {
                        navigate("/bankingandgeneralledger/transactions/journal-entry", {
                          state: { trans_no: transNo, trans_type: transType },
                        });
                      } else if (transType === 1) {
                        navigate("/bankingandgeneralledger/transactions/payments", {
                          state: { trans_no: transNo, trans_type: transType },
                        });
                      } else if (transType === 4) {
                        navigate("/bankingandgeneralledger/transactions/bank-account-transfers", {
                          state: { trans_no: transNo, trans_type: transType },
                        });
                      } else {
                        notify.info(`Editing "${r.type}" transactions isn't supported yet.`);
                      }
                    }}
                  >
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}

            <TableRow sx={{ backgroundColor: "action.hover", borderTop: "2px solid #e0e0e0" }}>
              <TableCell colSpan={4} sx={{ fontWeight: "bold", borderRight: "1px solid #e0e0e0" }}>
                Ending Balance — {toDate || "end"}
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: "bold" }}>
                {formatMoney(periodDebit)}
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: "bold" }}>
                {formatMoney(periodCredit)}
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: "bold" }}>
                {formatMoney(endingBalance)}
              </TableCell>
              <TableCell colSpan={4} />
            </TableRow>
          </TableBody>

          <TableFooter>
            <TableRow>
              <TablePagination
                rowsPerPageOptions={[5, 10, 25, { label: "All", value: -1 }]}
                colSpan={11}
                count={rows.length}
                rowsPerPage={rowsPerPage}
                page={page}
                onPageChange={handleChangePage}
                onRowsPerPageChange={handleChangeRowsPerPage}
                showFirstButton
                showLastButton
              />
            </TableRow>
          </TableFooter>
        </Table>
      </TableContainer>
    </FormPageLayout>
  );
}
