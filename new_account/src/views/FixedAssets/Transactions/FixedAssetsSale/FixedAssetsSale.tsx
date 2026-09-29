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
    FormHelperText,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getCustomers } from "../../../../api/Customer/AddCustomerApi";
import { getBranches } from "../../../../api/CustomerBranch/CustomerBranchApi";
import { getPaymentTerms } from "../../../../api/PaymentTerm/PaymentTermApi";
import { getSalesTypes } from "../../../../api/SalesMaintenance/salesService";
import { getLocations } from "../../../../api/FixedAssetsLocation/FixedAssetsLocationApi";
import { getBankAccounts } from "../../../../api/BankAccount/BankAccountApi";
import { getItems, getItemById } from "../../../../api/Item/ItemApi";
import { getItemUnits } from "../../../../api/ItemUnit/ItemUnitApi";
import { getItemCategories } from "../../../../api/ItemCategories/ItemCategoriesApi";
import Breadcrumb from "../../../../components/BreadCrumb";
import PageTitle from "../../../../components/PageTitle";
import ItemSearchSelect, { type ItemSearchOption } from "../../../../components/ItemSearchSelect";
import { findFaItemByStockId } from "../../../../utils/fixedAssetsScreenCopy";
import theme from "../../../../theme";
import { postFaSale } from "../../../../api/FixedAssets/FaTransactionApi";
import { useSnackbar } from "notistack";
import { useNextFiscalYearReference } from "../../../../hooks/useNextFiscalYearReference";
import { useCustomerCredit } from "../../../../hooks/useCustomerCredit";
import CustomerCreditSummaryFields from "../../../../components/CustomerCreditSummaryFields";
import { relationId, bankAccountLabel, sortCashBankAccounts } from "../../../../utils/cashBankAccount";
import { isCashSalePaymentTerm } from "../../../../utils/customerCredit";
import { getStockQoh } from "../../../../api/Inventory/StockQuantityApi";
import FormattedNumberField from "../../../../components/FormattedNumberField";
import { useAuth } from "../../../../context/AuthContext";

function faLocationCode(loc: { locationCode?: string; loc_code?: string }): string {
    return String(loc.locationCode ?? loc.loc_code ?? "").toUpperCase();
}

type FaInventoryItem = {
    mb_flag?: number;
    stock_id?: string;
    id?: string;
    description?: string;
    category_id?: number;
};

function faLocationName(loc: {
    locationName?: string;
    location_name?: string;
    locationCode?: string;
    loc_code?: string;
}): string {
    return loc.locationName ?? loc.location_name ?? faLocationCode(loc);
}

async function fetchRowQoh(
    stockId: string | number | null,
    locCode: string
): Promise<number> {
    if (!stockId || !locCode) {
        return 0;
    }
    try {
        return await getStockQoh(String(stockId), faLocationCode({ loc_code: locCode }));
    } catch {
        return 0;
    }
}

