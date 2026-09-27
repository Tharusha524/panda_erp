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
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getFiscalYears } from "../../../../api/FiscalYear/FiscalYearApi";
import {
  getBankingPayment,
  postBankingPayment,
  putBankingPayment,
  mapFormLines,
} from "../../../../api/Banking/BankingTransactionApi";
import useCurrentUser from "../../../../hooks/useCurrentUser";
import { useFiscalYearFormDefaults } from "../../../../hooks/useFiscalYearFormDefaults";
import { useNextFiscalYearReference } from "../../../../hooks/useNextFiscalYearReference";
import { getBankAccounts } from "../../../../api/BankAccount/BankAccountApi";
import useBankBalance from "../../../../hooks/useBankBalance";
import useAllBankBalances from "../../../../hooks/useAllBankBalances";
import {
  balanceByBankAccountId,
  bankAccountLabelWithBalance,
  defaultPaymentSourceAccountId,
  groupPaymentSourceAccounts,
  sortPaymentSourceAccounts,
} from "../../../../utils/cashBankAccount";
import { getFriendlyApiErrorMessage } from "../../../../utils/apiErrorMessage";
import Breadcrumb from "../../../../components/BreadCrumb";
import PageTitle from "../../../../components/PageTitle";
import PageLoader from "../../../../components/PageLoader";
import ReportCostCenterSelect from "../../../../components/ReportCostCenterSelect";
import BankPayerModeBar from "../../../../components/BankPayerModeBar";
import theme from "../../../../theme";
import FormattedNumberField from "../../../../components/FormattedNumberField";
import { useAuth } from "../../../../context/AuthContext";

