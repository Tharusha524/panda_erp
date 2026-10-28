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
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import PageTitle from "../../../../components/PageTitle";
import Breadcrumb from "../../../../components/BreadCrumb";
import { getPaymentTerms } from "../../../../api/PaymentTerm/PaymentTermApi";
import { getShippingCompanies } from "../../../../api/ShippingCompany/ShippingCompanyApi";
import { getDebtorTrans } from "../../../../api/DebtorTrans/DebtorTransApi";
import { prepaidFinalInvoice } from "../../../../api/SalesInquiry/SalesInquiryApi";
import { runTransactionSave } from "../../../../utils/transactionSave";
import { getCustomers } from "../../../../api/Customer/AddCustomerApi";
import { getBranches } from "../../../../api/CustomerBranch/CustomerBranchApi";
import { getSalesTypes } from "../../../../api/SalesMaintenance/salesService";
import { getDebtorTransDetails } from "../../../../api/DebtorTrans/DebtorTransDetailsApi";
import { getItems } from "../../../../api/Item/ItemApi";
import { getItemUnits } from "../../../../api/ItemUnit/ItemUnitApi";
import { getItemTaxTypes } from "../../../../api/ItemTaxType/ItemTaxTypeApi";

import { getSalesOrders, getSalesOrderByOrderNo, updateSalesOrder } from "../../../../api/SalesOrders/SalesOrdersApi";
import { getSalesOrderDetailsByOrderNo } from "../../../../api/SalesOrders/SalesOrderDetailsApi";
import { getTaxGroupItemsByGroupId } from "../../../../api/Tax/TaxGroupItemApi";
import { getTaxTypes } from "../../../../api/Tax/taxServices";
import { useAuth } from "../../../../context/AuthContext";
import { useNextFiscalYearReference } from "../../../../hooks/useNextFiscalYearReference";

