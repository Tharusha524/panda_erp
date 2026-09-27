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
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getLocations } from "../../../../api/FixedAssetsLocation/FixedAssetsLocationApi";
import { getItems, getItemById } from "../../../../api/Item/ItemApi";
import { getItemUnits } from "../../../../api/ItemUnit/ItemUnitApi";
import { getFiscalYears } from "../../../../api/FiscalYear/FiscalYearApi";
import { getStockMoves } from "../../../../api/StockMoves/StockMovesApi";
import { getStockQoh } from "../../../../api/Inventory/StockQuantityApi";
import { postFaDisposal, postFaOpeningBalance } from "../../../../api/FixedAssets/FaTransactionApi";
import { createAuditTrail } from "../../../../api/StockMoves/AuditTrailsApi";
import { createComment } from "../../../../api/Comments/CommentsApi";
import useCurrentUser from "../../../../hooks/useCurrentUser";
import Breadcrumb from "../../../../components/BreadCrumb";
import PageTitle from "../../../../components/PageTitle";
import ItemSearchSelect, { type ItemSearchOption } from "../../../../components/ItemSearchSelect";
import { findFaItemByStockId } from "../../../../utils/fixedAssetsScreenCopy";
import theme from "../../../../theme";
import FormattedNumberField from "../../../../components/FormattedNumberField";
import { useAuth } from "../../../../context/AuthContext";

function faLocationCode(loc: { locationCode?: string; loc_code?: string }): string {
    return String(loc.locationCode ?? loc.loc_code ?? "").toUpperCase();
}

function faLocationName(loc: { locationName?: string; location_name?: string; locationCode?: string; loc_code?: string }): string {
    return loc.locationName ?? loc.location_name ?? faLocationCode(loc);
}

async function fetchRowQoh(stockId: string | number, locCode: string): Promise<number> {
    if (!stockId || !locCode) return 0;
    try {
        return await getStockQoh(String(stockId), locCode);
    } catch {
        return 0;
    }
}