export default function Payments() {
  const { hasEditPermission } = useAuth();
  const canEdit = hasEditPermission('Bank payments');
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const editState = routerLocation.state as {
    trans_no?: number;
    trans_type?: number;
    reference?: string;
    date?: string;
  } | null;
  const editTransNo = Number(editState?.trans_no ?? 0);
  const isEditMode =
    Number.isFinite(editTransNo) &&
    editTransNo > 0 &&
    Number(editState?.trans_type ?? 0) === 1;

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

  const paymentSourceAccounts = useMemo(
    () => sortPaymentSourceAccounts(bankAccounts as any[]),
    [bankAccounts]
  );

  const paymentAccountGroups = useMemo(
    () => groupPaymentSourceAccounts(bankAccounts as any[]),
    [bankAccounts]
  );

  const { data: allBankBalances } = useAllBankBalances();
  const balanceMap = useMemo(
    () => balanceByBankAccountId(allBankBalances?.accounts),
    [allBankBalances]
  );

  const [fromField, setFromField] = useState("");

  useEffect(() => {
    if (fromField || paymentSourceAccounts.length === 0) return;
    const defaultId = defaultPaymentSourceAccountId(paymentSourceAccounts);
    if (defaultId) setFromField(defaultId);
  }, [fromField, paymentSourceAccounts]);

  const { fiscalYear: activeFiscalYear } = useFiscalYearFormDefaults();
  const { reference: nextReference, manualEntryRequired, suffix } =
    useNextFiscalYearReference(1, { enabled: !isEditMode });

  const {
    data: existingPayment,
    isLoading: loadingExistingPayment,
    isError: existingPaymentError,
    error: existingPaymentLoadError,
  } = useQuery({
    queryKey: ["bankingPayment", editTransNo],
    queryFn: () => getBankingPayment(editTransNo),
    enabled: isEditMode,
  });

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
  // A completed row (not the last, always-open one) is locked until its
  // "Edit" button is clicked — before that, its fields can't be changed.
  const [editingRowId, setEditingRowId] = useState<number | null>(null);

  useEffect(() => {
    if (isEditMode || !nextReference) return;
    setReference(nextReference);
  }, [nextReference, isEditMode]);

  useEffect(() => {
    if (!existingPayment || !isEditMode) return;

    const transDate = String(existingPayment.trans_date ?? "").split(" ")[0];
    setDate(transDate || editState?.date || "");
    setReference(existingPayment.reference || editState?.reference || "");
    setFromField(String(existingPayment.bank_account_id ?? ""));
    setMemo(existingPayment.memo || "");

    const loadedRows = (existingPayment.lines ?? []).map((line: any, index: number) => ({
      id: index + 1,
      accountCode: String(line.account_code ?? ""),
      accountDescription: "",
      costCenter: line.costCenter ? String(line.costCenter) : "",
      amount: line.amount != null ? String(line.amount) : "",
      memo: line.memo ?? "",
      selectedAccountCode: String(line.account_code ?? ""),
    }));

    setRows(
      loadedRows.length > 0
        ? loadedRows
        : [
            {
              id: 1,
              accountCode: "",
              accountDescription: "",
              costCenter: "",
              amount: "",
              memo: "",
              selectedAccountCode: "",
            },
          ]
    );
  }, [existingPayment, isEditMode, editState]);

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

  //  Handle input change in table
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
    if (!date) {
      setSaveError("Please select a date");
      return;
    }
    if (rows.length === 0 || rows.every((row: any) => !row.selectedAccountCode || !row.amount)) {
      setSaveError("Please add at least one line with account and amount");
      return;
    }
    if (!fromField) {
      setSaveError("Please select the bank account to pay from");
      return;
    }

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

    if (totalAmount <= 0) {
      setSaveError("Please enter at least one line with a valid amount");
      return;
    }

    const availableBalance = Number(bankBalanceData?.book_balance ?? 0);
    if (availableBalance + 0.001 < totalAmount) {
      setSaveError(
        `Insufficient funds. Available balance is ${availableBalance.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} but payment total is ${totalAmount.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}.`
      );
      return;
    }

    setIsSaving(true);
    setSaveError("");
    setSaveSuccess(false);

    try {
      const payload = {
        bank_account_id: Number(fromField),
        trans_date: date,
        reference,
        memo: memo || toTheOrderOf,
        lines: mapFormLines(linePayload).filter((l) => (l.amount ?? 0) > 0),
      };

      const result = isEditMode
        ? await putBankingPayment(editTransNo, payload)
        : await postBankingPayment(payload);

      navigate("/bankingandgeneralledger/transactions/payments/success", {
        state: {
          reference: result.reference ?? reference,
          date,
          payTo,
          from: fromField,
          bankAccountId: fromField,
          toTheOrderOf,
          bankBalance: result.book_balance ?? bankBalanceData?.book_balance ?? 0,
          trans_no: result.trans_no ?? editTransNo,
          trans_type: result.trans_type ?? 1,
          transactionKind: "payment",
          lines: linePayload,
        },
      });
    } catch (error: any) {
      console.error("Error saving payment:", error);
      setSaveError(getFriendlyApiErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const breadcrumbItems = [
    { title: "Home", href: "/dashboard" },
    { title: isEditMode ? `Edit Bank Payment #${editTransNo}` : "Payments" },
  ];

  if (isEditMode && loadingExistingPayment) {
    return <PageLoader />;
  }

  if (isEditMode && existingPaymentError) {
    return (
      <Stack spacing={2} sx={{ p: 2 }}>
        <Alert severity="error">
          {getFriendlyApiErrorMessage(existingPaymentLoadError) || "Failed to load bank payment."}
        </Alert>
        <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)}>
          Back
        </Button>
      </Stack>
    );
  }

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
          <PageTitle title={isEditMode ? `Edit Bank Payment #${editTransNo}` : "Bank Account Payment Entry"} />
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
        {!isEditMode && (
          <BankPayerModeBar mode="gl" onModeChange={() => undefined} entryKind="payment" />
        )}
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
              // Native date input's displayed format follows this element's
              // locale — en-GB shows DD/MM/YYYY instead of the default MM/DD/YYYY.
              inputProps={{ lang: "en-GB" }}
              error={!!dateError}
              helperText={dateError}
            />
          </Grid>

          <Grid item xs={12} sm={4}>
            <TextField
              select
              fullWidth
              label="Pay To"
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
              label="From"
              fullWidth
              size="small"
              value={fromField}
              onChange={(e) => setFromField(e.target.value)}
            >
              <MenuItem value="">Select account</MenuItem>
              {Object.entries(paymentAccountGroups).flatMap(([typeName, accounts]) => [
                <ListSubheader key={`hdr-${typeName}`}>{typeName}</ListSubheader>,
                ...accounts.map((acc: any) => (
                  <MenuItem key={acc.id} value={String(acc.id)}>
                    {bankAccountLabelWithBalance(acc, balanceMap.get(String(acc.id)))}
                  </MenuItem>
                )),
              ])}
            </TextField>
          </Grid>

          {/* Second row: Reference, To the order of, Bank balance */}
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
              label="To the order of"
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
              <TableCell>Memo</TableCell>
              <TableCell align="center">Action</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {rows.map((row, index) => {
              const isLastRow = index === rows.length - 1;
              const isLocked = !isLastRow && editingRowId !== row.id;

              return (
              <TableRow key={row.id} hover data-row-id={row.id}>
                <TableCell>{index + 1}</TableCell>
                <TableCell>
                  <TextField size="small" value={row.accountCode} InputProps={{ readOnly: true }} />
                </TableCell>
                <TableCell>
                  <TextField
                    select
                    size="small"
                    disabled={isLocked}
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
                  <ReportCostCenterSelect
                    value={row.costCenter}
                    onChange={(val) => handleChange(row.id, "costCenter", val)}
                    disabled={isLocked}
                  />
                </TableCell>
                <TableCell>
                  <FormattedNumberField
                    size="small"
                    fixedDecimals={2}
                    value={row.amount}
                    InputProps={{ readOnly: isLocked }}
                    onChange={(e) => handleChange(row.id, "amount", e.target.value)}
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    size="small"
                    value={row.memo}
                    InputProps={{ readOnly: isLocked }}
                    onChange={(e) => handleChange(row.id, "memo", e.target.value)}
                  />
                </TableCell>
                <TableCell align="center">
                  {isLastRow ? (
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
                      {editingRowId === row.id ? (
                        <Button variant="contained" size="small" onClick={() => setEditingRowId(null)}>
                          Done
                        </Button>
                      ) : (
                        <Button variant="outlined" size="small" startIcon={<EditIcon />} onClick={() => setEditingRowId(row.id)}>
                          Edit
                        </Button>
                      )}
                      <Button variant="outlined" color="error" size="small" startIcon={<DeleteIcon />} onClick={() => handleRemoveRow(row.id)}>Delete</Button>
                    </Stack>
                  )}
                </TableCell>
              </TableRow>
              );
            })}
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
          {isSaving ? "Saving..." : isEditMode ? "Update Payment" : "Process Payment"}
        </Button>
      </Box>
    </FormPageLayout>
  );
}
