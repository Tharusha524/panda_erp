import { FormPageLayout } from "../../../../components/Layout/FormPageLayout";
import React, { useEffect, useState, useMemo } from "react";
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
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getCustomers } from "../../../../api/Customer/AddCustomerApi";
import { getBranches } from "../../../../api/CustomerBranch/CustomerBranchApi";
import { getBankAccounts } from "../../../../api/BankAccount/BankAccountApi";
import CostCenterSelect from "../../../../components/CostCenterSelect";
import { getDebtorTrans, createDebtorTran, updateDebtorTran } from "../../../../api/DebtorTrans/DebtorTransApi";
import { buildCustomerPaymentAllocationRows } from "../../../../utils/customerPaymentAllocation";
import CustomerCurrencyField from "../../../../components/CustomerCurrencyField";
import { customerCurrencyCode } from "../../../../utils/relationId";
import { useTransactionMoney } from "../../../../hooks/useTransactionMoney";
import { useNextFiscalYearReference } from "../../../../hooks/useNextFiscalYearReference";
import { getBankTrans, createBankTrans, updateBankTrans } from "../../../../api/BankTrans/BankTransApi";
import { getFiscalYears } from "../../../../api/FiscalYear/FiscalYearApi";
import { getCompanies } from "../../../../api/CompanySetup/CompanySetupApi";
import { getSalesOrders, getSalesOrderByOrderNo, updateSalesOrder } from "../../../../api/SalesOrders/SalesOrdersApi";
import { createCustAllocation } from "../../../../api/CustAllocation/CustAllocationApi";

import Breadcrumb from "../../../../components/BreadCrumb";
import PageTitle from "../../../../components/PageTitle";
import theme from "../../../../theme";
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
  all: string;
  none: string;
}

