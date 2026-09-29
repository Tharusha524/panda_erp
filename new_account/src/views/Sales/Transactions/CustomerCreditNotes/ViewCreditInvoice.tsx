import React, { useMemo, useState, useEffect } from "react";
import { Button, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getCustomers } from "../../../../api/Customer/AddCustomerApi";
import { getShippingCompanies } from "../../../../api/ShippingCompany/ShippingCompanyApi";
import { getBranches } from "../../../../api/CustomerBranch/CustomerBranchApi";
import { getSalesTypes } from "../../../../api/SalesMaintenance/salesService";
import { getDebtorTrans } from "../../../../api/DebtorTrans/DebtorTransApi";
import { getDebtorTransDetails } from "../../../../api/DebtorTrans/DebtorTransDetailsApi";
import { getItems } from "../../../../api/Item/ItemApi";
import { getItemUnits } from "../../../../api/ItemUnit/ItemUnitApi";
import { getTaxGroupItemsByGroupId } from "../../../../api/Tax/TaxGroupItemApi";
import { getTaxTypes } from "../../../../api/Tax/taxServices";
import { creditNoteGlNavState } from "../../../../utils/salesGlJournalNavState";
import { getCustAllocations } from "../../../../api/CustAllocation/CustAllocationApi";
import { TransactionPrintPage, TransactionPrintTemplate } from "../../../../components/Print";
import { formatPrintMoney } from "../../../../utils/formatPrintDocument";
import {
  DOCUMENT_PRINT_TYPES,
  STANDARD_ITEM_PRINT_COLUMNS,
} from "../../../../utils/transactionPrintColumns";
import {
  buildDebtorDetailPrintLines,
  computeSalesTaxLines,
} from "../../../../utils/transactionPrintHelpers";

