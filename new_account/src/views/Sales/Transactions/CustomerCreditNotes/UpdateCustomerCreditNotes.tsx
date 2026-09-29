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
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";

// ===== API Imports =====
import { getCustomers } from "../../../../api/Customer/AddCustomerApi";
import { getBranches } from "../../../../api/CustomerBranch/CustomerBranchApi";
import { getSalesTypes } from "../../../../api/SalesMaintenance/salesService";
import { getShippingCompanies } from "../../../../api/ShippingCompany/ShippingCompanyApi";
// import { getCostCenters } from "../../../../api/CostCenter/CostCenterApi";
import { getItems, getItemById } from "../../../../api/Item/ItemApi";
import { getItemUnits } from "../../../../api/ItemUnit/ItemUnitApi";
import { getItemCategories } from "../../../../api/ItemCategories/ItemCategoriesApi";
import { getInventoryLocations } from "../../../../api/InventoryLocation/InventoryLocationApi";
import { resolveSalesItemPrice } from "../../../../utils/resolveSalesItemPrice";
import { customerCurrencyCode } from "../../../../utils/relationId";
import { useHomeCurrency } from "../../../../hooks/useHomeCurrency";
import { useTransactionMoney } from "../../../../hooks/useTransactionMoney";
import { getTaxTypes } from "../../../../api/Tax/taxServices";
import { getTaxGroupItemsByGroupId } from "../../../../api/Tax/TaxGroupItemApi";
import { getDebtorTrans, createDebtorTran, updateDebtorTran } from "../../../../api/DebtorTrans/DebtorTransApi";
import { createDebtorTransDetail, getDebtorTransDetails, updateDebtorTransDetail, deleteDebtorTransDetail } from "../../../../api/DebtorTrans/DebtorTransDetailsApi";
import { getChartMasters } from "../../../../api/GLAccounts/ChartMasterApi";
import { createStockMove, getStockMoves, updateStockMove, deleteStockMove } from "../../../../api/StockMoves/StockMovesApi";
import auditTrailApi from "../../../../api/AuditTrail/AuditTrailApi";
import { getFiscalYears } from "../../../../api/FiscalYear/FiscalYearApi";
import { getCompanies } from "../../../../api/CompanySetup/CompanySetupApi";
import useCurrentUser from "../../../../hooks/useCurrentUser";
import { useNextFiscalYearReference } from "../../../../hooks/useNextFiscalYearReference";
import Breadcrumb from "../../../../components/BreadCrumb";
import PageTitle from "../../../../components/PageTitle";
import theme from "../../../../theme";
import CustomerCurrencyField from "../../../../components/CustomerCurrencyField";
import CurrencyAmountInput from "../../../../components/CurrencyAmountInput";
import FormattedNumberField from "../../../../components/FormattedNumberField";
import { useAuth } from "../../../../context/AuthContext";

interface ChartMaster {
    account_code: string;
    account_name: string;
    account_type: string;
}

