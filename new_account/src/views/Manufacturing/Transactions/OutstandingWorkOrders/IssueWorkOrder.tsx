import { FormPageLayout } from "../../../../components/Layout/FormPageLayout";
import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Box,
  Button,
  Paper,
  Stack,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  MenuItem,
  Typography,
  Grid,
  ListSubheader,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useQuery } from "@tanstack/react-query";
import PageTitle from "../../../../components/PageTitle";
import Breadcrumb from "../../../../components/BreadCrumb";
import theme from "../../../../theme";
import { getWorkOrderById } from "../../../../api/WorkOrders/WorkOrderApi";
import { postWorkOrderIssue } from "../../../../api/Manufacturing/ManufacturingApi";
import { runTransactionSave } from "../../../../utils/transactionSave";
import { useSnackbar } from "notistack";
import { getItems } from "../../../../api/Item/ItemApi";
import { getItemUnits } from "../../../../api/ItemUnit/ItemUnitApi";
import { getItemCategories } from "../../../../api/ItemCategories/ItemCategoriesApi";
import { getWorkCentres } from "../../../../api/WorkCentre/WorkCentreApi";
import { getInventoryLocations } from "../../../../api/InventoryLocation/InventoryLocationApi";
import ItemSearchSelect, { type ItemSearchOption } from "../../../../components/ItemSearchSelect";
import FormattedNumberField from "../../../../components/FormattedNumberField";
import { useAuth } from "../../../../context/AuthContext";

