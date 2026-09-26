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
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getInventoryLocations } from "../../../../api/InventoryLocation/InventoryLocationApi";
import { getItems, getItemById } from "../../../../api/Item/ItemApi";
import { getItemUnits } from "../../../../api/ItemUnit/ItemUnitApi";
import { getFiscalYears } from "../../../../api/FiscalYear/FiscalYearApi";
import { getStockQoh } from "../../../../api/Inventory/StockQuantityApi";
import { postInventoryTransfer } from "../../../../api/Inventory/InventoryTransactionApi";
import { getCompanies } from "../../../../api/CompanySetup/CompanySetupApi";
import { useNextFiscalYearReference } from "../../../../hooks/useNextFiscalYearReference";
import { runTransactionSave } from "../../../../utils/transactionSave";
import Breadcrumb from "../../../../components/BreadCrumb";
import PageTitle from "../../../../components/PageTitle";
import theme from "../../../../theme";
import AddedConfirmationModal from "../../../../components/AddedConfirmationModal";
import ErrorModal from "../../../../components/ErrorModal";
import ItemSearchSelect, { type ItemSearchOption } from "../../../../components/ItemSearchSelect";
import FormattedNumberField from "../../../../components/FormattedNumberField";
import { useAuth } from "../../../../context/AuthContext";

