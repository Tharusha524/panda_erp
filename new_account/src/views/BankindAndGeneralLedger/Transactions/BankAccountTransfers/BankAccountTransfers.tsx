import { FormPageLayout } from "../../../../components/Layout/FormPageLayout";
import React, { useState, useMemo, useEffect } from "react";
import {
  Box,
  Button,
  Stack,
  Paper,
  TextField,
  Typography,
  MenuItem,
  Grid,
  Alert,
  InputAdornment,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getFiscalYears } from "../../../../api/FiscalYear/FiscalYearApi";
import { getStockMoves } from "../../../../api/StockMoves/StockMovesApi";
import useCurrentUser from "../../../../hooks/useCurrentUser";
import { getBankAccounts } from "../../../../api/BankAccount/BankAccountApi";
import useBankBalance from "../../../../hooks/useBankBalance";
import { useNextFiscalYearReference } from "../../../../hooks/useNextFiscalYearReference";
import {
  postBankingTransfer,
  getBankingTransfer,
  putBankingTransfer,
} from "../../../../api/Banking/BankingTransactionApi";
import Breadcrumb from "../../../../components/BreadCrumb";
import PageTitle from "../../../../components/PageTitle";
import theme from "../../../../theme";
import FormattedNumberField from "../../../../components/FormattedNumberField";
import { useAuth } from "../../../../context/AuthContext";
import { getFriendlyApiErrorMessage } from "../../../../utils/apiErrorMessage";
import PageLoader from "../../../../components/PageLoader";

