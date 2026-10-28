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
  Grid,
} from "@mui/material";
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useQuery } from "@tanstack/react-query";
import PageTitle from "../../../../components/PageTitle";
import Breadcrumb from "../../../../components/BreadCrumb";
import theme from "../../../../theme";
import { getWorkCentres } from "../../../../api/WorkCentre/WorkCentreApi";
import { useQueryClient } from "@tanstack/react-query";
import { getInventoryLocations } from "../../../../api/InventoryLocation/InventoryLocationApi";
import { getWorkOrderById } from "../../../../api/WorkOrders/WorkOrderApi";
import { postWorkOrderProduce } from "../../../../api/Manufacturing/ManufacturingApi";
import { runTransactionSave } from "../../../../utils/transactionSave";
import { useAuth } from "../../../../context/AuthContext";
import { useNextFiscalYearReference } from "../../../../hooks/useNextFiscalYearReference";

export default function ProduceWorkOrder() {
  const { hasEditPermission } = useAuth();
  const canEdit = hasEditPermission('Work order releases');
  const navigate = useNavigate();
  const location = useLocation();
  const idFromState = (location.state as any)?.id ?? null;

  const { data: locations = [] } = useQuery({ queryKey: ["inventoryLocations"], queryFn: getInventoryLocations });
  const { data: workCentres = [] } = useQuery({ queryKey: ["workCentres"], queryFn: getWorkCentres });

  const [loadingError, setLoadingError] = useState("");
  const [woRecord, setWoRecord] = useState<any | null>(null);

  const today = new Date().toISOString().split("T")[0];
  const [prodDate, setProdDate] = useState(today);
  const [prodReference, setProdReference] = useState("");
  const [prodType, setProdType] = useState("produce");
  const [prodQuantity, setProdQuantity] = useState("0");
  const [prodMemo, setProdMemo] = useState("");
  const [formError, setFormError] = useState("");
  const [processingAction, setProcessingAction] = useState<string | null>(null);

  const queryClient = useQueryClient();

  // trans_type 29 = Work Order Production
  const { reference: nextProductionReference } = useNextFiscalYearReference(29, {
    asOfDate: prodDate || undefined,
  });

  useEffect(() => {
    if (nextProductionReference) {
      setProdReference(nextProductionReference);
    }
  }, [nextProductionReference]);

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
        try {
          const required = Number(wo.units_reqd ?? wo.quantity ?? wo.units_req ?? 0) || 0;
          const alreadyMade = Number(wo.units_issued ?? 0) || 0;
          const remaining = Math.max(0, required - alreadyMade);
          setProdQuantity(String(remaining > 0 ? remaining : required));
        } catch (e) {}
      } catch (err) {
        console.warn("Failed to load work order:", err);
        setLoadingError("Failed to load work order");
      }
    })();
  }, [idFromState]);

  const getTypeLabel = (t: any) => {
    const n = Number(t);
    if (n === 0) return "Assemble";
    if (n === 1) return "Unassemble";
    if (n === 2) return "Advanced Manufacture";
    return String(t ?? "");
  };

  const itemLabel = (stockId: any) => {
    const rec = (woRecord || {});
    return rec ? (rec.item_name ?? rec.name ?? String(stockId)) : String(stockId ?? "");
  };

  const locLabel = (locCode: any) => {
    const rec = (locations || []).find((l: any) => String(l.loc_code ?? l.loccode ?? l.code ?? "") === String(locCode));
    return rec ? (rec.location_name ?? String(locCode)) : String(locCode ?? "");
  };

  const processProduction = async (forceClose = false) => {
    setFormError("");
    if (!prodDate) { setFormError("Select a date"); return; }
    if (!prodReference || String(prodReference).trim() === "") { setFormError("Enter a reference"); return; }
    const qty = Number(String(prodQuantity).replace(/,/g, "")) || 0;
    if (isNaN(qty) || qty <= 0) { setFormError("Enter a valid quantity"); return; }
    if (!idFromState) { setFormError("Work order id missing"); return; }

    try {
      const computedRef = String(prodReference).trim();

      const saveResult = await runTransactionSave(async () =>
        postWorkOrderProduce({
          workorder_id: Number(idFromState),
          reference: computedRef,
          quantity: qty,
          date: prodDate,
          memo: prodMemo || undefined,
          close: forceClose,
        })
      );

      if (saveResult.ok === false) {
        setFormError(saveResult.message);
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["workOrders"] });
      navigate("/manufacturing/transactions/work-order-entry/success", {
        state: { reference: computedRef, id: idFromState, successMode: "manufacture" },
      });
    } catch (err) {
      console.error("Failed production process:", err);
      setFormError("Failed to process production.");
    } finally {
      setProcessingAction(null);
    }
  };

  const handleProcess = () => {
    setProcessingAction('process');
    processProduction(false);
  };
  const handleProcessAndClose = () => {
    setProcessingAction('processAndClose');
    processProduction(true);
  };

  const breadcrumbItems = [
    { title: "Transactions", href: "/manufacturing/transactions" },
    { title: "Produce Work Order" },
  ];

  return (
    <FormPageLayout>
      <Box sx={{ padding: theme.spacing(2), boxShadow: 2, borderRadius: 1, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
        <Box>
          <PageTitle title="Produce or Unassemble Finished Items From Work Order" />
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

          <Grid item xs={12} sx={{ mt: 3 }}>
            <Paper sx={{ p: 2 }}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <TextField label="Date" type="date" fullWidth size="small" value={prodDate} onChange={(e) => setProdDate(e.target.value)} InputLabelProps={{ shrink: true }} />
                </Grid>

                <Grid item xs={12} sm={4}>
                  <TextField fullWidth size="small" label="Reference" value={prodReference} onChange={(e) => setProdReference(e.target.value)} />
                </Grid>

                <Grid item xs={12} sm={4}>
                  <TextField select fullWidth size="small" label="Type" value={prodType} onChange={(e) => setProdType(String(e.target.value))}>
                    <MenuItem value="produce">Produce Finished Items</MenuItem>
                    <MenuItem value="return">Return Items to work order</MenuItem>
                  </TextField>
                </Grid>

                <Grid item xs={12} sm={4}>
                  <TextField fullWidth size="small" label="Quantity" value={prodQuantity} onChange={(e) => setProdQuantity(e.target.value)} />
                </Grid>

                <Grid item xs={12}>
                  <TextField label="Memo" fullWidth multiline rows={3} value={prodMemo} onChange={(e) => setProdMemo(e.target.value)} />
                </Grid>

                {formError && (
                  <Grid item xs={12}>
                    <Alert severity="warning">{formError}</Alert>
                  </Grid>
                )}

                <Grid item xs={12} sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
                  <Button variant="contained" color="primary" onClick={handleProcess} disabled={!!processingAction}>{processingAction === 'process' ? 'Processing...' : 'Process'}</Button>
                  <Button variant="contained" color="secondary" onClick={handleProcessAndClose} disabled={!!processingAction || !canEdit}>{processingAction === 'processAndClose' ? 'Processing...' : 'Process and Close Order'}</Button>
                </Grid>
              </Grid>
            </Paper>
          </Grid>
        </Grid>
      </Paper>
    </FormPageLayout>
  );
}
