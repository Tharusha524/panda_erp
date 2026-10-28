import { FormPageLayout } from "../../../../components/Layout/FormPageLayout";
import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  Box,
  Button,
  Grid,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ListSubheader,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getCustomers } from "../../../../api/Customer/AddCustomerApi";
import { getBranches } from "../../../../api/CustomerBranch/CustomerBranchApi";
import { getBankAccounts } from "../../../../api/BankAccount/BankAccountApi";
import CostCenterSelect from "../../../../components/CostCenterSelect";
import { createCustomerPayment } from "../../../../api/SalesPayment/SalesPaymentApi";
import { getDebtorTrans } from "../../../../api/DebtorTrans/DebtorTransApi";
import { getFiscalYears } from "../../../../api/FiscalYear/FiscalYearApi";
import { useNextFiscalYearReference } from "../../../../hooks/useNextFiscalYearReference";
import { buildCustomerPaymentAllocationRows } from "../../../../utils/customerPaymentAllocation";
import CustomerCurrencyField from "../../../../components/CustomerCurrencyField";
import { customerCurrencyCode } from "../../../../utils/relationId";
import { useTransactionMoney } from "../../../../hooks/useTransactionMoney";
import { getCompanies } from "../../../../api/CompanySetup/CompanySetupApi";
import { getSalesOrders } from "../../../../api/SalesOrders/SalesOrdersApi";

import Breadcrumb from "../../../../components/BreadCrumb";
import PageTitle from "../../../../components/PageTitle";
import theme from "../../../../theme";
import { useMessageDialog } from "../../../../context/MessageDialogContext";
import { runTransactionSave } from "../../../../utils/transactionSave";
import {
  balanceByBankAccountId,
  bankAccountLabelWithBalance,
  groupPaymentSourceAccounts,
} from "../../../../utils/cashBankAccount";
import useAllBankBalances from "../../../../hooks/useAllBankBalances";
import FormattedNumberField from "../../../../components/FormattedNumberField";
import { useAuth } from "../../../../context/AuthContext";

interface AllocationRow {
  transactionType: string;
  number: number;
  ref: string;
  date: string;
  dueDate: string;
  amount: number;
  otherAllocations: number;
  leftToAllocate: number;
  thisAllocation: number;
  transType: number;
  all: string;
  none: string;
}

