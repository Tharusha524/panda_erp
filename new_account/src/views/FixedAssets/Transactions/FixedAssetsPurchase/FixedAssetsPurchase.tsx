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
  FormHelperText,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useNavigate } from "react-router-dom";
import Breadcrumb from "../../../../components/BreadCrumb";
import PageTitle from "../../../../components/PageTitle";
import theme from "../../../../theme";
import { getSuppliers } from "../../../../api/Supplier/SupplierApi";
import { getLocations } from "../../../../api/FixedAssetsLocation/FixedAssetsLocationApi";
import { getCostCenters } from "../../../../api/CostCenter/CostCenterApi";
import { getItems } from "../../../../api/Item/ItemApi";
import { getItemUnits } from "../../../../api/ItemUnit/ItemUnitApi";
import { getPaymentTerms } from "../../../../api/PaymentTerm/PaymentTermApi";
import { getBankAccounts } from "../../../../api/BankAccount/BankAccountApi";
import {
  findPaymentTerm,
  isCashPaymentTerm,
  paymentTermTypeName,
} from "../../../../utils/paymentTermHelpers";
import {
  bankAccountLabel,
  defaultPaymentSourceAccountId,
  sortPaymentSourceAccounts,
} from "../../../../utils/cashBankAccount";
import { getItemCategories } from "../../../../api/ItemCategories/ItemCategoriesApi";
import { postFaPurchase } from "../../../../api/FixedAssets/FaTransactionApi";
import { useSnackbar } from "notistack";
import { useSupplierCredit } from "../../../../hooks/useSupplierCredit";
import SupplierCreditSummaryFields from "../../../../components/SupplierCreditSummaryFields";
import ItemSearchSelect, { type ItemSearchOption } from "../../../../components/ItemSearchSelect";
import { findFaItemByStockId } from "../../../../utils/fixedAssetsScreenCopy";
import FormattedNumberField from "../../../../components/FormattedNumberField";
import { useAuth } from "../../../../context/AuthContext";

function faLocationCode(loc: { locationCode?: string; loc_code?: string }): string {
  return String(loc.locationCode ?? loc.loc_code ?? "");
}

function faLocationName(loc: { locationName?: string; location_name?: string; locationCode?: string; loc_code?: string }): string {
  return loc.locationName ?? loc.location_name ?? faLocationCode(loc);
}