export default function FixedAssetsSale() {
  const { hasEditPermission } = useAuth();
  const canEdit = hasEditPermission('Fixed assets sale');
    const navigate = useNavigate();
    const { enqueueSnackbar } = useSnackbar();
    const [submitting, setSubmitting] = useState(false);
    // A completed row (not the last, always-open one) is locked until its
    // "Edit" button is clicked — before that, its fields can't be changed.
    const [editingRowId, setEditingRowId] = useState<number | null>(null);

    // ===== Form fields =====
    const [customer, setCustomer] = useState("");
    const [branch, setBranch] = useState("");
    const [reference, setReference] = useState("");
    const [discount, setDiscount] = useState(0);
    const [payment, setPayment] = useState("");
    const [priceList, setPriceList] = useState("");
    const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);

    // A fixed asset sale posts as a Sales Invoice (trans_type 10) under the hood
    // (see trans_type: res?.invoice_trans_type ?? 10 below), so it shares that
    // type's reference sequence via the shared TransactionReferenceService.
    const { reference: nextSaleReference } = useNextFiscalYearReference(10, {
        asOfDate: invoiceDate,
    });
    const [deliverFrom, setDeliverFrom] = useState("");
    const [cashAccount, setCashAccount] = useState("");
    const [comments, setComments] = useState("");
    const [shippingCharge, setShippingCharge] = useState(0);

    // ===== Fetch master data =====
    const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: getCustomers });
    const { data: branches = [] } = useQuery({ queryKey: ["branches"], queryFn: () => getBranches() });
    const { data: paymentTerms = [] } = useQuery({ queryKey: ["payments"], queryFn: getPaymentTerms });
    const { data: priceLists = [] } = useQuery({ queryKey: ["priceLists"], queryFn: getSalesTypes });
    const { data: locations = [] } = useQuery({
        queryKey: ["fixedAssetsLocations"],
        queryFn: getLocations,
    });
    const { data: bankAccounts = [] } = useQuery({
        queryKey: ["bankAccounts"],
        queryFn: getBankAccounts,
    });
    const { data: items = [] } = useQuery({ queryKey: ["items"], queryFn: getItems });
    const { data: itemUnits = [] } = useQuery({ queryKey: ["itemUnits"], queryFn: getItemUnits });
    const { data: categories = [] } = useQuery({ queryKey: ["itemCategories"], queryFn: () => getItemCategories() });

    const { summary: customerCreditSummary, isLoading: customerCreditLoading } =
        useCustomerCredit(customer || null, customers);

    const cashBankAccounts = useMemo(
        () => sortCashBankAccounts(bankAccounts as { inactive?: boolean }[]),
        [bankAccounts]
    );

    const selectedCashBankAccount = useMemo(
        () =>
            cashBankAccounts.find(
                (acc: { id?: number | string }) => String(acc.id) === String(cashAccount)
            ),
        [cashBankAccounts, cashAccount]
    );

    const isCashSale = useMemo(
        () => isCashSalePaymentTerm(paymentTerms, payment),
        [paymentTerms, payment]
    );

    // ===== Table rows =====
    const [rows, setRows] = useState([
        {
            id: 1,
            itemCode: "",
            description: "",
            quantity: 0,
            unit: "",
            priceAfterTax: 0,
            discount: 0,
            total: 0,
            selectedItemId: null as string | number | null,
            qoh: 0,
        },
    ]);

    const handleAddRow = () => {
        setRows((prev) => [
            ...prev,
            {
                id: prev.length + 1,
                itemCode: "",
                description: "",
                quantity: 0,
                unit: "",
                priceAfterTax: 0,
                discount: 0,
                total: 0,
                selectedItemId: null,
                qoh: 0,
            },
        ]);
    };

    const handleRemoveRow = (id: number) => {
        setRows((prev) => prev.filter((r) => r.id !== id));
    };

    const handleChange = (id: number, field: string, value: any) => {
        setRows((prev) =>
            prev.map((r) =>
                r.id === id
                    ? {
                        ...r,
                        [field]: value,
                        total:
                            field === "quantity" ||
                                field === "priceAfterTax" ||
                                field === "discount"
                                ? (field === "quantity" ? value : r.quantity) *
                                (field === "priceAfterTax" ? value : r.priceAfterTax) *
                                (1 - (field === "discount" ? value : r.discount) / 100)
                                : r.total,
                    }
                    : r
            )
        );
    };

    const handleFaRowItemSelect = async (rowId: number, selected: ItemSearchOption | null) => {
        if (!selected) {
            handleChange(rowId, "description", "");
            handleChange(rowId, "itemCode", "");
            handleChange(rowId, "selectedItemId", null);
            return;
        }
        const fa = findFaItemByStockId(faItems, selected.stock_id) ?? selected;
        handleChange(rowId, "description", fa.description);
        handleChange(rowId, "itemCode", fa.stock_id);
        handleChange(rowId, "selectedItemId", fa.stock_id);
        const itemData = await getItemById(fa.stock_id);
        if (itemData) {
            const unitName =
                itemUnits.find(
                    (u: { id?: number; name?: string }) => u.id === itemData.units
                )?.name || "";
            handleChange(rowId, "unit", unitName);
            handleChange(rowId, "priceAfterTax", itemData.material_cost || 0);
        }
        if (deliverFrom) {
            const qoh = await fetchRowQoh(fa.stock_id, deliverFrom);
            handleChange(rowId, "qoh", qoh);
            if (qoh <= 0) {
                enqueueSnackbar(`${fa.stock_id} has no stock at ${deliverFrom}.`, {
                    variant: "warning",
                });
            }
        }
    };

    // ===== Auto-generate reference based on fiscal year =====
    // Uses the shared TransactionReferenceService (via useNextFiscalYearReference) so
    // this follows the Sales Invoice type's configured Prefix/Pattern under
    // Setup > Transaction References, instead of a random placeholder number.
    useEffect(() => {
        if (nextSaleReference) {
            setReference(nextSaleReference);
        }
    }, [nextSaleReference]);

    // Default branch when customer changes
    useEffect(() => {
        if (!customer || branches.length === 0) {
            return;
        }
        const customerBranches = branches.filter(
            (b: { debtor_no?: number | string }) => String(b.debtor_no) === String(customer)
        );
        const branchBelongsToCustomer = customerBranches.some(
            (b: { branch_code?: number | string }) => String(b.branch_code) === String(branch)
        );
        if (!branchBelongsToCustomer) {
            const defaultBranch =
                customerBranches.find((b: { inactive?: boolean }) => !b.inactive) ||
                customerBranches[0];
            setBranch(defaultBranch ? String(defaultBranch.branch_code) : "");
        }
    }, [customer, branches, branch]);

    // Auto payment type, price list, discount from customer
    useEffect(() => {
        if (!customer || customers.length === 0) {
            setDiscount(0);
            setPayment("");
            setPriceList("");
            setRows((prev) => prev.map((r) => ({ ...r, discount: 0 })));
            return;
        }

        const selectedCustomer = customers.find(
            (c: { debtor_no?: number | string }) => String(c.debtor_no) === String(customer)
        );
        if (!selectedCustomer) {
            return;
        }

        const newDiscount = Number(selectedCustomer.discount) || 0;
        let newPayment =
            relationId(selectedCustomer.payment_terms, "terms_indicator", "id") ||
            relationId(selectedCustomer.payment_term, "terms_indicator", "id");
        const newPriceList = relationId(selectedCustomer.sales_type, "id");

        if (newPayment && paymentTerms.length > 0) {
            const ptObj = paymentTerms.find(
                (pt: { terms_indicator?: number | string }) =>
                    String(pt.terms_indicator) === String(newPayment)
            );
            if (ptObj) {
                const pType = ptObj.payment_type;
                const typeId =
                    typeof pType === "number"
                        ? pType
                        : Number(
                              (pType as { id?: number; payment_type?: number })?.id ??
                                  (pType as { payment_type?: number })?.payment_type ??
                                  0
                          );
                if (typeId === 1) {
                    newPayment = "";
                }
            }
        }

        setDiscount(newDiscount);
        setPayment(newPayment);
        setPriceList(newPriceList);
        setRows((prev) => prev.map((r) => ({ ...r, discount: newDiscount })));
    }, [customer, customers, paymentTerms]);

    // Default deliver-from from branch when it matches a fixed asset location
    useEffect(() => {
        if (!branch || branches.length === 0 || locations.length === 0) {
            return;
        }
        const selectedBranch = branches.find(
            (b: { branch_code?: number | string }) => String(b.branch_code) === String(branch)
        );
        const branchLoc = String(selectedBranch?.inventory_location ?? "").toUpperCase();
        if (!branchLoc) {
            return;
        }
        const faMatch = (locations as { locationCode?: string; loc_code?: string }[]).find(
            (loc) => faLocationCode(loc) === branchLoc
        );
        if (faMatch) {
            setDeliverFrom(faLocationCode(faMatch));
        }
    }, [branch, branches, locations]);

    // Auto-select cash account when payment term is cash sale
    useEffect(() => {
        if (!isCashSale || cashBankAccounts.length === 0 || cashAccount) {
            return;
        }
        setCashAccount(String(cashBankAccounts[0].id));
    }, [isCashSale, cashBankAccounts, cashAccount]);

    useEffect(() => {
        if (!cashAccount || cashBankAccounts.length === 0) {
            return;
        }
        const exists = cashBankAccounts.some(
            (acc: { id?: number | string }) => String(acc.id) === String(cashAccount)
        );
        if (!exists) {
            setCashAccount(String(cashBankAccounts[0].id));
        }
    }, [cashAccount, cashBankAccounts]);

    // Refresh quantity on hand when deliver-from location changes
    useEffect(() => {
        if (!deliverFrom) {
            setRows((prev) => prev.map((row) => ({ ...row, qoh: 0 })));
            return;
        }
        const refreshQoh = async () => {
            const nextRows = await Promise.all(
                rows.map(async (row) => {
                    if (!row.selectedItemId) {
                        return { ...row, qoh: 0 };
                    }
                    const qoh = await fetchRowQoh(row.selectedItemId, deliverFrom);
                    return { ...row, qoh };
                })
            );
            setRows(nextRows);
        };
        void refreshQoh();
    }, [deliverFrom]);

    const faItems = (items as FaInventoryItem[]).filter(
        (it) => Number(it.mb_flag) === 4
    );

    const handlePlaceQuotation = async () => {
        if (!customer) {
            enqueueSnackbar("Select a customer.", { variant: "warning" });
            return;
        }
        if (!branch) {
            enqueueSnackbar("Select a branch.", { variant: "warning" });
            return;
        }
        if (!deliverFrom) {
            enqueueSnackbar("Select deliver from location.", { variant: "warning" });
            return;
        }
        if (isCashSale && !cashAccount) {
            enqueueSnackbar("Select a cash account for cash sale.", { variant: "warning" });
            return;
        }
        const activeRows = rows.filter((r) => r.selectedItemId && Number(r.quantity) > 0);
        if (activeRows.length === 0) {
            enqueueSnackbar("Add at least one fixed asset.", { variant: "warning" });
            return;
        }

        const rowsWithQoh = await Promise.all(
            activeRows.map(async (row) => ({
                row,
                qoh: await fetchRowQoh(row.selectedItemId, deliverFrom),
            }))
        );

        const noStock = rowsWithQoh.filter(({ qoh }) => qoh <= 0.0001);
        if (noStock.length > 0) {
            enqueueSnackbar(
                `No quantity on hand at ${deliverFrom} for: ${noStock
                    .map(({ row }) => row.itemCode || row.selectedItemId)
                    .join(", ")}. Purchase or transfer the asset first.`,
                { variant: "error" }
            );
            return;
        }

        const overSold = rowsWithQoh.filter(
            ({ row, qoh }) => Number(row.quantity) > qoh + 0.0001
        );
        if (overSold.length > 0) {
            enqueueSnackbar(
                `Cannot sell more than quantity on hand: ${overSold
                    .map(
                        ({ row, qoh }) =>
                            `${row.itemCode || row.selectedItemId} (available: ${qoh})`
                    )
                    .join("; ")}`,
                { variant: "error" }
            );
            return;
        }

        const lines = activeRows.map((r) => ({
            stock_id: String(r.selectedItemId),
            quantity: Number(r.quantity),
            price: Number(r.priceAfterTax),
        }));
        setSubmitting(true);
        try {
            const res = await postFaSale({
                debtor_no: Number(customer),
                branch_code: branch ? Number(branch) : 0,
                loc_code: faLocationCode({ loc_code: deliverFrom }),
                reference,
                tran_date: invoiceDate,
                lines,
            });
            const detailsToPost = activeRows.map((r) => ({
                item: r.itemCode || r.selectedItemId,
                description: r.description || "",
                quantity: Number(r.quantity) || 0,
                unit: r.unit || "",
                price: Number(r.priceAfterTax) || 0,
                discount: Number(r.discount) || 0,
                lineValue: (Number(r.quantity) || 0) * (Number(r.priceAfterTax) || 0),
            }));
            const successState = {
                customer: Number(customer),
                branch_code: branch ? Number(branch) : 0,
                reference: res?.invoice_reference ?? reference,
                deliveryReference: res?.delivery_reference ?? reference,
                invoiceDate,
                date: invoiceDate,
                loc_code: faLocationCode({ loc_code: deliverFrom }),
                trans_type: res?.invoice_trans_type ?? 10,
                trans_no: res?.invoice_trans_no,
                delivery_trans_type: res?.delivery_trans_type ?? 13,
                delivery_trans_no: res?.delivery_trans_no,
                items: detailsToPost,
                subtotal: subTotal,
                totalInvoice: res?.total ?? amountTotal,
                comments,
                cashAccount: cashAccount ? Number(cashAccount) : null,
                isCashSale,
            };
            navigate("/fixedassets/transactions/fixed-assets-sale/success", {
                state: successState,
            });
        } catch (err: unknown) {
            const e = err as { response?: { data?: { message?: string } } };
            enqueueSnackbar(e?.response?.data?.message ?? "Failed to post FA sale.", {
                variant: "error",
            });
        } finally {
            setSubmitting(false);
        }
    };

    const breadcrumbItems = [
        { title: "Transactions", href: "/fixedassets/transactions/" },
        { title: "Fixed Assets Sale" },
    ];

    const subTotal = rows.reduce((sum, r) => sum + r.total, 0);
    const amountTotal = subTotal + shippingCharge;

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
                    <PageTitle title="Fixed Assets Sale" />
                    <Breadcrumb breadcrumbs={breadcrumbItems} />
                </Box>

                <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)}>
                    Back
                </Button>
            </Box>
            {/* Form fields */}
            <Paper sx={{ p: 2, borderRadius: 2 }}>
                <Grid container spacing={2}>
                    <Grid item xs={12} sm={4}>
                        <TextField
                            select
                            fullWidth
                            label="Customer"
                            value={customer}
                            onChange={(e) => setCustomer(e.target.value)}
                            size="small"
                        >
                            {customers.map((c: any) => (
                                <MenuItem key={c.debtor_no} value={c.debtor_no}>
                                    {c.name}
                                </MenuItem>
                            ))}
                        </TextField>
                    </Grid>

                    <Grid item xs={12} sm={4}>
                        <TextField
                            select
                            fullWidth
                            label="Branch"
                            value={branch}
                            onChange={(e) => setBranch(e.target.value)}
                            size="small"
                        >
                            {branches
                                .filter((b: any) => b.debtor_no === customer)
                                .map((b: any) => (
                                    <MenuItem key={b.branch_code} value={b.branch_code}>
                                        {b.br_name}
                                    </MenuItem>
                                ))}
                        </TextField>
                    </Grid>

                    <Grid item xs={12} sm={4}>
                        <TextField
                            label="Reference"
                            fullWidth
                            size="small"
                            value={reference}
                            InputProps={{ readOnly: true }}
                        />
                    </Grid>

                    <Grid item xs={12} sm={4}>
                        <CustomerCreditSummaryFields
                            summary={customerCreditSummary}
                            documentTotal={amountTotal}
                            isLoading={customerCreditLoading}
                            availableCreditLabel="Current Credit"
                        />
                    </Grid>

                    <Grid item xs={12} sm={4}>
                        <TextField label="Customer Discount (%)" fullWidth size="small" value={discount} InputProps={{ readOnly: true }} />
                    </Grid>

                    <Grid item xs={12} sm={4}>
                        <TextField
                            select
                            fullWidth
                            label="Payment Type"
                            value={payment}
                            onChange={(e) => setPayment(e.target.value)}
                            size="small"
                        >
                            {paymentTerms.map((p: { terms_indicator?: number | string; description?: string }) => (
                                <MenuItem key={String(p.terms_indicator)} value={String(p.terms_indicator)}>
                                    {p.description}
                                </MenuItem>
                            ))}
                        </TextField>
                    </Grid>

                    <Grid item xs={12} sm={4}>
                        <TextField
                            select
                            fullWidth
                            label="Price List"
                            value={priceList}
                            onChange={(e) => setPriceList(e.target.value)}
                            size="small"
                        >
                            {priceLists.map((pl: { id?: number | string; typeName?: string }) => (
                                <MenuItem key={String(pl.id)} value={String(pl.id)}>
                                    {pl.typeName}
                                </MenuItem>
                            ))}
                        </TextField>
                    </Grid>

                    <Grid item xs={12} sm={4}>
                        <TextField
                            label="Invoice Date"
                            type="date"
                            fullWidth
                            size="small"
                            value={invoiceDate}
                            onChange={(e) => setInvoiceDate(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                        />
                    </Grid>
                </Grid>
            </Paper>
            {/* Items Table */}
            <Typography variant="subtitle1" sx={{ mb: 2, textAlign: 'center' }}>Sales Invoice Items</Typography>
            <TableContainer component={Paper}>     
                <Table>
                    <TableHead sx={{ backgroundColor: "var(--pallet-lighter-blue)" }}>
                        <TableRow>
                            <TableCell>No</TableCell>
                            <TableCell>Item Code</TableCell>
                            <TableCell>Description</TableCell>
                            <TableCell>QOH</TableCell>
                            <TableCell>Quantity</TableCell>
                            <TableCell>Unit</TableCell>
                            <TableCell>Price After Tax</TableCell>
                            <TableCell>Discount (%)</TableCell>
                            <TableCell>Total</TableCell>
                            <TableCell>Action</TableCell>
                        </TableRow>
                    </TableHead>

                    <TableBody>
                        {rows.map((row, i) => {
                            const isLastRow = i === rows.length - 1;
                            const isLocked = !isLastRow && editingRowId !== row.id;

                            return (
                            <TableRow key={row.id} data-row-id={row.id}>
                                <TableCell>{i + 1}</TableCell>
                                <TableCell>
                                    <ItemSearchSelect
                                        displayField="code"
                                        hideLabel
                                        placeholder="Search fixed asset code…"
                                        disabled={isLocked}
                                        selectedStockId={String(row.selectedItemId ?? row.itemCode ?? "")}
                                        value={row.itemCode}
                                        items={faItems as ItemSearchOption[]}
                                        categories={categories.map((c) => ({
                                            id: c.category_id,
                                            category_name: c.description,
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
                                        selectedStockId={String(row.selectedItemId ?? row.itemCode ?? "")}
                                        value={row.description}
                                        items={faItems as ItemSearchOption[]}
                                        categories={categories.map((c) => ({
                                            id: c.category_id,
                                            category_name: c.description,
                                        }))}
                                        onSelect={(selected) => handleFaRowItemSelect(row.id, selected)}
                                    />
                                </TableCell>
                                <TableCell>
                                    <Typography
                                        variant="body2"
                                        color={
                                            deliverFrom && row.selectedItemId && row.qoh <= 0
                                                ? "error"
                                                : "textPrimary"
                                        }
                                    >
                                        {deliverFrom ? row.qoh : "—"}
                                    </Typography>
                                </TableCell>
                                <TableCell>
                                    <FormattedNumberField
                                        size="small"
                                        value={row.quantity}
                                        InputProps={{ readOnly: isLocked }}
                                        inputProps={{
                                            min: 0,
                                            max: row.qoh > 0 ? row.qoh : undefined,
                                            step: 1,
                                        }}
                                        error={
                                            deliverFrom &&
                                            row.selectedItemId &&
                                            (row.qoh <= 0 ||
                                                Number(row.quantity) > row.qoh + 0.0001)
                                        }
                                        helperText={
                                            deliverFrom &&
                                            row.selectedItemId &&
                                            row.qoh <= 0
                                                ? "No stock at location"
                                                : deliverFrom &&
                                                    row.selectedItemId &&
                                                    Number(row.quantity) > row.qoh
                                                  ? `Max ${row.qoh}`
                                                  : undefined
                                        }
                                        onChange={(e) =>
                                            handleChange(row.id, "quantity", Number(e.target.value))
                                        }
                                    />
                                </TableCell>
                                <TableCell>
                                    <TextField size="small" value={row.unit} InputProps={{ readOnly: true }} />
                                </TableCell>
                                <TableCell>
                                    <FormattedNumberField
                                        size="small"
                                        value={row.priceAfterTax}
                                        InputProps={{ readOnly: isLocked }}
                                        onChange={(e) => handleChange(row.id, "priceAfterTax", Number(e.target.value))}
                                    />
                                </TableCell>
                                <TableCell>
                                    <FormattedNumberField
                                        size="small"
                                        value={row.discount}
                                        InputProps={{ readOnly: true }}
                                    />
                                </TableCell>
                                <TableCell>{row.total.toFixed(2)}</TableCell>
                                <TableCell>
                                    {isLastRow ? (
                                        <Button
                                            size="small"
                                            variant="contained"
                                            startIcon={<AddIcon />}
                                            onClick={handleAddRow}
                                            disabled={!row.itemCode || !(Number(row.quantity) > 0)}
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
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<EditIcon />}
                          onClick={() => setEditingRowId(row.id)}
                        >
                          Edit
                        </Button>
                      )}
                      <Button
                        variant="outlined"
                        color="error"
                        size="small"
                        startIcon={<DeleteIcon />}
                        onClick={() => handleRemoveRow(row.id)}
                      >
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
                            <TableCell colSpan={8}>Shipping Charge</TableCell>
                            <TableCell>
                                <FormattedNumberField
                                    size="small"
                                    value={shippingCharge}
                                    onChange={(e) => setShippingCharge(Number(e.target.value))}
                                />
                            </TableCell>
                            <TableCell></TableCell>
                        </TableRow>

                        <TableRow>
                            <TableCell colSpan={8} sx={{ fontWeight: 600 }}>Sub-total</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>{subTotal.toFixed(2)}</TableCell>
                            <TableCell></TableCell>
                        </TableRow>
                       
                        <TableRow>
                            <TableCell colSpan={8} sx={{ fontWeight: 600 }}>Amount Total</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>{(subTotal + shippingCharge).toFixed(2)}</TableCell>
                            <TableCell>
                                <Button variant="contained" size="small">
                                    Update
                                </Button>
                            </TableCell>
                        </TableRow>
                    </TableFooter>
                </Table>
            </TableContainer>
            {/* Cash Payment Section */}
            <Paper sx={{ p: 2, borderRadius: 2 }}>
                <Typography variant="subtitle1" sx={{ mb: 2, textAlign: 'center' }}>
                    Cash Payment
                </Typography>
                <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                        <TextField
                            select
                            fullWidth
                            label="Deliver From (FA Location)"
                            value={deliverFrom}
                            onChange={(e) =>
                                setDeliverFrom(faLocationCode({ loc_code: e.target.value }))
                            }
                            size="small"
                        >
                            <MenuItem value="">
                                <em>Select FA location</em>
                            </MenuItem>
                            {(locations as { locationCode?: string; loc_code?: string; locationName?: string; location_name?: string }[]).map(
                                (loc) => {
                                    const code = faLocationCode(loc);
                                    return (
                                        <MenuItem key={code} value={code}>
                                            {faLocationName(loc)}
                                        </MenuItem>
                                    );
                                }
                            )}
                        </TextField>
                    </Grid>

                    <Grid item xs={12} sm={6}>
                        <TextField
                            select
                            fullWidth
                            label="Cash Account"
                            value={String(cashAccount || "")}
                            onChange={(e) => setCashAccount(e.target.value)}
                            size="small"
                            SelectProps={{
                                renderValue: (selected) => {
                                    if (!selected) {
                                        return isCashSale ? "Select" : "Not required (credit sale)";
                                    }
                                    const acc = cashBankAccounts.find(
                                        (a: { id?: number | string }) =>
                                            String(a.id) === String(selected)
                                    );
                                    return acc ? bankAccountLabel(acc) : String(selected);
                                },
                            }}
                            helperText={
                                cashBankAccounts.length === 0
                                    ? "No bank accounts found — add one under Banking → Bank Accounts."
                                    : isCashSale
                                      ? "Required for cash sales"
                                      : "Optional — used when payment type is cash"
                            }
                        >
                            <MenuItem value="">
                                <em>{isCashSale ? "Select cash account" : "Not required"}</em>
                            </MenuItem>
                            {cashBankAccounts.map((acc: { id?: number | string }) => (
                                <MenuItem key={acc.id} value={String(acc.id)}>
                                    {bankAccountLabel(acc)}
                                </MenuItem>
                            ))}
                        </TextField>
                        {cashBankAccounts.length === 0 ? (
                            <FormHelperText error>
                                No active bank accounts. Add a Cash, Chequing, or Current account
                                under Banking maintenance.
                            </FormHelperText>
                        ) : null}
                        {cashAccount && !selectedCashBankAccount ? (
                            <FormHelperText error>
                                Selected account is not in the list.
                            </FormHelperText>
                        ) : null}
                    </Grid>

                    <Grid item xs={12}>
                        <TextField
                            fullWidth
                            multiline
                            rows={2}
                            label="Comments"
                            value={comments}
                            onChange={(e) => setComments(e.target.value)}
                        />
                    </Grid>
                </Grid>

                <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2, gap: 2 }}>
                    <Button variant="outlined" onClick={() => navigate(-1)}>
                        Cancel Invoice
                    </Button>
                    <Button variant="contained" color="primary" onClick={handlePlaceQuotation} disabled={submitting || !canEdit}>
                        {submitting ? "Posting…" : "Place Invoice"}
                    </Button>
                </Box>
            </Paper>
        </FormPageLayout>
    );
}