export default function IssueWorkOrder() {
  const { hasEditPermission } = useAuth();
  const canEdit = hasEditPermission('Work order releases');
  const navigate = useNavigate();
  const location = useLocation();
  const { enqueueSnackbar } = useSnackbar();
  const [processing, setProcessing] = useState(false);
  const idFromState = (location.state as any)?.id ?? null;

  const { data: items = [] } = useQuery({ queryKey: ["items"], queryFn: getItems });
  const { data: locations = [] } = useQuery({ queryKey: ["inventoryLocations"], queryFn: getInventoryLocations });
  const { data: workCentres = [] } = useQuery({ queryKey: ["workCentres"], queryFn: getWorkCentres });

  const [loadingError, setLoadingError] = useState("");
  const [woRecord, setWoRecord] = useState<any | null>(null);

  // order items state like DirectGRN
  const [rows, setRows] = useState([
    {
      id: 1,
      stockId: "",
      itemCode: "",
      description: "",
      quantity: 0,
      unit: "",
      price: 0,
      total: 0,
      editable: true,
    },
  ]);
  const [rowError, setRowError] = useState("");

  const { data: itemUnits = [] } = useQuery({ queryKey: ["itemUnits"], queryFn: () => getItemUnits() });
  const { data: categories = [] } = useQuery({ queryKey: ["itemCategories"], queryFn: () => getItemCategories() });

  useEffect(() => {
    (async () => {
      if (!idFromState) {
        setLoadingError("No work order id provided");
        return;
      }
      try {
        const wo = await getWorkOrderById(idFromState);
        if (!wo) {
          setLoadingError("Work order not found");
          return;
        }
        setWoRecord(wo);
        // default from location to work order location if available
        try {
          const locCode = wo.loc_code ?? wo.location ?? wo.loc ?? "";
          if (locCode) setFromLocation(String(locCode));
        } catch (e) {}
      } catch (err) {
        console.warn("Failed to load work order:", err);
        setLoadingError("Failed to load work order");
      }
    })();
  }, [idFromState]);

  // default select first inventory location when locations load (if none already set)
  useEffect(() => {
    try {
      if ((!fromLocationState || String(fromLocationState) === "") && Array.isArray(locations) && locations.length > 0) {
        const first = locations[0];
        const val = first.loc_code ?? first.id ?? "";
        if (val) setFromLocation(String(val));
      }
    } catch (e) {
      // ignore
    }
  }, [locations]);

  // default select first work centre when workCentres load
  useEffect(() => {
    try {
      if ((!toWorkCentre || String(toWorkCentre) === "") && Array.isArray(workCentres) && workCentres.length > 0) {
        const first = workCentres[0];
        const val = first.id ?? first.work_centre_id ?? first.workCentreId ?? "";
        if (val) setToWorkCentre(String(val));
      }
    } catch (e) {
      // ignore
    }
  }, [workCentres]);

  const handleAddRow = () => {
    // validate last row: item selected and quantity > 0
    const last = rows[rows.length - 1];
    if (!last || !last.stockId || Number(last.quantity) <= 0) {
      setRowError("Select an item and enter quantity before adding.");
      return;
    }
    setRowError("");
    setRows((prev) => {
      const lastId = prev.length > 0 ? prev[prev.length - 1].id : null;
      const locked = prev.map((r) => (r.id === lastId ? { ...r, editable: false } : r));
      return [
        ...locked,
        {
          id: prev.length + 1,
          stockId: "",
          itemCode: "",
          description: "",
          quantity: 0,
          unit: "",
          price: 0,
          total: 0,
          editable: true,
        },
      ];
    });
  };

  const handleRemoveRow = (id: number) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleChange = (id: number, field: string, value: any) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? (r.editable
              ? {
                  ...r,
                  [field]: value,
                  total:
                    field === "quantity" || field === "price"
                      ? (field === "quantity" ? Number(value) : Number(r.quantity)) *
                        (field === "price" ? Number(value) : Number(r.price))
                      : r.total,
                }
              : r)
          : r
      )
    );
  };

  const issueItemOptions = React.useMemo(() => {
    const excludeId = String(woRecord?.stock_id ?? woRecord?.stock ?? woRecord?.item_id ?? "");
    return (items || []).filter(
      (it: any) => String(it.stock_id ?? it.id ?? "") !== excludeId
    ) as ItemSearchOption[];
  }, [items, woRecord]);

  const handleRowItemSelect = (rowId: number, selected: ItemSearchOption | null) => {
    if (!selected) {
      handleChange(rowId, "stockId", "");
      handleChange(rowId, "description", "");
      handleChange(rowId, "itemCode", "");
      return;
    }
    const unitObj = (itemUnits || []).find(
      (u: any) => u.id === selected.units || String(u.id) === String(selected.units)
    );
    handleChange(rowId, "stockId", selected.stock_id);
    handleChange(rowId, "description", selected.description);
    handleChange(rowId, "itemCode", selected.stock_id);
    handleChange(rowId, "unit", unitObj ? unitObj.abbr : String(selected.units ?? ""));
    const unitCostRaw =
      (selected as any).material_cost ??
      (selected as any).materialCost ??
      (selected as any).standard_cost ??
      0;
    handleChange(rowId, "price", Number(unitCostRaw) || 0);
  };

  const handleEditRow = (id: number) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, editable: true } : r)));
    setRowError("");
  };

  // Issue form state
  const today = new Date().toISOString().split("T")[0];
  const [issueDate, setIssueDate] = useState(today);
  const [fromLocationState, setFromLocation] = useState("");
  const [toWorkCentre, setToWorkCentre] = useState("");
  const [issueReference, setIssueReference] = useState("");
  const [issueType, setIssueType] = useState("issue");
  const [issueMemo, setIssueMemo] = useState("");

  // subtotal removed per UI change (no line totals shown)

  const getTypeLabel = (t: any) => {
    const n = Number(t);
    if (n === 0) return "Assemble";
    if (n === 1) return "Unassemble";
    if (n === 2) return "Advanced Manufacture";
    return String(t ?? "");
  };

  const itemLabel = (stockId: any) => {
    const rec = (items || []).find((it: any) => String(it.stock_id ?? it.id ?? it.stock_master_id ?? it.item_id ?? "") === String(stockId));
    return rec ? (rec.item_name ?? rec.name ?? rec.description ?? String(stockId)) : String(stockId ?? "");
  };

  const locLabel = (locCode: any) => {
    const rec = (locations || []).find((l: any) => String(l.loc_code ?? l.loccode ?? l.code ?? "") === String(locCode));
    return rec ? (rec.location_name ?? String(locCode)) : String(locCode ?? "");
  };

  const handleIssue = async () => {
    const validItems = rows.filter((r) => r.stockId && Number(r.quantity) > 0);
    if (validItems.length === 0) {
      setRowError("Add at least one item with quantity before processing issue.");
      return;
    }
    if (!fromLocationState) {
      setRowError("Select From Location.");
      return;
    }
    if (!idFromState || !woRecord) {
      setRowError("Work order not loaded.");
      return;
    }

    setProcessing(true);
    setRowError("");
    try {
      const saveResult = await runTransactionSave(async () =>
        postWorkOrderIssue({
          workorder_id: Number(idFromState),
          reference: issueReference || undefined,
          issue_date: issueDate,
          loc_code: String(fromLocationState),
          work_centre: toWorkCentre ? Number(toWorkCentre) : null,
          memo: issueMemo || undefined,
          return_to_inventory: issueType === "return",
          lines: validItems.map((item) => ({
            stock_id: String(item.stockId),
            quantity: Number(item.quantity),
            unit_cost: Number(item.price) || undefined,
          })),
        })
      );

      if (saveResult.ok === false) {
        setRowError(saveResult.message);
        enqueueSnackbar(saveResult.message, { variant: "error" });
        return;
      }

      enqueueSnackbar("Work order issue processed.", { variant: "success" });
      navigate("/manufacturing/transactions/outstanding-work-orders");
    } catch (err) {
      console.error(err);
      enqueueSnackbar("Failed to process work order issue.", { variant: "error" });
      setRowError("Failed to process issue. Check stock and work order data.");
    } finally {
      setProcessing(false);
    }
  };

  const breadcrumbItems = [
    { title: "Transactions", href: "/manufacturing/transactions" },
    { title: "Issue Work Order" },
  ];

  return (
    <FormPageLayout>
      <Box sx={{ padding: theme.spacing(2), boxShadow: 2, borderRadius: 1, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
        <Box>
          <PageTitle title="Issue Items to Work Order" />
          <Breadcrumb breadcrumbs={breadcrumbItems} />
        </Box>

        <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)}>Back</Button>
      </Box>
      <Paper sx={{ p: 2, borderRadius: 2 }}>
        {loadingError && <Alert severity="error">{loadingError}</Alert>}

        <Grid container>
          <Grid item xs={12}>
            <TableContainer>
              <Table>
                <TableHead sx={{ backgroundColor: "var(--pallet-lighter-blue)" }}>
                  <TableRow>
                    <TableCell>#</TableCell>
                    <TableCell>Reference</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Manufactured Item</TableCell>
                    <TableCell>Into Location</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Required by</TableCell>
                    <TableCell>Quantity required</TableCell>
                    <TableCell>Released date</TableCell>
                    <TableCell>Manufactured</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {woRecord ? (
                    <TableRow hover>
                      <TableCell>{woRecord.id ?? woRecord.wo_id ?? ""}</TableCell>
                      <TableCell>{woRecord.wo_ref ?? woRecord.reference ?? ""}</TableCell>
                      <TableCell>{getTypeLabel(woRecord.type)}</TableCell>
                      <TableCell>{itemLabel(woRecord.stock_id ?? woRecord.stock ?? woRecord.item_id)}</TableCell>
                      <TableCell>{locLabel(woRecord.loc_code ?? woRecord.location ?? woRecord.loc)}</TableCell>
                      <TableCell>{woRecord.date ? String(woRecord.date).split("T")[0] : (woRecord.tran_date ?? "")}</TableCell>
                      <TableCell>{woRecord.required_by ?? woRecord.date_required_by ?? woRecord.requiredBy ?? ""}</TableCell>
                      <TableCell>{Number(woRecord.units_reqd ?? woRecord.quantity ?? woRecord.units_req ?? 0)}</TableCell>
                      <TableCell>{woRecord.released_date ? String(woRecord.released_date).split("T")[0] : ""}</TableCell>
                      <TableCell>{Number(woRecord.units_issued ?? woRecord.unitsIssued ?? 0)}</TableCell>
                    </TableRow>
                  ) : (
                    <TableRow>
                      <TableCell colSpan={10}>No work order selected</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>

          {/* Order Items section similar to DirectGRN */}
          <Grid item xs={12} sx={{ mt: 4 }}>
            <Typography variant="subtitle1" sx={{ mb: 1, textAlign: "center" }}>Items to Issue</Typography>
            <TableContainer component={Paper} sx={{ p: 1 }}>
              {rowError && (
                <Box sx={{ mb: 1 }}>
                  <Alert severity="warning">{rowError}</Alert>
                </Box>
              )}
              <Table>
                <TableHead sx={{ backgroundColor: "var(--pallet-lighter-blue)" }}>
                  <TableRow>
                    <TableCell>No</TableCell>
                    <TableCell>Item Code</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell>Quantity</TableCell>
                    <TableCell>Unit</TableCell>
                    <TableCell>Unit Cost</TableCell>
                    <TableCell align="center">Action</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {rows.map((row, i) => (
                    <TableRow key={row.id}>
                      <TableCell>{i + 1}</TableCell>

                      <TableCell>
                        <ItemSearchSelect
                          displayField="code"
                          hideLabel
                          disabled={!row.editable}
                          selectedStockId={String(row.stockId ?? row.itemCode ?? "")}
                          value={row.itemCode}
                          items={issueItemOptions}
                          categories={categories.map((cat: any) => ({
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
                          disabled={!row.editable}
                          selectedStockId={String(row.stockId ?? row.itemCode ?? "")}
                          value={row.description}
                          items={issueItemOptions}
                          categories={categories.map((cat: any) => ({
                            id: cat.category_id,
                            category_name: cat.description,
                          }))}
                          onSelect={(selected) => handleRowItemSelect(row.id, selected)}
                        />
                      </TableCell>

                      <TableCell>
                        <FormattedNumberField size="small" value={row.quantity} disabled={!row.editable} onChange={(e) => handleChange(row.id, "quantity", Number(e.target.value))} />
                      </TableCell>

                      <TableCell>
                        <TextField size="small" value={row.unit} InputProps={{ readOnly: true }} />
                      </TableCell>

                      <TableCell>
                        <FormattedNumberField size="small" value={row.price} disabled={!row.editable} onChange={(e) => handleChange(row.id, "price", Number(e.target.value))} />
                      </TableCell>

                      <TableCell align="center">
                          {i === rows.length - 1 ? (
                            <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={handleAddRow} disabled={!row.itemCode || !(Number(row.quantity) > 0)}>Add</Button>
                          ) : (
                            <Stack direction="row" spacing={1}>
                              <Button variant="outlined" size="small" startIcon={<EditIcon />} onClick={() => handleEditRow(row.id)}>Edit</Button>
                              <Button variant="outlined" color="error" size="small" startIcon={<DeleteIcon />} onClick={() => handleRemoveRow(row.id)}>Delete</Button>
                            </Stack>
                          )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>

                {/* subtotal/footer removed per design */}
              </Table>
            </TableContainer>
          </Grid>

          
          {/* Issue form */}
          <Grid item xs={12} sx={{ mt: 3 }}>
            <Paper sx={{ p: 2 }}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <TextField label="Issue Date" type="date" fullWidth size="small" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} InputLabelProps={{ shrink: true }} />
                </Grid>

                <Grid item xs={12} sm={4}>
                  <TextField select fullWidth size="small" label="From Location" value={fromLocationState} onChange={(e) => setFromLocation(String(e.target.value))}>
                    <MenuItem value="">Select</MenuItem>
                    {(locations || []).map((l: any) => (
                      <MenuItem key={l.loc_code ?? l.id} value={l.loc_code ?? l.id}>{l.location_name ?? l.name ?? l.loc_code}</MenuItem>
                    ))}
                  </TextField>
                </Grid>

                <Grid item xs={12} sm={4}>
                  <TextField select fullWidth size="small" label="To Work Centre" value={toWorkCentre} onChange={(e) => setToWorkCentre(String(e.target.value))}>
                    <MenuItem value="">Select</MenuItem>
                    {(workCentres || []).map((w: any) => (
                      <MenuItem key={w.id ?? w.work_centre_id} value={w.id ?? w.work_centre_id}>{w.name ?? w.description ?? w.code ?? w.id}</MenuItem>
                    ))}
                  </TextField>
                </Grid>

                <Grid item xs={12} sm={4}>
                  <TextField fullWidth size="small" label="Reference" value={issueReference} onChange={(e) => setIssueReference(e.target.value)} />
                </Grid>

                <Grid item xs={12} sm={4}>
                  <TextField select fullWidth size="small" label="Type" value={issueType} onChange={(e) => setIssueType(String(e.target.value))}>
                    <MenuItem value="issue">Issue items to work order</MenuItem>
                    <MenuItem value="return">Return items to location</MenuItem>
                  </TextField>
                </Grid>

                <Grid item xs={12}>
                  <TextField label="Memo" fullWidth multiline rows={3} value={issueMemo} onChange={(e) => setIssueMemo(e.target.value)} />
                </Grid>

                <Grid item xs={12} sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
                  <Button variant="contained" color="primary" onClick={handleIssue} disabled={processing || !canEdit}>
                    {processing ? "Processing…" : "Process Issue"}
                  </Button>
                </Grid>
              </Grid>
            </Paper>
          </Grid>
        </Grid>
      </Paper>
    </FormPageLayout>
  );
}
