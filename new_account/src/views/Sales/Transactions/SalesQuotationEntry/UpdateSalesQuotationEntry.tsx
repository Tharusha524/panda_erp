import { FormPageLayout } from "../../../../components/Layout/FormPageLayout";
import React, { useState, useMemo, useEffect } from "react";
import { useParams } from "react-router-dom";
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
import { getInventoryLocations } from "../../../../api/InventoryLocation/InventoryLocationApi";
// import { getCashAccounts } from "../../../../api/Accounts/CashAccountsApi";
import { getItems, getItemById } from "../../../../api/Item/ItemApi";
import { getItemUnits } from "../../../../api/ItemUnit/ItemUnitApi";
import { getItemCategories } from "../../../../api/ItemCategories/ItemCategoriesApi";
import { getSalesPricingByStockId } from "../../../../api/SalesPricing/SalesPricingApi";
import Breadcrumb from "../../../../components/BreadCrumb";
import PageTitle from "../../../../components/PageTitle";
import theme from "../../../../theme";
import CustomerCurrencyField from "../../../../components/CustomerCurrencyField";
import CurrencyAmountInput from "../../../../components/CurrencyAmountInput";
import { getSalesOrderByOrderNo, updateSalesOrder } from "../../../../api/SalesOrders/SalesOrdersApi";
import { getSalesOrderDetailsByOrderNo, createSalesOrderDetail, updateSalesOrderDetail, deleteSalesOrderDetail } from "../../../../api/SalesOrders/SalesOrderDetailsApi";
import { useCustomerCredit } from "../../../../hooks/useCustomerCredit";
import CustomerCreditSummaryFields from "../../../../components/CustomerCreditSummaryFields";
import {
    customerCurrencyCode,
} from "../../../../utils/relationId";
import { resolveSalesItemLinePrices } from "../../../../utils/resolveSalesItemPrice";
import { useHomeCurrency } from "../../../../hooks/useHomeCurrency";
import { useTransactionMoney } from "../../../../hooks/useTransactionMoney";
import FormattedNumberField from "../../../../components/FormattedNumberField";
import { useAuth } from "../../../../context/AuthContext";

