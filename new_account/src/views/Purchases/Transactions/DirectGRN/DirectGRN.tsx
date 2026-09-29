import React, { useState, useEffect, useMemo } from "react";
import { FormPageLayout } from "../../../../components/Layout/FormPageLayout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { useNavigate } from "react-router-dom";
import Breadcrumb from "../../../../components/BreadCrumb";
import PageTitle from "../../../../components/PageTitle";
import ItemSearchSelect from "../../../../components/ItemSearchSelect";
import theme from "../../../../theme";
import { getSuppliers } from "../../../../api/Supplier/SupplierApi";
import { getInventoryLocations } from "../../../../api/InventoryLocation/InventoryLocationApi";
import { getCostCenters } from "../../../../api/CostCenter/CostCenterApi";
import { getItems } from "../../../../api/Item/ItemApi";
import { getItemUnits } from "../../../../api/ItemUnit/ItemUnitApi";
import { getItemCategories } from "../../../../api/ItemCategories/ItemCategoriesApi";
import { getFiscalYears } from "../../../../api/FiscalYear/FiscalYearApi";
import { postDirectGrn } from "../../../../api/Purchases/PurchasesApi";
import { getCompanies } from "../../../../api/CompanySetup/CompanySetupApi";
import useCurrentUser from "../../../../hooks/useCurrentUser";
import { runTransactionSave } from "../../../../utils/transactionSave";
import { useMessageDialog } from "../../../../context/MessageDialogContext";
import { useNextFiscalYearReference } from "../../../../hooks/useNextFiscalYearReference";
import { useSupplierCredit } from "../../../../hooks/useSupplierCredit";
import SupplierCreditSummaryFields from "../../../../components/SupplierCreditSummaryFields";
import SupplierCurrencyField from "../../../../components/SupplierCurrencyField";
import CurrencyAmountInput from "../../../../components/CurrencyAmountInput";
import { resolveSupplierTransactionCurrencyCode } from "../../../../utils/relationId";
import { resolvePurchaseItemPrice } from "../../../../utils/resolvePurchaseItemPrice";
import { useHomeCurrency } from "../../../../hooks/useHomeCurrency";
import { useTransactionMoney } from "../../../../hooks/useTransactionMoney";
import { invalidateFinancialReports } from "../../../../utils/invalidateFinancialReports";
import FormattedNumberField from "../../../../components/FormattedNumberField";
import { useAuth } from "../../../../context/AuthContext";

