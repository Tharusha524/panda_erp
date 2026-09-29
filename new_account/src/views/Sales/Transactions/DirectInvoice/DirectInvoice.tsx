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
import { getSalesOrders, getSalesOrderByOrderNo } from "../../../../api/SalesOrders/SalesOrdersApi";
import { getSalesOrderDetailsByOrderNo } from "../../../../api/SalesOrders/SalesOrderDetailsApi";
import { directSalesInvoice } from "../../../../api/SalesInvoice/SalesInvoiceApi";
import { getDebtorTrans } from "../../../../api/DebtorTrans/DebtorTransApi";
import { useNextFiscalYearReference } from "../../../../hooks/useNextFiscalYearReference";
import { getCustomers } from "../../../../api/Customer/AddCustomerApi";
import { getBranches } from "../../../../api/CustomerBranch/CustomerBranchApi";
import { getPaymentTerms } from "../../../../api/PaymentTerm/PaymentTermApi";
import { getSalesTypes } from "../../../../api/SalesMaintenance/salesService";
import { getInventoryLocations } from "../../../../api/InventoryLocation/InventoryLocationApi";
import { getBankAccounts } from "../../../../api/BankAccount/BankAccountApi";
import { getItems, getItemById } from "../../../../api/Item/ItemApi";
import { getItemUnits } from "../../../../api/ItemUnit/ItemUnitApi";
import { getItemCategories } from "../../../../api/ItemCategories/ItemCategoriesApi";
import { getSalesPricingByStockId } from "../../../../api/SalesPricing/SalesPricingApi";
import { getShippingCompanies } from "../../../../api/ShippingCompany/ShippingCompanyApi";
import { getFiscalYears } from "../../../../api/FiscalYear/FiscalYearApi";
import { getCompanies } from "../../../../api/CompanySetup/CompanySetupApi";
import auditTrailApi from "../../../../api/AuditTrail/AuditTrailApi";
import useCurrentUser from "../../../../hooks/useCurrentUser";
import { getSalesPosList } from "../../../../api/SalePos/SalePosApi";
import { getTaxGroupItemsByGroupId } from "../../../../api/Tax/TaxGroupItemApi";
import { getTaxTypes } from "../../../../api/Tax/taxServices";
import { createTransTaxDetail } from "../../../../api/TransTaxDetail/TransTaxDetailApi";
import { getStockMoves, createStockMove } from "../../../../api/StockMoves/StockMovesApi";
import { getGlTransByTransaction } from "../../../../api/GlTrans/GlTransApi";
import { invalidateFinancialReports } from "../../../../utils/invalidateFinancialReports";
import Breadcrumb from "../../../../components/BreadCrumb";
import PageTitle from "../../../../components/PageTitle";
import theme from "../../../../theme";
import AddedConfirmationModal from "../../../../components/AddedConfirmationModal";
import { getCostCenters } from "../../../../api/CostCenter/CostCenterApi";
import {
    isCashSalePaymentTerm,
    validateCustomerCreditForSale,
} from "../../../../utils/customerCredit";
import { useCustomerCredit } from "../../../../hooks/useCustomerCredit";
import CustomerCreditSummaryFields from "../../../../components/CustomerCreditSummaryFields";
import CustomerCurrencyField from "../../../../components/CustomerCurrencyField";
import CurrencyAmountInput from "../../../../components/CurrencyAmountInput";
import ItemSearchSelect from "../../../../components/ItemSearchSelect";
import {
    customerPaymentTermId,
    customerSalesTypeId,
    customerCurrencyCode,
    relationId,
} from "../../../../utils/relationId";
import { resolveSalesItemLinePrices } from "../../../../utils/resolveSalesItemPrice";
import { useHomeCurrency } from "../../../../hooks/useHomeCurrency";
import { useTransactionMoney } from "../../../../hooks/useTransactionMoney";
import FormattedNumberField from "../../../../components/FormattedNumberField";
import { useAuth } from "../../../../context/AuthContext";

function sanitizeEmail(value: string | null | undefined): string | null {
    if (!value || typeof value !== "string") return null;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? value.trim() : null;
}

