import { FormPageLayout } from "../../../../components/Layout/FormPageLayout";
import React, { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
  CircularProgress,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useLocation } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import Breadcrumb from "../../../../components/BreadCrumb";
import PageTitle from "../../../../components/PageTitle";
import theme from "../../../../theme";
import AddedConfirmationModal from "../../../../components/AddedConfirmationModal";
import { getSuppliers } from "../../../../api/Supplier/SupplierApi";
import { getInventoryLocations } from "../../../../api/InventoryLocation/InventoryLocationApi";
import { getCostCenters } from "../../../../api/CostCenter/CostCenterApi";
import { getItems } from "../../../../api/Item/ItemApi";
import { getItemUnits } from "../../../../api/ItemUnit/ItemUnitApi";
import { getItemCategories } from "../../../../api/ItemCategories/ItemCategoriesApi";
import { getFiscalYears } from "../../../../api/FiscalYear/FiscalYearApi";
import { getCompanies } from "../../../../api/CompanySetup/CompanySetupApi";
import {
  getPurchOrderByOrderNo,
  postPurchOrderWithDetails,
} from "../../../../api/PurchOrders/PurchOrderApi";
import {
  getPurchOrderDetailsByOrderNo,
} from "../../../../api/PurchOrders/PurchOrderDetailsApi";
import { useQueryClient } from "@tanstack/react-query";
import { runTransactionSave } from "../../../../utils/transactionSave";
import { useSupplierCredit } from "../../../../hooks/useSupplierCredit";
import SupplierCreditSummaryFields from "../../../../components/SupplierCreditSummaryFields";
import SupplierCurrencyField from "../../../../components/SupplierCurrencyField";
import CurrencyAmountInput from "../../../../components/CurrencyAmountInput";
import { resolveSupplierTransactionCurrencyCode } from "../../../../utils/relationId";
import { resolvePurchaseItemPrice } from "../../../../utils/resolvePurchaseItemPrice";
import { useHomeCurrency } from "../../../../hooks/useHomeCurrency";
import { useTransactionMoney } from "../../../../hooks/useTransactionMoney";
import FormattedNumberField from "../../../../components/FormattedNumberField";
import { useAuth } from "../../../../context/AuthContext";

