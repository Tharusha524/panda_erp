import React, { useState, useMemo, useEffect, useRef } from "react";
import { FormPageLayout } from "../../../../components/Layout/FormPageLayout";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCustomers } from "../../../../api/Customer/AddCustomerApi";
import { getBranches } from "../../../../api/CustomerBranch/CustomerBranchApi";
import { getPaymentTerms } from "../../../../api/PaymentTerm/PaymentTermApi";
import { getSalesTypes } from "../../../../api/SalesMaintenance/salesService";
import { getInventoryLocations } from "../../../../api/InventoryLocation/InventoryLocationApi";
// import { getCashAccounts } from "../../../../api/Accounts/CashAccountsApi";
import ItemSearchSelect from "../../../../components/ItemSearchSelect";
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
import { getCompanies } from "../../../../api/CompanySetup/CompanySetupApi";
import { postSalesOrderWithDetails, generateProvisionalOrderNo, getSalesOrders } from "../../../../api/SalesOrders/SalesOrdersApi";
import { runTransactionSave } from "../../../../utils/transactionSave";
import AddedConfirmationModal from "../../../../components/AddedConfirmationModal";
import { getCostCenters } from "../../../../api/CostCenter/CostCenterApi";
import { useCustomerCredit } from "../../../../hooks/useCustomerCredit";
import CustomerCreditSummaryFields from "../../../../components/CustomerCreditSummaryFields";
import CustomerCurrencyField from "../../../../components/CustomerCurrencyField";
import CurrencyAmountInput from "../../../../components/CurrencyAmountInput";
import {
  customerPaymentTermId,
  customerSalesTypeId,
  customerCurrencyCode,
} from "../../../../utils/relationId";
import { resolveSalesItemLinePrices } from "../../../../utils/resolveSalesItemPrice";
import { useHomeCurrency } from "../../../../hooks/useHomeCurrency";
import { useTransactionMoney } from "../../../../hooks/useTransactionMoney";
import FormattedNumberField from "../../../../components/FormattedNumberField";
import { useAuth } from "../../../../context/AuthContext";