export default function BankAccountTransfers() {
  const { hasEditPermission } = useAuth();
  const canEdit = hasEditPermission('Bank account transfers');
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const editState = routerLocation.state as { trans_no?: number } | null;
  const editTransNo = Number(editState?.trans_no ?? 0);
  const isEditMode = Number.isFinite(editTransNo) && editTransNo > 0;

  const {
    data: existingTransfer,
    isLoading: loadingExistingTransfer,
    isError: existingTransferError,
    error: existingTransferLoadError,
  } = useQuery({
    queryKey: ["bankingTransfer", editTransNo],
    queryFn: () => getBankingTransfer(editTransNo),
    enabled: isEditMode,
  });

  // Fetch fiscal years
  const { data: fiscalYears = [] } = useQuery({
    queryKey: ["fiscalYears"],
    queryFn: getFiscalYears,
  });

  // Fetch bank accounts for From and To dropdowns
  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["bankAccounts"],
    queryFn: getBankAccounts,
  });

  // Find current fiscal year (not closed and contains today's date)
  const currentFiscalYear = useMemo(() => {
    const today = new Date();
    const openFiscalYears = fiscalYears.filter((fy: any) => !fy.isClosed);

    // First try to find fiscal year that contains today's date
    const currentFY = openFiscalYears.find((fy: any) => {
      const from = new Date(fy.fiscal_year_from);
      const to = new Date(fy.fiscal_year_to);
      return today >= from && today <= to;
    });

    // If no fiscal year contains today's date, use the first open one
    return currentFY || openFiscalYears[0];
  }, [fiscalYears]);

  const { user } = useCurrentUser();
  const userId = user?.id ?? (Number(localStorage.getItem("userId")) || 0);

  // Form fields
  const [fromAccount, setFromAccount] = useState("");
  const { data: bankBalanceData } = useBankBalance(fromAccount || null);
  const bankBalance =
    fromAccount && bankBalanceData
      ? Number(bankBalanceData.book_balance).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : "";
  const [amount, setAmount] = useState("");
  const [bankCharge, setBankCharge] = useState("");
  const [toAccount, setToAccount] = useState("");
  const [incomingAmount, setIncomingAmount] = useState("");
  const [transferDate, setTransferDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [reference, setReference] = useState("");

  // trans_type 4 = Funds Transfer (BankingTransactionService::TYPE_TRANSFER)
  const { reference: nextTransferReference } = useNextFiscalYearReference(4, {
    asOfDate: transferDate,
    enabled: !isEditMode,
  });
  const [costCenter, setCostCenter] = useState("");
  const [memo, setMemo] = useState("");
  const [dateError, setDateError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Currency states
  const [fromCurrency, setFromCurrency] = useState("");
  const [toCurrency, setToCurrency] = useState("");

  // Update currency when from account changes (balance comes from useBankBalance)
  useEffect(() => {
    if (fromAccount) {
      const selectedAccount = (bankAccounts as any[]).find((acc: any) => String(acc.id) === fromAccount);
      setFromCurrency(selectedAccount?.bank_curr_code || "");
    } else {
      setFromCurrency("");
    }
  }, [fromAccount, bankAccounts]);

  // Update currency when to account changes
  useEffect(() => {
    if (toAccount) {
      const selectedAccount = (bankAccounts as any[]).find((acc: any) => String(acc.id) === toAccount);
      setToCurrency(selectedAccount?.bank_curr_code || "");
    } else {
      setToCurrency("");
    }
  }, [toAccount, bankAccounts]);

  // Auto-generate reference based on fiscal year — uses the shared
  // TransactionReferenceService (via useNextFiscalYearReference) so this follows
  // the Funds Transfer type's configured Prefix/Pattern under Setup > Transaction
  // References. (Previously this pulled from stock_moves type 17, which is
  // Inventory Location Transfer — an unrelated table, not bank transfers.)
  useEffect(() => {
    if (isEditMode || !nextTransferReference) return;
    setReference(nextTransferReference);
  }, [nextTransferReference, isEditMode]);

  // Pre-fill the form from the existing transfer when opened via Edit.
  useEffect(() => {
    if (!existingTransfer || !isEditMode) return;

    const transDate = String(existingTransfer.trans_date ?? "").split(" ")[0];
    setTransferDate(transDate || new Date().toISOString().split("T")[0]);
    setReference(existingTransfer.reference || "");
    setFromAccount(String(existingTransfer.from_account_id ?? ""));
    setToAccount(String(existingTransfer.to_account_id ?? ""));
    setAmount(existingTransfer.amount != null ? String(existingTransfer.amount) : "");
    setBankCharge(existingTransfer.bank_charge != null ? String(existingTransfer.bank_charge) : "");
    setMemo(existingTransfer.memo || "");
    setCostCenter(existingTransfer.cost_center_id != null ? String(existingTransfer.cost_center_id) : "");
  }, [existingTransfer, isEditMode]);

  // Validate date is within fiscal year
  const validateDate = (selectedDate: string) => {
    if (!currentFiscalYear) {
      setDateError("No active fiscal year found");
      return false;
    }

    const selected = new Date(selectedDate);
    const from = new Date(currentFiscalYear.fiscal_year_from);
    const to = new Date(currentFiscalYear.fiscal_year_to);

    if (selected < from || selected > to) {
      setDateError(`Date must be within the fiscal year (${from.toLocaleDateString()} - ${to.toLocaleDateString()})`);
      return false;
    }

    setDateError("");
    return true;
  };

  // Handle date change with validation
  const handleDateChange = (value: string) => {
    setTransferDate(value);
    validateDate(value);
  };

  const handleEnterTransfer = async () => {
    // Validation
    if (!transferDate) {
      setSaveError("Please select a transfer date");
      return;
    }
    if (!fromAccount || !toAccount) {
      setSaveError("Please select both from and to accounts");
      return;
    }
    if (fromAccount === toAccount) {
      setSaveError("From and to accounts must be different");
      return;
    }
    if (!amount) {
      setSaveError("Please enter the amount");
      return;
    }
    // Only require incoming amount if currencies are different
    if (fromCurrency && toCurrency && fromCurrency !== toCurrency && !incomingAmount) {
      setSaveError("Please enter the incoming amount for currency conversion");
      return;
    }

    setIsSaving(true);
    setSaveError("");
    setSaveSuccess(false);

    try {
      const transferAmount = parseFloat(amount);
      const payload = {
        from_account_id: Number(fromAccount),
        to_account_id: Number(toAccount),
        amount: transferAmount,
        trans_date: transferDate,
        reference,
        bank_charge: parseFloat(bankCharge) || 0,
        memo: memo || undefined,
        cost_center_id: Number(costCenter) || undefined,
      };

      const result = isEditMode
        ? await putBankingTransfer(editTransNo, payload)
        : await postBankingTransfer(payload);

      navigate("/bankingandgeneralledger/transactions/bank-account-transfers/success", {
        state: {
          reference: result.reference ?? reference,
          date: transferDate,
          fromAccount,
          toAccount,
          amount: transferAmount,
          bankCharge,
          trans_no: result.trans_no ?? editTransNo,
          trans_type: result.trans_type ?? 4,
          incomingAmount:
            fromCurrency && toCurrency && fromCurrency !== toCurrency
              ? incomingAmount
              : amount,
          costCenter,
          memo,
        },
      });
    } catch (error: any) {
      console.error("Error saving transfer:", error);
      const msg =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        (typeof error?.response?.data === "string" ? error.response.data : null) ||
        error?.message;
      setSaveError(msg || "Failed to save transfer");
    } finally {
      setIsSaving(false);
    }
  };

  const breadcrumbItems = [
    { title: "Home", href: "/dashboard" },
    { title: isEditMode ? `Edit Funds Transfer #${editTransNo}` : "Bank Account Transfers" },
  ];

  if (isEditMode && loadingExistingTransfer) {
    return <PageLoader />;
  }

  if (isEditMode && existingTransferError) {
    return (
      <Stack spacing={2} sx={{ p: 2 }}>
        <Alert severity="error">
          {getFriendlyApiErrorMessage(existingTransferLoadError) || "Failed to load bank transfer."}
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
          <PageTitle title={isEditMode ? `Edit Funds Transfer #${editTransNo}` : "Bank Account Transfer Entry"} />
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
      {/* Transfer Form */}
      <Paper sx={{ p: 2, borderRadius: 2 }}>
        <Grid container spacing={2}>
          {/* First row: From Account, Amount */}
          <Grid item xs={12} sm={6}>
            <TextField
              select
              fullWidth
              label="From Account"
              value={fromAccount}
              onChange={(e) => setFromAccount(e.target.value)}
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

          <Grid item xs={12} sm={6}>
            <FormattedNumberField
              label="Amount"
              fullWidth
              size="small"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              InputProps={{
                endAdornment: fromCurrency ? (
                  <InputAdornment position="end">{fromCurrency}</InputAdornment>
                ) : null,
              }}
            />
          </Grid>

          {/* Second row: Bank Balance, Bank Charge */}
          <Grid item xs={12} sm={6}>
            <TextField
              label="Bank Balance"
              fullWidth
              size="small"
              value={bankBalance}
              InputProps={{ readOnly: true }}
              helperText={fromAccount ? "Book balance (sum of bank transactions)" : "Select a from account"}
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <FormattedNumberField
              label="Bank Charge"
              fullWidth
              size="small"
              value={bankCharge}
              onChange={(e) => setBankCharge(e.target.value)}
              InputProps={{
                endAdornment: fromCurrency ? (
                  <InputAdornment position="end">{fromCurrency}</InputAdornment>
                ) : null,
              }}
            />
          </Grid>

          {/* Third row: To Account, Incoming Amount (only if currencies differ) */}
          <Grid item xs={12} sm={6}>
            <TextField
              select
              fullWidth
              label="To Account"
              value={toAccount}
              onChange={(e) => setToAccount(e.target.value)}
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

          {fromCurrency && toCurrency && fromCurrency !== toCurrency && (
            <Grid item xs={12} sm={6}>
              <FormattedNumberField
                label="Incoming Amount"
                fullWidth
                size="small"
                value={incomingAmount}
                onChange={(e) => setIncomingAmount(e.target.value)}
                InputProps={{
                  endAdornment: toCurrency ? (
                    <InputAdornment position="end">{toCurrency}</InputAdornment>
                  ) : null,
                }}
              />
            </Grid>
          )}

          {/* Fourth row: Transfer Date, Reference */}
          <Grid item xs={12} sm={6}>
            <TextField
              label="Transfer Date"
              type="date"
              fullWidth
              size="small"
              value={transferDate}
              onChange={(e) => handleDateChange(e.target.value)}
              InputLabelProps={{ shrink: true }}
              error={!!dateError}
              helperText={dateError}
            />
          </Grid>

          <Grid item xs={12} sm={6}>
            <TextField
              label="Reference"
              fullWidth
              size="small"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Enter reference"
            />
          </Grid>

          {/* Fifth row: CostCenter */}
          <Grid item xs={12}>
            <TextField
              label="Cost Center"
              fullWidth
              size="small"
              value={costCenter}
              onChange={(e) => setCostCenter(e.target.value)}
            />
          </Grid>

          {/* Memo */}
          <Grid item xs={12}>
            <TextField
              label="Memo"
              fullWidth
              multiline
              rows={3}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Enter memo or notes..."
            />
          </Grid>
        </Grid>
      </Paper>
      {/* Success/Error Messages */}
      {saveSuccess && (
        <Alert severity="success" sx={{ mt: 2 }}>
          Transfer processed successfully!
        </Alert>
      )}
      {saveError && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {saveError}
        </Alert>
      )}
      {/* Submit Button */}
      <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2, p: 1 }}>
        <Button
          variant="contained"
          color="primary"
          disabled={!!dateError || isSaving || !canEdit}
          onClick={handleEnterTransfer}
        >
          {isSaving ? "Processing..." : isEditMode ? "Update Transfer" : "Enter Transfer"}
        </Button>
      </Box>
    </FormPageLayout>
  );
}
