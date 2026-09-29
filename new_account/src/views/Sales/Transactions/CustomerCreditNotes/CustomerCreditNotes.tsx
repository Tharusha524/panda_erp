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
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";

// ===== API Imports =====
import { getCustomers } from "../../../../api/Customer/AddCustomerApi";
import { getBranches } from "../../../../api/CustomerBranch/CustomerBranchApi";
import { getSalesTypes } from "../../../../api/SalesMaintenance/salesService";
import { getShippingCompanies } from "../../../../api/ShippingCompany/ShippingCompanyApi";
import CostCenterSelect from "../../../../components/CostCenterSelect";
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
import { createSalesCreditNote } from "../../../../api/SalesCreditNote/SalesCreditNoteApi";
import { getDebtorTrans } from "../../../../api/DebtorTrans/DebtorTransApi";
import { runTransactionSave } from "../../../../utils/transactionSave";
import { getFiscalYears } from "../../../../api/FiscalYear/FiscalYearApi";
import { getCompanies } from "../../../../api/CompanySetup/CompanySetupApi";
import { getChartMasters } from "../../../../api/GLAccounts/ChartMasterApi";
import { createStockMove, getStockMoves } from "../../../../api/StockMoves/StockMovesApi";
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

export default function CustomerCreditNotes() {
  const { hasEditPermission } = useAuth();
  const canEdit = hasEditPermission('Sales credit notes against invoice');
    const navigate = useNavigate();
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
    const [userSelectedCustomer, setUserSelectedCustomer] = useState(false);
    const [creditNoteDate, setCreditNoteDate] = useState(
        new Date().toISOString().split("T")[0]
    );
    const [costCenter, setCostCenter] = useState("");
    const [creditNoteType, setCreditNoteType] = useState("");
    const [returnLocation, setReturnLocation] = useState("");
    const [glAccount, setGlAccount] = useState("");
    const [memo, setMemo] = useState("");
    const [dateError, setDateError] = useState("");

    // trans_type 11 = Customer Credit Note
    const { reference: nextCreditNoteReference } = useNextFiscalYearReference(11, {
        asOfDate: creditNoteDate,
    });

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
    const { data: stockMoves = [] } = useQuery({ queryKey: ["stockMoves"], queryFn: getStockMoves });
    const { data: chartMaster = [] } = useQuery<ChartMaster[]>({ queryKey: ["chartMaster"], queryFn: () => getChartMasters() });
    const { data: fiscalYears = [] } = useQuery({ queryKey: ["fiscalYears"], queryFn: getFiscalYears });
    const { data: companyData } = useQuery({
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
        setCreditNoteDate(value);
        validateDate(value);
    };

    // Validate date when fiscal year changes
    useEffect(() => {
        if (selectedFiscalYear) {
            validateDate(creditNoteDate);
        }
    }, [selectedFiscalYear]);
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
        },
    ]);
    // A completed row (not the last, always-open one) is locked until its
    // "Edit" button is clicked — before that, its fields can't be changed.
    const [editingRowId, setEditingRowId] = useState<number | null>(null);

    const handleAddRow = () => {
        setRows((prev) => [
            ...prev,
            {
                id: prev.length + 1,
                itemCode: "",
                description: "",
                quantity: 0,
                unit: "",
                price: 0,
                discount: 0,
                total: 0,
                selectedItemId: null,
                material_cost: 0,
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
    useEffect(() => {
        if (nextCreditNoteReference) {
            setReference(nextCreditNoteReference);
        }
    }, [nextCreditNoteReference]);

    // Auto-select first customer, branch, and sales type until user manually selects customer
    useEffect(() => {
        if (!userSelectedCustomer && customers.length > 0 && !customer) {
            setCustomer(customers[0].debtor_no);
        }
    }, [customers, userSelectedCustomer, customer]);

    useEffect(() => {
        if (!userSelectedCustomer && customer && branches.length > 0 && !branch) {
            const customerBranches = branches.filter((b: any) => b.debtor_no === customer);
            if (customerBranches.length > 0) {
                setBranch(customerBranches[0].branch_code);
            }
        }
    }, [customer, branches, userSelectedCustomer, branch]);

    useEffect(() => {
        if (!userSelectedCustomer && salesTypes.length > 0 && !salesType) {
            setSalesType(String(salesTypes[0].id));
        }
    }, [salesTypes, userSelectedCustomer, salesType]);

    // Reset branch when customer changes (only if user manually selected)
    useEffect(() => {
        if (userSelectedCustomer && customer && branches.length > 0) {
            const customerBranches = branches.filter((b: any) => b.debtor_no === customer);
            if (customerBranches.length > 0) {
                setBranch(customerBranches[0].branch_code);
            } else {
                setBranch("");
            }
        }
    }, [customer, userSelectedCustomer, branches]);

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

    const subTotal = rows
        .filter((r) => r.selectedItemId && r.quantity > 0)
        .reduce((sum, r) => sum + r.total, 0);

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
        if (!creditNoteType) {
            alert("Please select credit note type.");
            return;
        }
        if (creditNoteType === "Return" && !returnLocation) {
            alert("Please select return location.");
            return;
        }
        if (creditNoteType === "Allowance" && !glAccount) {
            alert("Please select write-off GL account.");
            return;
        }
        if (!hasValidRows) {
            alert("Please add items with quantity greater than 0.");
            return;
        }

        const saveResult = await runTransactionSave(async () => {
            const result = await createSalesCreditNote({
                debtor_no: Number(customer),
                branch_code: Number(branch),
                tran_date: creditNoteDate,
                order_type: Number(salesType),
                ship_via: Number(shippingCompany) || undefined,
                freight_cost: Number(shipping) || 0,
                from_stk_loc: creditNoteType === "Return" ? returnLocation : undefined,
                write_off_account: creditNoteType === "Allowance" ? glAccount : undefined,
                comments: memo || undefined,
                reference: reference || undefined,
                cost_center_id: Number(costCenter) || 0,
                lines: rows
                    .filter((r) => r.selectedItemId && r.quantity > 0)
                    .map((r) => ({
                        stock_id: r.itemCode,
                        quantity: r.quantity,
                        unit_price: r.price,
                        discount_percent: r.discount,
                        description: r.description,
                    })),
            });

            if (result.gl_warning) {
                console.warn("Credit note GL warning:", result.gl_warning);
            }

            return {
                trans_no: result.trans_no,
                reference: result.reference ?? reference,
                trans_type: 11,
                date: creditNoteDate,
            };
        });

        if (saveResult.ok === false) {
            alert(saveResult.message || "Failed to process credit note.");
            return;
        }

        queryClient.invalidateQueries({ queryKey: ["debtorTrans"] });
        queryClient.invalidateQueries({ queryKey: ["debtorTransDetails"] });
        queryClient.invalidateQueries({ queryKey: ["stockMoves"] });
        navigate("/sales/transactions/customer-credit-notes/success", {
            state: saveResult.data,
        });
    };

    const breadcrumbItems = [
        { title: "Transactions", href: "/sales/transactions/" },
        { title: "Customer Credit Notes" },
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
                    <PageTitle title="Customer Credit Note" />
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
                                onChange={(e) => {
                                    setCustomer(e.target.value);
                                    setUserSelectedCustomer(true);
                                }}
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
                            <CostCenterSelect
                                label="Cost Center"
                                value={costCenter}
                                onChange={setCostCenter}
                                costCenterType={1}
                            />
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
                                                    handleChange(row.id, "material_cost", material_cost);
                                                    handleChange(row.id, "price", itemPrice);
                                                    if (!row.quantity) {
                                                        handleChange(row.id, "quantity", 1);
                                                    }
                                                } catch (err) {
                                                    console.error("Failed to resolve item price:", err);
                                                }
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
                                Total
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
                                value={glAccount}
                                onChange={(e) => setGlAccount(e.target.value)}
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
                        Update
                    </Button>
                    <Button variant="contained" color="primary" onClick={handleProcessCreditNote} disabled={!!dateError || !canEdit}>
                        Process Credit Note
                    </Button>
                </Box>
            </Paper>
        </FormPageLayout>
    );
}