function bankAccountTypeId(acc: any): number {
    const raw = acc?.account_type ?? acc?.accountType;
    if (raw == null) return 0;
    if (typeof raw === "number" || typeof raw === "string") return Number(raw) || 0;
    if (typeof raw === "object") return Number(raw.id) || 0;
    return 0;
}

function isCashBankAccount(acc: any): boolean {
    const typeId = bankAccountTypeId(acc);
    if (typeId === 4) return true;
    const typeName = String(
        acc?.accountType?.type_name ?? acc?.account_type?.type_name ?? ""
    ).toLowerCase();
    return typeName.includes("cash");
}

function bankAccountLabel(acc: any): string {
    const name = acc?.bank_account_name ?? acc?.name ?? "";
    const gl = acc?.account_gl_code ?? acc?.accountGl?.account_code ?? "";
    return gl ? `${name} (${gl})` : String(name);
}

export default function DirectInvoice() {
  const { hasEditPermission } = useAuth();
  const canEdit = hasEditPermission('Direct sales invoice entry');
    const navigate = useNavigate();
    const location = useLocation();
    const queryClient = useQueryClient();
    const { code: homeCurrencyCode } = useHomeCurrency();

    const [open, setOpen] = useState(false);
    const [templateOrderNo, setTemplateOrderNo] = useState<number | null>(null);
    const [hasPopulatedFromTemplate, setHasPopulatedFromTemplate] = useState(false);

    // ===== Form fields =====
    const [customer, setCustomer] = useState("");
    const [branch, setBranch] = useState("");
    const [reference, setReference] = useState("");
    const [discount, setDiscount] = useState(0);
    const [payment, setPayment] = useState("");
    const [priceList, setPriceList] = useState("");
    const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);

    const { reference: nextInvoiceReference } = useNextFiscalYearReference(10, {
        asOfDate: invoiceDate,
    });
    const [deliverFrom, setDeliverFrom] = useState("");
    const [cashAccount, setCashAccount] = useState("");
    const [costCenter, setCostCenter] = useState("");
    const [comments, setComments] = useState("");
    const [dateError, setDateError] = useState("");
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

    // Normalize select values when API returned relation objects (e.g. sales_type: { id: 1 })
    useEffect(() => {
        if (String(priceList) === "[object Object]") setPriceList("");
        else {
            const fixedPrice = relationId(priceList, "id");
            if (priceList && fixedPrice && fixedPrice !== String(priceList)) setPriceList(fixedPrice);
        }
        if (String(payment) === "[object Object]") setPayment("");
        else {
            const fixedPayment = relationId(payment, "terms_indicator", "id");
            if (payment && fixedPayment && fixedPayment !== String(payment)) setPayment(fixedPayment);
        }
        if (String(shippingCompany) === "[object Object]") setShippingCompany("");
        else {
            const fixedShip = relationId(shippingCompany, "shipper_id", "id");
            if (shippingCompany && fixedShip && fixedShip !== String(shippingCompany)) setShippingCompany(fixedShip);
        }
        if (String(deliverFrom) === "[object Object]") setDeliverFrom("");
        else {
            const fixedLoc = relationId(deliverFrom, "loc_code", "code");
            if (deliverFrom && fixedLoc && fixedLoc !== String(deliverFrom)) setDeliverFrom(fixedLoc);
        }
    }, [priceList, payment, shippingCompany, deliverFrom]);

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
    const { data: fiscalYears = [] } = useQuery({ queryKey: ["fiscalYears"], queryFn: getFiscalYears });
    const { data: companyData } = useQuery({ queryKey: ["company"], queryFn: getCompanies });
    const { data: costCenters = [] } = useQuery({ queryKey: ["costCenters"], queryFn: getCostCenters });
    const { data: bankAccounts = [] } = useQuery({ queryKey: ["bankAccounts"], queryFn: getBankAccounts });
    const { user } = useCurrentUser();
    const { data: salesOrders = [] } = useQuery({ queryKey: ["salesOrders"], queryFn: getSalesOrders });
    const { data: debtorTrans = [] } = useQuery({ queryKey: ["debtorTrans"], queryFn: getDebtorTrans });
    const { data: taxTypes = [] } = useQuery({ queryKey: ["taxTypes"], queryFn: getTaxTypes });
    const { data: posList = [] } = useQuery({ queryKey: ["salesPos"], queryFn: getSalesPosList });

    // All active bank accounts (cash types first) — strict cash-only filter hid POS/chequing accounts.
    const cashBankAccounts = useMemo(() => {
        const active = (bankAccounts as any[]).filter((acc) => !acc.inactive);
        const cash = active.filter(isCashBankAccount);
        const other = active.filter((acc) => !isCashBankAccount(acc));
        return [...cash, ...other];
    }, [bankAccounts]);

    const selectedCashBankAccount = useMemo(
        () => cashBankAccounts.find((acc: any) => String(acc.id) === String(cashAccount)),
        [cashBankAccounts, cashAccount]
    );

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
            setInvoiceDate(initialDate);
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

    // Auto-select POS and set default bank account / location
    useEffect(() => {
        if (posList && posList.length > 0) {
            // Usually there's one default POS for the user or first active one
            const defaultPos = posList.find((p: any) => !p.inactive) || posList[0];
            if (defaultPos) {
                if (defaultPos.pos_account && !cashAccount) {
                    const pa = defaultPos.pos_account;
                    const paId =
                        pa != null && typeof pa === "object" && !Array.isArray(pa)
                            ? (pa as { id?: unknown; bank_account_id?: unknown; bank_act?: unknown; account_id?: unknown }).id ??
                            (pa as { bank_account_id?: unknown }).bank_account_id ??
                            (pa as { bank_act?: unknown }).bank_act ??
                            (pa as { account_id?: unknown }).account_id ??
                            pa
                            : pa;
                    if (paId != null) setCashAccount(String(paId));
                }
                if (defaultPos.pos_location && !deliverFrom) {
                    const pl = defaultPos.pos_location;
                    const plCode =
                        pl != null && typeof pl === "object" && !Array.isArray(pl)
                            ? (pl as { loc_code?: unknown; code?: unknown; id?: unknown }).loc_code ??
                            (pl as { code?: unknown }).code ??
                            (pl as { id?: unknown }).id ??
                            pl
                            : pl;
                    if (plCode != null) setDeliverFrom(String(plCode));
                }
            }
        }
    }, [posList, cashAccount, deliverFrom]);

    // Update branch based on customer — only when current branch does not belong to customer
    useEffect(() => {
        if (!customer || branches.length === 0) return;
        const customerBranches = branches.filter((b: any) => String(b.debtor_no) === String(customer));
        const branchBelongsToCustomer = customerBranches.some(
            (b: any) => String(b.branch_code) === String(branch)
        );
        if (!branchBelongsToCustomer) {
            const defaultBranch = customerBranches.find((b: any) => !b.inactive) || customerBranches[0];
            setBranch(defaultBranch ? String(defaultBranch.branch_code) : "");
        }
    }, [customer, branches, branch]);

    // Update branch details: location, payment, priceList, tax group
    useEffect(() => {
        if (branch && branches.length > 0) {
            const selectedBranch = branches.find((b: any) => String(b.branch_code) === String(branch));
            if (selectedBranch) {
                if (selectedBranch.inventory_location && !deliverFrom) {
                    setDeliverFrom(selectedBranch.inventory_location);
                }
                if (selectedBranch.shipping_company && !shippingCompany) {
                    const shipId = relationId(selectedBranch.shipping_company, "shipper_id", "id");
                    if (shipId) setShippingCompany(shipId);
                }
                // Fetch tax group details
                if (selectedBranch.tax_group) {
                    getTaxGroupItemsByGroupId(selectedBranch.tax_group).then(setTaxGroupItems);
                }
            }
        }
    }, [branch, branches, deliverFrom, shippingCompany]);

    // Update customer-level defaults
    useEffect(() => {
        if (customer && customers.length > 0) {
            const cust = customers.find((c: any) => String(c.debtor_no) === String(customer));
            if (cust) {
                if (!payment) {
                    const pt = relationId(cust.payment_terms, "terms_indicator")
                        || relationId(cust.payment_term, "terms_indicator");
                    if (pt) setPayment(pt);
                }
                if (!priceList) {
                    const pl = relationId(cust.sales_type, "id");
                    if (pl) setPriceList(pl);
                }
                if (cust.discount !== undefined && discount === 0) {
                    setDiscount(cust.discount);
                }
            }
        }
    }, [customer, customers, payment, priceList, discount]);

    // Set templateOrderNo from navigation state
    useEffect(() => {
        if (location.state?.orderNo) {
            setTemplateOrderNo(location.state.orderNo);
        }
    }, [location.state]);

    useEffect(() => {
        if (payment && paymentTerms.length > 0) {
            const term = paymentTerms.find(
                (t: any) => String(t.terms_indicator) === String(payment)
            );
            if (term && (term.cash_sale || term.days_before_due === 0) && cashBankAccounts.length > 0) {
                if (!cashAccount) {
                    setCashAccount(String(cashBankAccounts[0].id));
                }
            }
        }
    }, [payment, paymentTerms, cashBankAccounts, cashAccount]);

    // If POS/customer default bank id is not in the cash list, clear invalid selection.
    useEffect(() => {
        if (!cashAccount || cashBankAccounts.length === 0) return;
        const exists = cashBankAccounts.some((acc: any) => String(acc.id) === String(cashAccount));
        if (!exists) {
            setCashAccount(String(cashBankAccounts[0].id));
        }
    }, [cashAccount, cashBankAccounts]);

    // Populate form from template order
    useEffect(() => {
        if (templateOrderNo && salesOrders.length > 0 && !hasPopulatedFromTemplate) {
            const order = salesOrders.find((o: any) => o.order_no === templateOrderNo);
            if (order) {
                // Populate form fields
                setCustomer(order.debtor_no || "");
                setBranch(order.branch_code || "");
                setInvoiceDate(order.ord_date || new Date().toISOString().split("T")[0]);
                setPriceList(relationId(order.order_type, "id") || String(order.order_type || ""));
                setDeliverFrom(String(order.from_stk_loc || ""));
                setComments(order.comments || "");
                setShippingCharge(order.freight_cost || 0);
                setValidUntil(order.delivery_date || "");
                setDeliverTo(order.deliver_to || "");
                setAddress(order.delivery_address || "");
                setContactPhoneNumber(order.contact_phone || "");
                setCustomerReference(order.customer_ref || "");
                const shipVia = relationId(order.ship_via, "shipper_id", "id") || String(order.ship_via || "");
                if (shipVia) setShippingCompany(shipVia);

                // Fetch order details and populate rows
                const fetchOrderDetails = async () => {
                    try {
                        const orderDetails = await getSalesOrderDetailsByOrderNo(templateOrderNo);
                        if (orderDetails && orderDetails.length > 0) {
                            const populatedRows = await Promise.all(orderDetails.map(async (detail: any, index: number) => {
                                const itemData = await getItemById(detail.stk_code);
                                const unitName = itemData ? itemUnits.find((u: any) => u.id === itemData.units)?.abbr || "" : "";
                                return {
                                    id: index + 1,
                                    itemCode: detail.stk_code || "",
                                    description: detail.description || "",
                                    quantity: detail.quantity || 0,
                                    unit: unitName,
                                    priceAfterTax: detail.unit_price || 0,
                                    priceBeforeTax: detail.unit_price || 0, // Assuming same for now
                                    discount: detail.discount_percent || 0,
                                    total: (detail.quantity || 0) * (detail.unit_price || 0) * (1 - (detail.discount_percent || 0) / 100),
                                    selectedItemId: detail.stk_code,
                                    materialCost: itemData?.material_cost || 0,
                                };
                            }));
                            setRows(populatedRows);
                        }
                    } catch (error) {
                        console.error('Failed to fetch order details:', error);
                    }
                };
                fetchOrderDetails();
                setHasPopulatedFromTemplate(true);
            }
        }
    }, [templateOrderNo, hasPopulatedFromTemplate]);

    // Handle date change with validation
    const handleDateChange = (value: string) => {
        setInvoiceDate(value);
        validateDate(value);
    };

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
            materialCost: 0,
            availableQuantity: 0,
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

        // Fetch available quantity from stock_moves table
        let availableQty = 0;
        if (deliverFrom && selectedItem.stock_id) {
            try {
                const stockMoves = await getStockMoves();
                // Filter stock moves by location and stock_id, then sum quantities
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
        handleChange(rowId, "availableQuantity", availableQty);
        handleChange(rowId, "quantity", 1);
        const itemData = await getItemById(selectedItem.stock_id);
        if (itemData) {
            const unitName = itemUnits.find((u: any) => u.id === itemData.units)?.abbr || "";
            handleChange(rowId, "unit", unitName);
            handleChange(rowId, "materialCost", itemData.material_cost || 0);
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

    // ===== Auto-generate reference based on fiscal year =====
    // Uses the shared TransactionReferenceService (via useNextFiscalYearReference) so
    // this follows each transaction type's configured Prefix/Pattern under
    // Setup > Transaction References, instead of a hardcoded "NNN/year" format.
    useEffect(() => {
        if (nextInvoiceReference) {
            setReference(nextInvoiceReference);
        }
    }, [nextInvoiceReference]);

    // Auto-select first customer on load (match DirectDelivery behaviour)
    useEffect(() => {
        if (customers.length > 0 && !customer) {
            setCustomer(customers[0].debtor_no);
        }
    }, [customers, customer]);

    // Auto-select first location for deliverFrom on load
    useEffect(() => {
        if (locations.length > 0 && !deliverFrom) {
            const loc = relationId(locations[0].loc_code, "loc_code", "code")
                || relationId(locations[0], "loc_code", "code");
            if (loc) setDeliverFrom(loc);
        }
    }, [locations, deliverFrom]);

    // Reset branch when customer changes if current branch is not for that customer
    useEffect(() => {
        if (!customer) {
            setBranch("");
            return;
        }
        const customerBranches = branches.filter((b: any) => String(b.debtor_no) === String(customer));
        const branchBelongsToCustomer = customerBranches.some(
            (b: any) => String(b.branch_code) === String(branch)
        );
        if (!branchBelongsToCustomer) {
            const newBranch = customerBranches.length > 0 ? String(customerBranches[0].branch_code) : "";
            setBranch(newBranch);
        }
    }, [customer, branches, branch]);

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

    // Update prices when price list changes (guarded update)
    useEffect(() => {
        if (priceList) {
            const updatePrices = async () => {
                const selectedPriceList = priceLists.find((pl: any) => String(pl.id) === String(priceList));
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
                                materialCost: Number(itemData?.material_cost ?? row.materialCost ?? 0),
                            });
                            const priceToUse = selectedPriceList?.taxIncl ? priceAfterTax : priceBeforeTax;
                            const total = row.quantity * priceToUse * (1 - row.discount / 100);
                            return {
                                ...row,
                                priceAfterTax,
                                priceBeforeTax,
                                total: total,
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

    // Update credit, discount, payment and priceList when customer changes (guarded updates)
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
    }, [customer, customers, paymentTerms]);

    // === Save flow: create sales_order, sales_order_details and two debtor_trans + details
    const [submitting, setSubmitting] = useState(false);
    const [orderNo, setOrderNo] = useState<number>(1);

    useEffect(() => {
        if (salesOrders.length > 0) {
            const maxOrderNo = Math.max(...salesOrders.map((o: any) => o.order_no));
            setOrderNo(maxOrderNo + 1);
        }
    }, [salesOrders]);

    // Helper to get selected customer object
    const customerName = selectedCustomer?.name || null;
    const customerPhone = selectedCustomer?.phone || selectedCustomer?.contact_phone || null;
    const customerEmail = selectedCustomer?.email || selectedCustomer?.contact_email || null;
    const customerAddr = selectedCustomer?.address || selectedCustomer?.delivery_address || address || null;

    const handlePlaceQuotation = async () => {
        if (!customer) { alert("Select customer first"); return; }
        if (!branch) { alert("Select branch first"); return; }
        if (!deliverFrom) { alert("Select deliver-from location"); return; }
        if (!priceList) { alert("Please select a price list."); return; }
        const orderTypeId = Number(relationId(priceList, "id"));
        if (!orderTypeId || !priceLists.some((pl: any) => Number(pl.id) === orderTypeId)) {
            alert("Please select a valid price list.");
            return;
        }
        const isCashSale = isCashSalePaymentTerm(paymentTerms, payment);
        if (isCashSale && !cashAccount) { alert("Select cash account"); return; }
        // FrontAccounting direct invoice: no stock issue on invoice-only entry.
        const lineRows = rows.filter((r) => r.itemCode && r.quantity > 0);
        if (lineRows.length === 0) {
            alert("At least one item must be added to the invoice.");
            return;
        }

        const invoiceNetPreview = selectedPriceList?.taxIncl
            ? subTotal - totalTaxAmount
            : subTotal;
        const invoiceTotalPreview =
            invoiceNetPreview + totalTaxAmount + (shippingCharge || 0);
        const creditError = validateCustomerCreditForSale({
            summary: creditSummary,
            documentTotal: invoiceTotalPreview,
            skipCreditCheck: isCashSalePaymentTerm(paymentTerms, payment),
        });
        if (creditError) {
            alert(creditError);
            return;
        }

        setSubmitting(true);
        try {
            const defaultShipperId = shippingCompanies.length > 0 ? shippingCompanies[0].shipper_id : 1;
            const shipViaId = Number(relationId(shippingCompany, "shipper_id", "id")) || Number(defaultShipperId) || 1;
            const paymentTermsId = payment
                ? Number(relationId(payment, "terms_indicator", "id")) || null
                : null;
            const stockLoc =
                relationId(deliverFrom, "loc_code", "code").slice(0, 5)
                || String(deliverFrom || "").slice(0, 5);
            const lineRows = rows.filter((r) => r.itemCode && r.quantity > 0);
            const unitPriceFor = (row: any) =>
                priceColumnLabel === "Price after Tax" ? row.priceAfterTax : row.priceBeforeTax;
            const isCashSale = isCashSalePaymentTerm(paymentTerms, payment);

            const result = await directSalesInvoice({
                debtor_no: Number(customer),
                branch_code: Number(branch),
                tran_date: invoiceDate,
                due_date: validUntil || invoiceDate,
                order_type: orderTypeId,
                ship_via: shipViaId,
                payment_terms: paymentTermsId,
                freight_cost: shippingCharge || 0,
                from_stk_loc: stockLoc || undefined,
                customer_ref: customerReference || undefined,
                cost_center_id: Number(costCenter) || undefined,
                delivery_address: customerAddr || undefined,
                deliver_to: customerName || undefined,
                comments: comments || undefined,
                reference: reference || nextInvoiceReference || undefined,
                cash_sale: isCashSale,
                bank_account_id: isCashSale ? Number(cashAccount) || null : null,
                lines: lineRows.map((row) => ({
                    stock_id: row.itemCode,
                    quantity: Number(row.quantity),
                    unit_price: Number(unitPriceFor(row)),
                    discount_percent: Number(row.discount) || 0,
                    description: row.description,
                })),
            });

            if (result.gl_warning) {
                console.warn("Invoice GL warning:", result.gl_warning);
            }

            setOpen(true);
            await queryClient.invalidateQueries({ queryKey: ["salesOrders"] });
            await queryClient.invalidateQueries({ queryKey: ["debtorTrans"] });
            await queryClient.invalidateQueries({ queryKey: ["bankTrans"] });
            await queryClient.invalidateQueries({ queryKey: ["customerCreditSummary", customer] });
            invalidateFinancialReports(queryClient);
            navigate("/sales/transactions/direct-invoice/success", {
                state: {
                    orderNo: result.order_no,
                    reference: result.reference ?? reference,
                    invoiceDate,
                    trans_no: result.trans_no,
                    trans_type: 10,
                },
            });
        } catch (e: any) {
            console.error("Save error", e);
            const respData = e?.data ?? e?.response?.data;
            console.error("Save error response data:", respData);
            let detail = e?.statusText || e?.message || "Unknown error";
            if (respData) {
                if (typeof respData === "object") {
                    let msg = respData.message || "";
                    if (respData.error) msg += `: ${respData.error}`;
                    if (respData.errors) msg += `\nErrors:\n${JSON.stringify(respData.errors, null, 2)}`;
                    detail = msg || JSON.stringify(respData, null, 2);
                } else {
                    detail = String(respData);
                }
            } else if (e?.status === 422) {
                detail = "Validation failed. Check location, price list, shipping, and customer email.";
            }
            alert("Failed to save: " + detail);
        } finally {
            setSubmitting(false);
        }
    };

    const breadcrumbItems = [
        { title: "Transactions", href: "/sales/transactions/" },
        { title: "Direct Sales Invoice" },
    ];

    // Only calculate subtotal for completed rows (all rows except the last one which is being edited)
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
                tax_type_id: item.tax_type_id,
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
        return pt.id ?? pt.payment_type ?? null;
    }, [selectedPaymentTerm]);

    // Only show payment terms where payment_type != 1
    const visiblePaymentTerms = useMemo(() => {
        return paymentTerms.filter((pt: any) => {
            const pType = pt.payment_type;
            const id = typeof pType === "number" ? pType : (pType?.id ?? pType?.payment_type ?? null);
            return Number(id) !== 1;
        });
    }, [paymentTerms]);


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
                    <PageTitle title="Direct Sales Invoice" />
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
                                value={String(customer || "")}
                                onChange={(e) => setCustomer(e.target.value)}
                                size="small"
                            >
                                {customers.map((c: any) => (
                                    <MenuItem key={c.debtor_no} value={String(c.debtor_no)}>
                                        {c.name}
                                    </MenuItem>
                                ))}
                            </TextField>
                            <TextField
                                select
                                fullWidth
                                label="Branch"
                                value={String(branch || "")}
                                onChange={(e) => setBranch(e.target.value)}
                                size="small"
                            >
                                {branches
                                    .filter((b: any) => String(b.debtor_no) === String(customer))
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
                                value={String(payment || "")}
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
                                    <MenuItem key={p.terms_indicator} value={String(p.terms_indicator)}>
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
                                label="Invoice Date"
                                type="date"
                                fullWidth
                                size="small"
                                value={invoiceDate}
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
            <Typography variant="subtitle1" sx={{ mb: 2, textAlign: 'center' }}>Sales Invoice Items</Typography>
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
                    Cash Payment
                </Typography>
                <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                        <TextField
                            select
                            fullWidth
                            label="Deliver From Location"
                            value={String(deliverFrom || "")}
                            onChange={(e) => setDeliverFrom(e.target.value)}
                            size="small"
                        >
                            {locations.map((loc: any) => (
                                <MenuItem key={loc.loc_code} value={String(loc.loc_code)}>
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
                                    ? "No bank accounts found — add one under Banking maintenance."
                                    : selectedCashBankAccount
                                        ? undefined
                                        : cashAccount
                                            ? "Selected account is not in the list."
                                            : undefined
                            }
                        >
                            <MenuItem value="">Select</MenuItem>
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
                </Grid>

                <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2, gap: 2 }}>
                    <Button variant="outlined" onClick={() => navigate(-1)}>
                        Cancel Invoice
                    </Button>
                    <Button variant="contained" color="primary" onClick={handlePlaceQuotation} disabled={!!dateError || submitting || !canEdit}>
                        {submitting ? "Saving..." : "Place Invoice"}
                    </Button>
                </Box>
            </Paper>
            <AddedConfirmationModal
                open={open}
                title="Success"
                content="Sales Invoice has been added successfully!"
                addFunc={async () => { }}
                handleClose={() => setOpen(false)}
                onSuccess={() => {
                    // Form was already cleared on successful submission
                    window.history.back();
                }}
            />
        </FormPageLayout>
    );
}
