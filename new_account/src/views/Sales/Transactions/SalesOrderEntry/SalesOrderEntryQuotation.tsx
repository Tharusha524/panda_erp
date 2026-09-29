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
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { getShippingCompanies } from "../../../../api/ShippingCompany/ShippingCompanyApi";
import { getTaxGroupItemsByGroupId } from "../../../../api/Tax/TaxGroupItemApi";
import { getTaxTypes } from "../../../../api/Tax/taxServices";
import Breadcrumb from "../../../../components/BreadCrumb";
import PageTitle from "../../../../components/PageTitle";
import theme from "../../../../theme";
import { getFiscalYears } from "../../../../api/FiscalYear/FiscalYearApi";
import { createSalesOrder, generateProvisionalOrderNo, getSalesOrders, getSalesOrderByOrderNo } from "../../../../api/SalesOrders/SalesOrdersApi";
import { createSalesOrderDetail, getSalesOrderDetailsByOrderNo, updateSalesOrderDetail } from "../../../../api/SalesOrders/SalesOrderDetailsApi";
import AddedConfirmationModal from "../../../../components/AddedConfirmationModal";
import {
  isCashSalePaymentTerm,
  validateCustomerCreditForSale,
} from "../../../../utils/customerCredit";
import {
  isCashPaymentTerm,
  isPrepaymentPaymentTerm,
  salesOrderPrepAmount,
} from "../../../../utils/paymentTermHelpers";
import { useCustomerCredit } from "../../../../hooks/useCustomerCredit";
import CustomerCreditSummaryFields from "../../../../components/CustomerCreditSummaryFields";
import CustomerCurrencyField from "../../../../components/CustomerCurrencyField";
import CurrencyAmountInput from "../../../../components/CurrencyAmountInput";
import { customerCurrencyCode } from "../../../../utils/relationId";
import { resolveSalesItemLinePrices } from "../../../../utils/resolveSalesItemPrice";
import { useHomeCurrency } from "../../../../hooks/useHomeCurrency";
import { useTransactionMoney } from "../../../../hooks/useTransactionMoney";
import { useNextFiscalYearReference } from "../../../../hooks/useNextFiscalYearReference";
import FormattedNumberField from "../../../../components/FormattedNumberField";
import { useAuth } from "../../../../context/AuthContext";

