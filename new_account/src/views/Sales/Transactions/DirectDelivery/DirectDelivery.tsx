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
import { getBankAccounts } from "../../../../api/BankAccount/BankAccountApi";
import { getSalesPosList } from "../../../../api/SalePos/SalePosApi";
import { getCompanies } from "../../../../api/CompanySetup/CompanySetupApi";
import ItemSearchSelect from "../../../../components/ItemSearchSelect";
import { getItems, getItemById } from "../../../../api/Item/ItemApi";
import { getItemUnits } from "../../../../api/ItemUnit/ItemUnitApi";
import { getItemCategories } from "../../../../api/ItemCategories/ItemCategoriesApi";
import { getSalesPricingByStockId } from "../../../../api/SalesPricing/SalesPricingApi";
import { getShippingCompanies } from "../../../../api/ShippingCompany/ShippingCompanyApi";
import { getFiscalYears } from "../../../../api/FiscalYear/FiscalYearApi";
import { getSalesOrders, getSalesOrderByOrderNo } from "../../../../api/SalesOrders/SalesOrdersApi";
import { getSalesOrderDetailsByOrderNo } from "../../../../api/SalesOrders/SalesOrderDetailsApi";
import { getDebtorTrans } from "../../../../api/DebtorTrans/DebtorTransApi";
import { getTaxGroupItemsByGroupId } from "../../../../api/Tax/TaxGroupItemApi";
import { getTaxTypes } from "../../../../api/Tax/taxServices";
import { getStockMoves } from "../../../../api/StockMoves/StockMovesApi";
import { directSalesDelivery } from "../../../../api/SalesDelivery/SalesDeliveryApi";
import { useNextFiscalYearReference } from "../../../../hooks/useNextFiscalYearReference";
import Breadcrumb from "../../../../components/BreadCrumb";
import PageTitle from "../../../../components/PageTitle";
import theme from "../../../../theme";
import AddedConfirmationModal from "../../../../components/AddedConfirmationModal";
import {
  isCashSalePaymentTerm,
  validateCustomerCreditForSale,
} from "../../../../utils/customerCredit";
import { useCustomerCredit } from "../../../../hooks/useCustomerCredit";
import CustomerCreditSummaryFields from "../../../../components/CustomerCreditSummaryFields";
import CustomerCurrencyField from "../../../../components/CustomerCurrencyField";
import CurrencyAmountInput from "../../../../components/CurrencyAmountInput";
import {
    bankAccountLabel,
    relationId,
    sortCashBankAccounts,
} from "../../../../utils/cashBankAccount";
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

