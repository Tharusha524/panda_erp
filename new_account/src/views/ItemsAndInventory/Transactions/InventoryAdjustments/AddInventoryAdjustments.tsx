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
import { getItemTypes } from "../../../../api/ItemType/ItemType";
import { getFiscalYears } from "../../../../api/FiscalYear/FiscalYearApi";
import { getStockQoh } from "../../../../api/Inventory/StockQuantityApi";
import { postInventoryAdjustment } from "../../../../api/Inventory/InventoryTransactionApi";
import { getCompanies } from "../../../../api/CompanySetup/CompanySetupApi";
import { useNextFiscalYearReference } from "../../../../hooks/useNextFiscalYearReference";
import { runTransactionSave } from "../../../../utils/transactionSave";
import { getItemUnits } from "../../../../api/ItemUnit/ItemUnitApi";
import Breadcrumb from "../../../../components/BreadCrumb";
import PageTitle from "../../../../components/PageTitle";
import theme from "../../../../theme";
import AddedConfirmationModal from "../../../../components/AddedConfirmationModal";
import ErrorModal from "../../../../components/ErrorModal";
import ItemSearchSelect, { type ItemSearchOption } from "../../../../components/ItemSearchSelect";
import FormattedNumberField from "../../../../components/FormattedNumberField";
import { useAuth } from "../../../../context/AuthContext";

