import React, { useState, useEffect, useMemo } from "react";
import { FormPageLayout } from "../../../../components/Layout/FormPageLayout";
import { useQuery } from "@tanstack/react-query";
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
  Alert,
  FormControlLabel,
  Checkbox,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { useNavigate, useLocation } from "react-router-dom";
import Breadcrumb from "../../../../components/BreadCrumb";
import PageTitle from "../../../../components/PageTitle";
import ItemSearchSelect from "../../../../components/ItemSearchSelect";
import theme from "../../../../theme";
import {
  groupPaymentSourceAccounts,
  sortPaymentSourceAccounts,
  bankAccountLabelWithBalance,
} from "../../../../utils/cashBankAccount";
import { getSuppliers } from "../../../../api/Supplier/SupplierApi";
import { getInventoryLocations } from "../../../../api/InventoryLocation/InventoryLocationApi";
import { getCostCenters } from "../../../../api/CostCenter/CostCenterApi";
import { getItems } from "../../../../api/Item/ItemApi";
import { getItemUnits } from "../../../../api/ItemUnit/ItemUnitApi";
import { getPaymentTypes } from "../../../../api/PaymentType/PaymentTypeApi";
import { getBankAccounts } from "../../../../api/BankAccount/BankAccountApi";
import { getItemCategories } from "../../../../api/ItemCategories/ItemCategoriesApi";
import { getFiscalYears } from "../../../../api/FiscalYear/FiscalYearApi";
import { postDirectSupplierInvoice } from "../../../../api/Purchases/PurchasesApi";
import { getCompanies } from "../../../../api/CompanySetup/CompanySetupApi";
import { useNextFiscalYearReference } from "../../../../hooks/useNextFiscalYearReference";
import useCurrentUser from "../../../../hooks/useCurrentUser";
import { runTransactionSave } from "../../../../utils/transactionSave";
import { useMessageDialog } from "../../../../context/MessageDialogContext";
import { useSupplierCredit } from "../../../../hooks/useSupplierCredit";
import SupplierCreditSummaryFields from "../../../../components/SupplierCreditSummaryFields";
import SupplierCurrencyField from "../../../../components/SupplierCurrencyField";
import CurrencyAmountInput from "../../../../components/CurrencyAmountInput";
import { resolveSupplierTransactionCurrencyCode } from "../../../../utils/relationId";
import { resolvePurchaseItemPrice } from "../../../../utils/resolvePurchaseItemPrice";
import { useHomeCurrency } from "../../../../hooks/useHomeCurrency";
import { useTransactionMoney } from "../../../../hooks/useTransactionMoney";
import { useCompanySetupSettings } from "../../../../hooks/useCompanySetupSettings";
import FormattedNumberField from "../../../../components/FormattedNumberField";
import { useAuth } from "../../../../context/AuthContext";

const FA_MB_FLAG = 4;

