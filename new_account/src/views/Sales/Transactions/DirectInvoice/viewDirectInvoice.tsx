import React, { useMemo, useState, useEffect } from "react";
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useLocation, useNavigate } from "react-router-dom";
import { getCustomers } from "../../../../api/Customer/AddCustomerApi";
import { getShippingCompanies } from "../../../../api/ShippingCompany/ShippingCompanyApi";
import { getDebtorTrans } from "../../../../api/DebtorTrans/DebtorTransApi";
import { getBranches } from "../../../../api/CustomerBranch/CustomerBranchApi";
import { getPaymentTerms } from "../../../../api/PaymentTerm/PaymentTermApi";
import { getSalesTypes } from "../../../../api/SalesMaintenance/salesService";
import { getDebtorTransDetails } from "../../../../api/DebtorTrans/DebtorTransDetailsApi";
import { getItems } from "../../../../api/Item/ItemApi";
import { getItemUnits } from "../../../../api/ItemUnit/ItemUnitApi";
import { getTaxGroupItemsByGroupId } from "../../../../api/Tax/TaxGroupItemApi";
import { getTaxTypes } from "../../../../api/Tax/taxServices";
import { useCustomerCredit } from "../../../../hooks/useCustomerCredit";
import CustomerCreditSummaryFields from "../../../../components/CustomerCreditSummaryFields";
import { TransactionPrintPage, TransactionPrintTemplate } from "../../../../components/Print";
import { formatPrintDate, formatPrintMoney } from "../../../../utils/formatPrintDocument";
import { STANDARD_ITEM_PRINT_COLUMNS } from "../../../../utils/transactionPrintColumns";
import { useQuery } from "@tanstack/react-query";