export default function UpdateCustomerPayments() {
  const { hasEditPermission } = useAuth();
  const canEdit = hasEditPermission('Customer payments entry');
  const navigate = useNavigate();
  const location = useLocation();
  const editData = location.state as { trans_no: string, reference: string, date: string, debtor_no: string } | null;
  const isEditing = !!editData;

  // ====== Form State ======
  const [customer, setCustomer] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [branch, setBranch] = useState("");
  const [branchName, setBranchName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
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
  const { data: fiscalYears = [] } = useQuery({ queryKey: ["fiscalYears"], queryFn: getFiscalYears });
  const { data: debtorTrans = [] } = useQuery({ queryKey: ["debtorTrans"], queryFn: getDebtorTrans });
  const { data: salesOrders = [] } = useQuery({ queryKey: ["salesOrders"], queryFn: getSalesOrders });
  const { data: companyData } = useQuery({
    queryKey: ["company"],
    queryFn: getCompanies,
  });

  const { data: bankTrans = [] } = useQuery({ queryKey: ["bankTrans"], queryFn: getBankTrans });

  const { data: editTransaction } = useQuery({
    queryKey: ["editTransaction", editData?.trans_no],
    queryFn: () => getDebtorTrans().then(trans => trans.find(t => t.trans_no == editData?.trans_no && t.trans_type == 12)),
    enabled: isEditing
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

  // trans_type 12 = Customer Payment; an existing payment keeps its own reference.
  const { reference: nextPaymentReference } = useNextFiscalYearReference(12, {
    asOfDate: depositDate || undefined,
    enabled: !isEditing,
  });

  useEffect(() => {
    if (isEditing || !nextPaymentReference) return;
    setReference(nextPaymentReference);
  }, [nextPaymentReference, isEditing]);

  useEffect(() => {
    if (isEditing) return;
    // Only populate allocations after a customer is selected
    if (!customer) {
      setAllocationRows([]);
      return;
    }

    if (!salesOrders || salesOrders.length === 0) {
      if (!debtorTrans || debtorTrans.length === 0) {
        setAllocationRows([]);
        return;
      }
    }

    const rows = buildCustomerPaymentAllocationRows(
      customer,
      salesOrders || [],
      debtorTrans || [],
      depositDate
    );

    setAllocationRows(rows);
    setAmount(0);
  }, [salesOrders, debtorTrans, customer, depositDate, isEditing]);



  // Reset branch when customer changes
  useEffect(() => {
    setBranch("");
  }, [customer]);

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

  // Populate fields for editing
  useEffect(() => {
    if (editTransaction) {
      const cust = customers.find((c: any) => c.debtor_no == editTransaction.debtor_no);
      setCustomer(String(editTransaction.debtor_no));
      setCustomerName(cust ? cust.name : "");
      const branchObj = branches.find((b: any) => b.branch_code == editTransaction.branch_code && b.debtor_no == editTransaction.debtor_no);
      setBranch(String(editTransaction.branch_code || ""));
      setBranchName(branchObj ? branchObj.br_name : "");
      setDepositDate(editTransaction.tran_date);
      setReference(editTransaction.reference);
      setAmount(editTransaction.ov_amount);
      setMemo(editTransaction.memo || "");
      setCostCenter(editTransaction.cost_center_id ? String(editTransaction.cost_center_id) : "");
      // Find bank account from bankTrans
      const bankTransRecord = bankTrans.find((b: any) => b.trans_no == editTransaction.trans_no && b.type == 12);
      if (bankTransRecord) {
        setBankAccount(bankTransRecord.bank_act);
        const bankObj = bankAccounts.find((acc: any) => acc.id == bankTransRecord.bank_act);
        setBankAccountName(bankObj ? bankObj.bank_account_name : "");
        // Assuming bankCharge is the difference if any
        setBankCharge(Math.abs(bankTransRecord.amount) - Math.abs(editTransaction.ov_amount));
      }
    }
  }, [editTransaction, bankTrans, customers, branches, bankAccounts]);

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
    if (!customer || !amount) return alert("Please fill required fields!");
    if (dateError) return alert("Please correct the date error.");

    if (isEditing) {
      if (!editTransaction) {
        alert("Payment record not found.");
        return;
      }

      try {
        const totalAllocated = allocationRows.reduce(
          (s, r) => s + (Number(r.thisAllocation) || 0),
          0
        );
        const recordId = editTransaction.id ?? editTransaction.trans_no;
        await updateDebtorTran(recordId, {
          tran_date: depositDate,
          due_date: depositDate,
          ov_amount: amount,
          ov_discount: amountOfDiscount,
          branch_code: branch ? Number(branch) : editTransaction.branch_code,
          alloc: totalAllocated,
          version: (Number(editTransaction.version) || 0) + 1,
          cost_center_id: Number(costCenter) || 0,
        });

        const bankTransRecord = bankTrans.find(
          (b: any) =>
            String(b.trans_no) === String(editTransaction.trans_no) &&
            Number(b.type) === 12
        );
        if (bankTransRecord?.id != null) {
          await updateBankTrans(Number(bankTransRecord.id), {
            bank_act: bankAccount,
            trans_date: depositDate,
            ref: reference,
            amount: Number(amount) - Number(bankCharge || 0),
          });
        }

        await queryClient.invalidateQueries({ queryKey: ["debtorTrans"] });
        await queryClient.invalidateQueries({ queryKey: ["bankTrans"] });
        await queryClient.invalidateQueries({
          queryKey: ["customerCreditSummary", editTransaction.debtor_no],
        });
        alert("Customer payment updated successfully!");
        navigate("/sales/transactions/customer-payments/success", {
          state: {
            trans_no: editTransaction.trans_no,
            reference,
            date: depositDate,
          },
        });
      } catch (error) {
        console.error("Error updating payment:", error);
        alert("Failed to update payment. Please try again.");
      }
      return;
    }

    try {
      // Calculate next trans_no for trans_type 12
      const relevantTrans = debtorTrans.filter((dt: any) => Number(dt.trans_type) === 12);
      const maxTransNo = relevantTrans.length > 0 ? Math.max(...relevantTrans.map((dt: any) => dt.trans_no)) : 0;
      const nextTransNo = maxTransNo + 1;

      // Sum allocated amounts from allocationRows
      const totalAllocated = allocationRows.reduce((s, r) => s + (Number(r.thisAllocation) || 0), 0);
      const allocValue = totalAllocated > 0 ? totalAllocated : 0;

      const payload = {
        trans_no: nextTransNo,
        trans_type: 12, // Customer payment
        version: 0,
        debtor_no: Number(customer),
        branch_code: branch ? Number(branch) : 0,
        tran_date: depositDate,
        due_date: depositDate, // Assuming due date is same as transaction date
        reference,
        tpe: 0, // Assuming type is 0
        order_no: 0,
        ov_amount: amount,
        ov_gst: 0,
        ov_freight: 0,
        ov_freight_tax: 0,
        ov_discount: amountOfDiscount,
        alloc: allocValue,
        prep_amount: 0,
        rate: 1,
        ship_via: null,
        cost_center_id: Number(costCenter) || 0,
        cost_center2_id: 0,
        payment_terms: null,
        tax_included: 0,
      };

      await createDebtorTran(payload);

      // Insert into bank_trans
      const bankTransPayload = {
        bank_act: bankAccount,
        trans_no: nextTransNo,
        type: 12,
        ref: reference,
        trans_date: depositDate,
        amount: amount - bankCharge,
        cost_center_id: 0,
        cost_center2_id: 0,
        person_type_id: 2, // Debtor
        person_id: Number(customer),
        reconciled: null,
      };
      await createBankTrans(bankTransPayload);

      // Update alloc on related sales orders for each allocation row with an allocation
      const allocationsToApply = allocationRows.filter((r) => Number(r.thisAllocation) > 0);
      if (allocationsToApply.length > 0) {
        await Promise.all(
          allocationsToApply.map(async (r) => {
            try {
              const so = await getSalesOrderByOrderNo(r.number);
              if (!so) return;

              const updatedAlloc = Number(so.alloc || 0) + Number(r.thisAllocation || 0);

              const payload = {
                order_no: so.order_no,
                trans_type: so.trans_type ?? 30,
                version: so.version ?? 0,
                type: so.type ?? 0,
                debtor_no: so.debtor_no ?? 0,
                branch_code: so.branch_code ?? 0,
                reference: so.reference ?? "",
                ord_date: so.ord_date ?? depositDate,
                order_type: so.order_type ?? 0,
                ship_via: so.ship_via ?? 0,
                customer_ref: so.customer_ref ?? null,
                delivery_address: so.delivery_address ?? null,
                contact_phone: so.contact_phone ?? null,
                contact_email: so.contact_email ?? null,
                deliver_to: so.deliver_to ?? null,
                freight_cost: so.freight_cost ?? 0,
                from_stk_loc: so.from_stk_loc ?? "",
                delivery_date: so.delivery_date ?? null,
                payment_terms: so.payment_terms ?? null,
                total: so.total ?? 0,
                prep_amount: so.prep_amount ?? 0,
                alloc: updatedAlloc,
              };

              await updateSalesOrder(so.order_no, payload);
              // Create cust_allocations record linking this payment to the sales order
              try {
                const custAllocPayload = {
                  person_id: Number(customer),
                  amt: Number(r.thisAllocation || 0),
                  date_alloc: depositDate,
                  trans_no_from: nextTransNo,
                  trans_type_from: 12, // customer payment
                  trans_no_to: so.order_no,
                  trans_type_to: Number(so.trans_type) || 30,
                };
                await createCustAllocation(custAllocPayload);
              } catch (err) {
                console.error("Failed to create cust_allocation for order", r.number, err);
              }
            } catch (err) {
              console.error("Failed to update sales order alloc for order", r.number, err);
            }
          })
        );

        // Refresh sales orders and debtorTrans data
        queryClient.invalidateQueries({ queryKey: ["salesOrders"] });
        queryClient.invalidateQueries({ queryKey: ["debtorTrans"] });
        queryClient.invalidateQueries({ queryKey: ["custAllocations"] });

        // clear allocations and amount
        setAllocationRows([]);
        setAmount(0);
      }

      alert("Customer payment added successfully!");
      navigate("/sales/transactions/customer-payments/success", { state: { reference, amount, depositDate } });
    } catch (error: any) {
      console.error("Error adding payment:", error);
      alert("Failed to add payment. Please try again.");
    }
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
              {isEditing ? (
                <TextField
                  label="Customer"
                  fullWidth
                  size="small"
                  value={customerName}
                  InputProps={{ readOnly: true }}
                />
              ) : (
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
              )}
              {isEditing ? (
                <TextField
                  label="Branch"
                  fullWidth
                  size="small"
                  value={branchName}
                  InputProps={{ readOnly: true }}
                />
              ) : (
                <TextField
                  select
                  label="Branch"
                  fullWidth
                  size="small"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                >
                  {branches
                    .filter((b: any) => b.debtor_no === customer)
                    .map((b: any) => (
                      <MenuItem key={b.branch_code} value={b.branch_code}>
                        {b.br_name}
                      </MenuItem>
                    ))}
                </TextField>
              )}
              <CustomerCurrencyField customer={selectedCustomer} />
              {isEditing ? (
                <TextField
                  label="Into Bank Account"
                  fullWidth
                  size="small"
                  value={bankAccountName}
                  InputProps={{ readOnly: true }}
                />
              ) : (
                <TextField
                  select
                  label="Into Bank Account"
                  fullWidth
                  size="small"
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                >
                  {bankAccounts.map((acc: any) => (
                    <MenuItem key={acc.id} value={acc.id}>
                      {acc.bank_account_name}
                    </MenuItem>
                  ))}
                </TextField>
              )}
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
                InputProps={{ readOnly: true }}
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
                      <TableCell>{formatMoney(Math.max(0, (Number(row.amount || 0) - Number(row.otherAllocations || 0) - Number(row.thisAllocation || 0))))}</TableCell>
                      <TableCell>
                        <FormattedNumberField
                          size="small"
                          value={row.thisAllocation}
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
            {isEditing ? "Update Payment" : "Add Payment"}
          </Button>
        </Box>
      </Paper>
    </FormPageLayout>
  );
}