export default function UpdateSalesQuotationEntry() {
  const { hasEditPermission } = useAuth();
  const canEdit = hasEditPermission('Sales quotations');
    const navigate = useNavigate();
    const { id } = useParams();
    const { code: homeCurrencyCode } = useHomeCurrency();

    // ===== Form fields =====
    const [customer, setCustomer] = useState("");
    const [branch, setBranch] = useState("");
    const [reference, setReference] = useState("");
    const [discount, setDiscount] = useState(0);
    const [payment, setPayment] = useState("");
    const [priceList, setPriceList] = useState("");
    const [quotationDate, setQuotationDate] = useState(new Date().toISOString().split("T")[0]);
    const [deliverFrom, setDeliverFrom] = useState("");
    const [cashAccount, setCashAccount] = useState("");
    const [comments, setComments] = useState("");
    const [shippingCharge, setShippingCharge] = useState(0);
    const [priceColumnLabel, setPriceColumnLabel] = useState("Price after Tax");
    // A completed row (not the last, always-open one) is locked until its
    // "Edit" button is clicked — before that, its fields can't be changed.
    const [editingRowId, setEditingRowId] = useState<number | null>(null);

    // ===== Fetch master data =====
    const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: getCustomers });
    const selectedCustomer = useMemo(
        () => customers.find((c: any) => String(c.debtor_no) === String(customer)),
        [customers, customer]
    );
    const customerCurrency = customerCurrencyCode(selectedCustomer);
    const { formatMoney } = useTransactionMoney(customerCurrency);
    const { data: branches = [] } = useQuery({ queryKey: ["branches"], queryFn: () => getBranches() });
    const { data: paymentTerms = [] } = useQuery({ queryKey: ["payments"], queryFn: getPaymentTerms });
    const { data: priceLists = [] } = useQuery({ queryKey: ["priceLists"], queryFn: getSalesTypes });
    const { data: locations = [] } = useQuery({ queryKey: ["locations"], queryFn: getInventoryLocations });
    //   const { data: cashAccounts = [] } = useQuery({ queryKey: ["cashAccounts"], queryFn: getCashAccounts });
    const { data: items = [] } = useQuery({ queryKey: ["items"], queryFn: getItems });
    const { data: itemUnits = [] } = useQuery({ queryKey: ["itemUnits"], queryFn: getItemUnits });
    const { data: categories = [] } = useQuery({ queryKey: ["itemCategories"], queryFn: () => getItemCategories() });

    // ===== Table rows =====
    const [rows, setRows] = useState([
        {
            id: 1,
            itemCode: "",
            description: "",
            quantity: 0,
            unit: "",
            priceAfterTax: 0,
            priceBeforeTax: 0,
            discount: 0,
            total: 0,
            selectedItemId: null as string | number | null,
            src_id: null as string | number | null,
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
                priceBeforeTax: 0,
                discount: 0,
                total: 0,
                selectedItemId: null,
                src_id: null,
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
                                field === "priceBeforeTax" ||
                                field === "discount"
                                ? (field === "quantity" ? value : r.quantity) *
                                (field === "priceAfterTax" ? value : field === "priceBeforeTax" ? value : (priceColumnLabel.toLowerCase().includes("after") ? r.priceAfterTax : r.priceBeforeTax)) *
                                (1 - (field === "discount" ? value : r.discount) / 100)
                                : r.total,
                    }
                    : r
            )
        );
    };

    const handleItemChange = async (rowId: number, selected: any) => {
        handleChange(rowId, "description", selected.description);
        handleChange(rowId, "itemCode", selected.stock_id);
        handleChange(rowId, "selectedItemId", selected.stock_id);
        handleChange(rowId, "quantity", 1);
        const itemData = await getItemById(selected.stock_id);
        if (itemData) {
            const unitName = itemUnits.find((u: any) => u.id === itemData.units)?.name || "";
            handleChange(rowId, "unit", unitName);
            const pricingList = await getSalesPricingByStockId(selected.stock_id);
            const { priceAfterTax, priceBeforeTax } = resolveSalesItemLinePrices({
                pricingList,
                stockId: selected.stock_id,
                salesTypeId: priceList,
                salesTypes: priceLists,
                currencyCode: customerCurrency,
                homeCurrencyCode,
                materialCost: Number(itemData.material_cost ?? 0),
            });
            handleChange(rowId, "priceAfterTax", priceAfterTax);
            handleChange(rowId, "priceBeforeTax", priceBeforeTax);
        }
    };

    // Auto-select first customer on load
    useEffect(() => {
        if (customers.length > 0 && !customer) {
            setCustomer(customers[0].debtor_no);
        }
    }, [customers, customer]);

    // Load quotation when navigated to this edit route
    useEffect(() => {
        const loadQuotation = async () => {
            if (!id) return;
            try {
                const order = await getSalesOrderByOrderNo(id);
                if (!order) return;
                // Only load if this is a quotation (trans_type 32)
                if (Number(order.trans_type) !== 32) return;

                setCustomer(order.debtor_no ?? "");
                setBranch(order.branch_code ?? "");
                setReference(order.reference ?? "");
                setQuotationDate(order.ord_date ?? (new Date().toISOString().split("T")[0]));
                setPayment(order.payment_terms ? String(order.payment_terms) : "");
                setPriceList(order.order_type ? String(order.order_type) : "");
                setDeliverFrom(order.from_stk_loc ?? "");
                setComments(order.comments ?? "");
                setShippingCharge(Number(order.freight_cost ?? 0));

                // load details
                const details = await getSalesOrderDetailsByOrderNo(id);
                if (details && details.length > 0) {
                    const newRows = details.map((detail: any, index: number) => {
                        const item = items.find((it: any) => String(it.stock_id ?? it.id) === String(detail.stk_code));
                        const unitName = item ? (item.units ? (itemUnits.find((u: any) => u.id === item.units)?.name || "") : "") : "";
                        const qty = Number(detail.quantity ?? detail.qty_sent ?? 0);
                        const price = Number(detail.unit_price ?? 0);
                        const disc = Number(detail.discount_percent ?? 0);
                        return {
                            id: index + 1,
                            itemCode: detail.stk_code,
                            // preserve detail id for updates/deletes
                            src_id: detail.id,
                            description: detail.description || "",
                            quantity: qty,
                            unit: unitName,
                            priceAfterTax: price,
                            priceBeforeTax: price,
                            discount: disc,
                            total: qty * price * (1 - disc / 100),
                            selectedItemId: detail.stk_code,
                        };
                    });
                    // append an empty row for editing
                    newRows.push({
                        id: newRows.length + 1,
                        itemCode: "",
                        description: "",
                        quantity: 0,
                        unit: "",
                        priceAfterTax: 0,
                        priceBeforeTax: 0,
                        discount: 0,
                        total: 0,
                        selectedItemId: null,
                    });
                    setRows(newRows);
                }
            } catch (err) {
                console.error("Failed to load quotation", err);
            }
        };

        loadQuotation();
    }, [id, items, itemUnits]);

    // Reset branch when customer changes and auto-select first branch
    useEffect(() => {
        setBranch("");
        const customerBranches = branches.filter((b: any) => b.debtor_no === customer);
        if (customerBranches.length > 0) {
            setBranch(customerBranches[0].branch_code);
        }
    }, [customer, branches]);

    // Update credit and discount when customer changes
    useEffect(() => {
        if (customer) {
            const selectedCustomer = customers.find((c: any) => c.debtor_no === customer);
            if (selectedCustomer) {
                setDiscount(selectedCustomer.discount || 0);
                setPayment(selectedCustomer.payment_terms ? String(selectedCustomer.payment_terms) : "");
                setPriceList(selectedCustomer.sales_type ? String(selectedCustomer.sales_type) : "");
                // Update table rows discount
                setRows((prev) => prev.map((r) => ({ ...r, discount: selectedCustomer.discount || 0 })));
            }
        } else {
            setDiscount(0);
            setPayment("");
            setPriceList("");
            // Reset table rows discount
            setRows((prev) => prev.map((r) => ({ ...r, discount: 0 })));
        }
    }, [customer, customers]);

    // Update price column label when price list changes
    useEffect(() => {
        if (priceList) {
            const selected = priceLists.find((pl: any) => String(pl.id) === String(priceList));
            if (selected) {
                if (selected.taxIncl) {
                    setPriceColumnLabel("Price after Tax");
                } else {
                    setPriceColumnLabel("Price before Tax");
                }
            }
        } else {
            setPriceColumnLabel("Price after Tax");
        }
    }, [priceList, priceLists]);

    const selectedPriceList = useMemo(() => {
        return priceLists.find((pl: any) => String(pl.id) === String(priceList));
    }, [priceList, priceLists]);

    const unitPriceForRow = (row: { priceAfterTax: number; priceBeforeTax: number }) =>
        selectedPriceList?.taxIncl ? row.priceAfterTax : row.priceBeforeTax;

    // Update prices when price list changes
    useEffect(() => {
        if (priceList) {
            const updatePrices = async () => {
                const newRows = await Promise.all(
                    rows.map(async (row) => {
                        if (row.selectedItemId) {
                            const pricingList = await getSalesPricingByStockId(row.selectedItemId);
                            const itemData = await getItemById(row.selectedItemId).catch(() => null);
                            const { priceAfterTax, priceBeforeTax } = resolveSalesItemLinePrices({
                                pricingList,
                                stockId: String(row.selectedItemId),
                                salesTypeId: priceList,
                                salesTypes: priceLists,
                                currencyCode: customerCurrency,
                                homeCurrencyCode,
                                materialCost: Number(itemData?.material_cost ?? 0),
                            });

                            return {
                                ...row,
                                priceAfterTax,
                                priceBeforeTax,
                            };
                        }
                        return row;
                    })
                );
                try {
                    const same = JSON.stringify(newRows) === JSON.stringify(rows);
                    if (!same) setRows(newRows);
                } catch (e) {
                    setRows(newRows);
                }
            };
            updatePrices();
        }
    }, [priceList, customerCurrency, homeCurrencyCode]);

    const handlePlaceQuotation = async () => {
        if (!id) return alert("No quotation loaded");
        if (!customer || rows.length === 0) return alert("Missing data");

        try {
            const existing = await getSalesOrderByOrderNo(id);
            if (!existing) return alert("Quotation not found");

            // Build payload and increment version
            const payload: any = {
                order_no: existing.order_no,
                trans_type: 32,
                version: (existing.version || 0) + 1,
                type: 0,
                debtor_no: Number(customer),
                branch_code: Number(branch) || 0,
                reference: reference || existing.reference || "",
                ord_date: quotationDate,
                order_type: payment ? Number(payment) : existing.order_type,
                ship_via: existing.ship_via ?? 0,
                comments: comments || existing.comments || "",
                delivery_address: existing.delivery_address || null,
                contact_phone: existing.contact_phone || null,
                contact_email: existing.contact_email || null,
                deliver_to: existing.deliver_to || null,
                freight_cost: Number(shippingCharge || existing.freight_cost || 0),
                from_stk_loc: deliverFrom || existing.from_stk_loc || "",
                delivery_date: quotationDate,
                payment_terms: payment ? Number(payment) : existing.payment_terms,
                total: subTotal + Number(shippingCharge || 0),
                prep_amount: existing.prep_amount || 0,
                alloc: existing.alloc || 0,
            };

            await updateSalesOrder(existing.order_no, payload);

            // Manage details: update existing, create new, delete removed
            const existingDetails = await getSalesOrderDetailsByOrderNo(id);
            const existingById: Record<string, any> = {};
            existingDetails.forEach((d: any) => { existingById[String(d.id)] = d; });

            // rows containing src_id are updates, others are creates
            for (const r of rows) {
                if (!r.selectedItemId) continue; // skip empty
                const detailPayload: any = {
                    order_no: existing.order_no,
                    trans_type: 32,
                    stk_code: r.itemCode,
                    description: r.description,
                    qty_sent: 0, // Always 0 for quotations
                    unit_price: Number(unitPriceForRow(r) || 0),
                    price_before_tax: Number(r.priceBeforeTax || 0),
                    price_after_tax: Number(r.priceAfterTax || 0),
                    quantity: Number(r.quantity || 0),
                    invoiced: 0,
                    discount_percent: Number(r.discount || 0),
                };

                if (r.src_id) {
                    // update
                    try {
                        await updateSalesOrderDetail(r.src_id, detailPayload);
                        delete existingById[String(r.src_id)];
                    } catch (err) {
                        console.error("Failed to update detail", r.src_id, err);
                    }
                } else {
                    // create
                    try {
                        await createSalesOrderDetail(detailPayload);
                    } catch (err) {
                        console.error("Failed to create detail", err);
                    }
                }
            }

            // Any remaining in existingById were deleted in UI -> remove them
            for (const leftoverId of Object.keys(existingById)) {
                try {
                    await deleteSalesOrderDetail(leftoverId);
                } catch (err) {
                    console.error("Failed to delete detail", leftoverId, err);
                }
            }

            alert("Quotation updated successfully!");
            await new Promise((r) => setTimeout(r, 200));
            navigate("/sales/transactions/updated-sales-quotation-entry/success", { state: { orderNo: existing.order_no, reference, quotationDate } });
        } catch (error) {
            console.error("Failed to update quotation", error);
            alert("Failed to update quotation. See console for details.");
        }
    };

    const breadcrumbItems = [
        { title: "Transactions", href: "/sales/transactions/" },
        { title: "Modifying Sales Quotation" },
    ];

    const subTotal = rows.reduce((sum, r) => sum + r.total, 0);
    const documentTotal = subTotal + Number(shippingCharge || 0);

    const { summary: creditSummary, isLoading: creditLoading } = useCustomerCredit(
        customer || null,
        customers
    );

    const selectedPaymentTerm = useMemo(() => {
        return paymentTerms.find((pt: any) => String(pt.terms_indicator) === String(payment));
    }, [payment, paymentTerms]);

    const selectedPaymentType = useMemo(() => {
        const pt = selectedPaymentTerm?.payment_type;
        if (pt == null) return null;
        if (typeof pt === "number") return pt;
        return pt.id ?? pt.payment_type ?? null;
    }, [selectedPaymentTerm]);

    const showQuotationDeliveryDetails = selectedPaymentType === 3 || selectedPaymentType === 4;

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
                    <PageTitle title="Modifying Sales Quotation" />
                    <Breadcrumb breadcrumbs={breadcrumbItems} />
                </Box>

                <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)}>
                    Back
                </Button>
            </Box>
            {/* Form fields */}
            <Paper sx={{ p: 2, borderRadius: 2 }}>
                <Grid container spacing={2}>
                    <Grid item xs={12} sm={3}>
                        <Stack spacing={2}>
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
                            <CustomerCurrencyField customer={selectedCustomer} />
                            <TextField
                                label="Reference"
                                fullWidth
                                size="small"
                                value={reference}
                                InputProps={{ readOnly: true }}
                            />
                        </Stack>
                    </Grid>

                    <Grid item xs={12} sm={3}>
                        <Stack spacing={2}>
                            <CustomerCreditSummaryFields
                                summary={creditSummary}
                                documentTotal={documentTotal}
                                isLoading={creditLoading}
                                currencyCode={customerCurrency}
                            />
                            <TextField label="Customer Discount (%)" fullWidth size="small" value={discount} InputProps={{ readOnly: true }} />
                        </Stack>
                    </Grid>

                    <Grid item xs={12} sm={3}>
                        <Stack spacing={2}>
                            <TextField
                                select
                                fullWidth
                                label="Payment Type"
                                value={payment}
                                onChange={(e) => setPayment(e.target.value)}
                                size="small"
                                SelectProps={{
                                    renderValue: (selected) => {
                                        const sel = paymentTerms.find((pt: any) => String(pt.terms_indicator) === String(selected));
                                        return sel ? sel.description : (selected as string);
                                    },
                                }}
                            >
                                {paymentTerms.map((p: any) => (
                                    <MenuItem key={p.terms_indicator} value={p.terms_indicator}>
                                        {p.description}
                                    </MenuItem>
                                ))}
                            </TextField>
                            <TextField
                                select
                                fullWidth
                                label="Price List"
                                value={priceList}
                                onChange={(e) => setPriceList(e.target.value)}
                                size="small"
                            >
                                {priceLists.map((pl: any) => (
                                    <MenuItem key={pl.id} value={pl.id}>
                                        {pl.typeName}
                                    </MenuItem>
                                ))}
                            </TextField>
                        </Stack>
                    </Grid>

                    <Grid item xs={12} sm={3}>
                        <TextField
                            label="Quotation Date"
                            type="date"
                            fullWidth
                            size="small"
                            value={quotationDate}
                            onChange={(e) => setQuotationDate(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                        />
                    </Grid>
                </Grid>
            </Paper>
            {/* Items Table */}
            <Typography variant="subtitle1" sx={{ mb: 2, textAlign: 'center' }}>Sales Quotation Items</Typography>
            <TableContainer component={Paper}>
                <Table>
                    <TableHead sx={{ backgroundColor: "var(--pallet-lighter-blue)" }}>
                        <TableRow>
                            <TableCell>No</TableCell>
                            <TableCell>Item Code</TableCell>
                            <TableCell>Description</TableCell>
                            <TableCell>Quantity</TableCell>
                            <TableCell>Unit</TableCell>
                            <TableCell>{priceColumnLabel}</TableCell>
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
                                    <TextField
                                        size="small"
                                        value={row.itemCode}
                                        InputProps={{ readOnly: isLocked }}
                                        onChange={(e) => handleChange(row.id, "itemCode", e.target.value)}
                                    />
                                </TableCell>
                                <TableCell>
                                    <TextField
                                        select
                                        size="small"
                                        disabled={isLocked}
                                        value={row.description}
                                        onChange={async (e) => {
                                            const selected = items.find((item: any) => item.description === e.target.value);
                                            handleChange(row.id, "description", e.target.value);
                                            if (selected) {
                                                await handleItemChange(row.id, selected);
                                            }
                                        }}
                                    >
                                        {Object.entries(
                                            items.reduce((acc: any, item: any) => {
                                                const category = categories.find((c: any) => c.category_id === item.category_id)?.description || "Uncategorized";
                                                if (!acc[category]) acc[category] = [];
                                                acc[category].push(item);
                                                return acc;
                                            }, {} as Record<string, any[]>)
                                        ).map(([category, catItems]: [string, any[]]) => [
                                            <ListSubheader key={category}>{category}</ListSubheader>,
                                            ...catItems.map((item: any) => (
                                                <MenuItem key={item.stock_id} value={item.description}>
                                                    {item.description}
                                                </MenuItem>
                                            )),
                                        ])}
                                    </TextField>
                                </TableCell>
                                <TableCell>
                                    <FormattedNumberField
                                        size="small"
                                        value={row.quantity}
                                        InputProps={{ readOnly: isLocked }}
                                        onChange={(e) => handleChange(row.id, "quantity", Number(e.target.value))}
                                    />
                                </TableCell>
                                <TableCell>
                                    <TextField size="small" value={row.unit} InputProps={{ readOnly: true }} />
                                </TableCell>
                                <TableCell align="right">
                                    <CurrencyAmountInput
                                        value={priceColumnLabel === "Price before Tax" ? row.priceBeforeTax : row.priceAfterTax}
                                        currencyCode={customerCurrency}
                                        disabled={isLocked}
                                        onChange={(v) => handleChange(row.id, priceColumnLabel === "Price before Tax" ? "priceBeforeTax" : "priceAfterTax", v)}
                                    />
                                </TableCell>
                                <TableCell>
                                    <FormattedNumberField
                                        size="small"
                                        value={row.discount}
                                        InputProps={{ readOnly: true }}
                                    />
                                </TableCell>
                                <TableCell>{formatMoney(row.total)}</TableCell>
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
                            <TableCell colSpan={7}>Shipping Charge</TableCell>
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
                            <TableCell colSpan={7} sx={{ fontWeight: 600 }}>Sub-total</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>{formatMoney(subTotal)}</TableCell>
                            <TableCell></TableCell>
                        </TableRow>
                       
                        <TableRow>
                            <TableCell colSpan={7} sx={{ fontWeight: 600 }}>Amount Total</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>{formatMoney(subTotal + shippingCharge)}</TableCell>
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
                    {showQuotationDeliveryDetails ? "Quotation Delivery Details" : "Cash Payment"}
                </Typography>
                <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                        <TextField
                            select
                            fullWidth
                            label="Deliver From Location"
                            value={deliverFrom}
                            onChange={(e) => setDeliverFrom(e.target.value)}
                            size="small"
                        >
                            {locations.map((loc: any) => (
                                <MenuItem key={loc.loc_code} value={loc.loc_code}>
                                    {loc.location_name}
                                </MenuItem>
                            ))}
                        </TextField>
                    </Grid>

                    <Grid item xs={12} sm={6}>
                        <TextField
                            select
                            fullWidth
                            label="Cash Account"
                            value={cashAccount}
                            onChange={(e) => setCashAccount(e.target.value)}
                            size="small"
                        >
                            {/* {cashAccounts.map((acc: any) => (
                <MenuItem key={acc.id} value={acc.id}>
                  {acc.name}
                </MenuItem>
              ))} */}
               <MenuItem value="">Select Cash Account</MenuItem>
                        </TextField>
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
                        Cancel Quotation
                    </Button>
                    <Button disabled={!canEdit} variant="contained" color="primary" onClick={handlePlaceQuotation}>
                        Commit Quotation Changes
                    </Button>
                </Box>
            </Paper>
        </FormPageLayout>
    );
}