export default function AddInventoryAdjustments() {
  const { hasEditPermission } = useAuth();
  const canEdit = hasEditPermission('Inventory adjustments');
  const navigate = useNavigate();

  // Fetch locations
  const { data: locations = [] } = useQuery({
    queryKey: ["inventoryLocations"],
    queryFn: getInventoryLocations,
  });

  // Fetch items
  const { data: items = [] } = useQuery({
    queryKey: ["items"],
    queryFn: getItems,
  });

  // Fetch item categories
  const { data: categories = [] } = useQuery({
    queryKey: ["itemCategories"],
    queryFn: () => import("../../../../api/ItemCategories/ItemCategoriesApi").then(m => m.getItemCategories()) as Promise<{ category_id: number; description: string }[]>,
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

  // Fetch item units
  const { data: itemUnits = [] } = useQuery({
    queryKey: ["itemUnits"],
    queryFn: getItemUnits,
  });

  // Fetch item types
  const { data: itemTypes = [] } = useQuery({
    queryKey: ["itemTypes"],
    queryFn: getItemTypes,
  });

  // Filter items to exclude those with item_type "Service"
  const filteredItems = useMemo(() => {
    const serviceType = itemTypes.find((type: any) => type.name === "Service");
    if (!serviceType) return items;
    return items.filter((item: any) => item.mb_flag !== serviceType.id);
  }, [items, itemTypes]);

  // Find selected fiscal year from company setup
  const selectedFiscalYear = useMemo(() => {
    if (!companyData || companyData.length === 0) return null;
    const company = companyData[0];
    return fiscalYears.find((fy: any) => fy.id === company.fiscal_year_id);
  }, [companyData, fiscalYears]);

  //  Table data
  const [rows, setRows] = useState([
    {
      id: 1,
      itemCode: "",
      description: "",
      qoh: 0,
      quantity: "",
      unit: "",
      unitCost: 0,
      total: 0,
      selectedItemId: null as string | number | null,
    },
  ]);

  //  Form fields
  const [memo, setMemo] = useState("");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState<string>("");
  const [reference, setReference] = useState("");
  const [dateError, setDateError] = useState("");

  const { reference: nextReference, manualEntryRequired } = useNextFiscalYearReference(17, {
    enabled: Boolean(selectedFiscalYear),
    asOfDate: date || undefined,
  });

  useEffect(() => {
    if (nextReference && !manualEntryRequired) {
      setReference(nextReference);
    }
  }, [nextReference, manualEntryRequired]);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [open, setOpen] = useState(false);
  const [errorOpen, setErrorOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

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

  // When selected location changes, refresh QOH values for rows with a selected item
  useEffect(() => {
    const refreshQoh = async () => {
      if (!location) return;
      const updated = await Promise.all(
        rows.map(async (r) => {
          if (!r.selectedItemId) return r;
          try {
            const qoh = await getStockQoh(String(r.selectedItemId), location);
            return { ...r, qoh };
          } catch {
            return { ...r, qoh: 0 };
          }
        })
      );
      setRows(updated);
    };
    refreshQoh();
  }, [location]);

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
    setDate(value);
    validateDate(value);
  };

  //  Handle input change in table
  const handleChange = (id: number, field: string, value: any) => {
    setRows((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
            ...row,
            [field]: value,
            total:
              field === "quantity" || field === "unitCost"
                ? (field === "quantity" ? value : row.quantity) *
                (field === "unitCost" ? value : row.unitCost)
                : row.total,
          }
          : row
      )
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
      if (itemData) {
        if (itemData.material_cost !== undefined) {
          handleChange(rowId, "unitCost", itemData.material_cost);
        }
        if (itemData.units !== undefined) {
          const unit = itemUnits.find((u: any) => u.id === itemData.units);
          const unitDescription = unit?.description || unit?.name || itemData.units;
          handleChange(rowId, "unit", unitDescription || "");
        }
      }
      if (location) {
        const qoh = await getStockQoh(String(selected.stock_id), location);
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
        qoh: 0,
        quantity: "",
        unit: "",
        unitCost: 0,
        total: 0,
        selectedItemId: null as string | number | null,
      },
    ]);
  };

  //  Remove row (optional)
  const handleRemoveRow = (id: number) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  // Save inventory adjustments
  const handleSaveAdjustment = async () => {
    // Validation
    if (!location) {
      setSaveError("Please select a location");
      return;
    }
    if (!date) {
      setSaveError("Please select a date");
      return;
    }
    if (rows.length === 0 || rows.every(row => !row.selectedItemId || !row.quantity)) {
      setSaveError("Please add at least one item with quantity");
      return;
    }

    setIsSaving(true);
    setSaveError("");
    setSaveSuccess(false);

    try {
      const validRows = rows.filter((row) => row.selectedItemId && row.quantity);
      const saveResult = await runTransactionSave(() =>
        postInventoryAdjustment({
          loc_code: location,
          trans_date: date,
          reference: reference || undefined,
          comments: memo || undefined,
          lines: validRows.map((row) => ({
            stock_id: String(row.selectedItemId),
            quantity: parseFloat(row.quantity.toString()),
            standard_cost: Number(row.unitCost) || undefined,
          })),
        })
      );

      if (saveResult.ok === false) {
        setSaveError(saveResult.message);
        return;
      }

      const result = saveResult.data;
      const payload = {
        trans_no: result.trans_no,
        location: result.loc_code ?? location,
        reference: result.reference ?? reference,
        date: result.trans_date ?? date,
        items: (result.items ?? validRows).map((r: any) => ({
          itemCode: r.item_code ?? r.itemCode ?? r.stock_id,
          description: r.description,
          quantity: r.quantity,
          unit: r.unit,
          unitCost: r.unit_cost ?? r.unitCost,
          selectedItemId: r.stock_id ?? r.selectedItemId,
        })),
      };

      navigate("/itemsandinventory/transactions/inventory-adjustments/success", { state: payload });
    } catch (error: any) {
      console.error("Error saving inventory adjustments:", error);
      setSaveError(error.response?.data?.message || "Failed to save inventory adjustments");
    } finally {
      setIsSaving(false);
    }
  };

  const breadcrumbItems = [
    { title: "Home", href: "/dashboard" },
    { title: "Inventory Adjustments" },
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
          flexWrap: "wrap",
        }}
      >
        <Box>
          <PageTitle title="Add Inventory Adjustments" />
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
      {/*  Location, Date, and Reference Fields */}
      <Paper sx={{ p: 2, borderRadius: 2 }}>
        <Grid container spacing={2}>
          {/* Location Dropdown */}
          <Grid item xs={12} sm={4}>
            <TextField
              select
              fullWidth
              label="Location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              size="small"
            >
              {locations.map((loc) => (
                <MenuItem key={loc.loc_code} value={loc.loc_code}>
                  {loc.location_name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          {/* Date Field */}
          <Grid item xs={12} sm={4}>
            <TextField
              label="Date"
              type="date"
              fullWidth
              size="small"
              value={date}
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

          {/* Reference Field */}
          <Grid item xs={12} sm={4}>
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
              <TableCell>Unit Cost</TableCell>
              <TableCell>Total</TableCell>
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
                    items={
                      filteredItems.filter(
                        (item: { stock_id: string }) =>
                          !rows.some(
                            (r) =>
                              r.id !== row.id && r.selectedItemId === item.stock_id
                          )
                      ) as ItemSearchOption[]
                    }
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
                    items={
                      filteredItems.filter(
                        (item: { stock_id: string }) =>
                          !rows.some(
                            (r) =>
                              r.id !== row.id && r.selectedItemId === item.stock_id
                          )
                      ) as ItemSearchOption[]
                    }
                    categories={categories.map((cat) => ({
                      id: cat.category_id,
                      category_name: cat.description,
                    }))}
                    onSelect={(selected) => handleRowItemSelect(row.id, selected)}
                  />
                </TableCell>
                <TableCell>
                  <FormattedNumberField
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
                    onChange={(e) =>
                      handleChange(row.id, "unit", e.target.value)
                    }
                    InputProps={{
                      readOnly: true,
                    }}
                  />
                </TableCell>
                <TableCell>
                  <FormattedNumberField
                    size="small"
                    value={row.unitCost}
                    onChange={(e) =>
                      handleChange(row.id, "unitCost", Number(e.target.value))
                    }
                    InputProps={{
                      readOnly: true,
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Typography>{Number(row.total).toFixed(2)}</Typography>
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
                          // Focus on the first editable field (item code)
                          const rowElement = document.querySelector(`[data-row-id="${row.id}"]`);
                          if (rowElement) {
                            const firstInput = rowElement.querySelector('input') as HTMLInputElement;
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

          <TableFooter>
            <TableRow>
              <TableCell colSpan={9}>
                <Typography align="right" sx={{ pr: 2, fontWeight: 600 }}>
                  Grand Total:{" "}
                  {rows
                    .reduce((sum, r) => sum + Number(r.total), 0)
                    .toFixed(2)}
                </Typography>
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </TableContainer>
      {/*  Memo Field */}
      <Box sx={{ mt: 2, pl: 1, pr: 1 }}>
        <Typography sx={{ mb: 1, fontWeight: 600 }}>Memo:</Typography>
        <TextField
          fullWidth
          multiline
          rows={2}
          placeholder="Enter memo or notes..."
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
      </Box>
      {/* Success/Error Messages */}
      {saveSuccess && (
        <Alert severity="success" sx={{ mt: 2 }}>
          Inventory adjustments saved successfully! Redirecting...
        </Alert>
      )}
      {saveError && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {saveError}
        </Alert>
      )}
      {/*  Submit Button */}
      <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2, pr: 1 }}>
        <Button
          variant="contained"
          color="primary"
          disabled={!!dateError || isSaving || !canEdit}
          onClick={handleSaveAdjustment}
        >
          {isSaving ? "Saving..." : "Process Adjustment"}
        </Button>
      </Box>
      <AddedConfirmationModal
        open={open}
        title="Success"
        content="Items adjustment has been processed!"
        addFunc={async () => { }}
        handleClose={() => setOpen(false)}
        onSuccess={() => setOpen(false)}
      />
      <ErrorModal
        open={errorOpen}
        onClose={() => setErrorOpen(false)}
        message={errorMessage}
      />
    </FormPageLayout>
  );
}