export default function DirectSupplierInvoice() {
  const { hasEditPermission } = useAuth();
  const canEdit = hasEditPermission('Direct supplier invoice entry');
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useCurrentUser();
  const { showError } = useMessageDialog();

  const initialSupplier =
    Number(
      location.state?.supplierId ??
        location.state?.supplier ??
        location.state?.supplier_id ??
        0
    ) || 0;

  // ========= Form Fields =========
  const [supplier, setSupplier] = useState(initialSupplier);
  const [supplierRef, setSupplierRef] = useState("");
  const [deliverTo, setDeliverTo] = useState("");
  const [orderDate, setOrderDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [dueDate, setDueDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [costCenter, setCostCenter] = useState(0);
  const [receiveInto, setReceiveInto] = useState(0);
  const [reference, setReference] = useState("");
  const [fixedAssetPurchase, setFixedAssetPurchase] = useState(false);

  const { fixedAssetsEnabled } = useCompanySetupSettings();

  const [memo, setMemo] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(0);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const paymentBankGroups = useMemo(
    () => groupPaymentSourceAccounts(bankAccounts),
    [bankAccounts]
  );
  const paymentBankAccounts = useMemo(
    () => sortPaymentSourceAccounts(bankAccounts),
    [bankAccounts]
  );

  // API data states
  const [suppliers, setSuppliers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [items, setItems] = useState([]);
  const [itemUnits, setItemUnits] = useState([]);
  const [paymentTypes, setPaymentTypes] = useState([]);
  const [categories, setCategories] = useState<{ category_id: number; description: string }[]>([]);

  const [orderDateError, setOrderDateError] = useState("");

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

  // ========= Generate Reference =========
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
      validateDate(orderDate, setOrderDateError);
    }
  }, [selectedFiscalYear]);

  const { reference: nextReference } = useNextFiscalYearReference(20, {
    asOfDate: orderDate,
  });

  useEffect(() => {
    if (nextReference) {
      setReference(nextReference);
    }
  }, [nextReference]);

  // ========= Update Credit When Supplier Changes =========
  // Helper to resolve supplier identifier (handles different backend shapes)
  const resolveSupplierId = (s: any) => s?.id ?? s?.supplier_id ?? null;

  const { summary: supplierCreditSummary, isLoading: supplierCreditLoading } =
    useSupplierCredit(supplier || null, suppliers);

  const selectedSupplier = useMemo(
    () =>
      suppliers.find(
        (s: any) => String(resolveSupplierId(s)) === String(supplier)
      ),
    [suppliers, supplier]
  );
  const { code: homeCurrencyCode } = useHomeCurrency();
  const currencyCode = resolveSupplierTransactionCurrencyCode(
    selectedSupplier,
    homeCurrencyCode
  );
  const { formatMoney } = useTransactionMoney(currencyCode);

  // ========= Fetch API Data =========
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [suppliersData, locationsData, costCentersData, itemsData, itemUnitsData, paymentTypesData, bankAccountsData, categoriesData] = await Promise.all([
          getSuppliers(),
          getInventoryLocations(),
          getCostCenters(),
          getItems(),
          getItemUnits(),
          getPaymentTypes(),
          getBankAccounts(),
          getItemCategories(),
        ]);
        setSuppliers(suppliersData);
        // default-select first supplier only when not pre-selected from navigation
        if (
          initialSupplier <= 0 &&
          (!supplier || supplier === 0) &&
          Array.isArray(suppliersData) &&
          suppliersData.length > 0
        ) {
          const first = suppliersData[0];
          const firstId = resolveSupplierId(first);
          if (firstId != null) setSupplier(Number(firstId));
        }
        setLocations(locationsData);
        setCostCenters(costCentersData);
        setItems(itemsData);
        setItemUnits(itemUnitsData);
        setPaymentTypes(paymentTypesData);
        const normalizedBankAccounts = bankAccountsData?.data ?? bankAccountsData ?? [];
        setBankAccounts(Array.isArray(normalizedBankAccounts) ? normalizedBankAccounts : []);
        setCategories(categoriesData);
        // default select first location if none selected
        if ((!receiveInto || receiveInto === 0) && Array.isArray(locationsData) && locationsData.length > 0) {
          setReceiveInto(Number(locationsData[0].id));
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };
    fetchData();
  }, []);

  // auto-fill Deliver To from Receive Into but allow edits
  const prevAutoDeliverRef = React.useRef<string>("");
  useEffect(() => {
    try {
      const selectedLoc = (locations || []).find((l: any) => String(l.id) === String(receiveInto) || String(l.loc_code) === String(receiveInto));
      const locName = selectedLoc ? (selectedLoc.location_name ?? selectedLoc.name ?? selectedLoc.loc_code ?? "") : "";
      if (!locName) return;

      const current = deliverTo ?? "";
      const isEmpty = current.toString().trim() === "";
      const wasAuto = current === prevAutoDeliverRef.current;

      if (isEmpty || wasAuto) {
        setDeliverTo(locName);
        prevAutoDeliverRef.current = locName;
      }
    } catch (e) {
      // ignore
    }
  }, [receiveInto, locations]);

  // ========= Table Rows =========
  const [rows, setRows] = useState([
    {
      id: 1,
      stockId: "",
      itemCode: "",
      description: "",
      quantity: 0,
      unit: "",
      price: 0,
      discount: 0,
      total: 0,
      isEditing: true,
    },
  ]);

  const [validationMsg, setValidationMsg] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const handleAddRow = () => {
    setRows((prev) => {
      if (prev.length === 0) {
        return [
          ...prev,
          {
            id: prev.length + 1,
            stockId: "",
            itemCode: "",
            description: "",
            quantity: 0,
            unit: "",
            price: 0,
            discount: 0,
            total: 0,
            isEditing: true,
          },
        ];
      }

      const last = prev[prev.length - 1];
      if (last && last.isEditing) {
        if (!validateRow(last)) return prev;
        const committed = { ...last, isEditing: false };
        return [
          ...prev.slice(0, -1),
          committed,
          {
            id: prev.length + 1,
            stockId: "",
            itemCode: "",
            description: "",
            quantity: 0,
            unit: "",
            price: 0,
            discount: 0,
            total: 0,
            isEditing: true,
          },
        ];
      }

      return [
        ...prev,
        {
          id: prev.length + 1,
          stockId: "",
          itemCode: "",
          description: "",
          quantity: 0,
          unit: "",
          price: 0,
          discount: 0,
          total: 0,
          isEditing: true,
        },
      ];
    });
  };

  const handleRemoveRow = (id) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleChange = (id, field, value) => {
    setValidationMsg("");
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, [field]: value };
        const qty = field === "quantity" ? Number(value) : Number(next.quantity);
        const price = field === "price" ? Number(value) : Number(next.price);
        const disc = field === "discount" ? Number(value) : Number(next.discount ?? 0);
        next.total = qty * price * (1 - disc / 100);
        return next;
      })
    );
  };

  const setRowEditing = (id, editing) => {
    setValidationMsg("");
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, isEditing: editing } : r)));
  };

  const validateRow = (r: any) => {
    const qty = Number(r.quantity ?? 0);
    const hasItem = !!(r.itemCode || r.stockId || r.description);
    if (!hasItem) {
      setValidationMsg('Please select an item before confirming.');
      return false;
    }
    if (isNaN(qty) || qty <= 0) {
      setValidationMsg('Quantity must be greater than zero.');
      return false;
    }
    setValidationMsg("");
    return true;
  };

  const validateAndConfirm = (id: number) => {
    const row = rows.find((x) => x.id === id);
    if (!row) return;
    if (!validateRow(row)) return;
    setRowEditing(id, false);
  };

  // ========= Subtotal =========
  const subTotal = rows.reduce((sum, r) => sum + r.total, 0);

  // ========= Place Order =========
  const handlePlaceOrder = () => {
    (async () => {
      try {
        // require supplier's reference
        if (!supplierRef || String(supplierRef).trim() === "") {
          setSaveError("Supplier's Reference is required to process the invoice.");
          return;
        }

        if (!supplier) { setSaveError('Select supplier first'); return; }
        const detailsToPost = rows.filter(r => (r.itemCode || r.stockId) && r.quantity > 0);
        if (detailsToPost.length === 0) { setValidationMsg('Add at least one item with quantity > 0'); return; }

        const supplierIdToSend = Number(supplier) || null;
        if (!supplierIdToSend) { throw new Error('Missing supplier id'); }
        const selectedSupplierObj = (suppliers || []).find((s: any) => String(resolveSupplierId(s)) === String(supplier));
        const taxIncludedForSupplier = Boolean(selectedSupplierObj?.tax_included ?? selectedSupplierObj?.taxIncluded ?? false);

        const selectedLocationObj = (locations || []).find((l: any) => Number(l.id) === Number(receiveInto));
        const intoLocationCode = selectedLocationObj ? (selectedLocationObj.loc_code || selectedLocationObj.location_name || String(receiveInto)) : String(receiveInto || "");

        setIsSaving(true);
        setSaveError("");

        const invoiceLines = detailsToPost.map((r) => ({
          item_code: String(r.itemCode ?? r.stockId ?? ""),
          description: r.description || null,
          quantity: Number(r.quantity) || 0,
          unit_price: Number(r.price) || 0,
          discount_percent: Number(r.discount) || 0,
        }));

        const saveResult = await runTransactionSave(() =>
          postDirectSupplierInvoice({
            supplier_id: supplierIdToSend,
            reference: reference || undefined,
            supp_reference: supplierRef || undefined,
            trans_date: orderDate,
            due_date: dueDate,
            into_stock_location: intoLocationCode,
            delivery_address: deliverTo || "",
            tax_included: taxIncludedForSupplier,
            fixed_asset: fixedAssetPurchase,
            cost_center_id: Number(costCenter) || undefined,
            comments: memo || undefined,
            lines: invoiceLines,
          })
        );

        if (saveResult.ok === false) {
          showError(saveResult.message);
          setSaveError(saveResult.message);
          return;
        }

        const suppTransNo = saveResult.data.trans_no;

        // prepare state for success page and view page
        const successState: any = {
          location: intoLocationCode,
          reference: reference,
          date: orderDate,
          supplier: supplierIdToSend,
          supplierRef: supplierRef,
          invoiceDate: orderDate,
          dueDate: dueDate,
          trans_type: 20,
          trans_no: suppTransNo,
          orderNo: saveResult.data.order_no,
          grnBatchId: saveResult.data.grn_batch_id,
          items: detailsToPost.map((r) => ({
            delivery: dueDate,
            item: r.itemCode ?? r.stockId ?? null,
            description: r.description || "",
            quantity: Number(r.quantity) || 0,
            price: Number(r.price) || 0,
            lineValue: (Number(r.quantity) || 0) * (Number(r.price) || 0),
          })),
          subtotal: subTotal,
          totalInvoice: subTotal,
          returnToAllocation: location.state?.returnToAllocation,
        };

        navigate('/purchase/transactions/direct-supplier-invoice/success', { state: successState });
      } catch (err: any) {
        console.error('Failed to process supplier invoice', err);
        const detail = err?.response?.data ? JSON.stringify(err.response.data) : err?.message || String(err);
        setSaveError('Failed to process supplier invoice: ' + detail);
      } finally {
        setIsSaving(false);
      }
    })();
  };

  const breadcrumbItems = [
    { title: "Purchases", href: "/purchases" },
    { title: "Direct Purchase Invoice Entry" },
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
          <PageTitle title="Direct Purchase Invoice Entry" />
          <Breadcrumb breadcrumbs={breadcrumbItems} />
        </Box>

        <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)}>
          Back
        </Button>
      </Box>

      {/* Form Fields */}
      <Paper sx={{ p: 2, borderRadius: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Stack spacing={2}>
              <TextField select fullWidth label="Supplier" size="small" value={supplier} onChange={(e) => setSupplier(Number(e.target.value))}>
                {suppliers.map((s) => (
                  <MenuItem key={s.supplier_id} value={s.supplier_id}>{s.supp_name}</MenuItem>
                ))}
              </TextField>

              {fixedAssetsEnabled ? (
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={fixedAssetPurchase}
                      onChange={(e) => setFixedAssetPurchase(e.target.checked)}
                    />
                  }
                  label="Fixed asset purchase (FA items only)"
                />
              ) : null}

              <TextField label="Invoice Date" type="date" fullWidth size="small" value={orderDate} onChange={(e) => { setOrderDate(e.target.value); validateDate(e.target.value, setOrderDateError); }} InputLabelProps={{ shrink: true }} inputProps={{ min: selectedFiscalYear ? new Date(selectedFiscalYear.fiscal_year_from).toISOString().split('T')[0] : undefined, max: selectedFiscalYear ? new Date(selectedFiscalYear.fiscal_year_to).toISOString().split('T')[0] : undefined, }} error={!!orderDateError} helperText={orderDateError} />

              <SupplierCreditSummaryFields
                summary={supplierCreditSummary}
                documentTotal={subTotal}
                isLoading={supplierCreditLoading}
                currencyCode={currencyCode}
              />

              <TextField label="Reference" fullWidth size="small" value={reference} InputProps={{ readOnly: true }} />
            </Stack>
          </Grid>

          <Grid item xs={12} md={4}>
            <Stack spacing={2}>
              <SupplierCurrencyField supplier={selectedSupplier} />
              <TextField label="Supplier's Reference" fullWidth size="small" value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} />

              <TextField label="Due Date" type="date" fullWidth size="small" value={dueDate} onChange={(e) => setDueDate(e.target.value)} InputLabelProps={{ shrink: true }} />

              <TextField select fullWidth label="Cost Center" size="small" value={costCenter} onChange={(e) => setCostCenter(Number(e.target.value))}>
                {costCenters.map((d) => (
                  <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>
                ))}
              </TextField>

              <TextField select fullWidth label="Receive Into" size="small" value={receiveInto} onChange={(e) => setReceiveInto(Number(e.target.value))}>
                {locations.map((l) => (
                  <MenuItem key={l.id} value={l.id}>{l.location_name}</MenuItem>
                ))}
              </TextField>
            </Stack>
          </Grid>

          <Grid item xs={12} md={4}>
            <TextField label="Deliver To" fullWidth size="small" multiline rows={3} value={deliverTo} onChange={(e) => setDeliverTo(e.target.value)} />
          </Grid>
        </Grid>
      </Paper>

      {/* Order Items Table */}
      <Typography variant="subtitle1" sx={{ mb: 1, textAlign: "center" }}>
        Order Items
      </Typography>

      <TableContainer component={Paper}>
        <Table>
          <TableHead sx={{ backgroundColor: "var(--pallet-lighter-blue)" }}>
            <TableRow>
              <TableCell>No</TableCell>
              <TableCell>Item Code</TableCell>
              <TableCell>Description</TableCell>
              <TableCell>Quantity</TableCell>
              <TableCell>Unit</TableCell>
              <TableCell>Price Before Tax</TableCell>
              <TableCell>Discount (%)</TableCell>
              <TableCell>Line Total</TableCell>
              <TableCell align="center">Action</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={row.id}>
                <TableCell>{i + 1}</TableCell>

                {/* Item Code */}
                <TableCell>
                  <ItemSearchSelect
                    displayField="code"
                    hideLabel
                    disabled={!row.isEditing}
                    value={row.description || row.stockId}
                    selectedStockId={String(row.stockId ?? row.itemCode ?? "")}
                    items={
                      (fixedAssetPurchase
                        ? items.filter((it: any) => Number(it.mb_flag) === FA_MB_FLAG)
                        : items) as any[]
                    }
                    categories={categories.map((cat: any) => ({
                      id: cat.category_id,
                      category_name: cat.description,
                    }))}
                    onSelect={(selected) => {
                      if (!selected) return;
                      const unitObj = itemUnits.find((u) => u.id === (selected as any).units);
                      handleChange(row.id, "stockId", selected.stock_id);
                      handleChange(row.id, "description", selected.description);
                      handleChange(row.id, "itemCode", selected.stock_id);
                      handleChange(row.id, "unit", unitObj ? unitObj.abbr : String((selected as any).units ?? ""));
                      (async () => {
                        const supplierIdNum = Number(supplier) || 0;
                        const { price } = await resolvePurchaseItemPrice(
                          supplierIdNum,
                          String(selected.stock_id)
                        );
                        handleChange(row.id, "price", price);
                      })();
                    }}
                  />
                </TableCell>

                {/* Description */}
                <TableCell>
                  <ItemSearchSelect
                    hideLabel
                    disabled={!row.isEditing}
                    value={row.description || row.stockId}
                    selectedStockId={String(row.stockId ?? row.itemCode ?? "")}
                    items={
                      (fixedAssetPurchase
                        ? items.filter((it: any) => Number(it.mb_flag) === FA_MB_FLAG)
                        : items) as any[]
                    }
                    categories={categories.map((cat: any) => ({
                      id: cat.category_id,
                      category_name: cat.description,
                    }))}
                    onSelect={(selected) => {
                      if (!selected) return;
                      const unitObj = itemUnits.find((u) => u.id === (selected as any).units);
                      handleChange(row.id, "stockId", selected.stock_id);
                      handleChange(row.id, "description", selected.description);
                      handleChange(row.id, "itemCode", selected.stock_id);
                      handleChange(row.id, "unit", unitObj ? unitObj.abbr : String((selected as any).units ?? ""));
                      (async () => {
                        const supplierIdNum = Number(supplier) || 0;
                        const { price } = await resolvePurchaseItemPrice(
                          supplierIdNum,
                          String(selected.stock_id)
                        );
                        handleChange(row.id, "price", price);
                      })();
                    }}
                  />
                </TableCell>

                {/* Quantity */}
                <TableCell>
                  <FormattedNumberField size="small" value={row.quantity} disabled={!row.isEditing} onChange={(e) => handleChange(row.id, "quantity", Number(e.target.value))} />
                </TableCell>

                {/* Unit */}
                <TableCell>
                  <TextField size="small" value={row.unit} InputProps={{ readOnly: true }} />
                </TableCell>

                {/* Price Before Tax */}
                <TableCell>
                  <CurrencyAmountInput
                    size="small"
                    value={row.price}
                    currencyCode={currencyCode}
                    onChange={(v) => handleChange(row.id, "price", v)}
                    disabled={!row.isEditing}
                  />
                </TableCell>

                <TableCell>
                  <FormattedNumberField
                    size="small"
                    value={row.discount ?? 0}
                    disabled={!row.isEditing}
                    onChange={(e) => handleChange(row.id, "discount", Number(e.target.value))}
                    inputProps={{ min: 0, max: 100 }}
                  />
                </TableCell>

                {/* Line Total */}
                <TableCell>{formatMoney(row.total)}</TableCell>

                {/* Actions */}
                <TableCell align="center">
                  {i === rows.length - 1 ? (
                    <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={handleAddRow} disabled={!row.itemCode || !(Number(row.quantity) > 0)}>
                      Add
                    </Button>
                  ) : (
                    <Stack direction="row" spacing={1}>
                      {row.isEditing ? (
                        <Button variant="contained" size="small" onClick={() => validateAndConfirm(row.id)}>
                          Confirm
                        </Button>
                      ) : (
                        <Button variant="outlined" size="small" startIcon={<EditIcon />} onClick={() => setRowEditing(row.id, true)}>
                          Edit
                        </Button>
                      )}
                      <Button variant="outlined" color="error" size="small" startIcon={<DeleteIcon />} onClick={() => handleRemoveRow(row.id)}>
                        Delete
                      </Button>
                    </Stack>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>

          <TableFooter>
            <TableRow>
              <TableCell colSpan={6} sx={{ fontWeight: 600 }}>
                Sub-total
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{formatMoney(subTotal)}</TableCell>
              <TableCell></TableCell>
            </TableRow>

            <TableRow>
              <TableCell colSpan={6} sx={{ fontWeight: 600 }}>
                Amount Total
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{formatMoney(subTotal)}</TableCell>
              <TableCell align="center">
                <Button variant="contained" size="small" color="primary">
                  Update
                </Button>
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </TableContainer>

      {validationMsg ? (
        <Box sx={{ mt: 1 }}>
          <Alert
            severity="error"
            icon={<ErrorOutlineIcon />}
            sx={{
              backgroundColor: (theme) => theme.palette.error.light + '22',
              borderRadius: 1,
            }}
          >
            {validationMsg}
          </Alert>
        </Box>
      ) : null}

      {saveError ? (
        <Box sx={{ mt: 2 }}>
          <Alert severity="error">{saveError}</Alert>
        </Box>
      ) : null}

      {/* Payment Section */}
      <Paper sx={{ p: 2, borderRadius: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Payment
        </Typography>
        <TextField
          select
          fullWidth
          label="Bank Account"
          size="small"
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(Number(e.target.value))}
        >
          {Object.entries(paymentBankGroups).flatMap(([typeName, accounts]) => [
            <ListSubheader key={`hdr-${typeName}`}>{typeName}</ListSubheader>,
            ...accounts.map((b: any) => (
              <MenuItem key={b.id} value={b.id}>
                {bankAccountLabelWithBalance(b)}
              </MenuItem>
            )),
          ])}
        </TextField>
      </Paper>

      {/* Memo Section */}
      <Paper sx={{ p: 2, borderRadius: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Memo
        </Typography>
        <TextField fullWidth multiline rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} />

        <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2, gap: 2 }}>
          <Button variant="outlined" onClick={() => navigate(-1)}>
            Cancel Invoice
          </Button>
                <Button variant="contained" color="primary" onClick={handlePlaceOrder} disabled={isSaving || !!orderDateError || !canEdit}>
            {isSaving ? 'Processing...' : 'Process Invoice'}
          </Button>
        </Box>
      </Paper>
    </FormPageLayout>
  );
}
