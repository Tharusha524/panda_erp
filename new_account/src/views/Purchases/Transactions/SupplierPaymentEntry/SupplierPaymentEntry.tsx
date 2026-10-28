import { FormPageLayout } from "../../../../components/Layout/FormPageLayout";
import React, { useState, useEffect, useMemo } from "react";
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
  ListSubheader,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useNavigate, useLocation } from "react-router-dom";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Breadcrumb from "../../../../components/BreadCrumb";
import PageTitle from "../../../../components/PageTitle";

// APIs
import { getSuppliers } from "../../../../api/Supplier/SupplierApi";
import { getCostCenters } from "../../../../api/CostCenter/CostCenterApi";
import { getBankAccounts } from "../../../../api/BankAccount/BankAccountApi";
import { getSuppTrans } from "../../../../api/SuppTrans/SuppTransApi";
import { getSuppInvoiceItems } from "../../../../api/SuppInvoiceItems/SuppInvoiceItemsApi";
import { getPurchOrderDetails } from "../../../../api/PurchOrders/PurchOrderDetailsApi";
import { getFiscalYears } from "../../../../api/FiscalYear/FiscalYearApi";
import {
  getSupplierPaymentAllocatable,
  postSupplierPayment,
} from "../../../../api/Purchases/PurchasesApi";
import { runTransactionSave } from "../../../../utils/transactionSave";
import { getCompanies } from "../../../../api/CompanySetup/CompanySetupApi";
import useBankBalance from "../../../../hooks/useBankBalance";
import useAllBankBalances from "../../../../hooks/useAllBankBalances";
import {
  balanceByBankAccountId,
  bankAccountLabelWithBalance,
  defaultPaymentSourceAccountId,
  groupPaymentSourceAccounts,
  sortPaymentSourceAccounts,
} from "../../../../utils/cashBankAccount";
import SupplierCurrencyField from "../../../../components/SupplierCurrencyField";
import { resolveSupplierTransactionCurrencyCode } from "../../../../utils/relationId";
import { useHomeCurrency } from "../../../../hooks/useHomeCurrency";
import { useTransactionMoney } from "../../../../hooks/useTransactionMoney";
import FormattedNumberField from "../../../../components/FormattedNumberField";
import { useAuth } from "../../../../context/AuthContext";
import { useNextFiscalYearReference } from "../../../../hooks/useNextFiscalYearReference";