export default function DirectGRN() {
  const { hasEditPermission } = useAuth();
  const canEdit = hasEditPermission('Direct GRN entry');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const { showError } = useMessageDialog();

  // ========= Form Fields =========
  const [supplier, setSupplier] = useState(0);
  const [supplierRef, setSupplierRef] = useState("");
  const [deliverTo, setDeliverTo] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [costCenter, setCostCenter] = useState(0);
  const [receiveInto, setReceiveInto] = useState(0);
  const [reference, setReference] = useState("");
  const [dateError, setDateError] = useState("");

  const [memo, setMemo] = useState("");

  // API data states
  const [suppliers, setSuppliers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [items, setItems] = useState([]);
  const [itemUnits, setItemUnits] = useState([]);
  const [categories, setCategories] = useState<{ category_id: number; description: string }[]>([]);

  // Helper to resolve supplier identifier (handles different backend shapes)
  const resolveSupplierId = (s: any) => s?.id ?? s?.supplier_id ?? s?.supp_id ?? s?.supplierId ?? s?.debtor_no ?? s?.code ?? s?.supp_code ?? null;

  // ========= Generate Reference =========
  const { data: fiscalYears = [] } = useQuery({ queryKey: ["fiscalYears"], queryFn: getFiscalYears });

  // Fetch company setup
  const { data: companyData } = useQuery<any[]>({
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
    setDeliveryDate(value);
    validateDate(value);
  };

  // Set initial date based on selected fiscal year
  useEffect(() => {
    if (selectedFiscalYear) {
      const currentYear = new Date().getFullYear();
      const fiscalYear = new Date(selectedFiscalYear.fiscal_year_from).getFullYear();
      let initialDate = "";
      if (fiscalYear === currentYear) {
        initialDate = new Date().toISOString().split("T")[0];
      } else {
        initialDate = new Date(selectedFiscalYear.fiscal_year_from).toISOString().split("T")[0];
      }
      setDeliveryDate(initialDate);
      validateDate(initialDate); // Validate immediately to show error if invalid
    }
  }, [selectedFiscalYear]);

  const { reference: nextReference, manualEntryRequired, suffix } =
    useNextFiscalYearReference(25, { asOfDate: deliveryDate });

  useEffect(() => {
    if (nextReference) {
      setReference(nextReference);
    }
  }, [nextReference]);

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
        const [suppliersData, locationsData, costCentersData, itemsData, itemUnitsData, categoriesData] = await Promise.all([
          getSuppliers(),
          getInventoryLocations(),
          getCostCenters(),
          getItems(),
          getItemUnits(),
          getItemCategories(),
        ]);
        setSuppliers(suppliersData);
        // default-select first supplier if none selected
        if ((!supplier || supplier === 0) && Array.isArray(suppliersData) && suppliersData.length > 0) {
          const first = suppliersData[0];
          const firstId = resolveSupplierId(first);
          if (firstId != null) setSupplier(Number(firstId));
        }
        setLocations(locationsData);
        // default select first location if none selected
        if ((!receiveInto || receiveInto === 0) && Array.isArray(locationsData) && locationsData.length > 0) {
          setReceiveInto(Number(locationsData[0].id));
        }
        setCostCenters(costCentersData);
        setItems(itemsData);
        setItemUnits(itemUnitsData);
        setCategories(categoriesData);
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };
    fetchData();
  }, []);

  // ========= Table Rows =========
  const [rows, setRows] = useState([
    {
      id: 1,
      stockId: "",
      itemCode: "",
      description: "",
      quantity: 0,
      unit: "",
      deliveryDate: new Date().toISOString().split("T")[0],
      price: 0,
      total: 0,
      isEditing: true,
    },
  ]);

  const [validationMsg, setValidationMsg] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

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
            deliveryDate: new Date().toISOString().split("T")[0],
            price: 0,
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
            deliveryDate: new Date().toISOString().split("T")[0],
            price: 0,
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
          deliveryDate: new Date().toISOString().split("T")[0],
          price: 0,
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
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              [field]: value,
              total:
                field === "quantity" || field === "price"
                  ? (field === "quantity" ? value : r.quantity) *
                    (field === "price" ? value : r.price)
                  : r.total,
            }
          : r
      )
    );
  };

  const setRowEditing = (id, editing) => {
    setValidationMsg("");
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, isEditing: editing } : r)));
  };

  const handleItemSelect = (rowId: number, selected: any) => {
    if (!selected) return;
    const unitObj = itemUnits.find((u) => String(u.id) === String(selected.units));
    handleChange(rowId, "description", selected.description);
    handleChange(rowId, "itemCode", String(selected.stock_id));
    handleChange(rowId, "stockId", String(selected.stock_id));
    handleChange(
      rowId,
      "unit",
      unitObj ? unitObj.abbr : String((selected as any).units ?? "")
    );
    (async () => {
      const supplierIdNum = Number(supplier) || 0;
      const { price } = await resolvePurchaseItemPrice(
        supplierIdNum,
        String(selected.stock_id)
      );
      handleChange(rowId, "price", price);
    })();
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
        // basic validations
        if (!supplier) { setSaveError('Select supplier first'); return; }
        if (!reference?.trim()) {
          setSaveError(manualEntryRequired ? 'Enter a reference' : 'Reference is not ready yet. Please wait a moment.');
          return;
        }
        if (dateError) { setSaveError(dateError); return; }
        const detailsToPost = rows.filter(r => (r.itemCode || r.stockId) && r.quantity > 0);
        if (detailsToPost.length === 0) { setValidationMsg('Add at least one item with quantity > 0'); return; }

        setIsSaving(true);
        setSaveError("");

        // resolve supplier id (supplier holds supplier_id numeric)
        const supplierIdToSend = Number(supplier) || null;
        if (!supplierIdToSend) { throw new Error('Missing supplier id'); }
        const selectedSupplierObj = (suppliers || []).find((s: any) => String(resolveSupplierId(s)) === String(supplier));
        const taxIncludedForSupplier = Boolean(selectedSupplierObj?.tax_included ?? selectedSupplierObj?.taxIncluded ?? false);

        // resolve location code
        const selectedLocationObj = (locations || []).find((l: any) => Number(l.id) === Number(receiveInto));
        const intoLocationCode = selectedLocationObj ? (selectedLocationObj.loc_code || selectedLocationObj.location_name || String(receiveInto)) : String(receiveInto || "");

        const grnLines = detailsToPost.map((r) => ({
          item_code: String(r.itemCode ?? r.stockId ?? ""),
          description: r.description || null,
          quantity: Number(r.quantity) || 0,
          unit_price: Number(r.price) || 0,
          delivery_date: r.deliveryDate || deliveryDate,
        }));

        const saveResult = await runTransactionSave(() =>
          postDirectGrn({
            supplier_id: supplierIdToSend,
            reference: reference || undefined,
            delivery_date: deliveryDate,
            into_stock_location: intoLocationCode,
            delivery_address: deliverTo || "",
            tax_included: taxIncludedForSupplier,
            comments: memo || undefined,
            total: Number(subTotal) || 0,
            cost_center_id: Number(costCenter) || 0,
            lines: grnLines,
          })
        );

        if (saveResult.ok === false) {
          showError(saveResult.message);
          setSaveError(saveResult.message);
          return;
        }

        const usedOrderNo = saveResult.data.order_no;
        const grnBatchId = saveResult.data.grn_batch_id;

        const viewItems = detailsToPost.map((r) => ({
          itemCode: r.itemCode ?? r.stockId ?? "",
          description: r.description || "",
          requiredBy: r.deliveryDate || deliveryDate,
          quantity: Number(r.quantity) || 0,
          unit: r.unit || "",
          price: Number(r.price) || 0,
          lineTotal: Number(r.total) || (Number(r.quantity) || 0) * (Number(r.price) || 0),
          quantityInvoiced: 0,
        }));

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["grnBatches"] }),
          queryClient.invalidateQueries({ queryKey: ["grnItems"] }),
          queryClient.invalidateQueries({ queryKey: ["purchOrderDetails"] }),
          queryClient.invalidateQueries({ queryKey: ["purchOrders"] }),
          queryClient.invalidateQueries({ queryKey: ["stockMoves"] }),
          queryClient.invalidateQueries({ queryKey: ["locStocks"] }),
        ]);
        invalidateFinancialReports(queryClient);

        // navigate to success page and pass the data for the success/view pages
        navigate("/purchase/transactions/direct-grn/success", {
          state: {
            reference: reference || "",
            date: deliveryDate,
            deliveryDate: deliveryDate,
            trans_type: 25,
            grnBatchId,
            deliveryAddress: deliverTo || "",
            supplierId: supplierIdToSend,
            deliverIntoLocation: intoLocationCode,
            suppliersReference: supplierRef || "",
            purchaseOrderRef: usedOrderNo,
            orderNo: usedOrderNo,
            items: viewItems,
            subtotal: subTotal,
            totalAmount: subTotal,
          },
        });
      } catch (err: any) {
        console.error('Failed to place GRN', err);
        const detail = err?.response?.data ? JSON.stringify(err.response.data) : err?.message || String(err);
        setSaveError('Failed to place GRN: ' + detail);
      } finally {
        setIsSaving(false);
      }
    })();
  };

  const breadcrumbItems = [
    { title: "Purchases", href: "/purchases" },
    { title: "Direct GRN Entry" },
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
          <PageTitle title="Direct GRN Entry" />
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

              <TextField label="Delivery Date" type="date" fullWidth size="small" value={deliveryDate} onChange={(e) => handleDateChange(e.target.value)} InputLabelProps={{ shrink: true }} inputProps={{
                min: selectedFiscalYear ? new Date(selectedFiscalYear.fiscal_year_from).toISOString().split('T')[0] : undefined,
                max: selectedFiscalYear ? new Date(selectedFiscalYear.fiscal_year_to).toISOString().split('T')[0] : undefined,
              }} error={!!dateError} helperText={dateError} />

              <SupplierCreditSummaryFields
                summary={supplierCreditSummary}
                documentTotal={subTotal}
                isLoading={supplierCreditLoading}
                currencyCode={currencyCode}
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

          <Grid item xs={12} md={4}>
            <Stack spacing={2}>
              <SupplierCurrencyField supplier={selectedSupplier} />
              <TextField label="Supplier's Reference" fullWidth size="small" value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} />

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
                    value={row.description}
                    selectedStockId={String(row.stockId ?? row.itemCode ?? "")}
                    items={items as any[]}
                    categories={categories.map((cat: any) => ({
                      id: cat.category_id,
                      category_name: cat.description,
                    }))}
                    onSelect={(selected) => handleItemSelect(row.id, selected)}
                  />
                </TableCell>

                {/* Description */}
                <TableCell>
                  <ItemSearchSelect
                    hideLabel
                    disabled={!row.isEditing}
                    value={row.description}
                    selectedStockId={String(row.stockId ?? row.itemCode ?? "")}
                    items={items as any[]}
                    categories={categories.map((cat: any) => ({
                      id: cat.category_id,
                      category_name: cat.description,
                    }))}
                    onSelect={(selected) => handleItemSelect(row.id, selected)}
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
                      )
                      }
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
              <TableCell></TableCell>
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

      {/* Memo Section */}
      <Paper sx={{ p: 2, borderRadius: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Memo
        </Typography>
        <TextField fullWidth multiline rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} />

        <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2, gap: 2 }}>
          <Button variant="outlined" onClick={() => navigate(-1)}>
            Cancel GRN
          </Button>
          <Button variant="contained" color="primary" onClick={handlePlaceOrder} disabled={isSaving || !!dateError || !canEdit}>
            {isSaving ? "Processing..." : "Process GRN"}
          </Button>
        </Box>
      </Paper>
    </FormPageLayout>
  );
}