export default function DirectDelivery() {
  const { hasEditPermission } = useAuth();
  const canEdit = hasEditPermission('Direct sales delivery entry');
    const navigate = useNavigate();
    const location = useLocation();
    const queryClient = useQueryClient();
    const { code: homeCurrencyCode } = useHomeCurrency();

    const [open, setOpen] = useState(false);
    // ===== Form fields =====
    const [customer, setCustomer] = useState("");
    const [branch, setBranch] = useState("");
    const [reference, setReference] = useState("");
    const [discount, setDiscount] = useState(0);
    const [payment, setPayment] = useState("");
    const [priceList, setPriceList] = useState("");
    const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split("T")[0]);

    const { reference: nextDeliveryReference } = useNextFiscalYearReference(13, {
        asOfDate: deliveryDate,
    });
    const [deliverFrom, setDeliverFrom] = useState("");
    const [cashAccount, setCashAccount] = useState("");
    const [comments, setComments] = useState("");
    const [shippingCharge, setShippingCharge] = useState(0);
    const [priceColumnLabel, setPriceColumnLabel] = useState("Price After Tax");
    // A completed row (not the last, always-open one) is locked until its
    // "Edit" button is clicked — before that, its fields can't be changed.
    const [editingRowId, setEditingRowId] = useState<number | null>(null);
    const [dateError, setDateError] = useState("");

    // Tax calculation state
    const [taxGroupItems, setTaxGroupItems] = useState<any[]>([]);

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
    const { data: items = [] } = useQuery({ queryKey: ["items"], queryFn: getItems });
    const { data: itemUnits = [] } = useQuery({ queryKey: ["itemUnits"], queryFn: getItemUnits });
    const { data: categories = [] } = useQuery({ queryKey: ["itemCategories"], queryFn: () => getItemCategories() });
    const { data: shippingCompanies = [] } = useQuery({ queryKey: ["shippingCompanies"], queryFn: getShippingCompanies });
    const { data: fiscalYears = [] } = useQuery({ queryKey: ["fiscalYears"], queryFn: getFiscalYears });
    const { data: companyData } = useQuery({ queryKey: ["company"], queryFn: getCompanies });
    const { data: bankAccounts = [] } = useQuery({ queryKey: ["bankAccounts"], queryFn: getBankAccounts });
    const { data: posList = [] } = useQuery({ queryKey: ["salesPos"], queryFn: getSalesPosList });
    const { data: salesOrders = [] } = useQuery({ queryKey: ["salesOrders"], queryFn: getSalesOrders });
    const { data: debtorTrans = [] } = useQuery({ queryKey: ["debtorTrans"], queryFn: getDebtorTrans });
    const { data: taxTypes = [] } = useQuery({ queryKey: ["taxTypes"], queryFn: getTaxTypes });

    // Handle order data if coming from template delivery
    useEffect(() => {
        const state = location.state;
        if (state && state.orderNo && items.length > 0 && itemUnits.length > 0 && customers.length > 0 && branches.length > 0) {
            const fetchOrder = async () => {
                try {
                    const order = await getSalesOrderByOrderNo(state.orderNo);
                    if (order && order.trans_type === 30) { // Ensure it's a sales order
                        setCustomer(String(order.debtor_no));
                        setBranch(String(order.branch_code));
                        setPriceList(String(order.order_type));
                        setComments(`Direct Delivery for Order # ${state.orderNo}`);
                        setDeliverFrom(order.from_stk_loc || "");
                        setDeliverTo(order.deliver_to || "");
                        setAddress(order.delivery_address || "");
                        setContactPhoneNumber(order.contact_phone || "");
                        setCustomerReference(order.customer_ref || "");
                        setShippingCompany(order.ship_via ? String(order.ship_via) : "");
                        setDeliveryDate(order.delivery_date || new Date().toISOString().split("T")[0]);
                        setPayment(order.payment_terms ? String(order.payment_terms) : "");
                        // Fetch details
                        const details = await getSalesOrderDetailsByOrderNo(state.orderNo);
                        if (details.length > 0) {
                            const newRows = details.map((detail: any, index: number) => {
                                const item = items.find((i: any) => i.stock_id === detail.stk_code);
                                const unitName = item ? itemUnits.find((u: any) => u.id === item.units)?.abbr || "" : "";
                                return {
                                    id: index + 1,
                                    itemCode: detail.stk_code,
                                    description: detail.description,
                                    quantity: detail.quantity - (detail.qty_sent || 0), // Remaining quantity
                                    unit: unitName,
                                    priceAfterTax: detail.unit_price,
                                    priceBeforeTax: detail.unit_price,
                                    discount: detail.discount_percent || 0,
                                    total: (detail.quantity - (detail.qty_sent || 0)) * detail.unit_price * (1 - (detail.discount_percent || 0) / 100),
                                    selectedItemId: detail.stk_code,
                                    materialCost: item?.material_cost ?? 0,
                                    availableQuantity: 0, // Will be updated by the useEffect
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
                                materialCost: 0,
                                availableQuantity: 0,
                            });
                            setRows(newRows);
                        }
                    }
                } catch (error) {
                    console.error("Error fetching order data:", error);
                }
            };
            fetchOrder();
        }
    }, [location.state, items, itemUnits, customers, branches]);

    // Find selected fiscal year from company setup
    const selectedFiscalYear = useMemo(() => {
        if (!companyData || companyData.length === 0) return null;
        const company = companyData[0];
        return fiscalYears.find((fy: any) => fy.id === company.fiscal_year_id);
    }, [companyData, fiscalYears]);

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
            materialCost: 0,
            availableQuantity: 0,
        },
    ]);

    const customerDiscount = useMemo(() => {
        const c = customers.find((cust: any) => String(cust.debtor_no) === String(customer));
        return Number(c?.discount) || 0;
    }, [customer, customers]);

    const lineUnitPrice = (row: { priceAfterTax?: number; priceBeforeTax?: number }) =>
        priceColumnLabel === "Price before Tax"
            ? Number(row.priceBeforeTax) || 0
            : Number(row.priceAfterTax || row.priceBeforeTax) || 0;

    const lineTotal = (
        row: { quantity?: number; priceAfterTax?: number; priceBeforeTax?: number; discount?: number },
        disc?: number
    ) => {
        const qty = Number(row.quantity) || 0;
        const discountPct = disc ?? (Number(row.discount) || 0);
        return qty * lineUnitPrice(row) * (1 - discountPct / 100);
    };

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
                discount: customerDiscount,
                total: 0,
                selectedItemId: null,
                materialCost: 0,
                availableQuantity: 0,
            },
        ]);
    };

    const handleRemoveRow = (id: number) => {
        setRows((prev) => prev.filter((r) => r.id !== id));
    };

    const handleChange = (id: number, field: string, value: any) => {
        setRows((prev) =>
            prev.map((r) => {
                if (r.id !== id) return r;
                const updated = { ...r, [field]: value };
                if (field === "quantity" || field === "priceAfterTax" || field === "priceBeforeTax" || field === "discount") {
                    const disc = field === "discount" ? Number(value) || 0 : Number(updated.discount) || 0;
                    updated.total = lineTotal(updated, disc);
                }
                return updated;
            })
        );
    };

    const handleItemChange = async (rowId: number, selectedItem: any) => {
        let availableQty = 0;
        if (deliverFrom && selectedItem.stock_id) {
            try {
                const stockMoves = await getStockMoves();
                const relevantMoves = stockMoves.filter((move: any) =>
                    String(move.loc_code) === String(deliverFrom) &&
                    String(move.stock_id) === String(selectedItem.stock_id)
                );
                availableQty = relevantMoves.reduce((sum: number, move: any) => sum + (move.qty || 0), 0);
            } catch (error) {
                console.error("Error fetching stock moves:", error);
                availableQty = 0;
            }
        }

        const itemData = await getItemById(selectedItem.stock_id);
        let unitName = "";
        let materialCost = 0;
        let priceAfterTax = 0;
        let priceBeforeTax = 0;

        if (itemData) {
            unitName = itemUnits.find((u: any) => u.id === itemData.units)?.abbr || "";
            materialCost = itemData.material_cost || 0;
            const pricingList = await getSalesPricingByStockId(selectedItem.stock_id);
            const { priceAfterTax: resolvedAfter, priceBeforeTax: resolvedBefore } =
                resolveSalesItemLinePrices({
                    pricingList,
                    stockId: selectedItem.stock_id,
                    salesTypeId: priceList,
                    salesTypes: priceLists,
                    currencyCode: customerCurrency,
                    homeCurrencyCode,
                    materialCost: Number(itemData.material_cost ?? 0),
                });
            priceAfterTax = resolvedAfter;
            priceBeforeTax = resolvedBefore;
        }

        const qty = 1;
        const disc = customerDiscount;
        const draftRow = {
            quantity: qty,
            priceAfterTax,
            priceBeforeTax,
            discount: disc,
        };

        setRows((prev) =>
            prev.map((r) =>
                r.id === rowId
                    ? {
                        ...r,
                        description: selectedItem.description,
                        itemCode: selectedItem.stock_id,
                        selectedItemId: selectedItem.stock_id,
                        availableQuantity: availableQty,
                        quantity: qty,
                        unit: unitName,
                        materialCost,
                        priceAfterTax,
                        priceBeforeTax,
                        discount: disc,
                        total: lineTotal(draftRow, disc),
                    }
                    : r
            )
        );
    };

    // ===== Auto-generate reference based on fiscal year =====
    // Uses the shared TransactionReferenceService (via useNextFiscalYearReference) so
    // this follows each transaction type's configured Prefix/Pattern under
    // Setup > Transaction References, instead of a hardcoded "NNN/year" format.
    useEffect(() => {
        if (nextDeliveryReference) {
            setReference(nextDeliveryReference);
        }
    }, [nextDeliveryReference]);

    // Auto-select first customer on load (same logic as SalesQuotationEntry)
    useEffect(() => {
        if (customers.length > 0 && !customer) {
            setCustomer(customers[0].debtor_no);
        }
    }, [customers, customer]);

    // Reset branch when customer changes and auto-select first branch
    useEffect(() => {
        const customerBranches = branches.filter((b: any) => b.debtor_no == customer);
        const newBranch = customerBranches.length > 0 ? String(customerBranches[0].branch_code) : "";
        if (newBranch !== branch) setBranch(newBranch);
    }, [customer, branches]);

    // Update deliver to and address when branch changes
    useEffect(() => {
        if (branch) {
            const selectedBranch = branches.find((b: any) => b.branch_code == branch);
            if (selectedBranch) {
                setDeliverTo(selectedBranch.br_name || "");
                setAddress(selectedBranch.br_address || "");
                // Fetch tax group items for the branch
                if (selectedBranch.tax_group) {
                    getTaxGroupItemsByGroupId(selectedBranch.tax_group).then(setTaxGroupItems);
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

    // Auto-select first location on load
    useEffect(() => {
        if (locations.length > 0 && !deliverFrom) {
            setDeliverFrom(locations[0].loc_code);
        }
    }, [locations, deliverFrom]);


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

    // Update available quantities when deliverFrom location changes
    useEffect(() => {
        const updateAvailableQuantities = async () => {
            if (deliverFrom) {
                try {
                    const stockMoves = await getStockMoves();
                    const updatedRows = await Promise.all(
                        rows.map(async (row) => {
                            if (row.selectedItemId) {
                                // Filter stock moves by location and stock_id, then sum quantities
                                const relevantMoves = stockMoves.filter((move: any) =>
                                    String(move.loc_code) === String(deliverFrom) &&
                                    String(move.stock_id) === String(row.selectedItemId)
                                );
                                const availableQty = relevantMoves.reduce((sum: number, move: any) => sum + (move.qty || 0), 0);
                                return { ...row, availableQuantity: availableQty };
                            }
                            return row;
                        })
                    );
                    setRows(updatedRows);
                } catch (error) {
                    console.error("Error updating available quantities:", error);
                    // Reset available quantities if there's an error
                    setRows(rows.map(row => ({ ...row, availableQuantity: 0 })));
                }
            } else {
                // Reset available quantities if no location selected
                setRows(rows.map(row => ({ ...row, availableQuantity: 0 })));
            }
        };

        updateAvailableQuantities();
    }, [deliverFrom]);

    // Only show payment terms where payment_type != 1
    const visiblePaymentTerms = useMemo(() => {
        return paymentTerms.filter((pt: any) => {
            const pType = pt.payment_type;
            const id = typeof pType === "number" ? pType : (pType?.id ?? pType?.payment_type ?? null);
            return Number(id) !== 1;
        });
    }, [paymentTerms]);

    // Update credit and discount when customer changes
    useEffect(() => {
        if (customer) {
            const selectedCustomer = customers.find((c: any) => String(c.debtor_no) === String(customer));
            if (selectedCustomer) {
                const newDiscount = selectedCustomer.discount || 0;
                let newPayment = customerPaymentTermId(selectedCustomer);
                const newPriceList = customerSalesTypeId(selectedCustomer);

                // If the customer's default payment term has payment_type === 1 then ignore it (don't auto-select)
                if (newPayment) {
                    const ptObj = paymentTerms.find((pt: any) => String(pt.terms_indicator) === String(newPayment));
                    if (ptObj) {
                        const pType = ptObj.payment_type;
                        const id = typeof pType === 'number' ? pType : (pType?.id ?? pType?.payment_type ?? null);
                        if (Number(id) === 1) {
                            newPayment = "";
                        }
                    }
                }

                if (newDiscount !== discount) setDiscount(newDiscount);
                if (newPayment !== payment) setPayment(newPayment);
                if (newPriceList !== priceList) setPriceList(newPriceList);
            }
        } else {
            if (discount !== 0) setDiscount(0);
            if (payment !== "") setPayment("");
            if (priceList !== "") setPriceList("");
        }
    }, [customer, customers, paymentTerms]);

    // FA: customer discount applies to every line; recalc totals when discount or price column changes.
    useEffect(() => {
        setDiscount(customerDiscount);
        setRows((prev) =>
            prev.map((r) => ({
                ...r,
                discount: customerDiscount,
                total: lineTotal(r, customerDiscount),
            }))
        );
    }, [customerDiscount, priceColumnLabel]);

    // Update prices when price list changes
    useEffect(() => {
        if (priceList) {
            const updatePrices = async () => {
                const newRows = await Promise.all(
                    rows.map(async (row) => {
                        if (row.selectedItemId) {
                            const pricingList = await getSalesPricingByStockId(row.selectedItemId);
                            const { priceAfterTax, priceBeforeTax } = resolveSalesItemLinePrices({
                                pricingList,
                                stockId: String(row.selectedItemId),
                                salesTypeId: priceList,
                                salesTypes: priceLists,
                                currencyCode: customerCurrency,
                                homeCurrencyCode,
                                materialCost: Number(row.materialCost ?? 0),
                            });
                            const draftRow = {
                                ...row,
                                priceAfterTax,
                                priceBeforeTax,
                            };
                            return {
                                ...draftRow,
                                total: lineTotal(draftRow, Number(row.discount) || customerDiscount),
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
    }, [priceList, priceLists, customerCurrency, homeCurrencyCode]);

    // === Additional derived fields for backend mapping ===
    const [submitting, setSubmitting] = useState(false);
    const [orderNo, setOrderNo] = useState<number>(1);

    // Helper to get selected customer object
    const customerName = selectedCustomer?.name || null;
    const customerPhone = selectedCustomer?.phone || selectedCustomer?.contact_phone || null;
    const customerEmail = selectedCustomer?.email || selectedCustomer?.contact_email || null;
    const customerAddr = selectedCustomer?.address || selectedCustomer?.delivery_address || address || null;

    // Set order number based on existing sales orders
    useEffect(() => {
        if (salesOrders.length > 0) {
            const maxOrderNo = Math.max(...salesOrders.map((o: any) => o.order_no));
            setOrderNo(maxOrderNo + 1);
        }
    }, [salesOrders]);

    const handlePlaceQuotation = async () => {
        if (!customer) { alert("Select customer first"); return; }
        if (!branch) { alert("Select branch first"); return; }
        if (!deliverFrom) { alert("Select deliver-from location"); return; }
        if (!priceList) { alert("Please select a price list."); return; }
        const orderTypeId = Number(priceList);
        if (!orderTypeId || !priceLists.some((pl: any) => Number(pl.id) === orderTypeId)) {
            alert("Please select a valid price list.");
            return;
        }
        if (rows.filter(r => r.itemCode && r.quantity > 0).length === 0) {
            alert("At least one item must be added to the delivery.");
            return;
        }

        // Check if any item quantity exceeds available stock
        const invalidRows = rows.filter(
            (r) => r.selectedItemId && r.quantity > r.availableQuantity + 0.0001
        );
        if (invalidRows.length > 0) {
            const itemNames = invalidRows.map(r => r.description).join(", ");
            alert(`Cannot process delivery. The following items have quantities exceeding available stock: ${itemNames}`);
            return;
        }

        // FrontAccounting: delivery does not enforce credit limit (only on-hold via backend).
        setSubmitting(true);
        try {
            const stockLoc = String(deliverFrom || "").slice(0, 5);
            const lineRows = rows.filter((r) => r.selectedItemId && r.quantity > 0);
            const unitPriceFor = (row: any) =>
                priceColumnLabel === "Price after Tax" ? row.priceAfterTax : row.priceBeforeTax;

            const result = await directSalesDelivery({
                debtor_no: Number(customer),
                branch_code: Number(branch),
                tran_date: deliveryDate,
                due_date: validUntil || deliveryDate,
                order_type: orderTypeId,
                ship_via: shippingCompany ? Number(shippingCompany) : 1,
                payment_terms: payment ? Number(payment) : null,
                freight_cost: shippingCharge || 0,
                from_stk_loc: stockLoc,
                comments: comments || undefined,
                reference: reference || nextDeliveryReference || undefined,
                customer_ref: customerReference || undefined,
                delivery_address: customerAddr || undefined,
                deliver_to: customerName || undefined,
                lines: lineRows.map((row) => ({
                    stock_id: row.itemCode,
                    quantity: Number(row.quantity),
                    unit_price: Number(unitPriceFor(row)),
                    discount_percent: Number(row.discount) || 0,
                    description: row.description,
                })),
            });

            if (result.gl_warning) {
                console.warn("Delivery GL warning:", result.gl_warning);
            }

            setOpen(true);
            await queryClient.invalidateQueries({ queryKey: ["salesOrders"] });
            await queryClient.invalidateQueries({ queryKey: ["debtorTrans"] });
            await queryClient.invalidateQueries({ queryKey: ["customerCreditSummary", customer] });
            navigate("/sales/transactions/direct-delivery/success", {
                state: {
                    orderNo: result.debtor_trans?.order_no,
                    reference: result.reference ?? reference,
                    deliveryDate,
                    date: deliveryDate,
                    trans_no: result.trans_no,
                    trans_type: 13,
                },
            });
        } catch (e: any) {
            console.error("Save error", e);
            const detail = e?.response?.data?.message
                ? e.response.data.message
                : e?.response?.data
                  ? JSON.stringify(e.response.data)
                  : e?.message || "Unknown error";
            alert("Failed to save: " + detail);
        } finally {
            setSubmitting(false);
        }
    };

    const breadcrumbItems = [
        { title: "Transactions", href: "/sales/transactions/" },
        { title: "Direct Sales Delivery" },
    ];

    // Only calculate subtotal for completed rows (all rows except the last one which is being edited)
    const subTotal = rows.slice(0, -1).reduce((sum, r) => sum + r.total, 0);

    // Tax calculations
    const selectedPriceList = useMemo(() => priceLists.find((pl: any) => pl.id === priceList), [priceLists, priceList]);
    const taxCalculations = useMemo(() => {
        if (!selectedPriceList || taxGroupItems.length === 0 || taxTypes.length === 0) return [];

        return taxGroupItems.map((taxItem: any) => {
            const taxType = taxTypes.find((t: any) => t.id === taxItem.tax_type_id);
            if (!taxType) return null;

            const rate = taxType.default_rate || 0;
            const name = taxType.description || `Tax ${taxItem.tax_type_id}`;

            let amount = 0;
            if (selectedPriceList.taxIncl) {
                // Extract tax from subtotal
                amount = subTotal - (subTotal / (1 + rate / 100));
            } else {
                // Add tax to subtotal
                amount = subTotal * (rate / 100);
            }

            return { name, rate, amount, tax_type_id: taxItem.tax_type_id };
        }).filter(Boolean);
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

    const cashBankAccounts = useMemo(
        () => sortCashBankAccounts(bankAccounts as any[]),
        [bankAccounts]
    );

    const selectedCashBankAccount = useMemo(
        () => cashBankAccounts.find((acc: any) => String(acc.id) === String(cashAccount)),
        [cashBankAccounts, cashAccount]
    );

    useEffect(() => {
        if (!posList?.length) return;
        const defaultPos = posList.find((p: any) => !p.inactive) || posList[0];
        if (!defaultPos || cashAccount) return;
        const paId = relationId(
            defaultPos.pos_account,
            "id",
            "bank_account_id",
            "bank_act",
            "account_id"
        );
        if (paId) setCashAccount(paId);
        const locCode = relationId(defaultPos.pos_location, "loc_code", "code", "id");
        if (locCode && !deliverFrom) setDeliverFrom(locCode);
    }, [posList, cashAccount, deliverFrom]);

    useEffect(() => {
        if (!payment || !paymentTerms.length || cashAccount) return;
        const term = paymentTerms.find((t: any) => String(t.terms_indicator) === String(payment));
        if (term && (term.cash_sale || Number(term.days_before_due) === 0) && cashBankAccounts.length > 0) {
            setCashAccount(String(cashBankAccounts[0].id));
        }
    }, [payment, paymentTerms, cashBankAccounts, cashAccount]);

    useEffect(() => {
        if (!cashAccount || !cashBankAccounts.length) return;
        const exists = cashBankAccounts.some((acc: any) => String(acc.id) === String(cashAccount));
        if (!exists) setCashAccount(String(cashBankAccounts[0].id));
    }, [cashAccount, cashBankAccounts]);

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
                    <PageTitle title="Direct Sales Delivery" />
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
                                    .filter((b: any) => b.debtor_no == customer)
                                    .map((b: any) => (
                                        <MenuItem key={b.branch_code} value={String(b.branch_code)}>
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
                                        const sel = visiblePaymentTerms.find((pt: any) => String(pt.terms_indicator) === String(selected));
                                        return sel ? sel.description : (selected as string);
                                    },
                                }}
                            >
                                {visiblePaymentTerms.map((p: any) => (
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
                        <TextField
                            label="Delivery Date"
                            type="date"
                            fullWidth
                            size="small"
                            value={deliveryDate}
                            onChange={(e) => handleDateChange(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                            inputProps={{
                                min: selectedFiscalYear ? new Date(selectedFiscalYear.fiscal_year_from).toISOString().split('T')[0] : undefined,
                                max: selectedFiscalYear ? new Date(selectedFiscalYear.fiscal_year_to).toISOString().split('T')[0] : undefined,
                            }}
                            error={!!dateError}
                            helperText={dateError}
                        />
                    </Grid>
                </Grid>
            </Paper>
            {/* Items Table */}
            <Typography variant="subtitle1" sx={{ mb: 2, textAlign: 'center' }}>Delivery Note Items</Typography>
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
                                        onChange={(e) => {
                                            const inputValue = Number(e.target.value);
                                            handleChange(row.id, "quantity", inputValue);
                                        }}
                                        inputProps={{ min: 0 }}
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
                                    select
                                    fullWidth
                                    label="Cash Account"
                                    value={String(cashAccount || "")}
                                    onChange={(e) => setCashAccount(e.target.value)}
                                    size="small"
                                    SelectProps={{
                                        renderValue: (selected) => {
                                            if (!selected) return "Select";
                                            const acc = cashBankAccounts.find(
                                                (a: any) => String(a.id) === String(selected)
                                            );
                                            return acc ? bankAccountLabel(acc) : String(selected);
                                        },
                                    }}
                                    helperText={
                                        cashBankAccounts.length === 0
                                            ? "No bank accounts — add one under Banking maintenance."
                                            : selectedCashBankAccount
                                              ? undefined
                                              : cashAccount
                                                ? "Selected account is not in the list."
                                                : undefined
                                    }
                                >
                                    <MenuItem value="">
                                        <em>Select Cash Account</em>
                                    </MenuItem>
                                    {cashBankAccounts.map((acc: any) => (
                                        <MenuItem key={acc.id} value={String(acc.id)}>
                                            {bankAccountLabel(acc)}
                                        </MenuItem>
                                    ))}
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
                        </>
                    )}
                </Grid>

                <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2, gap: 2 }}>
                    <Button variant="outlined" onClick={() => navigate(-1)}>
                        Cancel Delivery
                    </Button>
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={handlePlaceQuotation}
                        disabled={
                            !!dateError ||
                            submitting ||
                            !canEdit ||
                            rows.some((r) => r.selectedItemId && r.quantity > r.availableQuantity + 0.0001)
                        }
                    >
                        {submitting ? "Saving..." : "Place Delivery"}
                    </Button>
                </Box>
            </Paper>
            <AddedConfirmationModal
                open={open}
                title="Success"
                content="Direct Delivery has been added successfully!"
                addFunc={async () => { }}
                handleClose={() => setOpen(false)}
                onSuccess={() => {


                }}
            />
        </FormPageLayout>
    );
}