export default function SupplierPaymentEntry() {
  const { hasEditPermission } = useAuth();
  const canEdit = hasEditPermission('Supplier payments');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const location = useLocation();

  // try to read supplier passed via navigation state (supplier, supplierId, supplier_id)
  const initialSupplier = Number(location?.state?.supplier ?? location?.state?.supplierId ?? location?.state?.supplier_id ?? 0) || 0;

  // ================== FORM STATES ==================
  const [supplier, setSupplier] = useState(initialSupplier);
  const [datePaid, setDatePaid] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [bankCharge, setBankCharge] = useState(0);
  const [bankAccount, setBankAccount] = useState(0);
  const { data: bankBalanceData } = useBankBalance(bankAccount || null);
  const bankBalance = bankBalanceData?.book_balance ?? 0;
  const [reference, setReference] = useState("");
  const [costCenter, setCostCenter] = useState(0);

  const [datePaidError, setDatePaidError] = useState("");

  const [amountDiscount, setAmountDiscount] = useState(0);
  const [amountPayment, setAmountPayment] = useState(0);
  const [memo, setMemo] = useState("");

  // ================== API STATES ==================
  const [suppliers, setSuppliers] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const { data: bankAccountsRaw = [] } = useQuery({
    queryKey: ["bankAccounts"],
    queryFn: getBankAccounts,
  });
  const banks = useMemo(() => {
    const list = Array.isArray(bankAccountsRaw)
      ? bankAccountsRaw
      : (bankAccountsRaw as { data?: unknown[] })?.data ?? [];
    return sortPaymentSourceAccounts(list as any[]);
  }, [bankAccountsRaw]);

  const bankAccountGroups = useMemo(
    () =>
      groupPaymentSourceAccounts(
        Array.isArray(bankAccountsRaw)
          ? (bankAccountsRaw as any[])
          : ((bankAccountsRaw as { data?: unknown[] })?.data ?? []) as any[]
      ),
    [bankAccountsRaw]
  );
  const { data: allBankBalances } = useAllBankBalances();
  const balanceMap = useMemo(
    () => balanceByBankAccountId(allBankBalances?.accounts),
    [allBankBalances]
  );

  // ================== TABLE ROWS (Allocated amounts) ==================
  const [rows, setRows] = useState<any[]>([]);
  const [suppTrans, setSuppTrans] = useState<any[]>([]);

  const { data: allocatableRows = [], isLoading: allocatableLoading } = useQuery({
    queryKey: ["supplier-payment-allocatable", supplier],
    queryFn: () => getSupplierPaymentAllocatable(Number(supplier)),
    enabled: Boolean(supplier),
  });

  const selectedSupplier = useMemo(
    () =>
      (suppliers || []).find(
        (s: any) =>
          String(s.supplier_id ?? s.id ?? s.supplier) === String(supplier)
      ),
    [suppliers, supplier]
  );
  const { code: homeCurrencyCode } = useHomeCurrency();
  const currencyCode = resolveSupplierTransactionCurrencyCode(
    selectedSupplier,
    homeCurrencyCode
  );
  const { formatMoney } = useTransactionMoney(currencyCode);

  // Validate date is within fiscal year
  const validateDate = (selectedDate: string, setError: (error: string) => void) => {
    if (!selectedFiscalYear) {
      setError("No fiscal year selected from company setup");
      return false;
    }

    if (selectedFiscalYear.closed) {
      setError("The fiscal year is closed for further data entry.");
      return false;
    }

    const selected = new Date(selectedDate);
    const from = new Date(selectedFiscalYear.fiscal_year_from);
    const to = new Date(selectedFiscalYear.fiscal_year_to);

    if (selected < from || selected > to) {
      setError("The entered date is out of fiscal year.");
      return false;
    }

    setError("");
    return true;
  };

  // ================== GENERATE REFERENCE ==================
  const { data: fiscalYears = [] } = useQuery({ queryKey: ["fiscalYears"], queryFn: getFiscalYears });
  const { data: companyData } = useQuery({ queryKey: ["company"], queryFn: getCompanies });

  // Find selected fiscal year from company setup
  const selectedFiscalYear = useMemo(() => {
    if (!companyData || companyData.length === 0) return null;
    const company = companyData[0];
    return fiscalYears.find((fy: any) => fy.id === company.fiscal_year_id);
  }, [companyData, fiscalYears]);

  // Validate dates when fiscal year is selected
  useEffect(() => {
    if (selectedFiscalYear) {
      validateDate(datePaid, setDatePaidError);
    }
  }, [selectedFiscalYear]);

  // Fresh entry when opened from success / hub (new navigation key)
  useEffect(() => {
    const sid =
      Number(
        location.state?.supplier ??
          location.state?.supplierId ??
          location.state?.supplier_id ??
          0
      ) || 0;
    setSupplier(sid);
    setAmountDiscount(0);
    setBankCharge(0);
    setMemo("");
    setAmountPayment(0);
    setRows([]);
    setDatePaid(new Date().toISOString().split("T")[0]);
  }, [location.key]);

  // trans_type 22 = Supplier Payment
  const { reference: nextSupplierPaymentReference } = useNextFiscalYearReference(22, {
    asOfDate: datePaid || undefined,
  });

  useEffect(() => {
    if (nextSupplierPaymentReference) {
      setReference(nextSupplierPaymentReference);
    }
  }, [nextSupplierPaymentReference]);

  // helper to normalize date strings to YYYY-MM-DD (top-level for reuse)
  const formatDate = (val: any) => {
    if (!val && val !== 0) return "";
    try {
      if (typeof val === "string") {
        if (val.includes("T")) return val.split("T")[0];
        const d = new Date(val);
        if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
        return val;
      }
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
      return String(val);
    } catch {
      return String(val);
    }
  };

  // ================== FETCH API DATA ==================
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [suppliersData, costCentersData, suppTransData] = await Promise.all([
          getSuppliers(),
          getCostCenters(),
          getSuppTrans(),
        ]);

        setSuppliers(suppliersData);
        setCostCenters(costCentersData);
        setSuppTrans(Array.isArray(suppTransData) ? suppTransData : (suppTransData?.data ?? []));

        if ((!supplier || supplier === 0) && Array.isArray(suppliersData) && suppliersData.length > 0) {
          const firstSupplier = suppliersData[0];
          const firstSupplierId = firstSupplier?.supplier_id ?? firstSupplier?.id ?? firstSupplier?.supplier ?? null;
          if (firstSupplierId != null) setSupplier(Number(firstSupplierId));
        }
      } catch (error) {
        console.error("Error loading payment page:", error);
      }
    };

    fetchData();
  }, [location.key]);

  useEffect(() => {
    if (!bankAccount && banks.length > 0) {
      const defaultId = defaultPaymentSourceAccountId(banks);
      if (defaultId) setBankAccount(Number(defaultId));
    }
  }, [bankAccount, banks]);

  useEffect(() => {
    if (!supplier) {
      setRows([]);
      return;
    }
    const mapped = (Array.isArray(allocatableRows) ? allocatableRows : []).map((t: any) => ({
      id: t.id ?? `supp-${t.number}`,
      type: t.type ?? "Supplier Invoice",
      number: t.number,
      supplierRef: t.supplier_ref ?? "",
      date: formatDate(t.date),
      dueDate: formatDate(t.due_date),
      amount: Number(t.amount ?? 0),
      otherAlloc: Number(t.other_alloc ?? 0),
      left: Number(t.left ?? 0),
      allocation: 0,
    }));
    setRows(mapped);
  }, [supplier, allocatableRows]);

  // ================== HANDLE ROW UPDATE ==================
  const handleRowChange = (id, field, value) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              [field]: value,
            }
          : r
      )
    );
  };

  // keep Amount of Payment in sync with sum of allocations minus discount
  useEffect(() => {
    const sumAlloc = (rows || []).reduce((s, r) => s + (Number(r.allocation) || 0), 0);
    const discount = Number(amountDiscount) || 0;
    const computed = sumAlloc - discount;
    setAmountPayment(computed >= 0 ? computed : 0);
  }, [rows, amountDiscount]);

  // view supplier invoice by trans_no
  const handleViewSupplierInvoice = async (transNo: any) => {
    try {
      const tno = transNo;
      let trans = (suppTrans || []).find((s: any) => String(s.trans_no ?? s.id ?? s.transno) === String(tno));
      if (!trans) {
        // try refetch
        const fresh = await getSuppTrans();
        trans = (Array.isArray(fresh) ? fresh : (fresh?.data ?? [])).find((s: any) => String(s.trans_no ?? s.id ?? s.transno) === String(tno));
      }
      if (!trans) {
        alert('Supplier transaction not found');
        return;
      }

      // fetch invoice items
      const allItems = await getSuppInvoiceItems();
      const itemsArr = Array.isArray(allItems) ? allItems : (allItems?.data ?? []);
      const invoiceItems = itemsArr.filter((it: any) => String(it.supp_trans_no ?? it.supp_trans ?? it.trans_no) === String(trans.trans_no ?? trans.id ?? trans.transno));

      let purchOrderDetails: any[] = [];
      try {
        const detailsRes = await getPurchOrderDetails();
        purchOrderDetails = Array.isArray(detailsRes) ? detailsRes : (detailsRes?.data ?? []);
      } catch {
        purchOrderDetails = [];
      }

      const itemsForView = invoiceItems.map((it: any) => {
        const qty = Number(it.quantity ?? it.qty ?? it.qty_recd ?? 0) || 0;
        const price = Number(it.unit_price ?? it.unitPrice ?? it.price ?? 0) || 0;

        // find purch order detail to get order_no (delivery)
        const poDetailId = it.po_detail_item_id ?? it.po_detail_item ?? it.po_detail ?? it.po_item_id ?? null;
        const matchedDetail = purchOrderDetails.find((d: any) => String(d.po_detail_item ?? d.po_detail_id ?? d.id) === String(poDetailId));
        const delivery = matchedDetail ? (matchedDetail.order_no ?? matchedDetail.purch_order_no ?? matchedDetail.orderNo ?? '') : '';

        return {
          delivery: delivery,
          item: it.stock_id ?? it.item ?? it.stockId ?? '',
          description: it.description ?? '',
          quantity: qty,
          price: price,
          lineValue: qty * price,
        };
      });

      const subtotal = itemsForView.reduce((s: number, it: any) => s + (Number(it.lineValue) || 0), 0);
      const totalInvoice = Number(trans.ov_amount ?? trans.amount ?? 0) + Number(trans.ov_gst ?? 0);

      const stateToSend = {
        supplier: trans.supplier_id ?? trans.supp_id ?? trans.supplier ?? null,
        reference: trans.reference ?? trans.ref ?? trans.trans_no ?? trans.id ?? '',
        supplierRef: trans.supp_reference ?? trans.supplier_ref ?? '',
        invoiceDate: formatDate(trans.trans_date ?? trans.date ?? ''),
        dueDate: formatDate(trans.due_date ?? trans.due ?? ''),
        items: itemsForView,
        subtotal: subtotal,
        totalInvoice: totalInvoice,
      };

      navigate('/purchase/transactions/supplier-invoice/view-supplier-invoice', {
        state: {
          ...stateToSend,
          trans_no: trans.trans_no ?? trans.id,
          trans_type: 20,
          fromInquiry: true,
        },
      });
    } catch (e) {
      console.error('Failed to load supplier invoice view', e);
      alert('Failed to load supplier invoice details');
    }
  };

  const allocateAll = (id) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, allocation: r.left }
          : r
      )
    );
  };

  const allocateNone = (id) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, allocation: 0 } : r
      )
    );
  };

  const handleSubmit = async () => {
    try {
      if (!supplier) return alert('Select supplier');
      if (!bankAccount) return alert('Select a bank account to pay from');

      // compute totals
      const discount = Number(amountDiscount) || 0;
      const payment = Number(amountPayment) || 0; // already sumAlloc - discount
      const bankChargeVal = Number(bankCharge) || 0;
      const totalOut = Math.abs(payment) + Math.abs(bankChargeVal);

      if (totalOut > 0 && Number(bankBalance) + 0.001 < totalOut) {
        return alert(
          `Insufficient funds. Available balance is ${Number(bankBalance).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} but payment total is ${totalOut.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}.`
        );
      }

      const selectedSupplier = (suppliers || []).find((s: any) => String(s.supplier_id ?? s.id ?? s.supplier) === String(supplier));
      const taxIncludedForSupplier = selectedSupplier ? (selectedSupplier.tax_included ?? selectedSupplier.taxIncluded ?? 0) : 0;

      const allocationSum = (rows || []).reduce(
        (sum, r) => sum + (Number(r.allocation) || 0),
        0
      );
      for (const r of rows || []) {
        const alloc = Number(r.allocation) || 0;
        if (alloc > Number(r.left) + 0.001) {
          return alert(
            `Allocation for invoice ${r.number} exceeds left to allocate (${formatMoney(Number(r.left))}).`
          );
        }
      }
      if (allocationSum > Math.abs(payment) + 0.001) {
        return alert("Sum of allocations cannot exceed the payment amount.");
      }
      if (
        allocationSum > 0 &&
        Math.abs(allocationSum - Math.abs(payment)) > 0.001
      ) {
        return alert(
          "Payment amount should match the sum of allocations when allocating to invoices."
        );
      }

      const allocations = (rows || [])
        .filter((r) => Number(r.allocation) > 0)
        .map((r) => ({
          trans_no_to: Number(r.number),
          trans_type_to: 20,
          amt: Number(r.allocation),
        }));

      const saveResult = await runTransactionSave(() =>
        postSupplierPayment({
          supplier_id: Number(supplier),
          tran_date: datePaid,
          bank_account_id: Number(bankAccount),
          amount: Math.abs(payment),
          discount: Math.abs(discount),
          bank_charge: Math.abs(bankChargeVal),
          reference: reference || undefined,
          tax_included: Boolean(taxIncludedForSupplier),
          cost_center_id: Number(costCenter) || undefined,
          allocations: allocations.length > 0 ? allocations : undefined,
        })
      );

      if (saveResult.ok === false) {
        alert(saveResult.message);
        return;
      }

      const paymentTransNo = saveResult.data.trans_no;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["suppTrans"] }),
        queryClient.invalidateQueries({ queryKey: ["supplierAllocationInquiry"] }),
        queryClient.invalidateQueries({ queryKey: ["supplier-payment-allocatable", supplier] }),
        queryClient.invalidateQueries({ queryKey: ["bankTrans"] }),
      ]);

          const bank = (banks || []).find((b: any) => String(b.id) === String(bankAccount));
          const bankName = bank ? (bank.bank_account_name ?? bank.name ?? String(bankAccount)) : String(bankAccount);

          const viewState = {
            supplier: supplier,
            bankAccount: bankName,
            datePaid: datePaid,
            date: datePaid,
            amount: payment,
            discount: discount,
            reference: reference,
            paymentType: bankName,
            trans_no: paymentTransNo,
            trans_type: 22,
            allocations: (rows || []).filter(r => Number(r.allocation) && Number(r.allocation) !== 0).map(r => ({
              type: r.type,
              number: r.number,
              date: r.date,
              totalAmount: r.amount,
              leftToAllocate: r.left,
              allocation: Number(r.allocation) || 0,
            })),
          };

          navigate('/purchase/transactions/payment-to-suppliers/success', { state: viewState });
    } catch (err) {
      console.error('Failed to process supplier payment', err);
      alert('Failed to process supplier payment. See console for details.');
    }
  };

  const breadcrumbItems = [
    { title: "Purchases", href: "/purchases" },
    { title: "Supplier Payment Entry" },
  ];

  return (
    <FormPageLayout>
      {/* Header */}
      <Box
        sx={{
          padding: 2,
          boxShadow: 2,
          borderRadius: 1,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Box>
          <PageTitle title="Supplier Payment Entry" />
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
      {/* ================== FORM FIELDS ================== */}
      <Paper sx={{ p: 3 }}>
        <Grid container spacing={2}>
          {/* Column 1: Payment To, From Bank Account, Bank Balance */}
          <Grid item xs={12} md={4}>
            <Stack spacing={2}>
              <TextField
                select
                fullWidth
                label="Payment To (Supplier)"
                size="small"
                value={supplier}
                onChange={(e) => setSupplier(Number(e.target.value))}
              >
                {suppliers.map((s) => (
                  <MenuItem key={s.supplier_id} value={s.supplier_id}>
                    {s.supp_name}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                select
                fullWidth
                size="small"
                label="From Bank Account"
                value={bankAccount}
                onChange={(e) => setBankAccount(Number(e.target.value))}
              >
                {Object.entries(bankAccountGroups).flatMap(([typeName, accounts]) => [
                  <ListSubheader key={`hdr-${typeName}`}>{typeName}</ListSubheader>,
                  ...accounts.map((b: any) => (
                    <MenuItem key={b.id} value={b.id}>
                      {bankAccountLabelWithBalance(b, balanceMap.get(String(b.id)))}
                    </MenuItem>
                  )),
                ])}
              </TextField>

              <TextField
                label="Bank Balance"
                size="small"
                value={Number(bankBalance).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
                InputProps={{ readOnly: true }}
                helperText="Book balance from bank transactions"
              />
            </Stack>
          </Grid>

          {/* Column 2: Date Paid, Reference */}
          <Grid item xs={12} md={4}>
            <Stack spacing={2}>
              <SupplierCurrencyField supplier={selectedSupplier} />
              <TextField
                label="Date Paid"
                type="date"
                fullWidth
                size="small"
                value={datePaid}
                onChange={(e) => { setDatePaid(e.target.value); validateDate(e.target.value, setDatePaidError); }}
                InputLabelProps={{ shrink: true }}
                inputProps={{ min: selectedFiscalYear ? new Date(selectedFiscalYear.fiscal_year_from).toISOString().split('T')[0] : undefined, max: selectedFiscalYear ? new Date(selectedFiscalYear.fiscal_year_to).toISOString().split('T')[0] : undefined, }}
                error={!!datePaidError}
                helperText={datePaidError}
              />

              <TextField
                label="Reference"
                size="small"
                value={reference}
                InputProps={{ readOnly: true }}
              />
            </Stack>
          </Grid>

          {/* Column 3: Bank Charge, CostCenter */}
          <Grid item xs={12} md={4}>
            <Stack spacing={2}>
              <FormattedNumberField
                label="Bank Charge"
                size="small"
                value={bankCharge}
                onChange={(e) => setBankCharge(Number(e.target.value))}
              />

              <TextField
                select
                fullWidth
                size="small"
                label="Cost Center"
                value={costCenter}
                onChange={(e) => setCostCenter(Number(e.target.value))}
              >
                {costCenters.map((d) => (
                  <MenuItem key={d.id} value={d.id}>
                    {d.name}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
          </Grid>
        </Grid>
      </Paper>
      {/* ================== TABLE ================== */}
      <Typography
        variant="subtitle1"
        sx={{ textAlign: "center", mt: 2, fontWeight: 600 }}
      >
        Allocated amounts in {currencyCode}:
      </Typography>
      <TableContainer component={Paper}>
        <Table>
          <TableHead sx={{ backgroundColor: "var(--pallet-lighter-blue)" }}>
            <TableRow>
              <TableCell>Transaction Type</TableCell>
              <TableCell>#</TableCell>
              <TableCell>Supplier Ref</TableCell>
              <TableCell sx={{ width: '120px' }}>Date</TableCell>
              <TableCell sx={{ width: '120px' }}>Due Date</TableCell>
              <TableCell>Amount</TableCell>
              <TableCell>Other Allocations</TableCell>
              <TableCell>Left to Allocate</TableCell>
              <TableCell sx={{ width: '140px' }}>This Allocation</TableCell>
              <TableCell sx={{ textAlign: 'center' }}>Action</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {allocatableLoading ? (
              <TableRow>
                <TableCell colSpan={10}>Loading open supplier invoices…</TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} align="center">
                  <Typography sx={{ py: 2 }} color="text.secondary">
                    No open supplier invoices for this supplier. Post a supplier invoice (from GRN or
                    direct), then return here to allocate this payment.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.type}</TableCell>
                <TableCell>
                  <Button size="small" onClick={() => handleViewSupplierInvoice(row.number)}>
                    {row.number}
                  </Button>
                </TableCell>
                <TableCell>{row.supplierRef}</TableCell>
                <TableCell sx={{ width: '120px' }}>{row.date}</TableCell>
                <TableCell sx={{ width: '120px' }}>{row.dueDate}</TableCell>
                <TableCell>{formatMoney(row.amount)}</TableCell>
                <TableCell>{formatMoney(row.otherAlloc)}</TableCell>
                <TableCell>{formatMoney(row.left)}</TableCell>

                {/* Allocation Input */}
                <TableCell sx={{ width: '120px' }}>
                  <FormattedNumberField
                    size="small"
                    value={row.allocation}
                    onChange={(e) =>
                      handleRowChange(row.id, "allocation", Number(e.target.value))
                    }
                  />
                </TableCell>

                <TableCell>
                  <Button size="small" onClick={() => allocateAll(row.id)}>
                    All
                  </Button>
                  <Button size="small" onClick={() => allocateNone(row.id)}>
                    None
                  </Button>
                </TableCell>
              </TableRow>
            ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {/* ================== PAYMENT + DISCOUNT + MEMO ================== */}
      <Paper sx={{ p: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <TextField
              label="Amount of Discount"
              size="small"
              type="text"
              inputProps={{ inputMode: 'decimal' }}
              fullWidth
              value={amountDiscount}
              onChange={(e) => setAmountDiscount(Number(e.target.value))}
            />
          </Grid>

          <Grid item xs={12} md={4}>
            <TextField
              label="Amount of Payment"
              size="small"
              type="text"
              inputProps={{ inputMode: 'decimal' }}
              fullWidth
              value={amountPayment}
              onChange={(e) => setAmountPayment(Number(e.target.value))}
            />
          </Grid>

          <Grid item xs={12}>
            <Typography variant="subtitle1">Memo:</Typography>
            <TextField
              multiline
              rows={3}
              fullWidth
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
          </Grid>
        </Grid>

        {/* Buttons */}
        <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 3, gap: 2 }}>
          <Button variant="outlined" onClick={() => navigate(-1)}>
            Cancel
          </Button>

          <Button variant="contained" color="primary" onClick={handleSubmit} disabled={!!datePaidError || !canEdit}>
            Enter Payment
          </Button>
        </Box>
      </Paper>
    </FormPageLayout>
  );
}