export default function UpdatePurchaseOrderEntry() {
  const { hasEditPermission } = useAuth();
  const canEdit = hasEditPermission('Purchase order entry');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const locationRouter = useLocation();
  const orderNoFromState = locationRouter.state?.id ?? null;

  // ========= Form Fields =========
  const [supplier, setSupplier] = useState("");
  const [supplierRef, setSupplierRef] = useState("");
  const [deliverTo, setDeliverTo] = useState("");
  const [orderDate, setOrderDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [costCenter, setCostCenter] = useState(0);
  const [receiveInto, setReceiveInto] = useState(0);
  const [reference, setReference] = useState("");

  const [memo, setMemo] = useState("");

  const [dateError, setDateError] = useState("");

  // API data states
  const [suppliers, setSuppliers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [items, setItems] = useState([]);
  const [itemUnits, setItemUnits] = useState([]);
  const [categories, setCategories] = useState<{ category_id: number; description: string }[]>([]);
  const [deletedDetailIds, setDeletedDetailIds] = useState<any[]>([]);
  const [openSuccess, setOpenSuccess] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // ========= Generate Reference =========
  // Fetch fiscal years to build fiscal-year-aware reference
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
    setOrderDate(value);
    validateDate(value);
  };

  // Validate date when fiscal year is loaded
  useEffect(() => {
    if (selectedFiscalYear && orderDate) {
      validateDate(orderDate);
    }
  }, [selectedFiscalYear]);

  const { summary: supplierCreditSummary, isLoading: supplierCreditLoading } =
    useSupplierCredit(supplier || null, suppliers);

  const selectedSupplier = useMemo(
    () =>
      suppliers.find(
        (s: any) => String(s.supplier_id ?? s.id) === String(supplier)
      ),
    [suppliers, supplier]
  );
  const { code: homeCurrencyCode } = useHomeCurrency();
  const currencyCode = resolveSupplierTransactionCurrencyCode(
    selectedSupplier,
    homeCurrencyCode
  );
  const { formatMoney } = useTransactionMoney(currencyCode);

  // ========= Fetch API Data =========
  useEffect(() => {
    const fetchData = async () => {
      try {
        // fetch lookups first
        const [suppliersData, locationsData, costCentersData, itemsData, itemUnitsData, categoriesData] = await Promise.all([
          getSuppliers(),
          getInventoryLocations(),
          getCostCenters(),
          getItems(),
          getItemUnits(),
          getItemCategories(),
        ]);
        setSuppliers(suppliersData);
        setLocations(locationsData);
        setCostCenters(costCentersData);
        setItems(itemsData);
        setItemUnits(itemUnitsData);
        setCategories(categoriesData);

        // if navigated with an order number, fetch that order and its details
        if (orderNoFromState) {
          try {
            const order = await getPurchOrderByOrderNo(orderNoFromState);
              if (order) {
                // Map order fields to form state
                setSupplier(String(order.supplier_id ?? order.supplier ?? order.supp_id ?? ""));
              setSupplierRef(order.requisition_no ?? order.requisitionNo ?? order.supplier_ref ?? "");
              setDeliverTo(order.delivery_address ?? order.deliveryAddress ?? "");
              // normalize order date to YYYY-MM-DD (strip time if present)
              const rawOrd = order.ord_date ?? order.ordDate ?? new Date().toISOString();
              setOrderDate(String(rawOrd).split("T")[0]);
              setReference(order.reference ?? "");
              setMemo(order.comments ?? order.memo ?? "");

              // resolve receiveInto: convert loc_code to id if necessary
              const intoLoc = order.into_stock_location ?? order.intoStockLocation ?? order.into_location;
              const matchedLoc = (locationsData || []).find((l: any) => String(l.loc_code) === String(intoLoc) || String(l.id) === String(intoLoc));
              setReceiveInto(matchedLoc ? matchedLoc.id : 0);
            }

            const details = await getPurchOrderDetailsByOrderNo(orderNoFromState);
            if (Array.isArray(details) && details.length > 0) {
              const mapped = details.map((d: any, idx: number) => ({
                id: idx + 1,
                detailId: d.id ?? d.purch_order_detail_id ?? d.po_detail_id ?? null,
                po_detail_item: Number(d.po_detail_item ?? d.po_detail_id ?? d.po_detail_item ?? d.po_detail_item ?? idx + 1),
                stockId: d.item_code ?? d.stock_id ?? d.item ?? d.item_id ?? "",
                itemCode: d.item_code ?? d.stock_id ?? d.item ?? d.item_id ?? "",
                description: d.description ?? d.desc ?? "",
                quantity: Number(d.quantity_ordered ?? d.quantity ?? d.qty ?? 0),
                unit: ((): string => {
                  const rawUnit = d.unit ?? d.uom ?? d.unit_code ?? d.unit_id ?? d.uom_code ?? "";
                  // if unit is numeric id, resolve to abbreviation from itemUnitsData
                  if (rawUnit && typeof rawUnit !== "string" && typeof rawUnit !== "number") return String(rawUnit);
                  const rawStr = String(rawUnit ?? "");
                  const found = (itemUnitsData || []).find((u: any) => String(u.id) === rawStr || String(u.unit_code ?? u.code ?? u.abbr) === rawStr || String(u.abbr) === rawStr);
                  return found ? (found.abbr ?? String(found.unit_code ?? found.code ?? rawStr)) : rawStr;
                })(),
                deliveryDate: String((d.delivery_date ?? d.required_date ?? new Date().toISOString())).split("T")[0],
                price: Number(d.unit_price ?? d.unitPrice ?? d.act_price ?? d.price ?? 0),
                total: Number((d.unit_price ?? d.unitPrice ?? d.act_price ?? d.price ?? 0) * (d.quantity_ordered ?? d.quantity ?? d.qty ?? 0)),
                // ensure these fields exist so the rows shape matches the state type
                qty_invoiced: Number(d.qty_invoiced ?? d.qtyInvoiced ?? d.qty ?? 0),
                act_price: Number(d.act_price ?? d.actPrice ?? d.unit_price ?? 0),
                std_cost_unit: Number(d.std_cost_unit ?? d.stdCostUnit ?? 0),
                quantity_received: Number(d.quantity_received ?? d.qty_received ?? 0),
              }));
              setRows(mapped);
            }
          } catch (err) {
            console.error("Error fetching order or details:", err);
          }
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };
    fetchData();
  }, []);

  const [rows, setRows] = useState([
    {
      id: 1,
      stockId: "",
      itemCode: "",
      description: "",
      quantity: 0,
      unit: "",
      deliveryDate: new Date().toISOString().split("T")[0],
      price: 0,
      total: 0,
      detailId: null,
      po_detail_item: 0,
      qty_invoiced: 0,
      act_price: 0,
      std_cost_unit: 0,
      quantity_received: 0,
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
        stockId: "",
        itemCode: "",
        description: "",
        quantity: 0,
        unit: "",
        deliveryDate: new Date().toISOString().split("T")[0],
        price: 0,
        total: 0,
        detailId: null,
        po_detail_item: 0,
        qty_invoiced: 0,
        act_price: 0,
        std_cost_unit: 0,
        quantity_received: 0,
      },
    ]);
  };

  const handleRemoveRow = (id) => {
    setRows((prev) => {
      const toRemove = prev.find((r) => r.id === id);
      // If this row corresponds to an existing purch_order_detail, track its po_detail_item
      if (toRemove && (toRemove as any).po_detail_item) {
        const item = Number((toRemove as any).po_detail_item);
        if (!isNaN(item) && item > 0) setDeletedDetailIds((prevDel) => [...prevDel, item]);
      }
      return prev.filter((r) => r.id !== id);
    });
  };

  const handleChange = (id, field, value) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const received = Number(r.quantity_received ?? 0);
        const quantity =
          field === "quantity"
            ? Math.max(received, Number(value) || 0)
            : Number(r.quantity ?? 0);
        const price = field === "price" ? Number(value) : Number(r.price ?? 0);
        return {
          ...r,
          [field]: field === "quantity" ? quantity : value,
          quantity: field === "quantity" ? quantity : r.quantity,
          total: quantity * price,
        };
      })
    );
  };

  const resolveUnitAbbr = (rawUnit: any) => {
    const raw = rawUnit ?? "";
    const s = String(raw);
    const found = (itemUnits || []).find((u: any) => String(u.id) === s || String(u.abbr) === s || String(u.unit_code ?? u.code ?? "") === s);
    return found ? (found.abbr ?? String(found.unit_code ?? found.code ?? s)) : s;
  };

  // ========= Subtotal =========
  const subTotal = rows.reduce((sum, r) => sum + r.total, 0);

  // ========= Place Order =========
  const handlePlaceOrder = async () => {
    setIsUpdating(true);
    try {
      const orderNo = orderNoFromState;
      if (!orderNo) {
        alert("No order selected to update.");
        return;
      }

      const detailsToSave = (rows || []).filter(
        (r: any) => (r.itemCode || r.stockId) && Number(r.quantity) > 0
      );
      if (detailsToSave.length === 0) {
        alert("Add at least one item with quantity > 0.");
        return;
      }

      for (const r of detailsToSave) {
        const ordered = Number(r.quantity ?? 0);
        const received = Number(r.quantity_received ?? 0);
        if (ordered < received) {
          alert(
            `Quantity for ${r.itemCode ?? r.stockId} cannot be less than already received (${received}).`
          );
          return;
        }
      }

      const locObj = (locations || []).find((l: any) => Number(l.id) === Number(receiveInto));
      const intoStockLocation = locObj ? locObj.loc_code ?? locObj.id : receiveInto;

      const selectedSupplierObj = (suppliers || []).find(
        (s: any) => String(s.supplier_id ?? s.id) === String(supplier)
      );
      const taxIncludedForSupplier = Boolean(
        selectedSupplierObj?.tax_included ?? selectedSupplierObj?.taxIncluded ?? true
      );

      const lines = detailsToSave.map((r: any) => {
        const itemCodeValue = r.itemCode ?? r.stockId ?? "";
        const foundItem = (items || []).find(
          (it: any) => String(it.stock_id ?? it.id) === String(itemCodeValue)
        );
        const stdCost =
          Number(foundItem?.material_cost ?? foundItem?.standard_cost ?? r.std_cost_unit ?? 0) || 0;
        const poDetailItem = Number(r.po_detail_item ?? 0);

        return {
          ...(poDetailItem > 0 ? { po_detail_item: poDetailItem } : {}),
          item_code: itemCodeValue,
          description: r.description || null,
          delivery_date: r.deliveryDate || orderDate,
          qty_invoiced: Number(r.qty_invoiced ?? 0),
          unit_price: Number(r.price ?? 0),
          act_price: Number(r.act_price ?? r.price ?? 0),
          std_cost_unit: stdCost,
          quantity_ordered: Number(r.quantity ?? 0),
          quantity_received: Number(r.quantity_received ?? 0),
        };
      });

      const saveResult = await runTransactionSave(() =>
        postPurchOrderWithDetails({
          header: {
            order_no: Number(orderNo),
            supplier_id: Number(supplier),
            comments: memo ?? null,
            ord_date: orderDate,
            reference: reference ?? "",
            requisition_no: supplierRef ?? null,
            into_stock_location: String(intoStockLocation),
            delivery_address: deliverTo ?? "",
            total: subTotal,
            prep_amount: 0,
            alloc: 0,
            tax_included: taxIncludedForSupplier,
            cost_center_id: Number(costCenter) || 0,
          },
          lines,
          delete_detail_ids: deletedDetailIds.map(Number).filter((id) => id > 0),
        })
      );

      if (saveResult.ok === false) {
        alert(saveResult.message);
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ["purchOrders"], refetchType: "all" });
      await queryClient.invalidateQueries({ queryKey: ["purchOrderDetails"], refetchType: "all" });
      await queryClient.invalidateQueries({ queryKey: ["purchaseOrdersInquiry"], refetchType: "all" });

      setDeletedDetailIds([]);
      setOpenSuccess(true);
    } catch (error) {
      console.error("Error updating purchase order:", error);
      alert("Failed to update purchase order. See console for details.");
    } finally {
      setIsUpdating(false);
    }
  };

  const breadcrumbItems = [
    { title: "Purchases", href: "/purchases" },
    { title: "Modify Purchase Order" },
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
          <PageTitle title="Modify Purchase Order" />
          <Breadcrumb breadcrumbs={breadcrumbItems} />
        </Box>

        <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)}>
          Back
        </Button>
      </Box>
      {/* Form Fields */}
      <Paper sx={{ p: 2, borderRadius: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Stack spacing={2}>
              <TextField
                fullWidth
                label="Supplier"
                size="small"
                value={(() => {
                  const s = (suppliers || []).find((x: any) => String(x.supplier_id ?? x.id ?? x.debtor_no) === String(supplier));
                  return s ? (s.supp_name ?? s.name ?? s.supplier_name ?? "") : "";
                })()}
                InputProps={{ readOnly: true }}
              />

              <TextField
                label="Order Date"
                type="date"
                fullWidth
                size="small"
                value={orderDate}
                onChange={(e) => handleDateChange(e.target.value)}
                InputLabelProps={{ shrink: true }}
                error={!!dateError}
                helperText={dateError}
              />

              <SupplierCreditSummaryFields
                summary={supplierCreditSummary}
                documentTotal={subTotal}
                isLoading={supplierCreditLoading}
                currencyCode={currencyCode}
              />

              <TextField label="Reference" fullWidth size="small" value={reference} InputProps={{ readOnly: true }} />
            </Stack>
          </Grid>

          <Grid item xs={12} md={4}>
            <Stack spacing={2}>
              <SupplierCurrencyField supplier={selectedSupplier} />
              <TextField label="Supplier's Reference" fullWidth size="small" value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} />

              <TextField select fullWidth label="Cost Center" size="small" value={costCenter} onChange={(e) => setCostCenter(Number(e.target.value))}>
                {costCenters.map((d) => (
                  <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>
                ))}
              </TextField>

              <TextField select fullWidth label="Receive Into" size="small" value={receiveInto} onChange={(e) => setReceiveInto(Number(e.target.value))}>
                {locations.map((l) => (
                  <MenuItem key={l.id} value={l.id}>{l.location_name}</MenuItem>
                ))}
              </TextField>
            </Stack>
          </Grid>

          <Grid item xs={12} md={4}>
            <TextField label="Deliver To" fullWidth size="small" multiline rows={3} value={deliverTo} onChange={(e) => setDeliverTo(e.target.value)} />
          </Grid>
        </Grid>
      </Paper>
      {/* Order Items Table */}
      <Typography variant="subtitle1" sx={{ mb: 1, textAlign: "center" }}>
        Order Items
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
              <TableCell>Required Delivery Date</TableCell>
              <TableCell>Price Before Tax</TableCell>
              <TableCell>Line Total</TableCell>
              <TableCell align="center">Action</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {rows.map((row, i) => {
              const isLastRow = i === rows.length - 1;
              const isLocked = !isLastRow && editingRowId !== row.id;

              return (
              <TableRow key={row.id}>
                <TableCell>{i + 1}</TableCell>

                {/* Item Code */}
                <TableCell>
                  <TextField size="small" value={row.itemCode} InputProps={{ readOnly: true }} />
                </TableCell>

                {/* Description */}
                <TableCell>
                  <TextField
                    select
                    size="small"
                    disabled={isLocked}
                    value={row.stockId}
                    onChange={(e) => {
                      const selectedStockId = e.target.value;
                      const selected = (items || []).find((it) => String(it.stock_id ?? it.id) === String(selectedStockId));
                      handleChange(row.id, "stockId", String(selectedStockId));
                      if (selected) {
                        const unitObj = (itemUnits || []).find((u) => String(u.id) === String(selected.units) || String(u.abbr) === String(selected.units));
                        handleChange(row.id, "description", selected.description);
                        handleChange(row.id, "itemCode", String(selected.stock_id ?? selected.id));
                        handleChange(row.id, "unit", unitObj ? (unitObj.abbr ?? String(unitObj.unit_code ?? unitObj.code ?? "")) : String(selected.units ?? ""));
                        // fetch supplier-specific purchase price if available, fallback to material_cost
                        (async () => {
                          const supplierIdNum = Number(supplier) || 0;
                          const { price } = await resolvePurchaseItemPrice(
                            supplierIdNum,
                            String(selected.stock_id ?? selected.id ?? "")
                          );
                          handleChange(row.id, "price", price);
                        })();
                      }
                    }}
                  >
                    {(() => {
                      const filteredItems = items;
                      return (Object.entries(
                        filteredItems.reduce((groups: Record<string, any[]>, item) => {
                          const catId = item.category_id || "Uncategorized";
                          if (!groups[catId]) groups[catId] = [];
                          groups[catId].push(item);
                          return groups;
                        }, {})
                      ) as [string, any][]).map(([categoryId, groupedItems]) => {
                        const category = categories.find(cat => cat.category_id === Number(categoryId));
                        const categoryLabel = category ? category.description : `Category ${categoryId}`;
                        return [
                          <ListSubheader key={`cat-${categoryId}`}>
                            {categoryLabel}
                          </ListSubheader>,
                          groupedItems.map((item) => (
                            <MenuItem key={item.stock_id} value={item.stock_id}>
                              {item.description}
                            </MenuItem>
                          ))
                        ];
                      });
                    })()}
                  </TextField>
                </TableCell>

                {/* Quantity */}
                <TableCell>
                  <FormattedNumberField size="small" value={row.quantity} InputProps={{ readOnly: isLocked }} onChange={(e) => handleChange(row.id, "quantity", Number(e.target.value))} />
                </TableCell>

                {/* Unit */}
                <TableCell>
                  <TextField size="small" value={row.unit || resolveUnitAbbr(row.unit)} InputProps={{ readOnly: true }} />
                </TableCell>

                {/* Delivery Date */}
                <TableCell>
                  <TextField
                    size="small"
                    type="date"
                    disabled={isLocked}
                    value={row.deliveryDate}
                    onChange={(e) => handleChange(row.id, "deliveryDate", e.target.value)}
                  />
                </TableCell>

                {/* Price Before Tax */}
                <TableCell>
                  <CurrencyAmountInput
                    size="small"
                    value={row.price}
                    currencyCode={currencyCode}
                    disabled={isLocked}
                    onChange={(v) => handleChange(row.id, "price", v)}
                  />
                </TableCell>

                <TableCell>{formatMoney(row.total)}</TableCell>

                {/* Actions */}
                <TableCell align="center">
                  {isLastRow ? (
                    <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={handleAddRow} disabled={!row.itemCode || !(Number(row.quantity) > 0)}>
                      Add
                    </Button>
                  ) : (
                    <Stack direction="row" spacing={1}>
                      {editingRowId === row.id ? (
                        <Button variant="contained" size="small" onClick={() => setEditingRowId(null)}>
                          Done
                        </Button>
                      ) : (
                        <Button variant="outlined" size="small" startIcon={<EditIcon />} onClick={() => setEditingRowId(row.id)}>
                          Edit
                        </Button>
                      )}
                      <Button variant="outlined" color="error" size="small" startIcon={<DeleteIcon />} onClick={() => handleRemoveRow(row.id)}>
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

            <TableRow>
              <TableCell colSpan={7} sx={{ fontWeight: 600 }}>
                Amount Total
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{formatMoney(subTotal)}</TableCell>
              <TableCell></TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </TableContainer>
      {/* Memo Section */}
      <Paper sx={{ p: 2, borderRadius: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Memo
        </Typography>
        <TextField fullWidth multiline rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} />

        <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2, gap: 2 }}>
          <Button variant="outlined" onClick={() => navigate(-1)} disabled={isUpdating}>
            Cancel Order
          </Button>
          <Button variant="contained" color="primary" onClick={handlePlaceOrder} disabled={isUpdating || !canEdit}>
            {isUpdating ? (
              <>
                <CircularProgress size={18} sx={{ mr: 1, color: 'white' }} /> Updating...
              </>
            ) : (
              'Update Order'
            )}
          </Button>
        </Box>
      </Paper>
      <AddedConfirmationModal
        open={openSuccess}
        title="Success"
        content="Purchase order updated successfully."
        addFunc={async () => {}}
        handleClose={() => setOpenSuccess(false)}
        onSuccess={() => navigate(-1)}
      />
    </FormPageLayout>
  );
}