export default function AddInventoryLocationTransfers() {
  const { hasEditPermission } = useAuth();
  const canEdit = hasEditPermission('Inventory location transfers');
  const navigate = useNavigate();

  // Fetch locations
  const { data: locations = [] } = useQuery({
    queryKey: ["inventoryLocations"],
    queryFn: getInventoryLocations,
  });

  // Fetch items (exclude service and fixed assets — FA parity)
  const { data: items = [] } = useQuery({
    queryKey: ["items"],
    queryFn: async () => {
      const all = await getItems();
      return (all as any[]).filter((item) => {
        const flag = Number(item.mb_flag ?? 0);
        return flag !== 3 && flag !== 4;
      });
    },
  });

  // Fetch item categories
  const { data: categories = [] } = useQuery({
    queryKey: ["itemCategories"],
    queryFn: () => import("../../../../api/ItemCategories/ItemCategoriesApi").then(m => m.getItemCategories()) as Promise<{ category_id: number; description: string }[]>,
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

  // Fetch company setup
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

  // Validate date
  const validateDate = (selectedDate: string) => {
    if (!selectedFiscalYear) {
      setDateError("No fiscal year selected from company setup");
      return;
    }

    if (selectedFiscalYear.closed) {
      setDateError("The fiscal year is closed for further data entry.");
      return;
    }

    const selected = new Date(selectedDate);
    const from = new Date(selectedFiscalYear.fiscal_year_from);
    const to = new Date(selectedFiscalYear.fiscal_year_to);

    if (selected < from || selected > to) {
      setDateError("The entered date is out of fiscal year.");
      return;
    }

    setDateError("");
  };

  // Validate date on fiscal year load
  useEffect(() => {
    if (selectedFiscalYear) {
      validateDate(date);
    }
  }, [selectedFiscalYear]);

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
      setDate(initialDate);
      validateDate(initialDate); // Validate immediately to show error if invalid
    }
  }, [selectedFiscalYear]);

  const [rows, setRows] = useState<{
    id: number;
    itemCode: string;
    description: string;
    quantity: string;
    unit: string;
    qoh: number;
    selectedItemId: string | number | null;
  }[]>([
    {
      id: 1,
      itemCode: "",
      description: "",
      quantity: "",
      unit: "",
      qoh: 0,
      selectedItemId: null,
    },
  ]);

  //  Form fields
  const [fromLocation, setFromLocation] = useState("");
  const [toLocation, setToLocation] = useState("");
  const [date, setDate] = useState<string>("");
  const [reference, setReference] = useState("");
  const [memo, setMemo] = useState("");
  const [dateError, setDateError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const { reference: nextReference, manualEntryRequired } = useNextFiscalYearReference(16, {
    enabled: Boolean(selectedFiscalYear),
    asOfDate: date || undefined,
  });

  useEffect(() => {
    if (nextReference && !manualEntryRequired) {
      setReference(nextReference);
    }
  }, [nextReference, manualEntryRequired]);

  const [processError, setProcessError] = useState("");
  const [processSuccess, setProcessSuccess] = useState(false);

  const [open, setOpen] = useState(false);
  const [errorOpen, setErrorOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [payload, setPayload] = useState<any>(null);

  // Update QOH when from location changes
  useEffect(() => {
    if (!fromLocation) {
      setRows((prev) => prev.map((row) => ({ ...row, qoh: 0 })));
      return;
    }

    const updateQOH = async () => {
      const updated = await Promise.all(
        rows.map(async (row) => {
          if (!row.selectedItemId) return row;
          try {
            const qoh = await getStockQoh(String(row.selectedItemId), fromLocation);
            return { ...row, qoh };
          } catch {
            return { ...row, qoh: 0 };
          }
        })
      );
      setRows(updated);
    };

    updateQOH();
  }, [fromLocation]);

  //  Handle table field changes
  const handleChange = (id: number, field: string, value: any) => {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  const handleRowItemSelect = async (rowId: number, selected: ItemSearchOption | null) => {
    if (!selected) {
      handleChange(rowId, "description", "");
      handleChange(rowId, "itemCode", "");
      handleChange(rowId, "selectedItemId", null);
      return;
    }
    handleChange(rowId, "description", selected.description);
    handleChange(rowId, "itemCode", selected.stock_id);
    handleChange(rowId, "selectedItemId", selected.stock_id);
    try {
      const itemData = await getItemById(selected.stock_id);
      if (itemData?.units !== undefined) {
        const unit = itemUnits.find((u: any) => u.id === itemData.units);
        const unitDescription = unit?.description || unit?.name || itemData.units;
        handleChange(rowId, "unit", unitDescription || "");
      }
      if (fromLocation) {
        const qoh = await getStockQoh(String(selected.stock_id), fromLocation);
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
        qoh: 0,
        selectedItemId: null as string | number | null,
      },
    ]);
  };

  //  Remove row (optional)
  const handleRemoveRow = (id: number) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  // Process transfer
  const handleProcessTransfer = async () => {
    // Validation
    if (!fromLocation || !toLocation) {
      setProcessError("Please select both from and to locations.");
      return;
    }
    if (fromLocation === toLocation) {
      setProcessError("From and to locations cannot be the same.");
      return;
    }
    if (dateError) {
      setProcessError("Please fix the date error before proceeding.");
      return;
    }
    if (selectedFiscalYear?.closed) {
      setProcessError("Cannot process transfer: The fiscal year is closed.");
      return;
    }

    // Check if there are valid items with quantities
    const validRows = rows.filter(row => row.selectedItemId && parseFloat(row.quantity) > 0);
    if (validRows.length === 0) {
      setProcessError("Please add at least one item with quantity greater than 0.");
      return;
    }

    // Validate quantities do not exceed QOH
    const invalidRows = validRows.filter(row => parseFloat(row.quantity) > row.qoh);
    if (invalidRows.length > 0) {
      setProcessError("Transfer quantity cannot exceed quantity on hand for the following items: " + invalidRows.map(row => row.description).join(", "));
      return;
    }

    setIsProcessing(true);
    setProcessError("");
    setProcessSuccess(false);

    try {
      const saveResult = await runTransactionSave(() =>
        postInventoryTransfer({
          from_loc_code: fromLocation,
          to_loc_code: toLocation,
          trans_date: date,
          reference: reference || undefined,
          comments: memo || undefined,
          lines: validRows.map((row) => ({
            stock_id: String(row.selectedItemId),
            quantity: parseFloat(row.quantity),
          })),
        })
      );

      if (saveResult.ok === false) {
        setProcessError(saveResult.message);
        return;
      }

      const result = saveResult.data;
      const transferPayload = {
        trans_no: result.trans_no,
        reference: result.reference ?? reference,
        date: result.trans_date ?? date,
        fromLocation: result.from_loc_code ?? fromLocation,
        toLocation: result.to_loc_code ?? toLocation,
        items: (result.items ?? []).map((it: any) => ({
          itemCode: it.item_code ?? it.stock_id,
          description: it.description,
          quantity: it.quantity,
          unit: it.unit,
          selectedItemId: it.stock_id,
        })),
      };
      setPayload(transferPayload);
      setProcessSuccess(true);
      setOpen(true);
    } catch (error: any) {
      console.error("Error processing transfer:", error);
      setProcessError(error.response?.data?.message || "Error processing transfer. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const breadcrumbItems = [
    { title: "Home", href: "/dashboard" },
    { title: "Inventory Location Transfers" },
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
          <PageTitle title="Add Inventory Location Transfers" />
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
              label="From Location"
              value={fromLocation}
              onChange={(e) => setFromLocation(e.target.value)}
              size="small"
            >
              {locations.map((loc) => (
                <MenuItem key={loc.loc_code} value={loc.loc_code}>
                  {loc.location_name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          {/* To Location */}
          <Grid item xs={12} sm={3}>
            <TextField
              select
              fullWidth
              label="To Location"
              value={toLocation}
              onChange={(e) => setToLocation(e.target.value)}
              size="small"
            >
              {locations.map((loc) => (
                <MenuItem key={loc.loc_code} value={loc.loc_code}>
                  {loc.location_name}
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
              inputProps={{
                min: selectedFiscalYear ? new Date(selectedFiscalYear.fiscal_year_from).toISOString().split('T')[0] : undefined,
                max: selectedFiscalYear ? new Date(selectedFiscalYear.fiscal_year_to).toISOString().split('T')[0] : undefined,
              }}
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
                readOnly: !manualEntryRequired,
              }}
              helperText={manualEntryRequired ? "Enter reference manually" : undefined}
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
              <TableCell>QOH</TableCell>
              <TableCell>Quantity</TableCell>
              <TableCell>Unit</TableCell>
              <TableCell align="center">Action</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={row.id} hover data-row-id={row.id}>
                <TableCell>{index + 1}</TableCell>
                <TableCell>
                  <ItemSearchSelect
                    displayField="code"
                    hideLabel
                    selectedStockId={String(row.selectedItemId ?? row.itemCode ?? "")}
                    value={row.itemCode}
                    items={items as ItemSearchOption[]}
                    categories={categories.map((cat) => ({
                      id: cat.category_id,
                      category_name: cat.description,
                    }))}
                    onSelect={(selected) => handleRowItemSelect(row.id, selected)}
                  />
                </TableCell>
                <TableCell>
                  <ItemSearchSelect
                    displayField="description"
                    hideLabel
                    selectedStockId={String(row.selectedItemId ?? row.itemCode ?? "")}
                    value={row.description}
                    items={items as ItemSearchOption[]}
                    categories={categories.map((cat) => ({
                      id: cat.category_id,
                      category_name: cat.description,
                    }))}
                    onSelect={(selected) => handleRowItemSelect(row.id, selected)}
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    size="small"
                    value={row.qoh}
                    InputProps={{
                      readOnly: true,
                    }}
                  />
                </TableCell>
                <TableCell>
                  <FormattedNumberField
                    size="small"
                    value={row.quantity}
                    onChange={(e) =>
                      handleChange(row.id, "quantity", Number(e.target.value))
                    }
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
                  {index === rows.length - 1 ? (
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
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<EditIcon />}
                        onClick={() => {
                          // Focus on the first editable field (description)
                          const rowElement = document.querySelector(`[data-row-id="${row.id}"]`);
                          if (rowElement) {
                            const firstInput = rowElement.querySelector('input:not([readonly])') as HTMLInputElement;
                            if (firstInput) firstInput.focus();
                          }
                        }}
                      >
                        Edit
                      </Button>
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
          Transfer processed successfully! Redirecting...
        </Alert>
      )}
      {processError && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {processError}
        </Alert>
      )}
      {selectedFiscalYear?.closed && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          The fiscal year is closed. Transfers cannot be processed.
        </Alert>
      )}
      {/*  Process Transfer Button */}
      <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2, pr: 1 }}>
        <Button 
          variant="contained" 
          color="primary" 
          onClick={handleProcessTransfer}
          disabled={!!dateError || isProcessing || selectedFiscalYear?.closed || !canEdit}
        >
          {isProcessing ? "Processing..." : "Process Transfer"}
        </Button>
      </Box>
      <AddedConfirmationModal
        open={open}
        title="Success"
        content="Inventory location transfer has been processed!"
        addFunc={async () => { }}
        handleClose={() => setOpen(false)}
        onSuccess={() => navigate("/itemsandinventory/transactions/inventory-location-transfer/success", { state: payload })}
      />
      <ErrorModal
        open={errorOpen}
        onClose={() => setErrorOpen(false)}
        message={errorMessage}
      />
    </FormPageLayout>
  );
}