export default function FixedAssetsDisposal() {
  const { hasEditPermission } = useAuth();
  const canEdit = hasEditPermission('Fixed Asset disposals');
    const navigate = useNavigate();

    // Fetch locations
    const { data: locations = [] } = useQuery({
        queryKey: ["fixedAssetsLocations"],
        queryFn: getLocations,
    });

    // Fetch fixed asset items only (mb_flag = 4)
    const { data: items = [] } = useQuery({
        queryKey: ["fixedAssetItems"],
        queryFn: async () => {
            const all = await getItems();
            return (all as { stock_id: string | number; description: string; mb_flag?: number }[]).filter(
                (item) => Number(item.mb_flag) === 4
            );
        },
    });

    // Fetch item units
    const { data: itemUnits = [] } = useQuery({
        queryKey: ["itemUnits"],
        queryFn: getItemUnits,
    });

    // Fetch fiscal years
    const { data: fiscalYears = [] } = useQuery({
        queryKey: ["fiscalYears"],
        queryFn: getFiscalYears,
    });

    // Find current fiscal year
    const currentFiscalYear = useMemo(() => {
        const now = new Date();
        return fiscalYears.find((fy: any) =>
            !fy.isClosed &&
            new Date(fy.fiscal_year_from) <= now &&
            now <= new Date(fy.fiscal_year_to)
        );
    }, [fiscalYears]);

    const { user } = useCurrentUser();
    const userId = user?.id ?? (Number(localStorage.getItem("userId")) || 0);

    // Validate date
    const validateDate = (selectedDate: string) => {
        if (!currentFiscalYear) {
            setDateError("No active fiscal year found.");
            return;
        }
        const selected = new Date(selectedDate);
        const start = new Date(currentFiscalYear.fiscal_year_from);
        const end = new Date(currentFiscalYear.fiscal_year_to);
        if (selected < start || selected > end) {
            setDateError("Date must be within the fiscal year.");
        } else {
            setDateError("");
        }
    };

    // Validate date on fiscal year load
    useEffect(() => {
        if (currentFiscalYear) {
            validateDate(date);
        }
    }, [currentFiscalYear]);

    // Set reference when fiscal year loads (or fallback when DB empty)
    useEffect(() => {
        // Determine year: prefer fiscal year start if available, otherwise use current calendar year
        const year = currentFiscalYear
            ? new Date(currentFiscalYear.fiscal_year_from).getFullYear()
            : new Date().getFullYear();

        // Fetch existing references to generate next sequential number
        // Only consider stock moves of the same transaction type (17 = FA disposal/adjustment)
        getStockMoves()
            .then((stockMoves) => {
                const moves = Array.isArray(stockMoves) ? stockMoves : [];
                const yearReferences = moves
                    .filter((move: any) => move && move.type === 17 && move.reference && String(move.reference).endsWith(`/${year}`))
                    .map((move: any) => String(move.reference))
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
                console.error("Error fetching stock moves for reference generation:", error);
                // Fallback to 001 if there's an error or DB is empty
                setReference(`001/${year}`);
            });
    }, [currentFiscalYear]);
    const [rows, setRows] = useState<{
        id: number;
        itemCode: string;
        description: string;
        quantity: string;
        unit: string;
        unitCost: string;
        initialValue: string;
        qoh: number;
        selectedItemId: string | number | null;
    }[]>([
        {
            id: 1,
            itemCode: "",
            description: "",
            quantity: "",
            unit: "",
            unitCost: "",
            initialValue: "",
            qoh: 0,
            selectedItemId: null,
        },
    ]);

    //  Form fields
    const [location, setLocation] = useState("");
    const [date, setDate] = useState<string>(new Date().toISOString().split("T")[0]);
    const [reference, setReference] = useState("");
    const [memo, setMemo] = useState("");
    const [dateError, setDateError] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);
    const [processError, setProcessError] = useState("");
    const [processSuccess, setProcessSuccess] = useState(false);
    // A completed row (not the last, always-open one) is locked until its
    // "Edit" button is clicked — before that, its fields can't be changed.
    const [editingRowId, setEditingRowId] = useState<number | null>(null);

    // Update QOH when location changes
    useEffect(() => {
        if (!location) {
            setRows((prev) => prev.map((row) => ({ ...row, qoh: 0 })));
            return;
        }
        const updateQOH = async () => {
            const nextRows = await Promise.all(
                rows.map(async (row) => {
                    if (!row.selectedItemId) return { ...row, qoh: 0 };
                    const qoh = await fetchRowQoh(row.selectedItemId, location);
                    return { ...row, qoh };
                })
            );
            setRows(nextRows);
        };
        updateQOH();
    }, [location]);

    //  Handle table field changes
    const handleChange = (id: number, field: string, value: any) => {
        setRows((prev) =>
            prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
        );
    };

    const handleFaRowItemSelect = async (rowId: number, selected: ItemSearchOption | null) => {
        if (!selected) {
            handleChange(rowId, "description", "");
            handleChange(rowId, "itemCode", "");
            handleChange(rowId, "selectedItemId", null);
            return;
        }
        const selectedItem = findFaItemByStockId(items, selected.stock_id) ?? selected;
        handleChange(rowId, "description", selectedItem.description);
        handleChange(rowId, "itemCode", selectedItem.stock_id);
        handleChange(rowId, "selectedItemId", selectedItem.stock_id);
        try {
            const itemData = await getItemById(selectedItem.stock_id);
            if (itemData?.units !== undefined) {
                const unit = itemUnits.find((u: any) => u.id === itemData.units);
                const unitDescription = unit?.description || unit?.name || itemData.units;
                handleChange(rowId, "unit", unitDescription || "");
            }
            if (itemData?.purchase_cost !== undefined) {
                handleChange(rowId, "unitCost", String(itemData.purchase_cost));
            }
            if (location) {
                const qoh = await fetchRowQoh(selectedItem.stock_id, location);
                handleChange(rowId, "qoh", qoh);
            }
        } catch (error) {
            console.error("Error fetching item data:", error);
        }
    };

    //  Add new row
    const handleAddItem = () => {
        setRows((prev) => [
            ...prev,
            {
                id: prev.length + 1,
                itemCode: "",
                description: "",
                quantity: "",
                unit: "",
                unitCost: "",
                initialValue: "",
                qoh: 0,
                selectedItemId: null as string | number | null,
            },
        ]);
    };

    //  Remove row (optional)
    const handleRemoveRow = (id: number) => {
        setRows((prev) => prev.filter((r) => r.id !== id));
    };

    const handleRecordOpeningQoh = async (rowId: number) => {
        if (!location) {
            setProcessError("Select a location first.");
            return;
        }
        const row = rows.find((r) => r.id === rowId);
        if (!row?.selectedItemId || parseFloat(String(row.quantity)) <= 0) {
            setProcessError("Enter a disposal quantity before recording opening QOH.");
            return;
        }
        setIsProcessing(true);
        setProcessError("");
        try {
            await postFaOpeningBalance({
                loc_code: location,
                trans_date: date,
                lines: [
                    {
                        stock_id: String(row.selectedItemId),
                        quantity: parseFloat(String(row.quantity)),
                    },
                ],
            });
            const qoh = await fetchRowQoh(row.selectedItemId, location);
            setRows((prev) =>
                prev.map((r) => (r.id === rowId ? { ...r, qoh } : r))
            );
            setProcessSuccess(true);
        } catch (error: any) {
            setProcessError(
                error.response?.data?.message ||
                    "Failed to record opening quantity on hand."
            );
        } finally {
            setIsProcessing(false);
        }
    };

    const handleProcessTransfer = async () => {
        if (!location) {
            setProcessError("Please select location.");
            return;
        }
        if (dateError) {
            setProcessError("Please fix the date error before proceeding.");
            return;
        }

        const validRows = rows.filter((row) => row.selectedItemId && parseFloat(String(row.quantity)) > 0);
        if (validRows.length === 0) {
            setProcessError("Please add at least one item with quantity greater than 0.");
            return;
        }

        const rowsWithQoh = await Promise.all(
            validRows.map(async (row) => ({
                ...row,
                qoh: await fetchRowQoh(String(row.selectedItemId), location),
            }))
        );
        setRows((prev) =>
            prev.map((row) => {
                const updated = rowsWithQoh.find((r) => r.id === row.id);
                return updated ? { ...row, qoh: updated.qoh } : row;
            })
        );

        const invalidRows = rowsWithQoh.filter(
            (row) => parseFloat(String(row.quantity)) > row.qoh + 0.0001
        );
        if (invalidRows.length > 0) {
            const details = invalidRows
                .map(
                    (row) =>
                        `${row.description} (available at ${location}: ${row.qoh})`
                )
                .join("; ");
            setProcessError(
                `Disposal quantity exceeds quantity on hand. ${details}. ` +
                    "If this asset has no stock history, click “Record opening QOH” or post an FA Purchase into this location first."
            );
            return;
        }

        setIsProcessing(true);
        setProcessError("");
        setProcessSuccess(false);

        try {
            const result = await postFaDisposal({
                loc_code: location,
                trans_date: date,
                reference: reference || undefined,
                lines: validRows.map((row) => ({
                    stock_id: String(row.selectedItemId),
                    quantity: parseFloat(row.quantity),
                })),
            });

            const transNo = Number(result?.trans_no ?? 0);
            setProcessSuccess(true);

            // Create audit trail entry for this disposal
            try {
                await createAuditTrail({
                    type: 17,
                    trans_no: transNo,
                    user: userId,
                    description: null,
                    fiscal_year: currentFiscalYear?.id ?? null,
                    gl_date: date,
                    gl_seq: null,
                });
            } catch (err) {
                console.error("Failed to create audit trail for transfer", err);
            }

            // If memo was provided, save it to comments table (non-blocking)
            if (memo && String(memo).trim() !== "") {
                try {
                    await createComment({
                        type: 17,
                        id: transNo,
                        date_: date || null,
                        memo_: memo,
                    });
                } catch (err) {
                    console.error("Failed to create comment for transfer", err);
                }
            }

            // Build payload to pass to success/view pages
            const payload = {
                reference,
                date,
                location,
                trans_no: transNo,
                trans_type: 17,
                items: rows
                    .filter(row => row.selectedItemId && parseFloat(row.quantity) > 0)
                    .map(r => ({
                        itemCode: r.itemCode,
                        description: r.description,
                        quantity: r.quantity,
                        unitCost: r.unitCost,
                        initialValue: r.initialValue,
                        unit: r.unit,
                        selectedItemId: r.selectedItemId,
                    })),
            };

            navigate(
                "/fixedassets/transactions/fixed-assets-disposal/success",
                { state: payload }
            );
        } catch (error: any) {
            console.error("Error processing transfer:", error);
            setProcessError(error.response?.data?.message || "Error processing disposal. Please try again.");
        } finally {
            setIsProcessing(false);
        }
    };

    const breadcrumbItems = [
        { title: "Home", href: "/dashboard" },
        { title: "Fixed Assets Disposal" },
    ];

    return (
        <FormPageLayout>
            {/*  Header */}
            <Box
                sx={{
                    padding: theme.spacing(2),
                    boxShadow: 2,
                    borderRadius: 1,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                }}
            >
                <Box>
                    <PageTitle title="Fixed Assets Disposal" />
                    <Breadcrumb breadcrumbs={breadcrumbItems} />
                </Box>

                <Button
                    variant="outlined"
                    startIcon={<ArrowBackIcon />}
                    onClick={() => navigate(-1)}
                >
                    Back
                </Button>
            </Box>
            {/*  From/To Location, Date, Reference */}
            <Paper sx={{ p: 2, borderRadius: 2 }}>
                <Grid container spacing={2}>
                    {/* From Location */}
                    <Grid item xs={12} sm={3}>
                        <TextField
                            select
                            fullWidth
                            label="Location"
                            value={location}
                            onChange={(e) => setLocation(e.target.value.toUpperCase())}
                            size="small"
                            SelectProps={{ displayEmpty: true }}
                        >
                            <MenuItem value="">
                                <em>Select location</em>
                            </MenuItem>
                            {locations.map((loc) => (
                                <MenuItem key={faLocationCode(loc)} value={faLocationCode(loc)}>
                                    {faLocationName(loc)}
                                </MenuItem>
                            ))}
                        </TextField>
                    </Grid>

                    {/* Date */}
                    <Grid item xs={12} sm={3}>
                        <TextField
                            label="Date"
                            type="date"
                            fullWidth
                            size="small"
                            value={date}
                            onChange={(e) => {
                                setDate(e.target.value);
                                validateDate(e.target.value);
                            }}
                            error={!!dateError}
                            helperText={dateError}
                            InputLabelProps={{ shrink: true }}
                        />
                    </Grid>

                    {/* Reference */}
                    <Grid item xs={12} sm={3}>
                        <TextField
                            label="Reference"
                            fullWidth
                            size="small"
                            value={reference}
                            onChange={(e) => setReference(e.target.value)}
                            placeholder="Enter reference"
                            InputProps={{
                                readOnly: true,
                            }}
                        />
                    </Grid>
                </Grid>
            </Paper>
            {/*  Table */}
            <TableContainer component={Paper} sx={{ p: 1 }}>
                <Table>
                    <TableHead sx={{ backgroundColor: "var(--pallet-lighter-blue)" }}>
                        <TableRow>
                            <TableCell>No</TableCell>
                            <TableCell>Item Code</TableCell>
                            <TableCell>Item Description</TableCell>
                            <TableCell>Quantity</TableCell>
                            <TableCell>QOH</TableCell>
                            <TableCell>Unit</TableCell>
                            <TableCell>Unit Cost</TableCell>
                            <TableCell>Initial Value</TableCell>
                            <TableCell align="center">Action</TableCell>
                        </TableRow>
                    </TableHead>

                    <TableBody>
                        {rows.map((row, index) => {
                            const isLastRow = index === rows.length - 1;
                            const isLocked = !isLastRow && editingRowId !== row.id;

                            return (
                            <TableRow key={row.id} hover data-row-id={row.id}>
                                <TableCell>{index + 1}</TableCell>
                                <TableCell>
                                    <ItemSearchSelect
                                        displayField="code"
                                        hideLabel
                                        placeholder="Search fixed asset code…"
                                        disabled={isLocked}
                                        selectedStockId={String(row.selectedItemId ?? row.itemCode ?? "")}
                                        value={row.itemCode}
                                        items={items as ItemSearchOption[]}
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
                                        items={items as ItemSearchOption[]}
                                        onSelect={(selected) => handleFaRowItemSelect(row.id, selected)}
                                    />
                                </TableCell>
                                <TableCell>
                                    <FormattedNumberField
                                        size="small"
                                        value={row.quantity}
                                        InputProps={{ readOnly: isLocked }}
                                        onChange={(e) =>
                                            handleChange(row.id, "quantity", Number(e.target.value))
                                        }
                                    />
                                </TableCell>
                                <TableCell>
                                    <Stack spacing={0.5}>
                                        <Typography variant="body2">{row.qoh}</Typography>
                                        {location && row.selectedItemId && row.qoh <= 0 && (
                                            <Button
                                                size="small"
                                                variant="text"
                                                disabled={isProcessing}
                                                onClick={() => handleRecordOpeningQoh(row.id)}
                                            >
                                                Record opening QOH
                                            </Button>
                                        )}
                                    </Stack>
                                </TableCell>
                                <TableCell>
                                    <FormattedNumberField
                                        size="small"
                                        value={row.unitCost}
                                        InputProps={{ readOnly: isLocked }}
                                        onChange={(e) => handleChange(row.id, "unitCost", e.target.value)}
                                    />
                                </TableCell>
                                <TableCell>
                                    <FormattedNumberField
                                        size="small"
                                        value={row.initialValue}
                                        InputProps={{ readOnly: isLocked }}
                                        onChange={(e) => handleChange(row.id, "initialValue", e.target.value)}
                                    />
                                </TableCell>
                                <TableCell>
                                    <TextField
                                        size="small"
                                        value={row.unit}
                                        onChange={(e) => handleChange(row.id, "unit", e.target.value)}
                                        InputProps={{
                                            readOnly: true,
                                        }}
                                    />
                                </TableCell>
                                <TableCell align="center">
                                    {isLastRow ? (
                                        <Button
                                            variant="contained"
                                            color="primary"
                                            size="small"
                                            startIcon={<AddIcon />}
                                            onClick={handleAddItem}
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
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
            {/*  Memo Field */}
            <Box sx={{ mt: 2, pl: 1, pr: 1 }}>
                <Typography sx={{ mb: 1, fontWeight: 600 }}>Memo:</Typography>
                <TextField
                    fullWidth
                    multiline
                    rows={3}
                    placeholder="Enter memo or notes..."
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                />
            </Box>
            {/* Success/Error Messages */}
            {processSuccess && (
                <Alert severity="success" sx={{ mt: 2 }}>
                    Disposal processed successfully! Redirecting...
                </Alert>
            )}
            {processError && (
                <Alert severity="error" sx={{ mt: 2 }}>
                    {processError}
                </Alert>
            )}
            {/*  Process Transfer Button */}
            <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2, pr: 1 }}>
                <Button
                    variant="contained"
                    color="primary"
                    onClick={handleProcessTransfer}
                    disabled={!!dateError || isProcessing || !canEdit}
                >
                    {isProcessing ? "Processing..." : "Process Disposal"}
                </Button>
            </Box>
        </FormPageLayout>
    );
}