export default function UpdateCustomerCreditNotes() {
  const { hasEditPermission } = useAuth();
  const canEdit = hasEditPermission('Sales credit notes against invoice');
    const navigate = useNavigate();
    const location = useLocation();
    const queryClient = useQueryClient();
    const { code: homeCurrencyCode } = useHomeCurrency();

    // ===== Form fields =====
    const [customer, setCustomer] = useState("");
    const [branch, setBranch] = useState("");
    const [reference, setReference] = useState("");
    const [salesType, setSalesType] = useState("");
    const [shippingCompany, setShippingCompany] = useState("");
    const [discount, setDiscount] = useState(0);
    const [shipping, setShipping] = useState(0);
    const [creditNoteDate, setCreditNoteDate] = useState(
        new Date().toISOString().split("T")[0]
    );

    // trans_type 11 = Customer Credit Note
    const { reference: nextCreditNoteReference } = useNextFiscalYearReference(11, {
        asOfDate: creditNoteDate,
    });
    const [costCenter, setCostCenter] = useState("");
    const [creditNoteType, setCreditNoteType] = useState("");
    const [returnLocation, setReturnLocation] = useState("");
    const [memo, setMemo] = useState("");
    const [dateError, setDateError] = useState("");

    // Populate form fields with selected data from navigation state
    useEffect(() => {
        if (location.state) {
            const { trans_no, reference, date, debtor_no } = location.state;
            // Don't set reference when editing - it will be loaded from transaction data
            if (!trans_no && reference) setReference(reference);
            // Don't set date when editing - it will be loaded from transaction data
            if (!trans_no && date) setCreditNoteDate(date);
            if (debtor_no) setCustomer(debtor_no);
        }
    }, [location.state]);

    // ===== Fetch master data =====
    const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: getCustomers });
    const selectedCustomer = useMemo(
        () => customers.find((c: any) => String(c.debtor_no) === String(customer)),
        [customers, customer]
    );
    const customerCurrency = customerCurrencyCode(selectedCustomer);
    const { formatMoney } = useTransactionMoney(customerCurrency);
    const { data: branches = [] } = useQuery({ queryKey: ["branches"], queryFn: () => getBranches() });
    const { data: salesTypes = [] } = useQuery({ queryKey: ["salesTypes"], queryFn: getSalesTypes });
    const { data: shippingCompanies = [] } = useQuery({ queryKey: ["shippingCompanies"], queryFn: getShippingCompanies });
    //   const { data: costCenters = [] } = useQuery({ queryKey: ["costCenters"], queryFn: getCostCenters });
    const { data: items = [] } = useQuery({ queryKey: ["items"], queryFn: getItems });
    const { data: itemUnits = [] } = useQuery({ queryKey: ["itemUnits"], queryFn: getItemUnits });
    const { data: categories = [] } = useQuery({ queryKey: ["itemCategories"], queryFn: () => getItemCategories() });
    const { data: locations = [] } = useQuery({ queryKey: ["locations"], queryFn: getInventoryLocations });
    const { data: taxTypes = [] } = useQuery({ queryKey: ["taxTypes"], queryFn: getTaxTypes });
    const { data: debtorTrans = [] } = useQuery({ queryKey: ["debtorTrans"], queryFn: getDebtorTrans });
    const { data: debtorTransDetails = [] } = useQuery({ queryKey: ["debtorTransDetails"], queryFn: getDebtorTransDetails });
    const { data: stockMoves = [] } = useQuery({ queryKey: ["stockMoves"], queryFn: getStockMoves });
    const { data: chartMaster = [] } = useQuery<ChartMaster[]>({ queryKey: ["chartMaster"], queryFn: () => getChartMasters() });
    const { data: fiscalYears = [] } = useQuery({ queryKey: ["fiscalYears"], queryFn: getFiscalYears });
    const { data: companyData } = useQuery({
        queryKey: ["company"],
        queryFn: getCompanies,
    });

    // Load transaction data when debtorTrans is available and we have trans_no
    useEffect(() => {
        const loadTransactionData = async () => {
            if (debtorTrans.length > 0 && location.state?.trans_no) {
                const selectedTransaction = debtorTrans.find((t: any) =>
                    String(t.trans_no) === String(location.state.trans_no) &&
                    String(t.trans_type) === "11"
                );

                if (selectedTransaction) {
                    // Populate additional form fields from the transaction
                    setCustomer(selectedTransaction.debtor_no || "");
                    setBranch(selectedTransaction.branch_code || "");
                    setSalesType(selectedTransaction.tpe || "");
                    setShippingCompany(selectedTransaction.ship_via || "");
                    setDiscount(selectedTransaction.discount || 0);
                    setShipping(selectedTransaction.ov_freight || 0);
                    setReference(selectedTransaction.reference || "");
                    setCreditNoteDate(selectedTransaction.tran_date ?
                        selectedTransaction.tran_date.split(" ")[0] :
                        new Date().toISOString().split("T")[0]);
                    setMemo(selectedTransaction.memo || "");

                    // Check if there are stock moves for this transaction
                    const transactionStockMoves = stockMoves.filter((sm: any) =>
                        String(sm.trans_no) === String(selectedTransaction.trans_no) &&
                        Number(sm.type) === 11
                    );

                    if (transactionStockMoves.length > 0) {
                        // If stock moves exist, set credit note type to Return
                        setCreditNoteType("Return");
                        // Use the location from the first stock move
                        setReturnLocation(transactionStockMoves[0].loc_code || "");
                    }

                    // Load transaction details for the table rows
                    if (debtorTransDetails.length > 0) {
                        const transactionDetails = debtorTransDetails.filter((d: any) =>
                            String(d.debtor_trans_no) === String(selectedTransaction.trans_no) &&
                            String(d.debtor_trans_type) === "11"
                        );

                        if (transactionDetails.length > 0) {
                            const detailRows = await Promise.all(transactionDetails.map(async (detail: any, index: number) => {
                                // Fetch item data to get unit information
                                let unitName = "";
                                if (detail.stock_id) {
                                    try {
                                        const itemData = await getItemById(detail.stock_id);
                                        if (itemData && itemData.units) {
                                            unitName = itemUnits.find((u: any) => u.id === itemData.units)?.name || "";
                                        }
                                    } catch (error) {
                                        console.warn("Failed to fetch item data for unit:", detail.stock_id, error);
                                    }
                                }

                                return {
                                    id: index + 1,
                                    itemCode: detail.stock_id || "",
                                    description: items.find((item: any) => item.stock_id === detail.stock_id)?.description || detail.description || "",
                                    quantity: detail.quantity || 0,
                                    unit: unitName,
                                    price: detail.unit_price || 0,
                                    discount: detail.discount_percent || 0,
                                    total: (detail.unit_price || 0) * (detail.quantity || 0) * (1 - (detail.discount_percent || 0) / 100),
                                    selectedItemId: detail.stock_id || null,
                                    material_cost: detail.standard_cost || 0,
                                    isExisting: true,
                                };
                            }));
                            setRows(detailRows);
                        }
                    }

                  //  console.log("Loading transaction data:", selectedTransaction);
                }
            }
        };

        loadTransactionData();
    }, [debtorTrans, debtorTransDetails, location.state, itemUnits]);

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
        setCreditNoteDate(value);
        validateDate(value);
    };

    // Validate date when fiscal year changes or when date changes
    useEffect(() => {
        if (selectedFiscalYear && creditNoteDate) {
            validateDate(creditNoteDate);
        }
    }, [selectedFiscalYear, creditNoteDate]);
    const { user } = useCurrentUser();

    // ===== GL Account Type Mapping =====
    const accountTypeMap: Record<string, string> = {
        "1": "Current Assets",
        "2": "Inventory Assets",
        "3": "Capital Assets",
        "4": "Current Liabilities",
        "5": "Long Term Liabilities",
        "6": "Share Capital",
        "7": "Retained Earnings",
        "8": "Sales Revenue",
        "9": "Other Revenue",
        "10": "Cost of Good Sold",
        "11": "Payroll Expenses",
        "12": "General and Adminitrative Expenses",
    };

    // Group GL accounts by descriptive account type
    const groupedGLAccounts = useMemo(() => {
        return chartMaster.reduce((acc: Record<string, any[]>, account: any) => {
            const typeText = accountTypeMap[account.account_type] || "Unknown";
            if (!acc[typeText]) acc[typeText] = [];
            acc[typeText].push(account);
            return acc;
        }, {});
    }, [chartMaster]);

    // Flatten the grouped accounts for menu items
    const groupedGLMenuItems = useMemo(() => {
        return Object.entries(groupedGLAccounts).flatMap(([typeText, accounts]) => [
            <ListSubheader key={`header-${typeText}`}>{typeText}</ListSubheader>,
            ...accounts.map((acc) => (
                <MenuItem key={acc.account_code} value={acc.account_code}>
                    {acc.account_code} - {acc.account_name}
                </MenuItem>
            )),
        ]);
    }, [groupedGLAccounts]);

    // ===== Tax-related state =====
    const [taxGroupItems, setTaxGroupItems] = useState<any[]>([]);
    const [rows, setRows] = useState([
        {
            id: 1,
            itemCode: "",
            description: "",
            quantity: 0,
            unit: "",
            price: 0,
            discount: 0,
            total: 0,
            selectedItemId: null as string | number | null,
            material_cost: 0,
            isExisting: false,
        },
    ]);
    // A completed row (not the last, always-open one) is locked until its
    // "Edit" button is clicked — before that, its fields can't be changed.
    const [editingRowId, setEditingRowId] = useState<number | null>(null);

    const handleAddRow = () => {
        // Get current customer's discount
        const currentCustomerDiscount = customer 
            ? (customers.find((c: any) => c.debtor_no === customer)?.discount || 0)
            : 0;

        setRows((prev) => [
            ...prev,
            {
                id: prev.length + 1,
                itemCode: "",
                description: "",
                quantity: 0,
                unit: "",
                price: 0,
                discount: currentCustomerDiscount,
                total: 0,
                selectedItemId: null,
                material_cost: 0,
                isExisting: false,
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
                                field === "price" ||
                                field === "discount"
                                ? (field === "quantity" ? value : r.quantity) *
                                (field === "price" ? value : r.price) *
                                (1 - (field === "discount" ? value : r.discount) / 100)
                                : r.total,
                    }
                    : r
            )
        );
    };

    // ===== Auto-generate reference based on fiscal year =====
    // Uses the shared TransactionReferenceService (via useNextFiscalYearReference) so
    // this follows the Customer Credit Note type's configured Prefix/Pattern under
    // Setup > Transaction References, instead of a hardcoded "NNN/year" format.
    // Only generate a reference for new credit notes, not when editing.
    useEffect(() => {
        if (location.state?.trans_no) return;
        if (nextCreditNoteReference) {
            setReference(nextCreditNoteReference);
        }
    }, [nextCreditNoteReference, location.state?.trans_no]);

    // Reset branch when customer changes (only if not in edit mode)
    useEffect(() => {
        if (!location.state?.trans_no) {
            setBranch("");
        }
    }, [customer, location.state?.trans_no]);

    // Update discount when customer changes
    useEffect(() => {
        if (customer) {
            const selectedCustomer = customers.find((c: any) => c.debtor_no === customer);
            if (selectedCustomer) {
                setDiscount(selectedCustomer.discount || 0);
                setRows((prev) => prev.map((r) => ({ ...r, discount: selectedCustomer.discount || 0 })));
            }
        } else {
            setDiscount(0);
            setRows((prev) => prev.map((r) => ({ ...r, discount: 0 })));
        }
    }, [customer, customers]);

    // Update prices when sales type changes
    useEffect(() => {
        if (!salesType) return;
        let cancelled = false;
        (async () => {
            const updated = await Promise.all(
                rows.map(async (r) => {
                    if (!r.selectedItemId) return r;
                    const { price: newPrice } = await resolveSalesItemPrice(
                        String(r.selectedItemId),
                        salesType,
                        salesTypes,
                        customerCurrency,
                        homeCurrencyCode
                    );
                    if (cancelled) return r;
                    return {
                        ...r,
                        price: newPrice,
                        total: r.quantity * newPrice * (1 - r.discount / 100),
                    };
                })
            );
            if (!cancelled) setRows(updated);
        })();
        return () => {
            cancelled = true;
        };
    }, [salesType, salesTypes, customerCurrency, homeCurrencyCode]);

    // Update tax group items when branch changes
    useEffect(() => {
        if (branch) {
            const selectedBranch = branches.find((b: any) => b.branch_code === branch);
            if (selectedBranch && selectedBranch.tax_group) {
                getTaxGroupItemsByGroupId(selectedBranch.tax_group)
                    .then((items) => setTaxGroupItems(items))
                    .catch((err) => console.error(err));
            } else {
                setTaxGroupItems([]);
            }
        } else {
            setTaxGroupItems([]);
        }
    }, [branch, branches]);

    const subTotal = rows.reduce((sum, r) => sum + r.total, 0);

    // Calculate taxes if taxIncl is true
    const selectedPriceList = useMemo(() => {
        return salesTypes.find((st: any) => String(st.id) === String(salesType));
    }, [salesType, salesTypes]);

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

    const hasValidRows = rows.some(r => r.selectedItemId && r.quantity > 0);

    const handleProcessCreditNote = async () => {
        if (!customer) {
            alert("Please select a customer.");
            return;
        }
        if (!branch) {
            alert("Please select a branch.");
            return;
        }
        if (!hasValidRows) {
            alert("Please add items with quantity greater than 0.");
            return;
        }

        const selectedCustomer = customers.find((c: any) => c.debtor_no === customer);
        const total = subTotal + (selectedPriceList?.taxIncl ? 0 : totalTaxAmount);
        const isEditing = !!location.state?.trans_no;

        let debtorResp: any = null;

        if (isEditing) {
            // UPDATE EXISTING CREDIT NOTE
            const existingTransNo = location.state.trans_no;

            // Validate that the transaction exists and has the correct type
            const existingTransaction = debtorTrans.find((t: any) =>
                String(t.trans_no) === String(existingTransNo) &&
                String(t.trans_type) === "11"
            );

            if (!existingTransaction) {
                alert("Invalid transaction or transaction type. Cannot update credit note.");
                return;
            }

            const debtorPayload = {
                trans_type: 11,
                version: 0,
                debtor_no: Number(customer),
                branch_code: Number(branch),
                tran_date: creditNoteDate,
                due_date: creditNoteDate,
                reference,
                tpe: salesType,
                order_no: 0,
                // Important for GL posting:
                // - ov_amount should represent net sales amount (excl output tax)
                // - ov_gst should carry output tax (when prices are tax-exclusive)
                ov_amount: subTotal,
                ov_gst: selectedPriceList?.taxIncl ? 0 : totalTaxAmount,
                ov_freight: shipping,
                ov_freight_tax: 0,
                ov_discount: 0,
                alloc: 0,
                prep_amount: 0,
                rate: 1,
                ship_via: Number(shippingCompany),
                cost_center_id: Number(costCenter) || 0,
                cost_center2_id: 0,
                payment_terms: selectedCustomer?.payment_terms || null,
                tax_included: selectedPriceList?.taxIncl ? 1 : 0,
            };

            // Update the main debtor transaction using the database id, not trans_no
            debtorResp = await updateDebtorTran(existingTransaction.id, debtorPayload);
            console.log("Debtor trans updated:", debtorResp);

            // Get existing details for this transaction
            const existingDetails = debtorTransDetails.filter((d: any) =>
                String(d.debtor_trans_no) === String(existingTransNo) &&
                String(d.debtor_trans_type) === "11"
            );

            // Process current form rows
            const currentRows = rows.filter(r => r.selectedItemId);

            // Update existing details and create new ones
            for (const row of currentRows) {
                const existingDetail = existingDetails.find((d: any) => d.stock_id === row.itemCode);

                if (existingDetail) {
                    // Update existing detail
                    const detailPayload = {
                        debtor_trans_no: existingTransNo,
                        debtor_trans_type: 11,
                        stock_id: row.itemCode,
                        description: row.description,
                        unit_price: row.price,
                        unit_tax: 0,
                        quantity: row.quantity,
                        discount_percent: row.discount,
                        standard_cost: row.material_cost,
                        qty_done: 0,
                        src_id: existingDetail.src_id ?? 0,
                    };

                    await updateDebtorTransDetail(existingDetail.id, detailPayload);
                    console.log("Debtor trans detail updated:", existingDetail.id);
                } else if (row.isExisting === false) {
                    // Create new detail for newly added items during update
                    const detailPayload = {
                        debtor_trans_no: existingTransNo,
                        debtor_trans_type: 11,
                        stock_id: row.itemCode,
                        description: row.description,
                        unit_price: row.price,
                        unit_tax: 0,
                        quantity: row.quantity,
                        discount_percent: row.discount,
                        standard_cost: row.material_cost,
                        qty_done: 0,
                        src_id: 0,
                    };

                    await createDebtorTransDetail(detailPayload);
                    console.log("New debtor trans detail created during update:", detailPayload);
                }
            }

            // Delete details that are no longer in the form
            const currentStockIds = currentRows.map(r => r.itemCode);
            const detailsToDelete = existingDetails.filter((d: any) => !currentStockIds.includes(d.stock_id));

            for (const detail of detailsToDelete) {
                await deleteDebtorTransDetail(detail.id);
                console.log("Debtor trans detail deleted:", detail.id);
            }

            // If credit note type is Return, update stock moves
            if (creditNoteType === "Return" && returnLocation) {
                // Get existing stock moves for this transaction
                const existingStockMoves = stockMoves.filter((sm: any) =>
                    String(sm.trans_no) === String(existingTransNo) &&
                    Number(sm.type) === 11
                );

                console.log("Existing stock moves:", existingStockMoves);

                // Update or create stock moves for current items
                for (const row of currentRows) {
                    const existingStockMove = existingStockMoves.find((sm: any) => sm.stock_id === row.itemCode);

                    const stockMovePayload = {
                        trans_no: existingTransNo,
                        stock_id: row.itemCode,
                        type: 11,
                        loc_code: returnLocation,
                        tran_date: creditNoteDate,
                        price: row.price,
                        reference: "Return",
                        qty: row.quantity,
                        standard_cost: row.material_cost,
                    };

                    if (existingStockMove) {
                        console.log("Updating stock move with trans_id:", existingStockMove.trans_id);
                        
                        try {
                            await updateStockMove(existingStockMove.trans_id, stockMovePayload);
                            console.log("Stock move updated:", existingStockMove.trans_id);
                        } catch (error) {
                            console.error("Failed to update stock move:", error);
                        }
                    } else {
                        // Create new stock move for newly added items
                        try {
                            await createStockMove(stockMovePayload);
                            console.log("New stock move created during update:", stockMovePayload);
                        } catch (error) {
                            console.error("Failed to create stock move:", error);
                        }
                    }
                }

                // Delete stock moves for items that are no longer in the form
                const currentStockIds2 = currentRows.map(r => r.itemCode);
                const stockMovesToDelete = existingStockMoves.filter((sm: any) => !currentStockIds2.includes(sm.stock_id));

                for (const stockMove of stockMovesToDelete) {
                    console.log("Deleting stock move with trans_id:", stockMove.trans_id);
                    
                    try {
                        await deleteStockMove(stockMove.trans_id);
                        console.log("Stock move deleted:", stockMove.trans_id);
                    } catch (error) {
                        console.error("Failed to delete stock move:", error);
                    }
                }
            } else {
                // If credit note type is not Return (e.g., Allowance/item written off), remove all existing stock moves
                const existingStockMoves = stockMoves.filter((sm: any) =>
                    String(sm.trans_no) === String(existingTransNo) &&
                    Number(sm.type) === 11
                );

                for (const stockMove of existingStockMoves) {
                    try {
                        await deleteStockMove(stockMove.trans_id);
                        console.log("Stock move deleted for Allowance type:", stockMove.trans_id);
                    } catch (error) {
                        console.error("Failed to delete stock move:", error);
                    }
                }
            }

        } else {
            // CREATE NEW CREDIT NOTE
            // Compute next trans_no for trans_type 11 (credit note)
            const existingDebtorTrans = (debtorTrans || []) as any[];
            const maxTrans = existingDebtorTrans
                .filter((d: any) => Number(d.trans_type) === 11 && d.trans_no != null)
                .reduce((m: number, d: any) => Math.max(m, Number(d.trans_no)), 0);
            const nextTransNo = maxTrans + 1;

            const debtorPayload = {
                trans_no: nextTransNo,
                trans_type: 11,
                version: 0,
                debtor_no: Number(customer),
                branch_code: Number(branch),
                tran_date: creditNoteDate,
                due_date: creditNoteDate,
                reference,
                tpe: salesType,
                order_no: 0,
                // Important for GL posting:
                // - ov_amount should represent net sales amount (excl output tax)
                // - ov_gst should carry output tax (when prices are tax-exclusive)
                ov_amount: subTotal,
                ov_gst: selectedPriceList?.taxIncl ? 0 : totalTaxAmount,
                ov_freight: shipping,
                ov_freight_tax: 0,
                ov_discount: 0,
                alloc: 0,
                prep_amount: 0,
                rate: 1,
                ship_via: Number(shippingCompany),
                cost_center_id: Number(costCenter) || 0,
                cost_center2_id: 0,
                payment_terms: selectedCustomer?.payment_terms || null,
                tax_included: selectedPriceList?.taxIncl ? 1 : 0,
            };

            debtorResp = await createDebtorTran(debtorPayload as any);
            const debtorTransNo = debtorResp?.trans_no ?? debtorResp?.id ?? null;
            console.log("Debtor trans created:", debtorResp, "debtorTransNo:", debtorTransNo);

            // Create debtor_trans_details
            const detailsToPost = rows.filter(r => r.selectedItemId);
            for (const row of detailsToPost) {
                const debtorDetailPayload = {
                    debtor_trans_no: debtorTransNo,
                    debtor_trans_type: 11,
                    stock_id: row.itemCode,
                    description: row.description,
                    unit_price: row.price,
                    unit_tax: 0,
                    quantity: row.quantity,
                    discount_percent: row.discount,
                    standard_cost: row.material_cost,
                    qty_done: 0,
                    src_id: 0,
                };
                console.log("Posting debtor_trans_detail", debtorDetailPayload);
                try {
                    const response = await createDebtorTransDetail(debtorDetailPayload);
                    console.log("Debtor trans detail posted successfully:", response);
                } catch (error) {
                    console.error("Failed to post debtor trans detail:", error);
                }
            }
        }

        // Create audit trail entry for this debtor_trans (type 11)
        try {
            const auditDateObj = new Date(creditNoteDate || new Date());
            let auditFiscalYearId = null;
            if (Array.isArray(fiscalYears) && fiscalYears.length > 0) {
                const matching = fiscalYears.find((fy: any) => {
                    if (!fy.fiscal_year_from || !fy.fiscal_year_to) return false;
                    const from = new Date(fy.fiscal_year_from);
                    const to = new Date(fy.fiscal_year_to);
                    if (isNaN(from.getTime()) || isNaN(to.getTime())) return false;
                    return auditDateObj >= from && auditDateObj <= to;
                });
                const chosen = matching || [...fiscalYears]
                    .filter((fy: any) => fy.fiscal_year_from && !isNaN(new Date(fy.fiscal_year_from).getTime()))
                    .sort((a: any, b: any) => new Date(b.fiscal_year_from).getTime() - new Date(a.fiscal_year_from).getTime())
                    .find((fy: any) => new Date(fy.fiscal_year_from) <= auditDateObj) || fiscalYears[0];
                if (chosen) {
                    auditFiscalYearId = chosen.id ?? chosen.fiscal_year_id ?? null;
                }
            }

            const transNo = isEditing ? location.state.trans_no : (debtorResp?.trans_no ?? debtorResp?.id ?? null);

            const auditPayload: any = {
                type: 11,
                trans_no: transNo,
                user: user?.id ?? null,
                stamp: new Date().toISOString(),
                description: memo || '',
                fiscal_year: auditFiscalYearId,
                gl_date: creditNoteDate || new Date().toISOString().split('T')[0],
                gl_seq: 0,
            };
            await auditTrailApi.create(auditPayload);
        } catch (e) {
            console.warn('Failed to create audit trail for customer credit note', e);
        }

        alert(isEditing ? "Credit Note updated successfully!" : "Credit Note processed successfully!");
        queryClient.invalidateQueries({ queryKey: ["debtorTrans"] });
        queryClient.invalidateQueries({ queryKey: ["debtorTransDetails"] });
        queryClient.invalidateQueries({ queryKey: ["stockMoves"] });

        const debtorTransNo = isEditing ? location.state.trans_no : (debtorResp?.trans_no ?? debtorResp?.id ?? null);
        navigate("/sales/transactions/customer-credit-notes/success-updated", {
            state: {
                trans_no: debtorTransNo,
                transNo: debtorTransNo,
                trans_type: 11,
                reference,
                date: creditNoteDate,
            },
        });
    };

    const breadcrumbItems = [
        { title: "Transactions", href: "/sales/transactions/" },
        { title: location.state?.trans_no ? "Modifying Customer Credit Note" : "Creating Customer Credit Note" },
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
                    <PageTitle title="Modifying Customer Credit Note" />
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
                            <TextField label="Reference" fullWidth size="small" value={reference} InputProps={{ readOnly: true }} />
                        </Stack>
                    </Grid>

                    <Grid item xs={12} sm={4}>
                        <Stack spacing={2}>
                            <TextField
                                select
                                fullWidth
                                label="Sales Type"
                                value={salesType}
                                onChange={(e) => setSalesType(e.target.value)}
                                size="small"
                            >
                                {salesTypes.map((st: any) => (
                                    <MenuItem key={st.id} value={st.id}>
                                        {st.typeName}
                                    </MenuItem>
                                ))}
                            </TextField>
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
                            <TextField label="Customer Discount (%)" fullWidth size="small" value={discount} InputProps={{ readOnly: true }} />
                        </Stack>
                    </Grid>

                    <Grid item xs={12} sm={4}>
                        <Stack spacing={2}>
                            <TextField
                                label="Credit Note Date"
                                type="date"
                                fullWidth
                                size="small"
                                value={creditNoteDate}
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
                                <MenuItem value="">
                                    <em>None</em>
                                </MenuItem>
                                {/* {costCenters.map((d: any) => (
                    <MenuItem key={d.id} value={d.id}>
                      {d.name}
                    </MenuItem>
                  ))} */}
                            </TextField>
                        </Stack>
                    </Grid>
                </Grid>
            </Paper>
            {/* Items Table */}
            <Typography variant="subtitle1" sx={{ mb: 2, textAlign: "center" }}>
                Customer Credit Note Items
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
                            <TableCell>Price</TableCell>
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
                            <TableRow key={row.id}>
                                <TableCell>{i + 1}</TableCell>
                                <TableCell>
                                    <TextField
                                        size="small"
                                        value={row.itemCode}
                                        onChange={(e) => handleChange(row.id, "itemCode", e.target.value)}
                                        InputProps={{ readOnly: row.isExisting || isLocked }}
                                    />
                                </TableCell>
                                <TableCell>
                                    {row.isExisting ? (
                                        <TextField
                                            size="small"
                                            value={row.description}
                                            InputProps={{ readOnly: true }}
                                            fullWidth
                                        />
                                    ) : (
                                        <TextField
                                            select
                                            size="small"
                                            disabled={isLocked}
                                            value={row.description}
                                            onChange={async (e) => {
                                                const selectedValue = e.target.value?.trim();
                                                const selected = items.find((item: any) => 
                                                    item.description?.trim() === selectedValue
                                                );
                                                
                                                handleChange(row.id, "description", selectedValue);
                                                
                                                if (selected) {
                                                    handleChange(row.id, "itemCode", selected.stock_id);
                                                    handleChange(row.id, "selectedItemId", selected.stock_id);
                                                    
                                                    try {
                                                        const { price: itemPrice, material_cost } =
                                                            await resolveSalesItemPrice(
                                                                selected.stock_id,
                                                                salesType || salesTypes[0]?.id || 0,
                                                                salesTypes,
                                                                customerCurrency,
                                                                homeCurrencyCode
                                                            );
                                                        const itemData = await getItemById(selected.stock_id);
                                                        const unitName = itemData
                                                            ? itemUnits.find((u: any) => u.id === itemData.units)?.abbr || ""
                                                            : "";
                                                        handleChange(row.id, "unit", unitName);
                                                        handleChange(row.id, "price", itemPrice);
                                                        handleChange(row.id, "material_cost", material_cost);
                                                    } catch (error) {
                                                        console.error("Failed to fetch item data:", error);
                                                        handleChange(row.id, "unit", "");
                                                        handleChange(row.id, "price", 0);
                                                        handleChange(row.id, "material_cost", 0);
                                                    }
                                                } else {
                                                    // Clear related fields if item not found
                                                    handleChange(row.id, "itemCode", "");
                                                    handleChange(row.id, "selectedItemId", null);
                                                    handleChange(row.id, "unit", "");
                                                    handleChange(row.id, "price", 0);
                                                    handleChange(row.id, "material_cost", 0);
                                                }
                                            }}
                                            fullWidth
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
                                    )}
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
                                <TableCell>
                                    <CurrencyAmountInput
                                        value={row.price}
                                        currencyCode={customerCurrency}
                                        disabled={isLocked}
                                        onChange={(v) => handleChange(row.id, "price", v)}
                                    />
                                </TableCell>
                                <TableCell>
                                    <FormattedNumberField size="small" value={row.discount} InputProps={{ readOnly: true }} />
                                </TableCell>
                                <TableCell>{formatMoney(row.total)}</TableCell>
                                <TableCell>
                                    {isLastRow ? (
                                        <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={handleAddRow} disabled={!row.itemCode || !(Number(row.quantity) > 0)}>
                                            Add
                                        </Button>
                                    ) : (
                                        <Stack direction="row" spacing={1}>
                                        {editingRowId === row.id ? (
                                            <Button size="small" variant="contained" onClick={() => setEditingRowId(null)}>
                                                Done
                                            </Button>
                                        ) : (
                                            <Button size="small" variant="outlined" startIcon={<EditIcon />} onClick={() => setEditingRowId(row.id)}>
                                                Edit
                                            </Button>
                                        )}
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            color="error"
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
                            <TableCell colSpan={7} sx={{ fontWeight: 600 }}>
                                Sub-total
                            </TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>{formatMoney(subTotal)}</TableCell>
                            <TableCell></TableCell>
                        </TableRow>
                        {taxCalculations.map((tax, index) => (
                            <TableRow key={index}>
                                <TableCell colSpan={7} sx={{ fontWeight: 600 }}>
                                    {tax.name} ({tax.rate}%)
                                </TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>{formatMoney(tax.amount)}</TableCell>
                                <TableCell></TableCell>
                            </TableRow>
                        ))}
                        <TableRow>
                            <TableCell colSpan={7} sx={{ fontWeight: 600 }}>
                                Shipping
                            </TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>
                                <FormattedNumberField
                                    size="small"
                                    value={shipping}
                                    onChange={(e) => setShipping(Number(e.target.value) || 0)}
                                    sx={{ width: 100 }}
                                />
                            </TableCell>
                            <TableCell></TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell colSpan={7} sx={{ fontWeight: 600 }}>
                                Credit Note Total
                            </TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>{formatMoney(subTotal + (selectedPriceList?.taxIncl ? 0 : totalTaxAmount) + shipping)}</TableCell>
                            <TableCell></TableCell>
                        </TableRow>
                    </TableFooter>
                </Table>
            </TableContainer>
            {/* Credit Note Type + Memo Section */}
            <Paper sx={{ p: 2, borderRadius: 2 }}>
                <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                        <TextField
                            select
                            fullWidth
                            label="Credit Note Type"
                            value={creditNoteType}
                            onChange={(e) => setCreditNoteType(e.target.value)}
                            size="small"
                        >
                            <MenuItem value="Return">Items Returned to Inventory Location</MenuItem>
                            <MenuItem value="Allowance">Items Written Off</MenuItem>
                        </TextField>
                    </Grid>

                    <Grid item xs={12} sm={6}>
                        {creditNoteType === "Return" ? (
                            <TextField
                                select
                                fullWidth
                                label="Items Returned To Location"
                                value={returnLocation}
                                onChange={(e) => setReturnLocation(e.target.value)}
                                size="small"
                            >
                                {locations.map((loc: any) => (
                                    <MenuItem key={loc.loc_code} value={loc.loc_code}>
                                        {loc.location_name}
                                    </MenuItem>
                                ))}
                            </TextField>
                        ) : creditNoteType === "Allowance" ? (
                            <TextField
                                select
                                fullWidth
                                label="Write off the cost of the items to"
                                value={returnLocation}
                                onChange={(e) => setReturnLocation(e.target.value)}
                                size="small"
                            >
                                {groupedGLMenuItems}
                            </TextField>
                        ) : null}
                    </Grid>

                    <Grid item xs={12}>
                        <TextField
                            fullWidth
                            multiline
                            rows={2}
                            label="Memo"
                            value={memo}
                            onChange={(e) => setMemo(e.target.value)}
                        />
                    </Grid>
                </Grid>

                <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2, gap: 2 }}>
                    <Button variant="outlined" onClick={() => navigate(-1)}>
                        Cancel
                    </Button>
                    <Button variant="contained" color="primary" onClick={handleProcessCreditNote} disabled={!!dateError || !canEdit}>
                        {location.state?.trans_no ? "Update Credit Note" : "Process Credit Note"}
                    </Button>
                </Box>
            </Paper>
        </FormPageLayout>
    );
}