export default function ViewCreditInvoice() {
    const { state } = useLocation();
    const navigate = useNavigate();

    const {
        trans_no,
        reference,
        date,
        autoPrint,
    } = state || {};

    // Fetch customers
    const { data: customers = [] } = useQuery({
        queryKey: ["customers"],
        queryFn: getCustomers,
    });

    // Fetch branches
    const { data: branches = [] } = useQuery({
        queryKey: ["branches"],
        queryFn: () => getBranches(),
    });

    // Fetch sales types
    const { data: salesTypes = [] } = useQuery({
        queryKey: ["salesTypes"],
        queryFn: getSalesTypes,
    });

    // Fetch shipping companies
    const { data: shippingCompanies = [] } = useQuery({
        queryKey: ["shippingCompanies"],
        queryFn: getShippingCompanies,
    });

    // Fetch debtor trans
    const { data: debtorTrans = [] } = useQuery({
        queryKey: ["debtorTrans"],
        queryFn: getDebtorTrans,
    });

    // Fetch debtor trans details
    const { data: debtorTransDetails = [] } = useQuery({
        queryKey: ["debtorTransDetails"],
        queryFn: getDebtorTransDetails,
    });

    // Fetch items
    const { data: items = [] } = useQuery({
        queryKey: ["items"],
        queryFn: getItems,
    });

    // Fetch item units
    const { data: itemUnits = [] } = useQuery({
        queryKey: ["itemUnits"],
        queryFn: getItemUnits,
    });

    // Fetch tax types
    const { data: taxTypes = [] } = useQuery({
        queryKey: ["taxTypes"],
        queryFn: getTaxTypes,
    });

    // Fetch customer allocations
    const { data: custAllocations = [] } = useQuery({
        queryKey: ["custAllocations"],
        queryFn: async () => (await getCustAllocations()).data,
    });

    const [taxGroupItems, setTaxGroupItems] = useState<any[]>([]);

    // Find the current debtor trans (only credit notes: trans_type === 11)
    const currentTrans = useMemo(() => {
        const found = debtorTrans.find((d: any) => Number(d.trans_no) === trans_no && Number(d.trans_type) === 11);
        return found;
    }, [debtorTrans, trans_no]);

    // Find the details for this trans (match debtor_trans.trans_no === debtor_trans_details.debtor_trans_no AND debtor_trans_details.debtor_trans_type = 11)
    const currentDetails = useMemo(() => {
        // Only return details when the parent debtor_trans is a customer credit note (trans_type === 11)
        if (!currentTrans || Number(currentTrans.trans_type) !== 11) return [];
        const transNo = currentTrans.trans_no ?? trans_no;
        return debtorTransDetails.filter((d: any) =>
            Number(d.debtor_trans_no) === Number(transNo) &&
            Number(d.debtor_trans_type) === 11
        );
    }, [debtorTransDetails, currentTrans, trans_no]);

    // Get the tax group ID for the current transaction's branch
    const taxGroupId = useMemo(() => {
        if (!currentTrans?.branch_code || !branches) return null;
        const selectedBranch = branches.find((b: any) => String(b.branch_code) === String(currentTrans.branch_code));
        return selectedBranch?.tax_group || null;
    }, [currentTrans?.branch_code, branches]);

    // Fetch tax group items when tax group ID changes
    useEffect(() => {
        if (taxGroupId) {
            getTaxGroupItemsByGroupId(taxGroupId)
                .then((items) => setTaxGroupItems(items))
                .catch((err) => {
                    console.error("Failed to fetch tax group items:", err);
                    setTaxGroupItems([]);
                });
        } else {
            setTaxGroupItems([]);
        }
    }, [taxGroupId]);

    // Resolve customer info
    const customerName = useMemo(() => {
        if (!currentTrans?.debtor_no) return "—";
        const found = (customers || []).find(
            (c) => String(c.debtor_no) === String(currentTrans.debtor_no)
        );
        return found ? found.name : String(currentTrans.debtor_no);
    }, [customers, currentTrans]);

    const customerAddress = useMemo(() => {
        if (!currentTrans?.debtor_no) return "";
        const found = (customers || []).find(
            (c) => String(c.debtor_no) === String(currentTrans.debtor_no)
        );
        if (!found) return "";
        return [found.address, found.city, found.state, found.postal_code]
            .filter(Boolean)
            .join(", ");
    }, [customers, currentTrans]);

    const customerCurrency = useMemo(() => {
        if (!currentTrans?.debtor_no) return undefined;
        const found = (customers || []).find(
            (c) => String(c.debtor_no) === String(currentTrans.debtor_no)
        );
        return found?.curr_code || undefined;
    }, [customers, currentTrans]);

    // Resolve branch info
    const branchInfo = useMemo(() => {
        if (!currentTrans?.branch_code) return "-";
        const found = (branches || []).find(
            (b) => String(b.branch_code) === String(currentTrans.branch_code)
        );
        if (found) {
            const address = [found.br_address, found.city, found.state, found.postal_code].filter(Boolean).join(", ");
            return `${found.br_name} - ${address}`;
        }
        return currentTrans.branch_code;
    }, [branches, currentTrans]);

    // Resolve sales type name
    const salesTypeName = useMemo(() => {
        if (!currentTrans?.tpe) return "-";
        const found = (salesTypes || []).find(
            (s) => String(s.id) === String(currentTrans.tpe)
        );
        return found ? found.typeName : currentTrans.tpe;
    }, [salesTypes, currentTrans]);

    // Determine selected price list (sales type)
    const selectedPriceList = useMemo(() => {
        if (!currentTrans?.tpe) return null;
        return (salesTypes || []).find(
            (s) => String(s.id) === String(currentTrans.tpe)
        );
    }, [salesTypes, currentTrans]);

    // Resolve shipping company name
    const shippingName = useMemo(() => {
        if (!currentTrans?.ship_via) return "-";
        const found = (shippingCompanies || []).find(
            (s) => String(s.shipper_id) === String(currentTrans.ship_via)
        );
        return found ? found.shipper_name : currentTrans.ship_via;
    }, [shippingCompanies, currentTrans]);

    // Calculate sub total
    const subTotal = useMemo(() => {
        return currentDetails.reduce((sum, item) => {
            const total = (item.unit_price || 0) * (item.quantity || 0) * (1 - (item.discount_percent || 0) / 100);
            return sum + total;
        }, 0);
    }, [currentDetails]);

    // Calculate taxes
    const taxIncluded = currentTrans?.tax_included === 1;

    const taxLines = useMemo(
        () => computeSalesTaxLines(subTotal, taxGroupItems, taxTypes, taxIncluded),
        [subTotal, taxGroupItems, taxTypes, taxIncluded]
    );

    const totalCredit = useMemo(() => {
        const taxSum = taxLines.reduce((sum, line) => sum + line.amount, 0);
        if (taxIncluded) return subTotal;
        return subTotal + taxSum;
    }, [taxIncluded, subTotal, taxLines]);

    const printLines = useMemo(
        () => buildDebtorDetailPrintLines(currentDetails, items, itemUnits),
        [currentDetails, items, itemUnits]
    );

    const allocationsData = useMemo(() => {
        if (!currentTrans?.order_no) {
            return { hasAllocations: false, allocations: [], totalAllocated: 0, leftToAllocate: 0 };
        }

        const originalInvoice = debtorTrans.find(
            (dt: any) => dt.trans_type === 10 && dt.order_no === currentTrans.order_no
        );

        if (!originalInvoice) {
            return { hasAllocations: false, allocations: [], totalAllocated: 0, leftToAllocate: 0 };
        }

        const allocations = [{
            type: "Invoice",
            number: originalInvoice.trans_no,
            date: originalInvoice.tran_date || "—",
            totalAmount: formatPrintMoney(originalInvoice.ov_amount || 0),
            leftToAllocate: "0.00",
            thisAllocation: formatPrintMoney(currentTrans?.alloc || 0),
        }];

        return {
            hasAllocations: true,
            allocations,
            totalAllocated: formatPrintMoney(currentTrans?.alloc || 0),
            leftToAllocate: "0.00",
        };
    }, [currentTrans, debtorTrans]);

    const breadcrumbItems = [
        { title: "Home", href: "/dashboard" },
        { title: "Customer Credit Notes" },
    ];

    return (
        <TransactionPrintPage
            pageTitle={`Customer Credit Note - ${currentTrans?.reference || reference || "—"}`}
            breadcrumbs={breadcrumbItems}
            onBack={() => navigate(-1)}
            autoPrint={Boolean(autoPrint)}
            ready={Boolean(currentTrans)}
            extraActions={
                <Button
                    variant="outlined"
                    onClick={() =>
                        navigate("/sales/transactions/gl-journal-entries", {
                            state: creditNoteGlNavState({
                                trans_no: currentTrans?.trans_no ?? trans_no,
                                reference: currentTrans?.reference ?? reference,
                                date: currentTrans?.tran_date ?? date,
                                trans_type: 11,
                            }),
                        })
                    }
                >
                    View GL Journal Entries
                </Button>
            }
            printContent={
                <TransactionPrintTemplate
                    documentType={DOCUMENT_PRINT_TYPES.creditNote}
                    documentNumber={currentTrans?.trans_no ?? trans_no}
                    reference={currentTrans?.reference ?? reference}
                    documentDate={currentTrans?.tran_date ?? date}
                    currency={customerCurrency}
                    partyName={customerName}
                    partyLines={customerAddress ? [customerAddress] : []}
                    documentFields={[
                        { label: "Branch", value: branchInfo },
                        { label: "Sales Type", value: salesTypeName },
                        { label: "Shipping", value: shippingName },
                    ]}
                    columns={STANDARD_ITEM_PRINT_COLUMNS}
                    lines={printLines}
                    totals={{
                        subtotal: subTotal,
                        taxLines,
                        total: totalCredit,
                        currency: customerCurrency,
                    }}
                    footerNote="Credit note — amounts credited to customer account as listed above."
                />
            }
            screenExtras={
                allocationsData.hasAllocations ? (
                    <Paper sx={{ p: 2 }}>
                        <Typography sx={{ mb: 1, fontWeight: 600 }}>Allocations</Typography>
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Type</TableCell>
                                        <TableCell>Number</TableCell>
                                        <TableCell>Date</TableCell>
                                        <TableCell align="right">Total Amount</TableCell>
                                        <TableCell align="right">Left to Allocate</TableCell>
                                        <TableCell align="right">This Allocation</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {allocationsData.allocations.map((alloc: any, index: number) => (
                                        <TableRow key={index}>
                                            <TableCell>{alloc.type}</TableCell>
                                            <TableCell>{alloc.number}</TableCell>
                                            <TableCell>{alloc.date}</TableCell>
                                            <TableCell align="right">{alloc.totalAmount}</TableCell>
                                            <TableCell align="right">{alloc.leftToAllocate}</TableCell>
                                            <TableCell align="right">{alloc.thisAllocation}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                ) : undefined
            }
        />
    );
}
