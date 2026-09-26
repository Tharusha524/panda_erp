import { FormPageLayout } from "../../../../components/Layout/FormPageLayout";
import React, { useState, useMemo, useEffect } from "react";
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
  TableFooter,
  Paper,
  TextField,
  Typography,
  MenuItem,
  Grid,
  Alert,
  ListSubheader,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getFiscalYears } from "../../../../api/FiscalYear/FiscalYearApi";
import { postBankingDeposit, mapFormLines } from "../../../../api/Banking/BankingTransactionApi";
import useBankBalance from "../../../../hooks/useBankBalance";
import useAllBankBalances from "../../../../hooks/useAllBankBalances";
import {
  balanceByBankAccountId,
  bankAccountLabelWithBalance,
  isCurrentBankAccount,
} from "../../../../utils/cashBankAccount";
import useCurrentUser from "../../../../hooks/useCurrentUser";
import { useFiscalYearFormDefaults } from "../../../../hooks/useFiscalYearFormDefaults";
import { useNextFiscalYearReference } from "../../../../hooks/useNextFiscalYearReference";
import { getBankAccounts } from "../../../../api/BankAccount/BankAccountApi";
import Breadcrumb from "../../../../components/BreadCrumb";
import PageTitle from "../../../../components/PageTitle";
import theme from "../../../../theme";
import BankPayerModeBar from "../../../../components/BankPayerModeBar";
import FormattedNumberField from "../../../../components/FormattedNumberField";
import { useAuth } from "../../../../context/AuthContext";