export default function FinalInvoiceEntry() {
  const { hasEditPermission } = useAuth();
  const canEdit = hasEditPermission('Invoice prepaid orders');
  const navigate = useNavigate();
  const { state } = useLocation();
  const { orderNo, reference: stateReference, date: stateDate } = state || {};

  // === Fields ===
  const [customer, setCustomer] = useState("");
  const [branch, setBranch] = useState("");
  const [selectedBranch, setSelectedBranch] = useState<any>(null);
  const [paymentTerm, setPaymentTerm] = useState("");
  const [reference, setReference] = useState(stateReference || "");
  const [salesType, setSalesType] = useState("");
  const [currency, setCurrency] = useState("");
  const [shippingCompany, setShippingCompany] = useState("");
  const [date, setDate] = useState(stateDate || new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState("");
  const [memo, setMemo] = useState("");
  const [shippingCost, setShippingCost] = useState(0);

  // === Table Data ===
  const [rows, setRows] = useState([]);

  // === API Queries ===
  const { data: paymentTerms = [] } = useQuery({
    queryKey: ["paymentTerms"],
    queryFn: getPaymentTerms,
  });

  const { data: shippingCompanies = [] } = useQuery({
    queryKey: ["shippingCompanies"],
    queryFn: getShippingCompanies,
  });

  const { data: debtorTrans = [] } = useQuery({
    queryKey: ["debtorTrans"],
    queryFn: getDebtorTrans,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: getCustomers,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ["branches"],
    queryFn: () => getBranches(),
  });

  const { data: salesTypes = [] } = useQuery({
    queryKey: ["salesTypes"],
    queryFn: getSalesTypes,
  });

  const { data: debtorTransDetails = [] } = useQuery({
    queryKey: ["debtorTransDetails"],
    queryFn: getDebtorTransDetails,
  });

  const { data: items = [] } = useQuery({
    queryKey: ["items"],
    queryFn: getItems,
  });

  const { data: itemUnits = [] } = useQuery({
    queryKey: ["itemUnits"],
    queryFn: getItemUnits,
  });

  const { data: itemTaxTypes = [] } = useQuery({
    queryKey: ["itemTaxTypes"],
    queryFn: getItemTaxTypes,
  });

  const { data: taxTypes = [] } = useQuery({
    queryKey: ["taxTypes"],
    queryFn: getTaxTypes,
  });

  const { data: taxGroupItems = [] } = useQuery({
    queryKey: ["taxGroupItems", selectedBranch?.tax_group],
    queryFn: () => selectedBranch?.tax_group ? getTaxGroupItemsByGroupId(selectedBranch.tax_group) : [],
    enabled: !!selectedBranch?.tax_group,
  });

  const { data: salesOrder } = useQuery({
    queryKey: ["salesOrder", orderNo],
    queryFn: () => orderNo ? getSalesOrderByOrderNo(orderNo) : null,
    enabled: !!orderNo,
  });

  const { data: salesOrderDetails = [] } = useQuery({
    queryKey: ["salesOrderDetails", orderNo],
    queryFn: () => orderNo ? getSalesOrderDetailsByOrderNo(orderNo) : [],
    enabled: !!orderNo,
  });

  // Set customer data from sales order
  useEffect(() => {
    if (salesOrder && customers.length > 0 && branches.length > 0 && salesTypes.length > 0 && shippingCompanies.length > 0 && paymentTerms.length > 0) {
      const customerData = customers.find((c: any) => String(c.debtor_no) === String(salesOrder.debtor_no));
      const branchData = branches.find((b: any) => String(b.branch_code) === String(salesOrder.branch_code));
      const salesTypeData = salesTypes.find((st: any) => String(st.id) === String(salesOrder.order_type));
      const shippingCompanyData = shippingCompanies.find((sc: any) => String(sc.shipper_id) === String(salesOrder.ship_via));
      const paymentTermValue = String(salesOrder.payment_terms || "");
      const term = paymentTerms.find((t: any) => String(t.terms_indicator) === paymentTermValue);
      const days = parseInt(term?.terms_indicator || "0");
      const dueDateObj = new Date(date);
      dueDateObj.setDate(dueDateObj.getDate() + days);
      const calculatedDueDate = dueDateObj.toISOString().split("T")[0];
      setCustomer(customerData?.name || "Customer not found");
      setSelectedBranch(branchData);
      setBranch(branchData?.br_name || "Branch not found");
      setCurrency(customerData?.curr_code || "Currency not found");
      setSalesType(salesTypeData?.typeName || "Sales type not found");
      setPaymentTerm(paymentTermValue);
      setShippingCompany(shippingCompanyData?.shipper_name || "Shipping company not found");
      setShippingCost(salesOrder.ov_freight || 0);
      setMemo(salesOrder.comments || "");
      setDueDate(calculatedDueDate);
    }
  }, [salesOrder, customers, branches, salesTypes, shippingCompanies, paymentTerms, date]);

  // Calculate due date when payment term or date changes
  useEffect(() => {
    if (paymentTerms.length > 0 && paymentTerm && date) {
      const term = paymentTerms.find((t: any) => String(t.terms_indicator) === String(paymentTerm));
      const days = parseInt(term?.terms_indicator || "0");
      const dueDateObj = new Date(date);
      dueDateObj.setDate(dueDateObj.getDate() + days);
      const calculatedDueDate = dueDateObj.toISOString().split("T")[0];
      setDueDate(calculatedDueDate);
    }
  }, [paymentTerm, date, paymentTerms]);

  // Determine selected price list
  const selectedPriceList = salesTypes.find((st: any) => String(st.id) === String(salesOrder?.order_type));

  // trans_type 10 = Sales Invoice
  const { reference: nextInvoiceReference } = useNextFiscalYearReference(10, {
    asOfDate: date || undefined,
    enabled: Boolean(salesOrder),
  });

  useEffect(() => {
    if (nextInvoiceReference) {
      setReference(nextInvoiceReference);
    }
  }, [nextInvoiceReference]);

  const queryClient = useQueryClient();
  useEffect(() => {
    if (salesOrderDetails.length > 0 && items.length > 0 && itemUnits.length > 0 && itemTaxTypes.length > 0) {
      const newRows = salesOrderDetails.map((detail: any, index: number) => {
        const itemData = items.find((i: any) => i.stock_id === detail.stk_code);
        const unitData = itemUnits.find((u: any) => u.id === itemData?.units);
        const unitName = unitData?.abbr || detail.units || "";
        const price = parseFloat(detail.unit_price || 0);
        const qty = parseFloat(detail.quantity || 0);
        const taxTypeData = itemTaxTypes.find((t: any) => String(t.id) === String(itemData?.tax_type_id));
        const taxRate = parseFloat(taxTypeData?.rate || 15);
        const discount = parseFloat(detail.discount_percent || 0);
        const unitTax = price * (taxRate / 100);
        const total = qty * price * (1 - discount / 100);
        const standardCost = parseFloat(itemData?.standard_cost || 0);

        return {
          id: index + 1,
          itemCode: detail.stk_code || "",
          description: detail.description || "",
          quantity: qty,
          units: unitName,
          invoiced: 0, // assuming no previous invoices
          thisInvoice: qty, // default to full quantity
          price: price,
          taxType: taxTypeData?.name,
          discount: parseFloat(detail.discount_percent || 0),
          total: total,
          src_id: detail.id, // or whatever
          unitTax: unitTax,
          standardCost: standardCost,
        };
      });
      setRows(newRows);
    }
  }, [salesOrderDetails, items, itemUnits, itemTaxTypes]);

  // === Calculations ===
  const subTotal = rows.reduce((sum, r) => sum + r.total, 0);

  // Calculate taxes
  const taxCalculations = taxGroupItems.map((item: any) => {
    const taxTypeData = taxTypes.find((t: any) => t.id === item.tax_type_id);
    const taxRate = taxTypeData?.default_rate || 0;
    const taxName = taxTypeData?.description || "Tax";

    let taxAmount = 0;
    if (selectedPriceList?.taxIncl) {
      // For prices that include tax, extract the tax amount
      taxAmount = subTotal - (subTotal / (1 + taxRate / 100));
    } else {
      // For prices that don't include tax, calculate tax on subtotal
      taxAmount = subTotal * (taxRate / 100);
    }

    return {
      name: taxName,
      rate: taxRate,
      amount: taxAmount,
    };
  });

  const totalTaxAmount = taxCalculations.reduce((sum, tax) => sum + tax.amount, 0);
  const invoiceTotal = selectedPriceList?.taxIncl ? subTotal + shippingCost : subTotal + totalTaxAmount + shippingCost;

  // === Actions ===
  const handleUpdate = async () => {
    if (!salesOrder || !orderNo) {
      alert("No sales order loaded.");
      return;
    }

    try {
      await updateSalesOrder(orderNo, {
        ...salesOrder,
        payment_terms: paymentTerm ? Number(paymentTerm) : salesOrder.payment_terms,
        freight_cost: shippingCost,
        delivery_date: dueDate || salesOrder.delivery_date,
        comments: memo || salesOrder.comments,
        version: (Number(salesOrder.version) || 0) + 1,
      });
      await queryClient.invalidateQueries({ queryKey: ["salesOrder", orderNo] });
      alert("Prepaid order details saved.");
    } catch (error: any) {
      console.error("Error updating prepaid order:", error);
      alert(
        "Failed to save: " +
          (error.response?.data?.message || error.message || "Unknown error")
      );
    }
  };
  const handleProcessInvoice = async () => {
    if (!salesOrder || !orderNo) {
      alert("No prepaid sales order loaded.");
      return;
    }

    const saveResult = await runTransactionSave(async () => {
      const result = await prepaidFinalInvoice(Number(orderNo), {
        tran_date: date,
        due_date: dueDate || date,
        comments: memo || undefined,
        payment_terms: paymentTerm ? Number(paymentTerm) : undefined,
        freight_cost: shippingCost,
      });

      if (result.gl_warning) {
        console.warn("Prepaid final invoice GL warning:", result.gl_warning);
      }

      return {
        transNo: result.trans_no,
        reference: result.reference,
        invoiceDate: date,
      };
    });

    if (saveResult.ok === false) {
      alert(saveResult.message || "Failed to process final invoice.");
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["debtorTrans"] });
    queryClient.invalidateQueries({ queryKey: ["salesOrders"] });
    navigate("/sales/transactions/invoice-prepaid-orders/final-invoice-entry/success", {
      state: saveResult.data,
    });
  };

  const breadcrumbItems = [
    { title: "Transactions", href: "/sales/transactions" },
    { title: "Prepayment or Final Invoice Entry" },
  ];

  return (
    <FormPageLayout>
      {/* Header */}
      <Box
        sx={{
          padding: 2,
          boxShadow: 2,
          borderRadius: 1,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Box>
          <PageTitle title="Prepayment or Final Invoice Entry" />
          <Breadcrumb breadcrumbs={breadcrumbItems} />
        </Box>

        <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)}>
          Back
        </Button>
      </Box>
      {/* Form */}
      <Paper sx={{ p: 2, borderRadius: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth label="Customer" value={customer} size="small" InputProps={{ readOnly: true }} />
          </Grid>

          <Grid item xs={12} sm={4}>
            <TextField fullWidth label="Branch" value={branch} size="small" InputProps={{ readOnly: true }} />
          </Grid>

          <Grid item xs={12} sm={4}>
            <TextField
              select
              fullWidth
              label="Payment Terms"
              value={paymentTerm}
              onChange={(e) => setPaymentTerm(e.target.value)}
              size="small"
            >
              {paymentTerms.map((term: any) => (
                <MenuItem key={term.terms_indicator} value={term.terms_indicator}>
                  {term.description}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          <Grid item xs={12} sm={4}>
            <TextField fullWidth label="Reference" value={reference} size="small" InputProps={{ readOnly: true }} />
          </Grid>

          <Grid item xs={12} sm={4}>
            <TextField fullWidth label="Sales Type" value={salesType} size="small" InputProps={{ readOnly: true }} />
          </Grid>

          <Grid item xs={12} sm={4}>
            <TextField fullWidth label="Currency" value={currency} size="small" InputProps={{ readOnly: true }} />
          </Grid>

          <Grid item xs={12} sm={4}>
            <TextField fullWidth label="Shipping Company" value={shippingCompany} size="small" InputProps={{ readOnly: true }} />
          </Grid>

          <Grid item xs={12} sm={4}>
            <TextField
              type="date"
              label="Date"
              fullWidth
              size="small"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          <Grid item xs={12} sm={4}>
            <TextField
              type="date"
              label="Due Date"
              fullWidth
              size="small"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
        </Grid>
      </Paper>
      {/* Items Table */}
      <Typography variant="subtitle1" sx={{ mb: 2, textAlign: "center" }}>
        Sales Order Items
      </Typography>
      <TableContainer component={Paper} sx={{ width: '100%', overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 650 }}>
          <TableHead sx={{ backgroundColor: "var(--pallet-lighter-blue)" }}>
            <TableRow>
              <TableCell>No</TableCell>
              <TableCell>Item Code</TableCell>
              <TableCell>Description</TableCell>
              <TableCell>Units</TableCell>
              <TableCell>Quantity</TableCell>
              <TableCell>Price</TableCell>
              <TableCell>Tax Type</TableCell>
              <TableCell>Discount</TableCell>
              <TableCell>Total</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={row.id}>
                <TableCell>{index + 1}</TableCell>
                <TableCell>{row.itemCode}</TableCell>
                <TableCell>{row.description}</TableCell>
                <TableCell>{row.units}</TableCell>
                <TableCell>{row.quantity}</TableCell>
                <TableCell>{row.price}</TableCell>
                <TableCell>{row.taxType}</TableCell>
                <TableCell>{row.discount}%</TableCell>
                <TableCell>{row.total.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>

          <TableFooter>
            <TableRow>
              <TableCell colSpan={8}>Shipping Cost</TableCell>
              <TableCell>
                {/* <TextField
                  size="small"
                  type="number"
                  value={shippingCost}
                  InputProps={{ readOnly: true }}
                /> */}
                {shippingCost}
              </TableCell>
            </TableRow>

            <TableRow>
              <TableCell colSpan={8} sx={{ fontWeight: 600 }}>
                Sub Total
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{subTotal.toFixed(2)}</TableCell>
            </TableRow>

            <TableRow>
              <TableCell colSpan={9} sx={{ fontWeight: 600, fontStyle: 'italic', color: 'text.secondary' }}>
                {selectedPriceList?.taxIncl ? "Taxes Included:" : "Taxes:"}
              </TableCell>
            </TableRow>
            {taxCalculations.map((tax, idx) => (
              <TableRow key={idx}>
                <TableCell colSpan={7}></TableCell>
                <TableCell sx={{ pl: 4 }}>
                  {tax.name} ({tax.rate}%)
                </TableCell>
                <TableCell>{tax.amount.toFixed(2)}</TableCell>
              </TableRow>
            ))}

            <TableRow>
              <TableCell colSpan={8} sx={{ fontWeight: 600 }}>
                Invoice Total
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{invoiceTotal.toFixed(2)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </TableContainer>
      {/* Memo and Actions */}
      <Paper sx={{ p: 2, borderRadius: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Sales order"
              value={salesOrder?.reference || orderNo || ""}
              InputProps={{ readOnly: true }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Payments received"
              value={0}
              InputProps={{ readOnly: true }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Invoiced here"
              value="0.00"
              InputProps={{ readOnly: true }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Left to be invoiced"
              value={(salesOrder?.total || 0)}
              InputProps={{ readOnly: true }}
            />
          </Grid>
        </Grid>

        <TextField
          fullWidth
          label="Memo"
          multiline
          rows={2}
          value={salesOrder?.comments || ""}
          onChange={(e) => setMemo(e.target.value)}
          sx={{ mt: 2 }}
        />

        <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 2, mt: 2 }}>
          <Button variant="contained" color="primary" onClick={handleUpdate}>
            Update
          </Button>
          <Button disabled={!canEdit} variant="contained" color="success" onClick={handleProcessInvoice}>
            Process Invoice
          </Button>
        </Box>
      </Paper>
    </FormPageLayout>
  );
}