export default function SalesOrderEntryQuotation() {
  const { hasEditPermission } = useAuth();
  const canEdit = hasEditPermission('Sales orders edition');
    const navigate = useNavigate();
    const location = useLocation();
    const queryClient = useQueryClient();
    const { code: homeCurrencyCode } = useHomeCurrency();
    const [open, setOpen] = useState(false);
    const [actualOrderNo, setActualOrderNo] = useState<number | null>(null);
    // ===== Form fields =====
    const [customer, setCustomer] = useState("");
    const [branch, setBranch] = useState("");
    const [reference, setReference] = useState("");
    const [discount, setDiscount] = useState(0);
    const [payment, setPayment] = useState("");
    const [priceList, setPriceList] = useState("");
    const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0]);

    // Saved as trans_type 30 (Sales Order) — see trans_type: 30 below.
    const { reference: nextOrderReference } = useNextFiscalYearReference(30, {
        asOfDate: orderDate,
    });
    const [deliverFrom, setDeliverFrom] = useState("");
    const [cashAccount, setCashAccount] = useState("");
    const [comments, setComments] = useState("");
    const [shippingCharge, setShippingCharge] = useState(0);
    const [priceColumnLabel, setPriceColumnLabel] = useState("Price After Tax");
    // A completed row (not the last, always-open one) is locked until its
    // "Edit" button is clicked — before that, its fields can't be changed.
    const [editingRowId, setEditingRowId] = useState<number | null>(null);

    // Additional fields for Quotation Delivery Details
    const [validUntil, setValidUntil] = useState("");
    const [deliverTo, setDeliverTo] = useState("");
    const [address, setAddress] = useState("");
    const [contactPhoneNumber, setContactPhoneNumber] = useState("");
    const [customerReference, setCustomerReference] = useState("");
    const [shippingCompany, setShippingCompany] = useState("");

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
    const { data: shippingCompanies = [] } = useQuery({ queryKey: ["shippingCompanies"], queryFn: getShippingCompanies });
    const { data: taxTypes = [] } = useQuery({ queryKey: ["taxTypes"], queryFn: getTaxTypes });

    // ===== Tax-related state =====
    const [taxGroupItems, setTaxGroupItems] = useState<any[]>([]);

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
                                (field === "priceAfterTax" ? value : field === "priceBeforeTax" ? value : r.priceAfterTax || r.priceBeforeTax) *
                                (1 - (field === "discount" ? value : r.discount) / 100)
                                : r.total,
                    }
                    : r
            )
        );
    };

    const handleItemChange = async (rowId: number, selectedItem: any) => {
        handleChange(rowId, "description", selectedItem.description);
        handleChange(rowId, "itemCode", selectedItem.stock_id);
        handleChange(rowId, "selectedItemId", selectedItem.stock_id);
        handleChange(rowId, "quantity", 1);
        const itemData = await getItemById(selectedItem.stock_id);
        if (itemData) {
            const unitName = itemUnits.find((u: any) => u.id === itemData.units)?.name || "";
            handleChange(rowId, "unit", unitName);
            // Fetch pricing
            const pricingList = await getSalesPricingByStockId(selectedItem.stock_id);
            const { priceAfterTax, priceBeforeTax } = resolveSalesItemLinePrices({
                pricingList,
                stockId: selectedItem.stock_id,
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

    // ===== Auto-generate reference =====

    // Auto-select first customer on load (same behavior as SalesQuotationEntry)
    useEffect(() => {
        if (customers.length > 0 && !customer) {
            setCustomer(customers[0].debtor_no);
        }
    }, [customers, customer]);

    // Reset branch when customer changes and auto-select first branch
    useEffect(() => {
        const customerBranches = branches.filter((b: any) => b.debtor_no === customer);
        const newBranch = customerBranches.length > 0 ? customerBranches[0].branch_code : "";
        if (!branch && newBranch) setBranch(newBranch);
    }, [customer, branches]);

    // Fetch tax group items when branch changes
    useEffect(() => {
        if (branch) {
            const selectedBranch = branches.find((b: any) => b.branch_code === branch);
            if (selectedBranch?.tax_group) {
                getTaxGroupItemsByGroupId(selectedBranch.tax_group)
                    .then((items) => setTaxGroupItems(items))
                    .catch((err) => {
                        console.error("Failed to fetch tax group items:", err);
                        setTaxGroupItems([]);
                    });
            } else {
                setTaxGroupItems([]);
            }
        } else {
            setTaxGroupItems([]);
        }
    }, [branch, branches]);

    // Update price column label when price list changes
    useEffect(() => {
        if (priceList) {
            const selected = priceLists.find((pl: any) => pl.id === priceList);
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

    // Update prices when price list changes (match both sales_type and stock_id)
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

    // Update credit and discount when customer changes
    useEffect(() => {
        if (customer) {
            const selectedCustomer = customers.find((c: any) => c.debtor_no === customer);
            if (selectedCustomer) {
                const newDiscount = selectedCustomer.discount || 0;
                const newPayment = selectedCustomer.payment_terms ? String(selectedCustomer.payment_terms) : "";
                const newPriceList = selectedCustomer.sales_type ? String(selectedCustomer.sales_type) : "";
                if (newDiscount !== discount) setDiscount(newDiscount);
                if (newPayment !== payment) setPayment(newPayment);
                if (newPriceList !== priceList) setPriceList(newPriceList);
                setRows((prev) => {
                    const updated = prev.map((r) => ({ ...r, discount: newDiscount }));
                    try {
                        const same = JSON.stringify(updated) === JSON.stringify(prev);
                        return same ? prev : updated;
                    } catch (e) {
                        return updated;
                    }
                });
            }
        } else {
            if (discount !== 0) setDiscount(0);
            if (payment !== "") setPayment("");
            if (priceList !== "") setPriceList("");
            setRows((prev) => {
                const updated = prev.map((r) => ({ ...r, discount: 0 }));
                try {
                    const same = JSON.stringify(updated) === JSON.stringify(prev);
                    return same ? prev : updated;
                } catch (e) {
                    return updated;
                }
            });
        }
    }, [customer, customers]);

    // === Additional derived fields for backend mapping ===
    const [submitting, setSubmitting] = useState(false);
    const [orderNo, setOrderNo] = useState<number>(1);

    // Helper to get selected customer object
    const customerName = selectedCustomer?.name || null;
    const customerPhone = selectedCustomer?.phone || selectedCustomer?.contact_phone || null;
    const customerEmail = selectedCustomer?.email || selectedCustomer?.contact_email || null;
    const customerAddr = selectedCustomer?.address || selectedCustomer?.delivery_address || address || null;

    // Fetch fiscal years
    const { data: fiscalYears = [] } = useQuery({ queryKey: ["fiscalYears"], queryFn: getFiscalYears });

    // Fetch sales orders to determine next order number
    const { data: salesOrders = [] } = useQuery({ queryKey: ["salesOrders"], queryFn: getSalesOrders });

    // Set order number based on existing sales orders
    useEffect(() => {
        if (salesOrders.length > 0) {
            const maxOrderNo = Math.max(...salesOrders.map((o: any) => o.order_no));
            setOrderNo(maxOrderNo + 1);
        }
    }, [salesOrders]);

    // Auto-generate reference based on fiscal year — uses the shared
    // TransactionReferenceService (via useNextFiscalYearReference) so this follows
    // the Sales Order type's configured Prefix/Pattern under Setup > Transaction
    // References, instead of a hardcoded "NNN/year" format.
    useEffect(() => {
        if (nextOrderReference) {
            setReference(nextOrderReference);
        }
    }, [nextOrderReference]);

    // Handle quotation data if coming from quotation success
    useEffect(() => {
        const state = location.state;
        if (state && state.orderNo && items.length > 0 && itemUnits.length > 0) {
            const fetchQuotation = async () => {
                try {
                    const quotation = await getSalesOrderByOrderNo(state.orderNo);
                    if (quotation && quotation.trans_type === 32) { // Ensure it's a quotation
                        setCustomer(String(quotation.debtor_no));
                        setBranch(String(quotation.branch_code));
                        setPriceList(String(quotation.order_type));
                        setComments(`Sales Quotation # ${state.orderNo}`);
                        // Fetch details
                        const details = await getSalesOrderDetailsByOrderNo(state.orderNo);
                        if (details.length > 0) {
                            const newRows = details.map((detail: any, index: number) => {
                                const item = items.find((i: any) => i.stock_id === detail.stk_code);
                                const unitName = item ? itemUnits.find((u: any) => u.id === item.units)?.name || "" : "";
                                return {
                                    id: index + 1,
                                    itemCode: detail.stk_code,
                                    description: detail.description,
                                    quantity: detail.quantity,
                                    unit: unitName,
                                    priceAfterTax: detail.unit_price,
                                    priceBeforeTax: detail.unit_price,
                                    discount: detail.discount_percent || 0,
                                    total: detail.quantity * detail.unit_price * (1 - (detail.discount_percent || 0) / 100),
                                    selectedItemId: detail.stk_code,
                                };
                            });
                            // Add empty row at end
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
                    }
                } catch (error) {
                    console.error("Error fetching quotation data:", error);
                }
            };
            fetchQuotation();
        }
    }, [location.state, items, itemUnits]);

    const handlePlaceQuotation = async () => {
        if (!customer) { alert("Select customer first"); return; }
        if (!branch) { alert("Select branch first"); return; }
        if (!deliverFrom) { alert("Select deliver-from location"); return; }
        if (rows.filter(r => r.itemCode && r.quantity > 0).length === 0) {
            alert("At least one item must be added to the order.");
            return;
        }
        const creditError = validateCustomerCreditForSale({
            summary: creditSummary,
            documentTotal,
                skipCreditCheck:
                    isCashSalePaymentTerm(paymentTerms, payment) ||
                    isPrepaymentPaymentTerm(paymentTerms, payment),
        });
        if (creditError) {
            alert(creditError);
            return;
        }
        setSubmitting(true);
        try {
            const payload = {
                order_no: orderNo,
                trans_type: 30,
                version: 0,
                type: 0,
                debtor_no: Number(customer),
                branch_code: Number(branch),
                reference,
                ord_date: orderDate,
                order_type: Number(priceList) || 0,
                ship_via: Number(shippingCompany) || 0,
                delivery_address: customerAddr,
                contact_phone: customerPhone,
                contact_email: customerEmail,
                deliver_to: customerName,
                freight_cost: 0,
                from_stk_loc: deliverFrom,
                delivery_date: validUntil || orderDate,
                payment_terms: payment ? Number(payment) : null,
                customer_ref: customerReference || null,
                comments: comments || null,
                total: subTotal + shippingCharge + (selectedPriceList?.taxIncl ? 0 : totalTaxAmount),
                prep_amount: salesOrderPrepAmount(
                    paymentTerms,
                    payment,
                    subTotal + shippingCharge + (selectedPriceList?.taxIncl ? 0 : totalTaxAmount)
                ),
                alloc: 0,
            };
            console.log("Posting sales order payload", payload);
            const response = await createSalesOrder(payload as any);
            const actualOrderNo = response.order_no || orderNo;
            setActualOrderNo(actualOrderNo);
            // If this page was opened from a quotation, update the existing quotation details (trans_type === 32)
            const state = location.state as any;
            if (state && state.orderNo) {
                try {
                    const existingDetails = await getSalesOrderDetailsByOrderNo(state.orderNo);
                    for (const ed of existingDetails) {
                        if (Number(ed.trans_type) === 32) {
                            try {
                                const updated = { ...ed, qty_sent: 1 };
                                await updateSalesOrderDetail(ed.id, updated);
                            } catch (err) {
                                console.warn("Failed to update quotation detail qty_sent=1", ed, err);
                            }
                        }
                    }
                } catch (err) {
                    console.warn("Failed to fetch/update existing quotation details:", err);
                }
            }

            const detailsToPost = rows.filter(r => r.selectedItemId);
            for (const row of detailsToPost) {
                const unitPrice = priceColumnLabel === "Price after Tax" ? row.priceAfterTax : row.priceBeforeTax;
                const detailPayload = {
                    order_no: actualOrderNo,
                    trans_type: 30,
                    stk_code: row.itemCode,
                    description: row.description,
                    qty_sent: 0,
                    unit_price: unitPrice,
                    quantity: row.quantity,
                    invoiced: 0,
                    discount_percent: discount,
                };
                console.log("Posting sales order detail", detailPayload);
                await createSalesOrderDetail(detailPayload);
            }
            // alert("Saved to sales_orders (order_no: " + actualOrderNo + ")");
             setOpen(true);
            await queryClient.invalidateQueries({ queryKey: ["salesOrders"] });
            await queryClient.invalidateQueries({ queryKey: ["customerCreditSummary", customer] });
            // navigate("/sales/transactions/sales-order-entry/success", { state: { orderNo: actualOrderNo, reference, orderDate } });
        } catch (e: any) {
            console.error("Save error", e);
            const detail = e?.response?.data ? JSON.stringify(e.response.data) : (e?.message || 'Unknown error');
            alert("Failed to save: " + detail);
        } finally {
            setSubmitting(false);
        }
    };

    const breadcrumbItems = [
        { title: "Transactions", href: "/sales/transactions/" },
        { title: "Sales Order Entry" },
    ];

    // Match SalesQuotationEntry subtotal behavior: exclude the last-edit row
    const subTotal = rows.slice(0, -1).reduce((sum, r) => sum + r.total, 0);

    // Calculate taxes if taxIncl is true
    const selectedPriceList = useMemo(() => {
        return priceLists.find((pl: any) => String(pl.id) === String(priceList));
    }, [priceList, priceLists]);

    const taxCalculations = useMemo(() => {
        if (taxGroupItems.length === 0) {
            return [];
        }

        // Calculate tax amounts for each tax type
        return taxGroupItems.map((item: any) => {
            const taxTypeData = taxTypes.find((t: any) => t.id === item.tax_type_id);
            const taxRate = taxTypeData?.default_rate || 0;
            const taxName = taxTypeData?.description || "Tax";

            let taxAmount = 0;
            if (selectedPriceList?.taxIncl) {
                // For prices that include tax, we need to extract the tax amount
                // Tax amount = subtotal - (subtotal / (1 + rate/100))
                taxAmount = subTotal - (subTotal / (1 + taxRate / 100));
            } else {
                // For prices that don't include tax, calculate tax on subtotal
                // Tax amount = subtotal * (rate/100)
                taxAmount = subTotal * (taxRate / 100);
            }

            return {
                name: taxName,
                rate: taxRate,
                amount: taxAmount,
            };
        });
    }, [selectedPriceList, taxGroupItems, taxTypes, subTotal]);

    const totalTaxAmount = taxCalculations.reduce((sum, tax) => sum + tax.amount, 0);

    const documentTotal =
        subTotal + shippingCharge + (selectedPriceList?.taxIncl ? 0 : totalTaxAmount);

    const { summary: creditSummary, isLoading: creditLoading } = useCustomerCredit(
        customer || null,
        customers
    );

    // Find currently selected payment term object so we can inspect its payment_type
    const selectedPaymentTerm = useMemo(() => {
        return paymentTerms.find((pt: any) => String(pt.terms_indicator) === String(payment));
    }, [payment, paymentTerms]);

    const selectedPaymentType = useMemo(() => {
        const pt = selectedPaymentTerm?.payment_type;
        if (pt == null) return null;
        if (typeof pt === "number") return pt;
        // try common id fields when payment_type is an object
        return pt.id ?? pt.payment_type ?? null;
    }, [selectedPaymentTerm]);

    const showQuotationDeliveryDetails =
        !isCashPaymentTerm(paymentTerms, payment) &&
        !isPrepaymentPaymentTerm(paymentTerms, payment) &&
        (selectedPaymentType === 3 || selectedPaymentType === 4);

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
                    <PageTitle title="Sales Order Entry" />
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
                                // Ensure the selected value shows the human-friendly `description`
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
                            label="Order Date"
                            type="date"
                            fullWidth
                            size="small"
                            value={orderDate}
                            onChange={(e) => setOrderDate(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                        />
                    </Grid>
                </Grid>
            </Paper>
            {/* Items Table */}
            <Typography variant="subtitle1" sx={{ mb: 2, textAlign: 'center' }}>Sales Order Items</Typography>
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
                                        onChange={(e) => {
                                            const selected = items.find((item: any) => item.description === e.target.value);
                                            if (selected) {
                                                handleItemChange(row.id, selected);
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

                        {/* Show tax breakdown */}
                        {taxCalculations.length > 0 && (
                            <>
                                <TableRow>
                                    <TableCell colSpan={9} sx={{ fontWeight: 600, fontStyle: 'italic', color: 'text.secondary' }}>
                                        {selectedPriceList?.taxIncl ? "Taxes Included:" : "Taxes:"}
                                    </TableCell>
                                </TableRow>
                                {taxCalculations.map((tax, idx) => (
                                    <TableRow key={idx}>
                                        <TableCell colSpan={7} sx={{ pl: 4 }}>
                                            {tax.name} ({tax.rate}%)
                                        </TableCell>
                                        <TableCell>{formatMoney(tax.amount)}</TableCell>
                                        <TableCell></TableCell>
                                    </TableRow>
                                ))}
                            </>
                        )}

                        <TableRow>
                            <TableCell colSpan={7} sx={{ fontWeight: 600 }}>Amount Total</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>
                                {formatMoney(subTotal + shippingCharge + (selectedPriceList?.taxIncl ? 0 : totalTaxAmount))}
                            </TableCell>
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
                    {showQuotationDeliveryDetails ? (
                        <>
                            <Grid item xs={12} sm={6}>
                                <Stack spacing={2}>
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
                                    <TextField
                                        label="Valid Until"
                                        type="date"
                                        fullWidth
                                        size="small"
                                        value={validUntil}
                                        onChange={(e) => setValidUntil(e.target.value)}
                                        InputLabelProps={{ shrink: true }}
                                    />
                                    <TextField
                                        label="Deliver To"
                                        fullWidth
                                        size="small"
                                        value={deliverTo}
                                        onChange={(e) => setDeliverTo(e.target.value)}
                                    />
                                    <TextField
                                        label="Address"
                                        fullWidth
                                        multiline
                                        rows={2}
                                        size="small"
                                        value={address}
                                        onChange={(e) => setAddress(e.target.value)}
                                    />
                                </Stack>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <Stack spacing={2}>
                                    <TextField
                                        label="Contact Phone Number"
                                        fullWidth
                                        size="small"
                                        value={contactPhoneNumber}
                                        onChange={(e) => setContactPhoneNumber(e.target.value)}
                                    />
                                    <TextField
                                        label="Customer Reference"
                                        fullWidth
                                        size="small"
                                        value={customerReference}
                                        onChange={(e) => setCustomerReference(e.target.value)}
                                    />
                                    <TextField
                                        select
                                        fullWidth
                                        label="Shipping Company"
                                        value={shippingCompany}
                                        onChange={(e) => setShippingCompany(e.target.value)}
                                        size="small"
                                    >
                                        {shippingCompanies.map((sc: any) => (
                                            <MenuItem key={sc.shipper_id} value={sc.shipper_id}>
                                                {sc.shipper_name}
                                            </MenuItem>
                                        ))}
                                    </TextField>
                                    <TextField
                                        fullWidth
                                        multiline
                                        rows={2}
                                        label="Comments"
                                        value={comments}
                                        onChange={(e) => setComments(e.target.value)}
                                    />
                                </Stack>
                            </Grid>
                        </>
                    ) : (
                        <>
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
                                    fullWidth
                                    label="Cash Account"
                                    value={cashAccount}
                                    size="small"
                                    InputProps={{ readOnly: true }}
                                />
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
                        </>
                    )}
                </Grid>

                <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2, gap: 2 }}>
                    <Button variant="outlined" onClick={() => navigate(-1)}>
                        Cancel Order
                    </Button>
                    <Button disabled={!canEdit} variant="contained" color="primary" onClick={handlePlaceQuotation}>
                        Place Order
                    </Button>
                </Box>
            </Paper>
            <AddedConfirmationModal
                open={open}
                title="Success"
                content="Sales Order Entry has been added successfully!"
                addFunc={async () => { }}
                handleClose={() => setOpen(false)}
                onSuccess={() => {
                    // Form was already cleared on successful submission
                   navigate("/sales/transactions/sales-order-entry/success", { state: { orderNo: actualOrderNo, reference, orderDate } });
                }}
            />
        </FormPageLayout>
    );
}