export default function SalesQuotationEntry() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { code: homeCurrencyCode } = useHomeCurrency();
    const { hasEditPermission } = useAuth();
    const canEdit = hasEditPermission('Sales quotations');

    const [open, setOpen] = useState(false);
    // ===== Form fields =====
    const [customer, setCustomer] = useState("");
    const [branch, setBranch] = useState("");
    const [reference, setReference] = useState("");
    const [discount, setDiscount] = useState(0);
    const [payment, setPayment] = useState("");
    const [priceList, setPriceList] = useState("");
    const [quotationDate, setQuotationDate] = useState(new Date().toISOString().split("T")[0]);
    const [dateError, setDateError] = useState("");
    const [deliverFrom, setDeliverFrom] = useState("");
    const [cashAccount, setCashAccount] = useState("");
    const [costCenter, setCostCenter] = useState("");
    const [comments, setComments] = useState("");
    const [shippingCharge, setShippingCharge] = useState(0);
    const [priceColumnLabel, setPriceColumnLabel] = useState("Price after Tax");

    // Additional fields for Quotation Delivery Details
    const [validUntil, setValidUntil] = useState("");
    const [deliverTo, setDeliverTo] = useState("");
    const [address, setAddress] = useState("");
    const [contactPhoneNumber, setContactPhoneNumber] = useState("");
    const [customerReference, setCustomerReference] = useState("");
    const [shippingCompany, setShippingCompany] = useState("");
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
    const { data: shippingCompanies = [] } = useQuery({ queryKey: ["shippingCompanies"], queryFn: getShippingCompanies });
    const { data: taxTypes = [] } = useQuery({ queryKey: ["taxTypes"], queryFn: getTaxTypes });

    // Fetch company setup
    const { data: companyData } = useQuery({ queryKey: ["company"], queryFn: getCompanies });
    const { data: costCenters = [] } = useQuery({ queryKey: ["costCenters"], queryFn: getCostCenters });

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
                discount: discount,
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
                                (field === "priceAfterTax" ? value : field === "priceBeforeTax" ? value : (priceColumnLabel.toLowerCase().includes("after") ? r.priceAfterTax : r.priceBeforeTax)) *
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

    // Auto-select first customer on load
    useEffect(() => {
        if (customers.length > 0 && !customer) {
            setCustomer(customers[0].debtor_no);
        }
    }, [customers, customer]);

    // Reset branch when customer changes and auto-select first branch
    useEffect(() => {
        const customerBranches = branches.filter((b: any) => b.debtor_no === customer);
        const newBranch = customerBranches.length > 0 ? customerBranches[0].branch_code : "";
        if (newBranch !== branch) setBranch(newBranch);
    }, [customer, branches]);

    // Update credit and discount when customer changes
    useEffect(() => {
        if (customer) {
            const selectedCustomer = customers.find((c: any) => String(c.debtor_no) === String(customer));
            if (selectedCustomer) {
                const newDiscount = selectedCustomer.discount || 0;
                const newPayment = customerPaymentTermId(selectedCustomer);
                const newPriceList = customerSalesTypeId(selectedCustomer);
                if (newDiscount !== discount) setDiscount(newDiscount);
                if (newPayment !== payment) setPayment(newPayment);
                if (newPriceList !== priceList) setPriceList(newPriceList);
                // Update table rows discount only if different
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

    // Update deliver to and address when branch changes
    useEffect(() => {
        if (branch) {
            const selectedBranch = branches.find((b: any) => b.branch_code === branch);
            if (selectedBranch) {
                setDeliverTo(selectedBranch.br_name || "");
                setAddress(selectedBranch.br_address || "");

                // Fetch tax group items for this branch
                if (selectedBranch.tax_group) {
                    getTaxGroupItemsByGroupId(selectedBranch.tax_group)
                        .then((items) => setTaxGroupItems(items))
                        .catch((err) => {
                            console.error("Failed to fetch tax group items:", err);
                            setTaxGroupItems([]);
                        });
                } else {
                    setTaxGroupItems([]);
                }
            }
        } else {
            setDeliverTo("");
            setAddress("");
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

    // === Additional derived fields for backend mapping ===
    const [submitting, setSubmitting] = useState(false);
    const [orderNo, setOrderNo] = useState<number>(1);
    // Synchronous guard against double-clicks: React state (`submitting`) only
    // disables the button after a re-render, which isn't fast enough to stop
    // two clicks fired in quick succession. This ref blocks the second one
    // immediately, before that render happens.
    const isSubmittingRef = useRef(false);

    // Helper to get selected customer object
    const customerName = selectedCustomer?.name || null;
    const customerPhone = selectedCustomer?.phone || selectedCustomer?.contact_phone || null;
    const customerEmail = selectedCustomer?.email || selectedCustomer?.contact_email || null;
    const customerAddr = selectedCustomer?.address || selectedCustomer?.delivery_address || address || null;

    const handlePlaceQuotation = async () => {
        if (isSubmittingRef.current) return;
        if (!customer) { alert("Select customer first"); return; }
        if (!branch) { alert("Select branch first"); return; }
        if (!priceList) { alert("Please select a price list."); return; }
        const orderTypeId = Number(priceList);
        if (!orderTypeId || !priceLists.some((pl: any) => Number(pl.id) === orderTypeId)) {
            alert("Please select a valid price list.");
            return;
        }
        if (rows.filter(r => r.itemCode && r.quantity > 0).length === 0) {
            alert("At least one item must be added to the quotation.");
            return;
        }
        isSubmittingRef.current = true;
        setSubmitting(true);
        try {
            const payload = {
                order_no: orderNo,
                trans_type: 32,
                version: 0,
                type: 0,
                debtor_no: Number(customer),
                branch_code: Number(branch),
                reference,
                ord_date: quotationDate,
                order_type: orderTypeId,
                ship_via: Number(shippingCompany) || 0,
                delivery_address: customerAddr || "",
                contact_phone: customerPhone,
                contact_email: customerEmail,
                deliver_to: customerName || "",
                freight_cost: Number(shippingCharge) || 0,
                from_stk_loc: deliverFrom || null,
                delivery_date: validUntil || quotationDate,
                payment_terms: payment ? Number(payment) : null,
                comments: comments || null,
                customer_ref: customerReference || null,
                cost_center_id: Number(costCenter) || null,
                total: subTotal + shippingCharge + (selectedPriceList?.taxIncl ? 0 : totalTaxAmount),
                prep_amount: 0,
                alloc: 0,
            };
            const detailsToPost = rows.filter((r) => r.selectedItemId && r.quantity > 0);
            const lines = detailsToPost.map((row) => ({
                stk_code: row.itemCode,
                description: row.description,
                qty_sent: 0,
                unit_price: unitPriceForRow(row),
                quantity: row.quantity,
                invoiced: 0,
                discount_percent: Number(row.discount) || 0,
            }));

            const saveResult = await runTransactionSave(() =>
                postSalesOrderWithDetails({ header: payload as any, lines })
            );

            if (saveResult.ok === false) {
                alert(saveResult.message || "Failed to save quotation.");
                return;
            }

            const actualOrderNo = saveResult.data.order_no ?? orderNo;
            setOpen(true);
            await queryClient.invalidateQueries({ queryKey: ["salesOrders"] });
            navigate("/sales/transactions/sales-quotation-entry/success", {
                state: { orderNo: actualOrderNo, reference, quotationDate }
            });
        } catch (e: any) {
            console.error("Save error", e);
            const detail = e?.response?.data?.message ?? e?.message ?? "Unknown error";
            alert("Failed to save: " + detail);
        } finally {
            isSubmittingRef.current = false;
            setSubmitting(false);
        }
    };

    const breadcrumbItems = [
        { title: "Transactions", href: "/sales/transactions/" },
        { title: "New Sales Quotation Entry" },
    ];

    // Only calculate subtotal for completed rows (all rows except the last one which is being edited)
    const subTotal = rows.slice(0, -1).reduce((sum, r) => sum + r.total, 0);

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

    const showQuotationDeliveryDetails = selectedPaymentType === 3 || selectedPaymentType === 4;

    // Fetch fiscal years
    const { data: fiscalYears = [] } = useQuery({ queryKey: ["fiscalYears"], queryFn: getFiscalYears });

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

        setDateError("");
        return true;
    };

    // Handle date change with validation
    const handleDateChange = (value: string) => {
        setQuotationDate(value);
        validateDate(value);
    };

    // Fetch sales orders to determine next order number
    const { data: salesOrders = [] } = useQuery({ queryKey: ["salesOrders"], queryFn: getSalesOrders });

    // Set order number based on existing sales orders
    useEffect(() => {
        if (salesOrders.length > 0) {
            const maxOrderNo = Math.max(...salesOrders.map((o: any) => o.order_no));
            setOrderNo(maxOrderNo + 1);
        }
    }, [salesOrders]);

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
            setQuotationDate(initialDate);
            validateDate(initialDate); // Validate immediately to show error if invalid
        }
    }, [selectedFiscalYear]);

    // Set reference when fiscal year loads (or fallback when DB empty)
    useEffect(() => {
        if (!selectedFiscalYear) return;

        // Determine year: prefer fiscal year start if available, otherwise use current calendar year
        const year = selectedFiscalYear
            ? new Date(selectedFiscalYear.fiscal_year_from).getFullYear()
            : new Date().getFullYear();

        // Fetch existing references to generate next sequential number
        // Only consider stock moves of the same transaction type (17 = adjustment)
        getSalesOrders()
            .then((salesOrders) => {
                const orders = Array.isArray(salesOrders) ? salesOrders : [];
                const yearReferences = orders
                    .filter((order: any) => order && order.trans_type === 32 && order.reference && String(order.reference).endsWith(`/${year}`))
                    .map((order: any) => String(order.reference))
                    .map((ref: string) => {
                        const match = String(ref).match(/^(\d{3})\/\d{4}$/);
                        return match ? parseInt(match[1], 10) : 0;
                    })
                    .filter((num: number) => !isNaN(num) && num > 0);

                const nextNumber = yearReferences.length > 0 ? Math.max(...yearReferences) + 1 : 1;
                const formattedNumber = nextNumber.toString().padStart(3, '0');
                setReference(`${formattedNumber}/${year}`);
            })
            .catch((error) => {
                console.error("Error fetching sales orders for reference generation:", error);
                // Fallback to 001 if there's an error or DB is empty
                setReference(`001/${year}`);
            });
    }, [selectedFiscalYear]);

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
                    <PageTitle title="New Sales Quotation Entry" />
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
                                value={String(priceList || "")}
                                onChange={(e) => setPriceList(e.target.value)}
                                size="small"
                            >
                                {priceLists.map((pl: any) => (
                                    <MenuItem key={pl.id} value={String(pl.id)}>
                                        {pl.typeName}
                                    </MenuItem>
                                ))}
                            </TextField>
                        </Stack>
                    </Grid>

                    <Grid item xs={12} sm={3}>
                        <Stack spacing={2}>
                            <TextField
                                label="Quotation Date"
                                type="date"
                                fullWidth
                                size="small"
                                value={quotationDate}
                                onChange={(e) => handleDateChange(e.target.value)}
                                InputLabelProps={{ shrink: true }}
                                error={!!dateError}
                                helperText={dateError}
                            />
                            <TextField
                                select
                                fullWidth
                                label="Cost Center"
                                value={costCenter}
                                onChange={(e) => setCostCenter(e.target.value)}
                                size="small"
                            >
                                <MenuItem value="">None</MenuItem>
                                {costCenters.map((cc: any) => (
                                    <MenuItem key={cc.id} value={cc.id}>
                                        {cc.name}
                                    </MenuItem>
                                ))}
                            </TextField>
                        </Stack>
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
                                    <ItemSearchSelect
                                        displayField="code"
                                        hideLabel
                                        disabled={isLocked}
                                        selectedStockId={String(row.selectedItemId ?? row.itemCode ?? "")}
                                        value={row.description}
                                        items={items as any[]}
                                        categories={categories.map((c: any) => ({
                                            id: c.category_id,
                                            category_name: c.description,
                                        }))}
                                        onSelect={(selected) => {
                                            if (selected) {
                                                handleItemChange(row.id, selected);
                                            }
                                        }}
                                    />
                                </TableCell>
                                <TableCell>
                                    <ItemSearchSelect
                                        hideLabel
                                        disabled={isLocked}
                                        value={row.description}
                                        selectedStockId={String(row.selectedItemId ?? row.itemCode ?? "")}
                                        items={items as any[]}
                                        categories={categories.map((c: any) => ({
                                            id: c.category_id,
                                            category_name: c.description,
                                        }))}
                                        onSelect={(selected) => {
                                            if (selected) {
                                                handleItemChange(row.id, selected);
                                            }
                                        }}
                                    />
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
                                            disabled={!canEdit || !row.selectedItemId || !(Number(row.quantity) > 0)}
                                        >
                                            Add
                                        </Button>
                                    ) : (
                                        <Stack direction="row" spacing={1} justifyContent="center">
                                            {editingRowId === row.id ? (
                                                <Button
                                                    variant="contained"
                                                    size="small"
                                                    disabled={!canEdit}
                                                    onClick={() => setEditingRowId(null)}
                                                >
                                                    Done
                                                </Button>
                                            ) : (
                                                <Button
                                                    variant="outlined"
                                                    size="small"
                                                    startIcon={<EditIcon />}
                                                    disabled={!canEdit}
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
                                                disabled={!canEdit}
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
                                <Button
                                    variant="contained"
                                    size="small"
                                    disabled={!canEdit}
                                    onClick={() => {
                                        // Force re-render to update totals
                                        setRows([...rows]);
                                    }}
                                >
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
                        Cancel Quotation
                    </Button>
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={handlePlaceQuotation}
                        disabled={submitting || !canEdit}
                    >
                        {submitting ? "Saving..." : "Place Quotation"}
                    </Button>
                </Box>
            </Paper>
            <AddedConfirmationModal
                open={open}
                title="Success"
                content="Sales Invoice has been added successfully!"
                addFunc={async () => { }}
                handleClose={() => setOpen(false)}
            />
        </FormPageLayout>
    );
}