export default function ViewDirectInvoice() {
  const { state } = useLocation();
  const navigate = useNavigate();

  const {
    chargeTo,
    chargeBranch,
    paymentTerms,
    reference,
    customerOrderRef,
    dueDate,
    currency,
    shippingCompany,
    deliveries,
    ourOrderNo,
    salesType,
    invoiceDate,
    items = [],
    payments = [],
    subtotal,
    totalInvoice,
    autoPrint,
  } = state || {};

  // === Fetch Data ===
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: getCustomers,
  });

  const { data: shippingCompanies = [] } = useQuery({
    queryKey: ["shippingCompanies"],
    queryFn: getShippingCompanies,
  });

  const { data: debtorTrans = [] } = useQuery({
    queryKey: ["debtorTrans"],
    queryFn: getDebtorTrans,
  });

  // === Resolve Names ===
  const debtorTransEntry = useMemo(() => {
    if (!reference) return null;
    return (debtorTrans || []).find(
      (dt: any) => dt.trans_type === 10 && String(dt.reference) === String(reference)
    );
  }, [debtorTrans, reference]);

  const debtorNo = useMemo(() => debtorTransEntry ? debtorTransEntry.debtor_no : chargeTo || "-", [debtorTransEntry, chargeTo]);
  const chargeBranchValue = useMemo(() => debtorTransEntry ? debtorTransEntry.branch_code : chargeBranch || "-", [debtorTransEntry, chargeBranch]);

  const { data: customerBranches = [] } = useQuery({
    queryKey: ["customerBranches", debtorNo],
    queryFn: () => getBranches(debtorNo),
    enabled: !!debtorNo && debtorNo !== "-",
  });

  const { data: paymentTermsData = [] } = useQuery({
    queryKey: ["paymentTerms"],
    queryFn: getPaymentTerms,
  });

  const { data: salesTypes = [] } = useQuery({
    queryKey: ["salesTypes"],
    queryFn: getSalesTypes,
  });

  const { data: debtorTransDetails = [] } = useQuery({
    queryKey: ["debtorTransDetails"],
    queryFn: getDebtorTransDetails,
  });

  const { data: stockMasters = [] } = useQuery({
    queryKey: ["stockMasters"],
    queryFn: getItems,
  });

  const { data: itemUnits = [] } = useQuery({
    queryKey: ["itemUnits"],
    queryFn: getItemUnits,
  });

  const { data: taxTypes = [] } = useQuery({
    queryKey: ["taxTypes"],
    queryFn: getTaxTypes,
  });

  const [taxGroupItems, setTaxGroupItems] = useState<any[]>([]);

  // Fetch tax group items when branch is available
  useEffect(() => {
    if (chargeBranchValue) {
      const selectedBranch = customerBranches.find((b: any) => b.branch_code === chargeBranchValue);
      if (selectedBranch?.tax_group) {
        getTaxGroupItemsByGroupId(selectedBranch.tax_group)
          .then((items) => setTaxGroupItems(items))
          .catch((err) => {
            console.error("Failed to fetch tax group items:", err);
            setTaxGroupItems([]);
          });
      } else {
        setTaxGroupItems([]);
      }
    } else {
      setTaxGroupItems([]);
    }
  }, [chargeBranchValue, customerBranches]);

  const chargeBranchName = useMemo(() => {
    if (!chargeBranchValue || chargeBranchValue === "-") return "-";
    const found = (customerBranches || []).find(
      (cb: any) => String(cb.branch_code) === String(chargeBranchValue)
    );
    if (found) {
      const address = found.br_address ? ` - ${found.br_address}` : '';
      return `${found.br_name}${address}`;
    }
    return chargeBranchValue;
  }, [customerBranches, chargeBranchValue]);

  const paymentTermsValue = useMemo(() => {
    if (!debtorTransEntry) return paymentTerms || "-";
    const ptId = debtorTransEntry.payment_terms;
    if (!ptId) return paymentTerms || "-";
    const found = (paymentTermsData || []).find(
      (pt: any) => String(pt.terms_indicator) === String(ptId)
    );
    return found ? found.description : ptId;
  }, [debtorTransEntry, paymentTerms, paymentTermsData]);

  const salesTypeValue = useMemo(() => {
    if (!debtorTransEntry) return salesType || "-";
    const tpe = debtorTransEntry.tpe;
    if (!tpe) return salesType || "-";
    const found = (salesTypes || []).find(
      (st: any) => String(st.id) === String(tpe)
    );
    return found ? found.typeName : tpe;
  }, [debtorTransEntry, salesType, salesTypes]);

  // Determine if prices include tax
  const selectedPriceList = useMemo(() => {
    return salesTypes.find((pl: any) => String(pl.id) === String(debtorTransEntry?.tpe));
  }, [salesTypes, debtorTransEntry]);

  const deliveriesValue = useMemo(() => {
    if (!debtorTransEntry) return deliveries || "-";
    const deliveryEntry = (debtorTrans || []).find(
      (dt: any) => dt.order_no === debtorTransEntry.order_no && dt.trans_type === 13
    );
    return deliveryEntry ? deliveryEntry.trans_no : deliveries || "-";
  }, [debtorTrans, debtorTransEntry, deliveries]);

  const itemDetails = useMemo(() => {
    if (!debtorTransEntry) return items;
    return (debtorTransDetails || []).filter(
      (dtd: any) => dtd.debtor_trans_no === debtorTransEntry.trans_no && dtd.debtor_trans_type === 10
    );
  }, [debtorTransDetails, debtorTransEntry, items]);

  const resolvedItemDetails = useMemo(() => {
    return itemDetails.map((it: any) => {
      const stock = (stockMasters || []).find((sm: any) => sm.stock_id === it.stock_id);
      const unitId = stock ? stock.units : null;
      const unit = (itemUnits || []).find((iu: any) => iu.id === unitId);
      const calculatedTotal = (it.quantity * it.unit_price * (1 - (it.discount_percent || 0) / 100)).toFixed(2);
      return {
        ...it,
        unitAbbr: unit ? unit.abbr : it.unit || "-",
        total: it.total || calculatedTotal,
      };
    });
  }, [itemDetails, stockMasters, itemUnits]);

  const calculatedSubtotal = useMemo(() => {
    return resolvedItemDetails.reduce((sum, it) => sum + (parseFloat(it.total) || 0), 0).toFixed(2);
  }, [resolvedItemDetails]);

  // Calculate taxes
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
        taxAmount = parseFloat(calculatedSubtotal) - (parseFloat(calculatedSubtotal) / (1 + taxRate / 100));
      } else {
        // For prices that don't include tax, calculate tax on subtotal
        // Tax amount = subtotal * (rate/100)
        taxAmount = parseFloat(calculatedSubtotal) * (taxRate / 100);
      }

      return {
        name: taxName,
        rate: taxRate,
        amount: taxAmount,
      };
    });
  }, [selectedPriceList, taxGroupItems, taxTypes, calculatedSubtotal]);

  const totalTaxAmount = taxCalculations.reduce((sum, tax) => sum + tax.amount, 0);

  // Calculate total amount
  const totalAmount = useMemo(() => {
    if (selectedPriceList?.taxIncl) {
      return calculatedSubtotal;
    } else {
      return (parseFloat(calculatedSubtotal) + totalTaxAmount).toFixed(2);
    }
  }, [selectedPriceList, calculatedSubtotal, totalTaxAmount]);

  const chargeToName = useMemo(() => {
    if (!debtorNo || debtorNo === "-") return "-";
    const found = (customers || []).find(
      (c: any) => String(c.debtor_no) === String(debtorNo)
    );
    if (found) {
      return found.name;
    }
    return debtorNo;
  }, [customers, debtorNo]);

  const documentTotal = useMemo(() => {
    if (totalInvoice != null) return Number(totalInvoice) || 0;
    if (debtorTransEntry) {
      return (
        Number(debtorTransEntry.ov_amount ?? 0) +
        Number(debtorTransEntry.ov_gst ?? 0) +
        Number(debtorTransEntry.ov_freight ?? 0) +
        Number(debtorTransEntry.ov_freight_tax ?? 0) +
        Number(debtorTransEntry.ov_discount ?? 0)
      );
    }
    return Number(totalAmount ?? 0) || 0;
  }, [totalInvoice, debtorTransEntry, totalAmount]);

  const { summary: creditSummary, isLoading: creditLoading } = useCustomerCredit(
    debtorNo && debtorNo !== "-" ? debtorNo : null,
    customers
  );

  const currencyValue = useMemo(() => {
    if (!debtorNo || debtorNo === "-") return currency || "-";
    const found = (customers || []).find(
      (c: any) => String(c.debtor_no) === String(debtorNo)
    );
    return found ? found.curr_code : currency || "-";
  }, [customers, debtorNo, currency]);

  const shippingCompanyName = useMemo(() => {
    const shipVia = debtorTransEntry ? debtorTransEntry.ship_via : shippingCompany || "-";
    if (!shipVia || shipVia === "-") return "-";
    const found = (shippingCompanies || []).find(
      (s: any) => String(s.shipper_id) === String(shipVia)
    );
    return found ? found.shipper_name : shipVia;
  }, [shippingCompanies, debtorTransEntry, shippingCompany]);

  const resolvedPayments = useMemo(() => {
    if (!debtorTransEntry) return payments;
    return (debtorTrans || []).filter((dt: any) => dt.trans_type === 10 && dt.order_no === debtorTransEntry.order_no).map((dt: any) => ({
      type: 'Invoice',
      number: dt.trans_no,
      date: dt.tran_date,
      totalAmount: dt.ov_amount,
      leftToAllocate: dt.ov_amount - dt.alloc,
      thisAllocation: dt.alloc,
    }));
  }, [debtorTrans, debtorTransEntry, payments]);

  const printLines = useMemo(
    () =>
      resolvedItemDetails.map((it: any) => ({
        item: it.stock_id ?? "—",
        description: it.description ?? "—",
        quantity: it.quantity ?? "—",
        unit: it.unitAbbr ?? "—",
        price: formatPrintMoney(it.unit_price ?? 0),
        discount: it.discount_percent != null ? `${it.discount_percent}%` : "—",
        total: it.total != null ? formatPrintMoney(it.total) : "—",
      })),
    [resolvedItemDetails]
  );

  const invoiceTransNo = debtorTransEntry?.trans_no;

  // === Breadcrumbs ===
  const breadcrumbItems = [
    { title: "Home", href: "/dashboard" },
    { title: "Direct Invoices" },
  ];

  return (
    <TransactionPrintPage
      pageTitle={`Tax Invoice - ${reference || "—"}`}
      breadcrumbs={breadcrumbItems}
      onBack={() => navigate(-1)}
      autoPrint={autoPrint}
      ready={Boolean(debtorTransEntry || resolvedItemDetails.length > 0)}
      printContent={
        <TransactionPrintTemplate
          documentType="Tax Invoice"
          documentNumber={invoiceTransNo ?? ourOrderNo}
          reference={reference}
          documentDate={debtorTransEntry?.tran_date ?? invoiceDate}
          dueDate={dueDate ?? debtorTransEntry?.due_date}
          currency={currencyValue !== "-" ? currencyValue : undefined}
          partyName={chargeToName}
          partyLines={[chargeBranchName !== "-" ? chargeBranchName : ""].filter(Boolean)}
          documentFields={[
            { label: "Customer Order Ref", value: customerOrderRef || "—" },
            { label: "Payment Terms", value: paymentTermsValue },
            { label: "Sales Type", value: salesTypeValue },
            { label: "Delivery No.", value: String(deliveriesValue) },
            { label: "Shipping", value: shippingCompanyName },
            { label: "Our Order No.", value: String(debtorTransEntry?.order_no ?? ourOrderNo ?? "—") },
          ]}
          columns={STANDARD_ITEM_PRINT_COLUMNS}
          lines={printLines}
          totals={{
            subtotal: parseFloat(calculatedSubtotal),
            taxLines: taxCalculations.map((t) => ({
              label: `${t.name} (${t.rate}%)`,
              amount: t.amount,
            })),
            taxIncluded: Boolean(selectedPriceList?.taxIncl),
            total: parseFloat(totalAmount),
            currency: currencyValue !== "-" ? currencyValue : undefined,
          }}
          footerNote="Payment is due by the due date shown above. Please quote invoice reference when remitting."
        />
      }
      screenExtras={
        <>
          <Paper sx={{ p: 2, maxWidth: 360, mb: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
              Customer Credit
            </Typography>
            <CustomerCreditSummaryFields
              summary={creditSummary}
              documentTotal={documentTotal}
              isLoading={creditLoading}
            />
          </Paper>
          {resolvedPayments.length > 0 && (
            <Paper sx={{ p: 2 }}>
              <Typography sx={{ mb: 1, fontWeight: 600 }}>Payment Allocations</Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Type</TableCell>
                      <TableCell>Number</TableCell>
                      <TableCell>Date</TableCell>
                      <TableCell align="right">Amount</TableCell>
                      <TableCell align="right">Allocated</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {resolvedPayments.map((p: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell>{p.type ?? "—"}</TableCell>
                        <TableCell>{p.number ?? "—"}</TableCell>
                        <TableCell>{p.date ?? "—"}</TableCell>
                        <TableCell align="right">{p.totalAmount ?? "—"}</TableCell>
                        <TableCell align="right">{p.thisAllocation ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}
        </>
      }
    />
  );
}