export default function Deposits() {
  const { hasEditPermission } = useAuth();
  const canEdit = hasEditPermission('Bank deposits');
  const navigate = useNavigate();

  // Fetch fiscal years
  const { data: fiscalYears = [] } = useQuery({
    queryKey: ["fiscalYears"],
    queryFn: getFiscalYears,
  });

  // Fetch GL accounts for Account Description dropdown
  const { data: chartMasters = [] } = useQuery({
    queryKey: ["chartMasters"],
    queryFn: () => import("../../../../api/GLAccounts/ChartMasterApi").then(m => m.getChartMasters()),
  });

  // Fetch GL Account Groups from backend
  const { data: chartTypes = [] } = useQuery({
    queryKey: ["chartTypes"],
    queryFn: () => import("../../../../api/GLAccounts/ChartTypeApi").then(m => m.getChartTypes()),
  });

  // Group chart masters by backend GL Account Group names
  const groupedChartMasters = useMemo(() => {
    const groupsMap: Record<string, any[]> = {};

    (chartMasters as any[]).forEach((acc: any) => {
      const matchedGroup = (chartTypes as any[]).find((g: any) => String(g.id) === String(acc.account_type));
      const typeText = matchedGroup ? matchedGroup.name : "Unknown Group";

      if (!groupsMap[typeText]) groupsMap[typeText] = [];
      groupsMap[typeText].push(acc);
    });

    // sort each group's accounts by account_code for stable order
    Object.values(groupsMap).forEach((arr) =>
      arr.sort((a: any, b: any) => (String(a.account_code || "")).localeCompare(String(b.account_code || "")))
    );
    return groupsMap;
  }, [chartMasters, chartTypes]);

  // Fetch bank accounts for 'From' dropdown
  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["bankAccounts"],
    queryFn: getBankAccounts,
  });

  const { data: allBankBalances } = useAllBankBalances();
  const balanceMap = useMemo(
    () => balanceByBankAccountId(allBankBalances?.accounts),
    [allBankBalances]
  );

  const depositTargetAccounts = useMemo(() => {
    const active = (bankAccounts as any[]).filter((acc) => !acc.inactive);
    const current = active.filter(isCurrentBankAccount);
    const other = active.filter((acc) => !isCurrentBankAccount(acc));
    return [...current, ...other];
  }, [bankAccounts]);

  const [fromField, setFromField] = useState("");

  useEffect(() => {
    if (fromField || depositTargetAccounts.length === 0) return;
    const preferred =
      depositTargetAccounts.find(isCurrentBankAccount) ?? depositTargetAccounts[0];
    if (preferred?.id != null) setFromField(String(preferred.id));
  }, [fromField, depositTargetAccounts]);

  // Active fiscal year from company setup
  const { fiscalYear: activeFiscalYear } = useFiscalYearFormDefaults();
  const { reference: nextReference, manualEntryRequired, suffix } =
    useNextFiscalYearReference(2);

  const { user } = useCurrentUser();
  const userId = user?.id ?? (Number(localStorage.getItem("userId")) || 0);

  //  Table data (payments rows)
  const [rows, setRows] = useState([
    {
      id: 1,
      accountCode: "",
      accountDescription: "",
      costCenter: "",
      amount: "",
      memo: "",
      selectedAccountCode: "",
    },
  ]);

  //  Form fields
  const [memo, setMemo] = useState("");
  const [location, setLocation] = useState("");
  const [payTo, setPayTo] = useState("");
  const { data: bankBalanceData } = useBankBalance(fromField || null);
  const bankBalanceDisplay =
    fromField && bankBalanceData
      ? Number(bankBalanceData.book_balance).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : "";
  const [toTheOrderOf, setToTheOrderOf] = useState("");
  const [date, setDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [reference, setReference] = useState("");
  const [dateError, setDateError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [openSelectRowId, setOpenSelectRowId] = useState<number | null>(null);

  useEffect(() => {
    if (nextReference) {
      setReference(nextReference);
    }
  }, [nextReference]);

  // Validate date is within fiscal year
  const validateDate = (selectedDate: string) => {
    if (!activeFiscalYear) {
      setDateError("No active fiscal year found");
      return false;
    }

    const selected = new Date(selectedDate);
    const from = new Date(activeFiscalYear.fiscal_year_from);
    const to = new Date(activeFiscalYear.fiscal_year_to);

    if (selected < from || selected > to) {
      setDateError(`Date must be within the fiscal year (${from.toLocaleDateString()} - ${to.toLocaleDateString()})`);
      return false;
    }

    setDateError("");
    return true;
  };

  // Handle date change with validation
  const handleDateChange = (value: string) => {
    setDate(value);
    validateDate(value);
  };

  //  Handle input change in table (generic)
  const handleChange = (id: number, field: string, value: any) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  //  Add new row
  const handleAddItem = () => {
    setRows((prev) => [
      ...prev,
      {
        id: prev.length + 1,
        accountCode: "",
        accountDescription: "",
        costCenter: "",
        amount: "",
        memo: "",
        selectedAccountCode: "",
      },
    ]);
  };

  //  Remove row (optional)
  const handleRemoveRow = (id: number) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleSaveAdjustment = async () => {
    // Validation
    if (!date) {
      setSaveError("Please select a date");
      return;
    }
    if (rows.length === 0 || rows.every((row: any) => !row.selectedAccountCode || !row.amount)) {
      setSaveError("Please add at least one line with account and amount");
      return;
    }

    setIsSaving(true);
    setSaveError("");
    setSaveSuccess(false);

    try {
      const linePayload = rows
        .filter((r: any) => r.selectedAccountCode && r.amount)
        .map((r: any) => ({
          accountCode: r.selectedAccountCode || r.accountCode,
          accountDescription: r.accountDescription,
          costCenter: r.costCenter,
          amount: r.amount,
          memo: r.memo,
          selectedAccountCode: r.selectedAccountCode,
        }));

      const totalAmount = linePayload.reduce(
        (sum: number, r: { amount: string }) => sum + (parseFloat(r.amount) || 0),
        0
      );

      if (!fromField) {
        setSaveError("Please select the bank account to deposit to");
        return;
      }
      if (totalAmount <= 0) {
        setSaveError("Please enter at least one line with a valid amount");
        return;
      }

      const result = await postBankingDeposit({
        bank_account_id: Number(fromField),
        trans_date: date,
        reference,
        memo: memo || toTheOrderOf,
        lines: mapFormLines(linePayload).filter((l) => (l.amount ?? 0) > 0),
      });

      navigate("/bankingandgeneralledger/transactions/deposits/success", {
        state: {
          reference: result.reference ?? reference,
          date,
          payTo,
          from: fromField,
          bankAccountId: fromField,
          toTheOrderOf,
          trans_no: result.trans_no,
          trans_type: result.trans_type ?? 2,
          transactionKind: "deposit",
          lines: linePayload,
        },
      });
    } catch (error: any) {
      console.error("Error saving deposit:", error);
      const msg =
        error?.message ||
        error?.data?.message ||
        (typeof error === "object" ? JSON.stringify(error) : "Failed to save deposit");
      setSaveError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const breadcrumbItems = [
    { title: "Home", href: "/dashboard" },
    { title: "Deposits" },
  ];

  return (
    <FormPageLayout>
      {/* Header */}
      <Box
        sx={{
          padding: theme.spacing(2),
          boxShadow: 2,
          borderRadius: 1,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <Box>
          <PageTitle title="Bank Account Deposit Entry" />
          <Breadcrumb breadcrumbs={breadcrumbItems} />
        </Box>

        <Button
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(-1)}
        >
          Back
        </Button>
      </Box>
      {/* New header fields: Date, Pay To, From / Reference, To the order of, Bank balance */}
      <Paper sx={{ p: 2, borderRadius: 2 }}>
        <BankPayerModeBar mode="gl" onModeChange={() => undefined} entryKind="deposit" />
        <Grid container spacing={2}>
          {/* First row: Date, Pay To, From */}
          <Grid item xs={12} sm={4}>
            <TextField
              label="Date"
              type="date"
              fullWidth
              size="small"
              value={date}
              onChange={(e) => handleDateChange(e.target.value)}
              InputLabelProps={{ shrink: true }}
              error={!!dateError}
              helperText={dateError}
            />
          </Grid>

          <Grid item xs={12} sm={4}>
            <TextField
              select
              fullWidth
              label="From"
              value={payTo}
              onChange={(e) => setPayTo(e.target.value)}
              size="small"
            >
              <MenuItem value="">Select</MenuItem>
              <MenuItem value="miscellaneous">Miscellaneous</MenuItem>
              <MenuItem value="customer">Customer</MenuItem>
              <MenuItem value="supplier">Supplier</MenuItem>
              <MenuItem value="quick">Quick Entry</MenuItem>
            </TextField>
          </Grid>

          <Grid item xs={12} sm={4}>
            <TextField
              select
              label="Into"
              fullWidth
              size="small"
              value={fromField}
              onChange={(e) => setFromField(e.target.value)}
            >
              <MenuItem value="">Select account</MenuItem>
              {(depositTargetAccounts as any[]).map((acc: any) => (
                <MenuItem key={acc.id} value={String(acc.id)}>
                  {bankAccountLabelWithBalance(acc, balanceMap.get(String(acc.id)))}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          {/* Second row: Reference, Name */}
          <Grid item xs={12} sm={4}>
            <TextField
              label="Reference"
              fullWidth
              size="small"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={manualEntryRequired ? "Enter reference manually" : "Enter reference"}
              helperText={
                manualEntryRequired
                  ? `Auto numbering is off — enter a reference for FY ${suffix || "active year"}`
                  : undefined
              }
            />
          </Grid>

          <Grid item xs={12} sm={4}>
            <TextField
              label="Name"
              fullWidth
              size="small"
              value={toTheOrderOf}
              onChange={(e) => setToTheOrderOf(e.target.value)}
            />
          </Grid>

          <Grid item xs={12} sm={4}>
            <TextField
              label="Bank balance"
              fullWidth
              size="small"
              value={bankBalanceDisplay}
              InputProps={{ readOnly: true }}
              helperText={fromField ? "Book balance (sum of bank transactions)" : "Select a bank account"}
            />
          </Grid>
        </Grid>
      </Paper>
      {/*  Table */}
      <TableContainer component={Paper} sx={{ p: 1 }}>
        <Table>
          <TableHead sx={{ backgroundColor: "var(--pallet-lighter-blue)" }}>
            <TableRow>
              <TableCell>No</TableCell>
              <TableCell>Account Code</TableCell>
              <TableCell>Account Description</TableCell>
              <TableCell>Cost Center</TableCell>
              <TableCell>Amount</TableCell>
              <TableCell sx={{ minWidth: 280 }}>Memo</TableCell>
              <TableCell align="center">Action</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={row.id} hover data-row-id={row.id}>
                <TableCell>{index + 1}</TableCell>
                <TableCell>
                  <TextField size="small" value={row.accountCode} InputProps={{ readOnly: true }} />
                </TableCell>
                <TableCell>
                  <TextField
                    select
                    size="small"
                    value={String(row.selectedAccountCode || row.accountCode || "")}
                    SelectProps={{
                        open: openSelectRowId === row.id,
                        onOpen: () => setOpenSelectRowId(row.id),
                        onClose: () => setOpenSelectRowId(null),
                        renderValue: (value: any) => {
                            if (!value) return "";
                            const found = (chartMasters as any[]).find((c: any) => String(c.account_code) === String(value));
                            return found ? `${found.account_name} - ${found.account_code}` : String(value);
                        },
                    }}
                    onChange={(e) => {
                      const selectedCode = String(e.target.value);
                      const selected = (chartMasters as any[]).find((c: any) => String(c.account_code) === selectedCode);
                      const desc = selected ? selected.account_name : "";
                      const code = selected ? String(selected.account_code) : selectedCode;
                      handleChange(row.id, "selectedAccountCode", code);
                      handleChange(row.id, "accountDescription", desc);
                      handleChange(row.id, "accountCode", code);
                      setOpenSelectRowId(null);
                    }}
                  >
                    <MenuItem value="" onClick={() => {
                      handleChange(row.id, "selectedAccountCode", "");
                      handleChange(row.id, "accountCode", "");
                      handleChange(row.id, "accountDescription", "");
                      setOpenSelectRowId(null);
                    }}>Select account</MenuItem>
                    {Object.entries(groupedChartMasters).map(([typeText, accounts]) => (
                      <React.Fragment key={typeText}>
                        <ListSubheader>{typeText}</ListSubheader>
                        {accounts.map((acc: any) => (
                          <MenuItem
                            key={String(acc.account_code)}
                            value={String(acc.account_code)}
                            onClick={() => {
                              const code = String(acc.account_code ?? "");
                              handleChange(row.id, "selectedAccountCode", code);
                              handleChange(row.id, "accountCode", code);
                              handleChange(row.id, "accountDescription", acc.account_name || "");
                              setOpenSelectRowId(null);
                            }}
                          >
                            {acc.account_name} {acc.account_code ? ` - ${acc.account_code}` : ""}
                          </MenuItem>
                        ))}
                      </React.Fragment>
                    ))}
                  </TextField>
                </TableCell>
                <TableCell>
                  <TextField size="small" value={row.costCenter} onChange={(e) => handleChange(row.id, "costCenter", e.target.value)} />
                </TableCell>
                <TableCell>
                  <FormattedNumberField size="small" fixedDecimals={2} value={row.amount} onChange={(e) => handleChange(row.id, "amount", e.target.value)} />
                </TableCell>
                <TableCell>
                  <TextField size="small" fullWidth sx={{ minWidth: 260 }} value={row.memo} onChange={(e) => handleChange(row.id, "memo", e.target.value)} />
                </TableCell>
                <TableCell align="center">
                  {index === rows.length - 1 ? (
                    <Button
                      variant="contained"
                      color="primary"
                      size="small"
                      startIcon={<AddIcon />}
                      onClick={handleAddItem}
                      disabled={!row.selectedAccountCode || !(Number(row.amount) > 0)}
                    >
                      Add
                    </Button>
                  ) : (
                    <Stack direction="row" spacing={1} justifyContent="center">
                      <Button variant="outlined" size="small" startIcon={<EditIcon />} onClick={() => {
                        const rowElement = document.querySelector(`[data-row-id="${row.id}"]`);
                        if (rowElement) {
                          const firstInput = rowElement.querySelector('input') as HTMLInputElement;
                          if (firstInput) firstInput.focus();
                        }
                      }}>Edit</Button>
                      <Button variant="outlined" color="error" size="small" startIcon={<DeleteIcon />} onClick={() => handleRemoveRow(row.id)}>Delete</Button>
                    </Stack>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>

          <TableFooter>
            <TableRow>
              <TableCell colSpan={7}>
                <Typography align="right" sx={{ pr: 2, fontWeight: 600 }}>
                  Total: {rows.reduce((sum, r) => sum + Number(r.amount || 0), 0).toFixed(2)}
                </Typography>
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </TableContainer>
      {/*  Memo Field */}
      <Box sx={{ mt: 2, pl: 1, pr: 1 }}>
        <Typography sx={{ mb: 1, fontWeight: 600 }}>Memo:</Typography>
        <TextField
          fullWidth
          multiline
          rows={2}
          placeholder="Enter memo or notes..."
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
      </Box>
      {/* Success/Error Messages */}
      {saveSuccess && (
        <Alert severity="success" sx={{ mt: 2 }}>
          Payment processed successfully!
        </Alert>
      )}
      {saveError && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {saveError}
        </Alert>
      )}
      {/*  Submit Button */}
      <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2, p: 1 }}>
        <Button
          variant="contained"
          color="primary"
          disabled={!!dateError || isSaving || !canEdit}
          onClick={handleSaveAdjustment}
        >
          {isSaving ? "Saving..." : "Process Deposit"}
        </Button>
      </Box>
    </FormPageLayout>
  );
}