export default function FixedAssetsPurchase() {
  const { hasEditPermission } = useAuth();
  const canEdit = hasEditPermission('Fixed Assets Operations');
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [submitting, setSubmitting] = useState(false);
  // A completed row (not the last, always-open one) is locked until its
  // "Edit" button is clicked — before that, its fields can't be changed.
  const [editingRowId, setEditingRowId] = useState<number | null>(null);

  // ========= Form Fields =========
  const [supplier, setSupplier] = useState(0);
  const [supplierRef, setSupplierRef] = useState("");
  const [deliverTo, setDeliverTo] = useState("");
  const [orderDate, setOrderDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [dueDate, setDueDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [costCenter, setCostCenter] = useState(0);
  const [receiveInto, setReceiveInto] = useState("");
  const [reference, setReference] = useState("");

  const [memo, setMemo] = useState("");
  const [bankAccountId, setBankAccountId] = useState<number | "">("");
  const [paymentTermsDesc, setPaymentTermsDesc] = useState("");
  const [paymentMethodName, setPaymentMethodName] = useState("");

  // API data states
  const [suppliers, setSuppliers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [items, setItems] = useState([]);
  const [itemUnits, setItemUnits] = useState([]);
  const [paymentTerms, setPaymentTerms] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<{ category_id: number; description: string }[]>([]);

  const { summary: supplierCreditSummary, isLoading: supplierCreditLoading } =
    useSupplierCredit(supplier || null, suppliers);

  // ========= Generate Reference =========
  useEffect(() => {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, "0");
    setReference(`PO-${random}/${year}`);
  }, []);

  // ========= Update Payment Terms When Supplier Changes =========
  useEffect(() => {
    const selected = suppliers.find(
      (s: { supplier_id?: number; id?: number }) =>
        Number(s.supplier_id ?? s.id) === Number(supplier)
    );

    const termsIndicator =
      selected?.payment_terms ?? selected?.paymentTerms ?? selected?.terms ?? null;
    const term = findPaymentTerm(paymentTerms, termsIndicator);
    setPaymentTermsDesc(term?.description ?? (termsIndicator ? String(termsIndicator) : "—"));
    setPaymentMethodName(
      paymentTermTypeName(term) ||
        (term?.payment_type?.name ?? "") ||
        (isCashPaymentTerm(paymentTerms, termsIndicator) ? "Cash" : "On credit (Accounts Payable)")
    );

    if (term && orderDate) {
      const days = Number(term.days_before_due ?? 0);
      if (days >= 0 && !Number.isNaN(days)) {
        const due = new Date(orderDate);
        due.setDate(due.getDate() + days);
        setDueDate(due.toISOString().split("T")[0]);
      }
    }
  }, [supplier, suppliers, paymentTerms, orderDate]);

  // ========= Fetch API Data =========
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [suppliersData, locationsData, costCentersData, itemsData, itemUnitsData, paymentTermsData, bankAccountsData, categoriesData] = await Promise.all([
          getSuppliers(),
          getLocations(),
          getCostCenters(),
          getItems(),
          getItemUnits(),
          getPaymentTerms(),
          getBankAccounts(),
          getItemCategories(),
        ]);
        setSuppliers(suppliersData);
        const faLocs = Array.isArray(locationsData) ? locationsData : [];
        setLocations(faLocs);
        if (faLocs.length === 1) {
          setReceiveInto(faLocationCode(faLocs[0]));
        }
        setCostCenters(costCentersData);
        setItems(itemsData);
        setItemUnits(itemUnitsData);
        setPaymentTerms(Array.isArray(paymentTermsData) ? paymentTermsData : []);
        setBankAccounts(Array.isArray(bankAccountsData) ? bankAccountsData : []);
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
      price: 0,
      total: 0,
    },
  ]);

  const handleAddRow = () => {
    setRows((prev) => [
      ...prev,
      {
        id: prev.length + 1,
        stockId: "",
        itemCode: "",
        description: "",
        quantity: 0,
        unit: "",
        price: 0,
        total: 0,
      },
    ]);
  };

  const handleRemoveRow = (id) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleChange = (id, field, value) => {
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

  const handleFaRowItemSelect = (rowId: number, selected: ItemSearchOption | null) => {
    if (!selected) {
      handleChange(rowId, "stockId", "");
      handleChange(rowId, "description", "");
      handleChange(rowId, "itemCode", "");
      return;
    }
    const fa = findFaItemByStockId(items, selected.stock_id) ?? selected;
    const unitObj = itemUnits.find((u) => u.id === fa.units);
    handleChange(rowId, "stockId", selected.stock_id);
    handleChange(rowId, "description", fa.description);
    handleChange(rowId, "itemCode", fa.stock_id);
    handleChange(rowId, "unit", unitObj ? unitObj.abbr : fa.units);
    handleChange(rowId, "price", fa.material_cost);
  };

  // ========= Subtotal =========
  const subTotal = rows.reduce((sum, r) => sum + r.total, 0);

  const faItems = items.filter(
    (it: { mb_flag?: number }) => Number(it.mb_flag) === 4
  );

  const selectedSupplier = suppliers.find(
    (s: { supplier_id?: number; id?: number }) =>
      Number(s.supplier_id ?? s.id) === Number(supplier)
  );
  const supplierTermsIndicator =
    selectedSupplier?.payment_terms ??
    selectedSupplier?.paymentTerms ??
    selectedSupplier?.terms ??
    null;
  const isCashPayment = isCashPaymentTerm(paymentTerms, supplierTermsIndicator);

  const paymentBankAccounts = useMemo(
    () => sortPaymentSourceAccounts(bankAccounts),
    [bankAccounts]
  );

  useEffect(() => {
    if (bankAccountId !== "" || paymentBankAccounts.length === 0) {
      return;
    }
    const defaultId = defaultPaymentSourceAccountId(bankAccounts);
    if (defaultId) {
      setBankAccountId(Number(defaultId));
    }
  }, [bankAccounts, paymentBankAccounts, bankAccountId]);

  const handlePlaceOrder = async () => {
    if (!supplier) {
      enqueueSnackbar("Select a supplier.", { variant: "warning" });
      return;
    }
    const lines = rows
      .filter((r) => r.stockId && Number(r.quantity) > 0)
      .map((r) => ({
        stock_id: String(r.stockId),
        quantity: Number(r.quantity),
        price: Number(r.price),
      }));
    if (lines.length === 0) {
      enqueueSnackbar("Add at least one fixed asset line.", { variant: "warning" });
      return;
    }
    const locCode = receiveInto.trim();
    if (!locCode) {
      enqueueSnackbar("Select a receive location (Fixed Asset Location).", { variant: "warning" });
      return;
    }
    setSubmitting(true);
    try {
      const detailsToPost = rows.filter((r) => r.stockId && Number(r.quantity) > 0);
      const res = await postFaPurchase({
        supplier_id: Number(supplier),
        loc_code: locCode,
        reference,
        supp_reference: supplierRef,
        trans_date: orderDate,
        due_date: dueDate,
        cost_center_id: Number(costCenter) || undefined,
        lines,
      });
      const successState = {
        location: locCode,
        reference,
        date: orderDate,
        supplier: Number(supplier),
        supplierRef,
        invoiceDate: orderDate,
        dueDate,
        trans_type: res?.trans_type ?? 20,
        trans_no: res?.trans_no,
        items: detailsToPost.map((r) => ({
          delivery: dueDate,
          item: r.stockId,
          description: r.description || "",
          quantity: Number(r.quantity) || 0,
          price: Number(r.price) || 0,
          lineValue: (Number(r.quantity) || 0) * (Number(r.price) || 0),
        })),
        subtotal: subTotal,
        totalInvoice: res?.total ?? subTotal,
      };
      navigate("/fixedassets/transactions/fixed-assets-purchase/success", {
        state: successState,
      });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      enqueueSnackbar(e?.response?.data?.message ?? "Failed to post FA purchase.", {
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const breadcrumbItems = [
    { title: "Fixed Assets", href: "/fixedassets/transactions" },
    { title: "Fixed Assets Purchase" },
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
          <PageTitle title="Fixed Assets Purchase" />
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
                  <MenuItem key={s.supplier_id} value={s.supplier_id}>{s.supp_short_name}</MenuItem>
                ))}
              </TextField>

              <TextField label="Order Date" type="date" fullWidth size="small" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} InputLabelProps={{ shrink: true }} />

              <SupplierCreditSummaryFields
                summary={supplierCreditSummary}
                documentTotal={subTotal}
                isLoading={supplierCreditLoading}
              />

              <TextField label="Reference" fullWidth size="small" value={reference} InputProps={{ readOnly: true }} />
            </Stack>
          </Grid>

          <Grid item xs={12} md={4}>
            <Stack spacing={2}>
              <TextField label="Supplier's Reference" fullWidth size="small" value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} />

              <TextField label="Due Date" type="date" fullWidth size="small" value={dueDate} onChange={(e) => setDueDate(e.target.value)} InputLabelProps={{ shrink: true }} />

              <TextField select fullWidth label="Cost Center" size="small" value={costCenter} onChange={(e) => setCostCenter(Number(e.target.value))}>
                {costCenters.map((d) => (
                  <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>
                ))}
              </TextField>

              <TextField
                select
                fullWidth
                label="Receive Into"
                size="small"
                value={receiveInto}
                onChange={(e) => setReceiveInto(e.target.value)}
                SelectProps={{ displayEmpty: true }}
              >
                <MenuItem value="">
                  <em>Select FA location</em>
                </MenuItem>
                {locations.map((loc) => {
                  const code = faLocationCode(loc);
                  return (
                    <MenuItem key={code} value={code}>
                      {faLocationName(loc)}
                    </MenuItem>
                  );
                })}
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
            {rows.map((row, i) => {
              const isLastRow = i === rows.length - 1;
              const isLocked = !isLastRow && editingRowId !== row.id;

              return (
              <TableRow key={row.id}>
                <TableCell>{i + 1}</TableCell>

                {/* Item Code */}
                <TableCell>
                  <ItemSearchSelect
                    displayField="code"
                    hideLabel
                    placeholder="Search fixed asset code…"
                    disabled={isLocked}
                    selectedStockId={String(row.stockId ?? row.itemCode ?? "")}
                    value={row.itemCode}
                    items={faItems as ItemSearchOption[]}
                    categories={categories.map((cat) => ({
                      id: cat.category_id,
                      category_name: cat.description,
                    }))}
                    onSelect={(selected) => handleFaRowItemSelect(row.id, selected)}
                  />
                </TableCell>

                <TableCell>
                  <ItemSearchSelect
                    displayField="description"
                    hideLabel
                    placeholder="Search fixed asset…"
                    disabled={isLocked}
                    selectedStockId={String(row.stockId ?? row.itemCode ?? "")}
                    value={row.description}
                    items={faItems as ItemSearchOption[]}
                    categories={categories.map((cat) => ({
                      id: cat.category_id,
                      category_name: cat.description,
                    }))}
                    onSelect={(selected) => handleFaRowItemSelect(row.id, selected)}
                  />
                </TableCell>

                {/* Quantity */}
                <TableCell>
                  <FormattedNumberField size="small" value={row.quantity} InputProps={{ readOnly: isLocked }} onChange={(e) => handleChange(row.id, "quantity", Number(e.target.value))} />
                </TableCell>

                {/* Unit */}
                <TableCell>
                  <TextField size="small" value={row.unit} InputProps={{ readOnly: true }} />
                </TableCell>

                {/* Price Before Tax */}
                <TableCell>
                  <FormattedNumberField size="small" value={row.price} InputProps={{ readOnly: isLocked }} onChange={(e) => handleChange(row.id, "price", Number(e.target.value))} />
                </TableCell>

                {/* Line Total */}
                <TableCell>{row.total.toFixed(2)}</TableCell>

                {/* Actions */}
                <TableCell align="center">
                  {isLastRow ? (
                    <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={handleAddRow} disabled={!row.itemCode || !(Number(row.quantity) > 0)}>
                      Add
                    </Button>
                  ) : (
                    <Stack direction="row" spacing={1}>
                      {editingRowId === row.id ? (
                        <Button variant="contained" size="small" onClick={() => setEditingRowId(null)}>
                          Done
                        </Button>
                      ) : (
                        <Button variant="outlined" size="small" startIcon={<EditIcon />} onClick={() => setEditingRowId(row.id)}>
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
              );
            })}
          </TableBody>

          <TableFooter>
            <TableRow>
              <TableCell colSpan={6} sx={{ fontWeight: 600 }}>
                Sub-total
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{subTotal.toFixed(2)}</TableCell>
              <TableCell></TableCell>
            </TableRow>

            <TableRow>
              <TableCell colSpan={6} sx={{ fontWeight: 600 }}>
                Amount Total
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{subTotal.toFixed(2)}</TableCell>
              <TableCell align="center">
                <Button variant="contained" size="small" color="primary">
                  Update
                </Button>
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </TableContainer>
      {/* Payment Section */}
      <Paper sx={{ p: 2, borderRadius: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Payment
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Payment Terms"
              size="small"
              value={paymentTermsDesc}
              InputProps={{ readOnly: true }}
              helperText="From supplier setup"
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Payment Method"
              size="small"
              value={paymentMethodName}
              InputProps={{ readOnly: true }}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              select
              fullWidth
              label="Pay From Bank Account"
              size="small"
              value={bankAccountId}
              onChange={(e) =>
                setBankAccountId(e.target.value === "" ? "" : Number(e.target.value))
              }
              SelectProps={{ displayEmpty: true }}
              helperText={
                isCashPayment
                  ? "Required for cash suppliers — select current/chequing account"
                  : "Optional — leave blank to post on credit (Accounts Payable)"
              }
            >
              <MenuItem value="">
                <em>{isCashPayment ? "Select bank account" : "On credit (no bank payment)"}</em>
              </MenuItem>
              {paymentBankAccounts.map((b: any) => (
                <MenuItem
                  key={b.id ?? b.bank_account_id ?? b.account_id}
                  value={b.id ?? b.bank_account_id ?? b.account_id}
                >
                  {bankAccountLabel(b)}
                </MenuItem>
              ))}
            </TextField>
            {paymentBankAccounts.length === 0 ? (
              <FormHelperText error>
                No bank accounts found. Add accounts under Banking → Bank Accounts.
              </FormHelperText>
            ) : null}
          </Grid>
        </Grid>
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
          <Button variant="contained" color="primary" onClick={handlePlaceOrder} disabled={submitting || !canEdit}>
            {submitting ? "Processing…" : "Process Invoice"}
          </Button>
        </Box>
      </Paper>
    </FormPageLayout>
  );
}