export default function CustomerPayments() {
  const { hasEditPermission } = useAuth();
  const canEdit = hasEditPermission('Customer payments entry');
  const navigate = useNavigate();
  const location = useLocation();
  const { showError } = useMessageDialog();

  // ====== Form State ======
  const [customer, setCustomer] = useState("");
  const [branch, setBranch] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [depositDate, setDepositDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [reference, setReference] = useState("");
  const [bankCharge, setBankCharge] = useState(0);
  const [costCenter, setCostCenter] = useState("");
  const [promptDiscount, setPromptDiscount] = useState(0);
  const [amountOfDiscount, setAmountOfDiscount] = useState(0);
  const [amount, setAmount] = useState(0);
  const [memo, setMemo] = useState("");
  const [dateError, setDateError] = useState("");

  // ====== Allocation Table State ======
  const [allocationRows, setAllocationRows] = useState<AllocationRow[]>([]);
  const [preSelectedTrans, setPreSelectedTrans] = useState<{transNo: number, transType: number} | null>(null);
  const lastBuiltCustomerRef = useRef<string>("");

  // ====== Fetch Data ======
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: getCustomers,
    refetchOnWindowFocus: true,
  });
  const selectedCustomer = useMemo(
    () => customers.find((c: any) => String(c.debtor_no) === String(customer)),
    [customers, customer]
  );
  const customerCurrency = customerCurrencyCode(selectedCustomer);
  const { formatMoney } = useTransactionMoney(customerCurrency);
  const { data: branches = [] } = useQuery({ queryKey: ["branches"], queryFn: () => getBranches(), refetchOnWindowFocus: true });
  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["bankAccounts"],
    queryFn: getBankAccounts,
    refetchOnWindowFocus: true,
  });
  const bankAccountGroups = useMemo(
    () => groupPaymentSourceAccounts(bankAccounts as any[]),
    [bankAccounts]
  );
  const { data: allBankBalances } = useAllBankBalances();
  const balanceMap = useMemo(
    () => balanceByBankAccountId(allBankBalances?.accounts),
    [allBankBalances]
  );
  const { data: fiscalYears = [] } = useQuery({ queryKey: ["fiscalYears"], queryFn: getFiscalYears });
  const { data: debtorTrans = [] } = useQuery({ queryKey: ["debtorTrans"], queryFn: getDebtorTrans });
  const { reference: nextReference, manualEntryRequired, suffix } =
    useNextFiscalYearReference(12, { asOfDate: depositDate || undefined });
  const { data: salesOrders = [] } = useQuery({ queryKey: ["salesOrders"], queryFn: getSalesOrders });
  const { data: companyData } = useQuery({
    queryKey: ["company"],
    queryFn: getCompanies,
  });

  // Find selected fiscal year from company setup
  const selectedFiscalYear = useMemo(() => {
    if (!companyData || companyData.length === 0) return null;
    const company = companyData[0];
    return fiscalYears.find((fy: any) => fy.id === company.fiscal_year_id);
  }, [companyData, fiscalYears]);

  // Validate date is within fiscal year
  const validateDate = (selectedDate: string) => {
    if (!selectedFiscalYear) {
      setDateError("No fiscal year selected from company setup");
      return false;
    }

    if (selectedFiscalYear.closed) {
      setDateError("The fiscal year is closed for further data entry.");
      return false;
    }

    const selected = new Date(selectedDate);
    const from = new Date(selectedFiscalYear.fiscal_year_from);
    const to = new Date(selectedFiscalYear.fiscal_year_to);

    if (selected < from || selected > to) {
      setDateError("The entered date is out of fiscal year.");
      return false;
    }

    setDateError("");
    return true;
  };

  // Handle date change with validation
  const handleDateChange = (value: string) => {
    setDepositDate(value);
    validateDate(value);
  };

  // Validate date when fiscal year changes
  useEffect(() => {
    if (selectedFiscalYear) {
      validateDate(depositDate);
    }
  }, [selectedFiscalYear]);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (nextReference) {
      setReference(nextReference);
    }
  }, [nextReference]);

  useEffect(() => {
    // Only populate allocations after a customer is selected
    if (!customer) {
      setAllocationRows([]);
      lastBuiltCustomerRef.current = "";
      setAmount(0);
      return;
    }

    const customerChanged = lastBuiltCustomerRef.current !== String(customer);
    if (customerChanged) {
      lastBuiltCustomerRef.current = String(customer);
      if (!preSelectedTrans) {
        setAmount(0);
      }
    }

    const rows = buildCustomerPaymentAllocationRows(
      customer,
      salesOrders || [],
      debtorTrans || [],
      depositDate
    );

    setAllocationRows((prev) => {
      if (prev.length === 0 || customerChanged) {
        return rows;
      }

      return rows.map((row) => {
        const existing = prev.find(
          (p) => p.number === row.number && p.transType === row.transType
        );
        if (!existing) {
          return row;
        }
        const preserved = Math.min(
          Number(existing.thisAllocation) || 0,
          row.leftToAllocate
        );
        return { ...row, thisAllocation: preserved };
      });
    });
  }, [salesOrders, debtorTrans, customer, depositDate]);

  // Apply pre-selected invoice/order once allocation rows are available
  useEffect(() => {
    if (!preSelectedTrans || allocationRows.length === 0) {
      return;
    }

    const index = allocationRows.findIndex(
      (r) =>
        r.number === preSelectedTrans.transNo &&
        r.transType === preSelectedTrans.transType
    );
    if (index === -1) {
      setPreSelectedTrans(null);
      return;
    }

    const left = allocationRows[index].leftToAllocate;
    setAllocationRows((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], thisAllocation: left };
      return updated;
    });
    setAmount(left);
    setPreSelectedTrans(null);
  }, [preSelectedTrans, allocationRows]);

  // Handle navigation state for pre-filling from inquiry
  useEffect(() => {
    if (!location.state || debtorTrans.length === 0) return;

    const state = location.state as {
      transNo?: number | string;
      transType?: number | string;
      debtor_no?: number | string;
    };

    if (state.transNo && state.transType) {
      const { transNo, transType } = state;
      const dt = debtorTrans.find((d: any) => d.trans_no == transNo && d.trans_type == transType);
      if (dt) {
        setCustomer(String(dt.debtor_no));
        const transTypeNum = Number(transType);
        if (transTypeNum === 10 || transTypeNum === 30) {
          setPreSelectedTrans({ transNo: Number(transNo), transType: transTypeNum });
        }
      }
      return;
    }

    if (state.debtor_no) {
      setCustomer(String(state.debtor_no));
    }
  }, [location.state, debtorTrans]);

  // Reset branch when customer changes, then auto-select default branch
  useEffect(() => {
    if (!customer) {
      setBranch("");
      return;
    }
    const customerBranches = branches.filter(
      (b: any) => String(b.debtor_no) === String(customer)
    );
    if (customerBranches.length === 0) {
      setBranch("");
      return;
    }
    const defaultBranch =
      customerBranches.find((b: any) => !b.inactive) || customerBranches[0];
    setBranch(String(defaultBranch.branch_code));
  }, [customer, branches]);

  // Update prompt discount when customer changes
  useEffect(() => {
    if (customer) {
      const selectedCustomer = customers.find((c: any) => c.debtor_no === customer);
      if (selectedCustomer) {
        setPromptDiscount(selectedCustomer.pymt_discount || 0);
      }
    } else {
      setPromptDiscount(0);
    }
  }, [customer, customers]);

  // ====== Handle Table Changes ======
  const handleAllocationChange = (index: number, value: number) => {
    const updatedRows = [...allocationRows];
    const left = updatedRows[index]?.leftToAllocate ?? 0;
    // Clamp value between 0 and leftToAllocate
    const clamped = Number.isNaN(Number(value)) ? 0 : Math.max(0, Math.min(Number(value), left));
    updatedRows[index] = { ...updatedRows[index], thisAllocation: clamped };
    setAllocationRows(updatedRows);

    const total = updatedRows.reduce((s, r) => s + (Number(r.thisAllocation) || 0), 0);
    setAmount(total);
  };

  const handleSetAll = (index: number) => {
    setAllocationRows((prev) => {
      const updated = [...prev];
      const left = updated[index]?.leftToAllocate ?? 0;
      updated[index] = { ...updated[index], thisAllocation: left };

      const total = updated.reduce((s, r) => s + (Number(r.thisAllocation) || 0), 0);
      setAmount(total);
      return updated;
    });
  };

  const handleSetNone = (index: number) => {
    setAllocationRows((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], thisAllocation: 0 };

      const total = updated.reduce((s, r) => s + (Number(r.thisAllocation) || 0), 0);
      setAmount(total);
      return updated;
    });
  };

  // ====== Handle Add Payment ======
  const handleAddPayment = async () => {
    if (!customer) {
      showError("Please select a customer.");
      return;
    }
    if (!Number(amount) || Number(amount) <= 0) {
      showError("Please enter a payment amount greater than zero.");
      return;
    }
    if (!branch) {
      showError("Please select a customer branch.");
      return;
    }
    if (!bankAccount) {
      showError("Please select a bank account.");
      return;
    }
    if (dateError) {
      showError(dateError, "Invalid date");
      return;
    }

    const paymentTotal =
      Number(amount) + (Number(amountOfDiscount) || 0);
    const allocationSum = allocationRows.reduce(
      (sum, r) => sum + (Number(r.thisAllocation) || 0),
      0
    );
    if (allocationSum > paymentTotal + 0.001) {
      showError(
        "Sum of allocations cannot exceed the payment amount plus discount.",
        "Allocation exceeds payment"
      );
      return;
    }

    const saveResult = await runTransactionSave(async () => {
      const allocationsToApply = allocationRows
        .filter(
          (r) =>
            Number(r.thisAllocation) > 0 &&
            (Number(r.transType) === 10 || Number(r.transType) === 30)
        )
        .map((r) => ({
          trans_no_to: Number(r.number),
          trans_type_to: Number(r.transType),
          amt: Number(r.thisAllocation),
        }));

      const result = await createCustomerPayment({
        debtor_no: Number(customer),
        branch_code: branch ? Number(branch) : 0,
        tran_date: depositDate,
        bank_account_id: Number(bankAccount),
        amount: Number(amount),
        discount: Number(amountOfDiscount) || 0,
        bank_charge: Number(bankCharge) || 0,
        reference: reference || undefined,
        comments: memo || undefined,
        cost_center_id: Number(costCenter) || 0,
        allocations: allocationsToApply.length > 0 ? allocationsToApply : undefined,
      });

      if (result.gl_warning) {
        console.warn("Payment GL warning:", result.gl_warning);
      }

      queryClient.invalidateQueries({ queryKey: ["salesOrders"] });
      queryClient.invalidateQueries({ queryKey: ["debtorTrans"] });
      queryClient.invalidateQueries({ queryKey: ["custAllocations"] });
      setAllocationRows([]);
      setAmount(0);

      return {
        reference: result.reference ?? reference,
        amount,
        depositDate,
        transNo: result.trans_no,
        trans_no: result.trans_no,
        trans_type: 12,
      };
    });

    if (saveResult.ok === false) {
      showError(saveResult.message, "Payment not saved");
      return;
    }

    navigate("/sales/transactions/customer-payments/success", {
      state: saveResult.data,
    });
  };

  // ====== Breadcrumb ======
  const breadcrumbItems = [
    { title: "Transactions", href: "/banking/transactions" },
    { title: "Customer Payment Entry" },
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
        }}
      >
        <Box>
          <PageTitle title="Customer Payment Entry" />
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
      {/* Form Section */}
      <Paper sx={{ p: 2, borderRadius: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <Stack spacing={2}>
              <TextField
                select
                label="Customer"
                fullWidth
                size="small"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
              >
                {customers.map((c: any) => (
                  <MenuItem key={c.debtor_no} value={c.debtor_no}>
                    {c.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Branch"
                fullWidth
                size="small"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
              >
                {branches
                  .filter((b: any) => String(b.debtor_no) === String(customer))
                  .map((b: any) => (
                    <MenuItem key={b.branch_code} value={b.branch_code}>
                      {b.br_name}
                    </MenuItem>
                  ))}
              </TextField>
              <CustomerCurrencyField customer={selectedCustomer} />
              <TextField
                select
                label="Into Bank Account"
                fullWidth
                size="small"
                value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value)}
              >
                {Object.entries(bankAccountGroups).flatMap(([typeName, accounts]) => [
                  <ListSubheader key={`hdr-${typeName}`}>{typeName}</ListSubheader>,
                  ...accounts.map((acc: any) => (
                    <MenuItem key={acc.id} value={acc.id}>
                      {bankAccountLabelWithBalance(acc, balanceMap.get(String(acc.id)))}
                    </MenuItem>
                  )),
                ])}
              </TextField>
            </Stack>
          </Grid>

          <Grid item xs={12} sm={4}>
            <Stack spacing={2}>
              <TextField
                label="Date of Deposit"
                type="date"
                fullWidth
                size="small"
                value={depositDate}
                onChange={(e) => handleDateChange(e.target.value)}
                InputLabelProps={{ shrink: true }}
                inputProps={{
                  min: selectedFiscalYear ? new Date(selectedFiscalYear.fiscal_year_from).toISOString().split('T')[0] : undefined,
                  max: selectedFiscalYear ? new Date(selectedFiscalYear.fiscal_year_to).toISOString().split('T')[0] : undefined,
                }}
                error={!!dateError}
                helperText={dateError}
              />
              <TextField
                label="Reference"
                fullWidth
                size="small"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                InputProps={{ readOnly: !manualEntryRequired }}
                helperText={
                  manualEntryRequired
                    ? `Auto numbering is off — enter a reference for FY ${suffix || "active year"}`
                    : undefined
                }
              />
            </Stack>
          </Grid>

          <Grid item xs={12} sm={4}>
            <Stack spacing={2}>
              <FormattedNumberField
                label="Bank Charge"
                fullWidth
                size="small"
                value={bankCharge}
                onChange={(e) => setBankCharge(Number(e.target.value))}
              />
              <CostCenterSelect
                label="Cost Center"
                value={costCenter}
                onChange={setCostCenter}
                costCenterType={1}
              />
            </Stack>
          </Grid>
        </Grid>
      </Paper>
      {customer === "" ? (
        <Paper sx={{ p: 2, borderRadius: 2 }}>
          <Typography variant="body2" sx={{ textAlign: "center" }}>
            Please select a customer to view allocations.
          </Typography>
        </Paper>
      ) : allocationRows.length > 0 ? (
        <>
          {/* Allocation Table */}
          <Paper sx={{ p: 2, borderRadius: 2 }}>
            <Typography
              variant="subtitle1"
              sx={{ mb: 2, textAlign: "center", fontWeight: 600 }}
            >
              Allocated amounts in USD
            </Typography>

            <TableContainer>
              <Table size="small">
                <TableHead sx={{ backgroundColor: "var(--pallet-lighter-blue)" }}>
                  <TableRow>
                    <TableCell>Transaction Type</TableCell>
                    <TableCell>#</TableCell>
                    <TableCell>Ref</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Due date</TableCell>
                    <TableCell>Amount</TableCell>
                    <TableCell>Other Allocations</TableCell>
                    <TableCell>Left to allocate</TableCell>
                    <TableCell>This allocation</TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {allocationRows.map((row, index) => (
                    <TableRow key={index}>
                      <TableCell>{row.transactionType}</TableCell>
                      <TableCell>{row.number}</TableCell>
                      <TableCell>{row.ref}</TableCell>
                      <TableCell>{row.date}</TableCell>
                      <TableCell>{row.dueDate}</TableCell>
                      <TableCell>{formatMoney(row.amount)}</TableCell>
                      <TableCell>{formatMoney(row.otherAllocations)}</TableCell>
                      <TableCell>{formatMoney(row.leftToAllocate)}</TableCell>
                      <TableCell>
                        <FormattedNumberField
                          size="small"
                          value={row.thisAllocation}
                          fixedDecimals={2}
                          onChange={(e) => handleAllocationChange(index, Number(e.target.value))}
                          sx={{ width: "100px" }}
                        />
                      </TableCell>
                      <TableCell>
                        <Button size="small" onClick={() => handleSetAll(index)}>
                          All
                        </Button>
                        <Button size="small" onClick={() => handleSetNone(index)} sx={{ ml: 1 }}>
                          None
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      ) : (
        <Paper sx={{ p: 2, borderRadius: 2 }}>
          <Typography variant="body2" sx={{ textAlign: "center" }}>
            No allocations to display for the selected customer.
          </Typography>
        </Paper>
      )}
      {/* Payment Section */}
      <Paper sx={{ p: 2, borderRadius: 2 }}>
        <Typography
          variant="subtitle1"
          sx={{ mb: 2, textAlign: "center", fontWeight: 600 }}
        >
          Customer Payment Details
        </Typography>

        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <FormattedNumberField
              label="Customer Prompt Payment Discount (%)"
              fullWidth
              size="small"
              value={promptDiscount}
              InputProps={{ readOnly: true }}
            />
          </Grid>

          <Grid item xs={12} sm={4}>
            <FormattedNumberField
              label="Amount of Discount"
              fullWidth
              size="small"
              value={amountOfDiscount}
              onChange={(e) => setAmountOfDiscount(Number(e.target.value))}
            />
          </Grid>

          <Grid item xs={12} sm={4}>
            <FormattedNumberField
              label="Amount"
              fullWidth
              size="small"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </Grid>

          <Grid item xs={12}>
            <TextField
              label="Memo"
              fullWidth
              multiline
              rows={2}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
          </Grid>
        </Grid>

        <Box
          sx={{ display: "flex", justifyContent: "flex-end", mt: 2, gap: 2 }}
        >
          <Button variant="outlined" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleAddPayment}
            disabled={!!dateError || !canEdit}
          >
            Add Payment
          </Button>
        </Box>
      </Paper>
    </FormPageLayout>
  );
}