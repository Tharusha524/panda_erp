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
  FormControlLabel,
  Checkbox,
  Tabs,
  Tab,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getBankingJournal,
  postBankingJournal,
  putBankingJournal,
} from "../../../../api/Banking/BankingTransactionApi";
import useCurrentUser from "../../../../hooks/useCurrentUser";
import { useFiscalYearFormDefaults } from "../../../../hooks/useFiscalYearFormDefaults";
import { useNextFiscalYearReference } from "../../../../hooks/useNextFiscalYearReference";
import { useHomeCurrency } from "../../../../hooks/useHomeCurrency";
import { getFriendlyApiErrorMessage } from "../../../../utils/apiErrorMessage";
import {
  isJournalColumnBalanced,
  journalColumnTotals,
  normalizeJournalLineAmounts,
  parseJournalAmount,
} from "../../../../utils/journalAmount";
import {
  chartMastersToTypeMap,
  computeOpeningBalanceSummary,
  getOpeningBalanceEquationHint,
  formatBsAmount,
} from "../../../../utils/openingBalanceJournal";
import { buildChartGroupMetaMap } from "../../../../utils/trialAccountBalance";
import { invalidateFinancialReports } from "../../../../utils/invalidateFinancialReports";
import { getBankAccounts } from "../../../../api/BankAccount/BankAccountApi";
import { getCostCenters } from "../../../../api/CostCenter/CostCenterApi";
import { getCustomers } from "../../../../api/Customer/AddCustomerApi";
import { getSuppliers } from "../../../../api/Supplier/SupplierApi";
import { getCurrencies } from "../../../../api/Currency/currencyApi";
import { getTaxTypes } from "../../../../api/Tax/taxServices";
import api from "../../../../api/apiClient";
import Breadcrumb from "../../../../components/BreadCrumb";
import PageTitle from "../../../../components/PageTitle";
import PageLoader from "../../../../components/PageLoader";
import theme from "../../../../theme";
import FormattedNumberField from "../../../../components/FormattedNumberField";
import { useAuth } from "../../../../context/AuthContext";

// TabPanel helper
function TabPanel({ children, value, index }: { children: React.ReactNode; value: number; index: number }) {
  return <div hidden={value !== index}>{value === index && <Box sx={{ mt: 2 }}>{children}</Box>}</div>;
}

interface TaxLineFormState {
  netAmount: string;
  inputTax: string;
  outputTax: string;
}

function parseTaxAmount(value: string): number {
  const parsed = parseFloat(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function emptyTaxLine(): TaxLineFormState {
  return { netAmount: "", inputTax: "", outputTax: "" };
}

export default function JournalEntry() {
  const { hasEditPermission } = useAuth();
  const canEdit = hasEditPermission('Journal entries to bank related accounts');
  const navigate = useNavigate();
  const location = useLocation();
  const editState = location.state as {
    trans_no?: number;
    trans_type?: number;
    reference?: string;
    date?: string;
  } | null;
  const editTransNo = Number(editState?.trans_no ?? 0);
  const isEditMode =
    Number.isFinite(editTransNo) &&
    editTransNo > 0 &&
    Number(editState?.trans_type ?? 0) === 0;

  // Fetch GL accounts for Account Description dropdown
  const { data: chartMasters = [] } = useQuery({
    queryKey: ["chartMasters"],
    queryFn: () => import("../../../../api/GLAccounts/ChartMasterApi").then(m => m.getChartMasters()),
  });

  // Fetch GL Account Groups from backend
  const { data: chartTypes = [] } = useQuery({
    queryKey: ["chartTypes"],
    queryFn: () => import("../../../../api/GLAccounts/ChartTypeApi").then(m => m.getChartTypes()),
  });

  const { data: chartClasses = [] } = useQuery({
    queryKey: ["chartClasses"],
    queryFn: () => import("../../../../api/GLAccounts/ChartClassApi").then(m => m.getChartClasses()),
  });

  const chartGroupMeta = useMemo(
    () => buildChartGroupMetaMap(chartTypes as any[], chartClasses as any[]),
    [chartTypes, chartClasses]
  );

  // Group chart masters by GL Account Class → GL Account Group (FrontAccounting)
  const groupedChartMasters = useMemo(() => {
    const groupsMap: Record<string, any[]> = {};

    (chartMasters as any[]).forEach((acc: any) => {
      const matchedGroup = (chartTypes as any[]).find((g: any) => String(g.id) === String(acc.account_type));
      const classObj = (chartClasses as any[]).find(
        (c: any) => String(c.cid ?? c.id) === String(matchedGroup?.class_id ?? "")
      );
      const className = classObj?.class_name ?? classObj?.name ?? "Other";
      const groupName = matchedGroup?.name ?? "Unknown Group";
      const typeText = `${className} — ${groupName}`;

      if (!groupsMap[typeText]) groupsMap[typeText] = [];
      groupsMap[typeText].push(acc);
    });

    // sort each group's accounts by account_code for stable order
    Object.values(groupsMap).forEach((arr) =>
      arr.sort((a: any, b: any) => (String(a.account_code || "")).localeCompare(String(b.account_code || "")))
    );
    return groupsMap;
  }, [chartMasters, chartTypes, chartClasses]);

  // Fetch bank accounts for 'From' dropdown
  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["bankAccounts"],
    queryFn: getBankAccounts,
  });

  // Fetch cost centers for the line-level Cost Center dropdown (optional field)
  const { data: costCenters = [] } = useQuery({
    queryKey: ["costCenters"],
    queryFn: getCostCenters,
  });

  // Fetch customers/suppliers for the line-level Counterparty dropdown, shown
  // only when the selected account is a Trade Debtors / Trade Creditors
  // control account (optional field).
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: getCustomers,
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: getSuppliers,
  });

  const isDebtorAccountRow = (accountDescription: string) =>
    /DEBTOR|DEBITOR|RECEIVABLE/i.test(accountDescription || "");
  const isCreditorAccountRow = (accountDescription: string) =>
    /CREDITOR|CREDITER|PAYABLE/i.test(accountDescription || "");

  // Fetch currencies for currency dropdown
  const { data: currencies = [] } = useQuery({
    queryKey: ["currencies"],
    queryFn: getCurrencies,
  });

  // Fetch tax types for Tax Register table
  const { data: taxTypes = [] } = useQuery({
    queryKey: ["taxTypes"],
    queryFn: getTaxTypes,
  });

  // Active fiscal year from company setup
  const { fiscalYearFrom, fiscalYearTo } = useFiscalYearFormDefaults();
  const { reference: nextReference, manualEntryRequired, suffix } =
    useNextFiscalYearReference(0, { enabled: !isEditMode });
  const { code: homeCurrencyCode } = useHomeCurrency();

  const {
    data: existingJournal,
    isLoading: loadingExistingJournal,
    isError: existingJournalError,
    error: existingJournalLoadError,
  } = useQuery({
    queryKey: ["bankingJournal", editTransNo],
    queryFn: () => getBankingJournal(editTransNo),
    enabled: isEditMode,
  });

  const { user } = useCurrentUser();
  const userId = user?.id ?? (Number(localStorage.getItem("userId")) || 0);
  const queryClient = useQueryClient();

  //  Table data (journal entry rows)
  const [rows, setRows] = useState([
    {
      id: 1,
      accountCode: "",
      accountDescription: "",
      costCenter: "",
      debit: "",
      credit: "",
      memo: "",
      selectedAccountCode: "",
      personTypeId: "",
      personId: "",
    },
    {
      id: 2,
      accountCode: "",
      accountDescription: "",
      costCenter: "",
      debit: "",
      credit: "",
      memo: "",
      selectedAccountCode: "",
      personTypeId: "",
      personId: "",
    },
  ]);

  //  Form fields
  const [memo, setMemo] = useState("");
  const [journalDate, setJournalDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [documentDate, setDocumentDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [referencePrefix, setReferencePrefix] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [currency, setCurrency] = useState("");
  const [eventDate, setEventDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [includeInTaxRegister, setIncludeInTaxRegister] = useState(false);
  const [taxLines, setTaxLines] = useState<Record<string, TaxLineFormState>>({});
  const [sourceRef, setSourceRef] = useState("");
  const [vatDate, setVatDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [dateError, setDateError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [openSelectRowId, setOpenSelectRowId] = useState<number | null>(null);
  const [tabValue, setTabValue] = useState(0);

  // Set reference number from active fiscal year (scoped by transaction type)
  useEffect(() => {
    if (isEditMode || !nextReference) return;
    setReferenceNumber(nextReference);
  }, [nextReference, isEditMode]);

  useEffect(() => {
    if (!existingJournal || !isEditMode) return;

    const tranDate = String(existingJournal.tran_date ?? "").split(" ")[0];
    const docDate = String(existingJournal.doc_date ?? tranDate).split(" ")[0];
    const eventDateValue = String(existingJournal.event_date ?? tranDate).split(" ")[0];

    setJournalDate(tranDate || editState?.date || "");
    setDocumentDate(docDate || tranDate || "");
    setEventDate(eventDateValue || tranDate || "");
    setReferenceNumber(existingJournal.reference || editState?.reference || "");
    setReferencePrefix("");
    setCurrency(existingJournal.currency || homeCurrencyCode || "");
    setSourceRef(existingJournal.source_ref || "");
    setMemo(existingJournal.memo || "");

    if (existingJournal.include_in_tax_register) {
      setIncludeInTaxRegister(true);
      setVatDate(String(existingJournal.vat_date ?? tranDate).split(" ")[0]);
      const loadedTax: Record<string, TaxLineFormState> = {};
      for (const line of existingJournal.tax_lines ?? []) {
        loadedTax[String(line.tax_type_id)] = {
          netAmount: Number(line.net_amount) > 0 ? String(line.net_amount) : "",
          inputTax: Number(line.input_tax) > 0 ? String(line.input_tax) : "",
          outputTax: Number(line.output_tax) > 0 ? String(line.output_tax) : "",
        };
      }
      setTaxLines(loadedTax);
    } else {
      setIncludeInTaxRegister(false);
      setTaxLines({});
    }

    const loadedRows = (existingJournal.lines ?? []).map((line: any, index: number) => ({
      id: index + 1,
      accountCode: String(line.account_code ?? ""),
      accountDescription: "",
      costCenter: line.cost_center_id ? String(line.cost_center_id) : "",
      debit: Number(line.debit ?? 0) !== 0 ? String(line.debit) : "",
      credit: Number(line.credit ?? 0) !== 0 ? String(line.credit) : "",
      memo: line.memo || "",
      selectedAccountCode: String(line.account_code ?? ""),
      personTypeId: line.person_type_id ? String(line.person_type_id) : "",
      personId: line.person_id ? String(line.person_id) : "",
    }));

    setRows(
      loadedRows.length >= 2
        ? loadedRows
        : [
            ...loadedRows,
            {
              id: loadedRows.length + 1,
              accountCode: "",
              accountDescription: "",
              costCenter: "",
              debit: "",
              credit: "",
              memo: "",
              selectedAccountCode: "",
              personTypeId: "",
              personId: "",
            },
          ]
    );
  }, [existingJournal, isEditMode, editState, homeCurrencyCode]);

  // Default journal date and currency from company setup
  useEffect(() => {
    if (!fiscalYearFrom || !fiscalYearTo) return;

    const today = new Date().toISOString().split("T")[0];
    const validDate =
      today >= fiscalYearFrom && today <= fiscalYearTo ? today : fiscalYearFrom;

    setJournalDate(validDate);
    setDocumentDate(validDate);
    setEventDate(validDate);
    setVatDate(validDate);

    const selected = new Date(validDate);
    const from = new Date(fiscalYearFrom);
    const to = new Date(fiscalYearTo);
    if (selected < from || selected > to) {
      setDateError(`Date must be within the fiscal year (${from.toLocaleDateString()} - ${to.toLocaleDateString()})`);
    } else {
      setDateError("");
    }
  }, [fiscalYearFrom, fiscalYearTo]);

  useEffect(() => {
    if (homeCurrencyCode) {
      setCurrency(homeCurrencyCode);
    }
  }, [homeCurrencyCode]);

  // Validate date is within fiscal year
  const validateDate = (selectedDate: string) => {
    if (!fiscalYearFrom || !fiscalYearTo) {
      setDateError("No active fiscal year found");
      return false;
    }

    const selected = new Date(selectedDate);
    const from = new Date(fiscalYearFrom);
    const to = new Date(fiscalYearTo);

    if (selected < from || selected > to) {
      setDateError(`Date must be within the fiscal year (${from.toLocaleDateString()} - ${to.toLocaleDateString()})`);
      return false;
    }

    setDateError("");
    return true;
  };

  // Handle journal date change with validation
  const handleJournalDateChange = (value: string) => {
    setJournalDate(value);
    validateDate(value);
  };

  // Tab change handler
  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  //  Handle input change in table (generic)
  const handleChange = (id: number, field: string, value: any) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const handleAccountSelect = (id: number, code: string, accountName: string) => {
    setRows((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              selectedAccountCode: code,
              accountCode: code,
              accountDescription: accountName,
              // Counterparty only applies to Debtors/Creditors control accounts —
              // clear it if the newly picked account is neither.
              personTypeId:
                isDebtorAccountRow(accountName) || isCreditorAccountRow(accountName)
                  ? row.personTypeId
                  : "",
              personId:
                isDebtorAccountRow(accountName) || isCreditorAccountRow(accountName)
                  ? row.personId
                  : "",
            }
          : row
      )
    );
    setOpenSelectRowId(null);
  };

  const handleCounterpartyChange = (id: number, personType: 2 | 3, value: string) => {
    setRows((prev) =>
      prev.map((row) =>
        row.id === id
          ? { ...row, personTypeId: value ? String(personType) : "", personId: value }
          : row
      )
    );
  };

  const handleDebitCreditChange = (id: number, field: "debit" | "credit", value: string) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const hasValue = value !== "" && value !== "-";
        if (field === "debit") {
          return { ...row, debit: value, credit: hasValue ? "" : row.credit };
        }
        return { ...row, credit: value, debit: hasValue ? "" : row.debit };
      })
    );
  };

  const handleTaxFieldChange = (
    taxId: number,
    field: keyof TaxLineFormState,
    value: string,
    defaultRate: number
  ) => {
    setTaxLines((prev) => {
      const key = String(taxId);
      const current = prev[key] ?? emptyTaxLine();
      const next = { ...current, [field]: value };

      if (field === "netAmount") {
        const net = parseTaxAmount(value);
        const hasInput = parseTaxAmount(current.inputTax) > 0;
        const hasOutput = parseTaxAmount(current.outputTax) > 0;
        if (net > 0 && defaultRate > 0 && !hasInput && !hasOutput) {
          const tax = Math.round(((net * defaultRate) / 100) * 100) / 100;
          next.outputTax = String(tax);
        }
      }

      if (field === "inputTax" && parseTaxAmount(value) > 0) {
        next.outputTax = "";
      }
      if (field === "outputTax" && parseTaxAmount(value) > 0) {
        next.inputTax = "";
      }

      return { ...prev, [key]: next };
    });
  };

  const buildTaxLinesPayload = () =>
    (taxTypes as Array<{ id: number; default_rate?: number }>).map((tax) => {
      const row = taxLines[String(tax.id)] ?? emptyTaxLine();
      return {
        tax_type_id: tax.id,
        rate: Number(tax.default_rate ?? 0),
        net_amount: parseTaxAmount(row.netAmount),
        input_tax: parseTaxAmount(row.inputTax),
        output_tax: parseTaxAmount(row.outputTax),
      };
    }).filter(
      (line) => line.net_amount > 0 || line.input_tax > 0 || line.output_tax > 0
    );

  const accountTypeByCode = useMemo(
    () => chartMastersToTypeMap(chartMasters as any[]),
    [chartMasters]
  );

  const journalTotals = useMemo(() => {
    const { debitTotal, creditTotal, difference: columnDifference } = journalColumnTotals(rows);
    let totalDebit = 0;
    let totalCredit = 0;
    rows.forEach((row) => {
      const { debit, credit } = normalizeJournalLineAmounts(row.debit, row.credit);
      totalDebit += debit;
      totalCredit += credit;
    });
    const postedDifference = totalDebit - totalCredit;
    const openingBalance = computeOpeningBalanceSummary(rows, accountTypeByCode, chartGroupMeta);
    const columnBalanced = isJournalColumnBalanced(rows);
    const openingBalanceHint = getOpeningBalanceEquationHint(openingBalance, columnBalanced);
    return {
      signedDebit: debitTotal,
      signedCredit: creditTotal,
      columnDifference,
      totalDebit,
      totalCredit,
      postedDifference,
      isBalanced: columnBalanced,
      isPostedBalanced: Math.abs(postedDifference) <= 0.01,
      openingBalance,
      openingBalanceHint,
    };
  }, [rows, accountTypeByCode, chartGroupMeta]);

  //  Add new row
  const handleAddItem = () => {
    setRows((prev) => {
      // Use max existing id + 1, not row count — prevents duplicate ids
      // (and the row-state mix-ups they cause) once a row has been removed.
      const nextId = prev.length > 0 ? Math.max(...prev.map((r) => r.id)) + 1 : 1;
      return [
        ...prev,
        {
          id: nextId,
          accountCode: "",
          accountDescription: "",
          costCenter: "",
          debit: "",
          credit: "",
          memo: "",
          selectedAccountCode: "",
          personTypeId: "",
          personId: "",
        },
      ];
    });
  };

  //  Remove row (optional)
  const handleRemoveRow = (id: number) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  // Save journal entry
  const handleSaveJournalEntry = async () => {
    // Validation
    if (!journalDate) {
      setSaveError("Please select a journal date");
      return;
    }
    if (!validateDate(journalDate)) {
      return;
    }
    if (manualEntryRequired && !referenceNumber.trim()) {
      setSaveError("Please enter a reference number");
      return;
    }

    const linePayload = rows
      .filter((r: any) => {
        const { debit, credit } = normalizeJournalLineAmounts(r.debit, r.credit);
        return r.selectedAccountCode && (debit > 0 || credit > 0);
      })
      .map((r: any) => {
        const { debit, credit } = normalizeJournalLineAmounts(r.debit, r.credit);
        return {
          accountCode: r.selectedAccountCode || r.accountCode,
          selectedAccountCode: r.selectedAccountCode,
          accountDescription: r.accountDescription,
          costCenter: r.costCenter,
          debit,
          credit,
          memo: r.memo,
          personTypeId: r.personTypeId,
          personId: r.personId,
        };
      });

    if (linePayload.length < 2) {
      setSaveError("Please add at least two lines with account and debit or credit amount");
      return;
    }

    const hasBothSidesOnOneLine = linePayload.some(
      (line) => line.debit > 0 && line.credit > 0
    );
    if (hasBothSidesOnOneLine) {
      setSaveError("Each line must have either a debit or a credit amount, not both");
      return;
    }

    if (!isJournalColumnBalanced(rows)) {
      const { debitTotal, creditTotal, difference } = journalColumnTotals(rows);
      setSaveError(
        `Debit column total (${debitTotal.toFixed(2)}) must equal credit column total (${creditTotal.toFixed(2)}). Difference: ${Math.abs(difference).toFixed(2)}`
      );
      return;
    }

    const totalDebit = linePayload.reduce((sum, line) => sum + line.debit, 0);
    const totalCredit = linePayload.reduce((sum, line) => sum + line.credit, 0);

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      setSaveError(
        `Posted GL debits (${totalDebit.toFixed(2)}) must equal credits (${totalCredit.toFixed(2)}). Difference: ${Math.abs(totalDebit - totalCredit).toFixed(2)}`
      );
      return;
    }

    // The Assets = Liabilities + Equity check only makes sense for pure balance-sheet
    // entries (e.g. entering opening balances). A normal entry that includes an
    // Income/Expense line is expected to leave that equation looking "unbalanced"
    // here, since P&L accounts aren't part of the balance sheet — so it must not
    // block posting.
    const ob = journalTotals.openingBalance;
    if (ob.hasBalanceSheetLines && !ob.equationBalanced && !ob.hasProfitAndLossLines) {
      setSaveError(
        `Opening balance: Total Assets (${formatBsAmount(ob.totalAssets)}) must equal Liabilities + Equity (${formatBsAmount(ob.liabilitiesPlusEquity)}). Difference: ${formatBsAmount(Math.abs(ob.difference))}`
      );
      return;
    }

    const taxLinesPayload = includeInTaxRegister ? buildTaxLinesPayload() : [];
    if (includeInTaxRegister) {
      if (!vatDate) {
        setSaveError("Please select a VAT date for the tax register.");
        return;
      }
      if (taxLinesPayload.length === 0) {
        setSaveError(
          "Tax register is enabled — enter at least one tax line with net amount, input tax, or output tax."
        );
        return;
      }
    }

    setIsSaving(true);
    setSaveError("");
    setSaveSuccess(false);

    try {
      const reference = referencePrefix
        ? `${referencePrefix}-${referenceNumber}`
        : referenceNumber;

      const payload = {
        tran_date: journalDate,
        reference,
        currency: currency || homeCurrencyCode || undefined,
        source_ref: sourceRef || undefined,
        event_date: eventDate || undefined,
        doc_date: documentDate || undefined,
        memo: memo || undefined,
        include_in_tax_register: includeInTaxRegister,
        vat_date: includeInTaxRegister ? vatDate : undefined,
        tax_lines: includeInTaxRegister ? taxLinesPayload : [],
        lines: linePayload.map((r) => ({
          account_code: r.selectedAccountCode || r.accountCode,
          debit: r.debit,
          credit: r.credit,
          memo: r.memo,
          cost_center_id: r.costCenter ? Number(r.costCenter) : undefined,
          person_type_id: r.personTypeId ? Number(r.personTypeId) : undefined,
          person_id: r.personId ? Number(r.personId) : undefined,
        })),
      };

      const result = isEditMode
        ? await putBankingJournal(editTransNo, payload)
        : await postBankingJournal(payload);

      const postedReference = result.reference ?? reference;
      // Opening (Brought Forward) = all GL before journal date; This Period = journal day; Balance = closing.
      const trialFromDate = journalDate;
      const trialToDate = journalDate;

      await invalidateFinancialReports(queryClient);
      await queryClient.invalidateQueries({ queryKey: ["glInquiry"] });
      await queryClient.invalidateQueries({ queryKey: ["glTransByTransaction"] });

      await queryClient.prefetchQuery({
        queryKey: [
          "trialBalance",
          trialFromDate,
          trialToDate,
          "",
          false,
          false,
          false,
        ],
        queryFn: async () => {
          const { data } = await api.post("/trial-balance/search", {
            fromDate: trialFromDate,
            toDate: trialToDate,
            costCenter: "",
            noZeroValues: false,
            onlyBalance: false,
            groupTotalsOnly: false,
            syncGl: true,
          });
          return data || [];
        },
      });

      navigate("/bankingandgeneralledger/inquiriesandreports/trial-balance", {
        state: {
          fromDate: trialFromDate,
          toDate: trialToDate,
          journalDate,
          autoSearch: true,
          journalPosted: true,
          reference: postedReference,
          trans_no: result.trans_no ?? editTransNo,
          journalSuccess: {
            reference: postedReference,
            date: journalDate,
            documentDate,
            eventDate,
            currency: result.currency ?? currency,
            trans_no: result.trans_no ?? editTransNo,
            trans_type: result.trans_type ?? 0,
            transactionKind: "journal",
            lines: linePayload,
          },
        },
      });
    } catch (error: any) {
      console.error("Error saving journal entry:", error);
      setSaveError(getFriendlyApiErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const breadcrumbItems = [
    { title: "Home", href: "/dashboard" },
    { title: isEditMode ? `Edit Journal Entry #${editTransNo}` : "Journal Entry" },
  ];

  if (isEditMode && loadingExistingJournal) {
    return <PageLoader />;
  }

  if (isEditMode && existingJournalError) {
    return (
      <Stack spacing={2} sx={{ p: 2 }}>
        <Alert severity="error">
          {getFriendlyApiErrorMessage(existingJournalLoadError) || "Failed to load journal entry."}
        </Alert>
        <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)}>
          Back
        </Button>
      </Stack>
    );
  }

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
          <PageTitle title={isEditMode ? `Edit Journal Entry #${editTransNo}` : "Journal Entry"} />
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
      {/* Journal Entry Header Fields */}
      <Paper sx={{ p: 2, borderRadius: 2 }}>
        <Grid container spacing={2}>
          {/* First row: Journal Date, Document Date, Reference */}
          <Grid item xs={12} sm={4}>
            <TextField
              label="Journal Date"
              type="date"
              fullWidth
              size="small"
              value={journalDate}
              onChange={(e) => handleJournalDateChange(e.target.value)}
              InputLabelProps={{ shrink: true }}
              error={!!dateError}
              helperText={dateError}
            />
          </Grid>

          <Grid item xs={12} sm={4}>
            <TextField
              label="Document Date"
              type="date"
              fullWidth
              size="small"
              value={documentDate}
              onChange={(e) => setDocumentDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          <Grid item xs={12} sm={4}>
            <Grid container spacing={1}>
              <Grid item xs={4}>
                <TextField
                  select
                  fullWidth
                  label="Prefix"
                  value={referencePrefix}
                  onChange={(e) => setReferencePrefix(e.target.value)}
                  size="small"
                >
                  <MenuItem value="">None</MenuItem>
                  <MenuItem value="JE">JE</MenuItem>
                  <MenuItem value="JV">JV</MenuItem>
                  <MenuItem value="ADJ">ADJ</MenuItem>
                  <MenuItem value="REV">REV</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={8}>
                <TextField
                  label="Reference"
                  fullWidth
                  size="small"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder={manualEntryRequired ? "Enter reference manually" : "Enter reference"}
                  helperText={
                    manualEntryRequired
                      ? `Auto numbering is off — enter a reference for FY ${suffix || "active year"}`
                      : undefined
                  }
                />
              </Grid>
            </Grid>
          </Grid>

          {/* Second row: Currency, Event Date, Include in tax register */}
          <Grid item xs={12} sm={4}>
            <TextField
              select
              fullWidth
              label="Currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              size="small"
            >
              <MenuItem value="">Select currency</MenuItem>
              {(currencies as any[]).map((curr: any) => (
                <MenuItem key={curr.id} value={curr.currency_abbreviation}>
                  {curr.currency_abbreviation} - {curr.currency_name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          <Grid item xs={12} sm={4}>
            <TextField
              label="Event Date"
              type="date"
              fullWidth
              size="small"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          <Grid item xs={12} sm={4}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={includeInTaxRegister}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setIncludeInTaxRegister(checked);
                    if (checked) {
                      setTabValue(1);
                    }
                  }}
                />
              }
              label="Include in tax register"
            />
          </Grid>

          {/* Source ref under Event Date */}
          <Grid item xs={12} sm={4} sx={{ ml: { sm: '33.33%' } }}>
            <TextField
              label="Source ref"
              fullWidth
              size="small"
              value={sourceRef}
              onChange={(e) => setSourceRef(e.target.value)}
            />
          </Grid>
        </Grid>
      </Paper>
      {/* Tabs */}
      <Tabs
        value={tabValue}
        onChange={handleTabChange}
        variant="scrollable"
        scrollButtons="auto"
        textColor="primary"
        indicatorColor="primary"
        sx={{ bgcolor: "background.paper", borderRadius: 1 }}
      >
        <Tab label="GL Posting" />
        <Tab label="Tax Register" disabled={!includeInTaxRegister} />
      </Tabs>
      {/* Tab Panels */}
      <TabPanel value={tabValue} index={0}>
      <TableContainer component={Paper} sx={{ p: 1 }}>
        <Table>
          <TableHead sx={{ backgroundColor: "var(--pallet-lighter-blue)" }}>
            <TableRow>
              <TableCell>No</TableCell>
              <TableCell>Account Code</TableCell>
              <TableCell>Account Description</TableCell>
              <TableCell>Cost Center</TableCell>
              <TableCell>Counterparty</TableCell>
              <TableCell width={130}>Debit</TableCell>
              <TableCell width={130}>Credit</TableCell>
              <TableCell>Memo</TableCell>
              <TableCell align="center">Action</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={row.id} hover data-row-id={row.id}>
                <TableCell>{index + 1}</TableCell>
                <TableCell>
                  <TextField size="small" value={row.accountCode} InputProps={{ readOnly: true }} />
                </TableCell>
                <TableCell>
                  <TextField
                    select
                    size="small"
                    value={String(row.selectedAccountCode || row.accountCode || "")}
                    SelectProps={{
                        open: openSelectRowId === row.id,
                        onOpen: () => setOpenSelectRowId(row.id),
                        onClose: () => setOpenSelectRowId(null),
                        renderValue: (value: any) => {
                            if (!value) return "";
                            const found = (chartMasters as any[]).find((c: any) => String(c.account_code) === String(value));
                            return found ? `${found.account_name} - ${found.account_code}` : String(value);
                        },
                    }}
                    onChange={(e) => {
                      const selectedCode = String(e.target.value);
                      if (!selectedCode) {
                        handleAccountSelect(row.id, "", "");
                        return;
                      }
                      const selected = (chartMasters as any[]).find(
                        (c: any) => String(c.account_code) === selectedCode
                      );
                      handleAccountSelect(
                        row.id,
                        selectedCode,
                        selected?.account_name || ""
                      );
                    }}
                  >
                    <MenuItem value="" onClick={() => handleAccountSelect(row.id, "", "")}>
                      Select account
                    </MenuItem>
                    {(bankAccounts as any[]).some((ba: any) => String(ba.account_gl_code ?? "").trim()) && (
                      <ListSubheader>Bank Accounts (linked GL)</ListSubheader>
                    )}
                    {(bankAccounts as any[]).map((ba: any) => {
                      const glCode = String(ba.account_gl_code ?? "").trim();
                      if (!glCode) return null;
                      const bankLabel =
                        ba.bank_account_name ||
                        [ba.bank_name, ba.bank_account_number].filter(Boolean).join(" - ") ||
                        `Bank #${ba.id}`;
                      return (
                        <MenuItem
                          key={`bank-${ba.id}`}
                          value={glCode}
                          onClick={() => {
                            const chartMatch = (chartMasters as any[]).find(
                              (c: any) => String(c.account_code) === glCode
                            );
                            handleAccountSelect(
                              row.id,
                              glCode,
                              chartMatch?.account_name || bankLabel
                            );
                          }}
                        >
                          {bankLabel} — GL {glCode}
                        </MenuItem>
                      );
                    })}
                    {Object.entries(groupedChartMasters).map(([typeText, accounts]) => (
                      <React.Fragment key={typeText}>
                        <ListSubheader>{typeText}</ListSubheader>
                        {accounts.map((acc: any) => (
                          <MenuItem
                            key={String(acc.account_code)}
                            value={String(acc.account_code)}
                            onClick={() => {
                              handleAccountSelect(
                                row.id,
                                String(acc.account_code ?? ""),
                                acc.account_name || ""
                              );
                            }}
                          >
                            {acc.account_name} {acc.account_code ? ` - ${acc.account_code}` : ""}
                          </MenuItem>
                        ))}
                      </React.Fragment>
                    ))}
                  </TextField>
                </TableCell>
                <TableCell>
                  <TextField
                    select
                    size="small"
                    sx={{ minWidth: 160 }}
                    value={row.costCenter ? String(row.costCenter) : ""}
                    onChange={(e) => handleChange(row.id, "costCenter", e.target.value)}
                  >
                    <MenuItem value="">
                      <em>None</em>
                    </MenuItem>
                    {(costCenters as any[]).map((cc: any) => (
                      <MenuItem key={cc.id} value={String(cc.id)}>
                        {cc.reference ? `${cc.reference} - ${cc.name}` : cc.name}
                      </MenuItem>
                    ))}
                  </TextField>
                </TableCell>
                <TableCell>
                  {isDebtorAccountRow(row.accountDescription) ? (
                    <TextField
                      select
                      size="small"
                      sx={{ minWidth: 180 }}
                      value={row.personId ? String(row.personId) : ""}
                      onChange={(e) => handleCounterpartyChange(row.id, 2, e.target.value)}
                    >
                      <MenuItem value="">
                        <em>None</em>
                      </MenuItem>
                      {(customers as any[]).map((c: any) => (
                        <MenuItem key={c.debtor_no} value={String(c.debtor_no)}>
                          {c.name}
                        </MenuItem>
                      ))}
                    </TextField>
                  ) : isCreditorAccountRow(row.accountDescription) ? (
                    <TextField
                      select
                      size="small"
                      sx={{ minWidth: 180 }}
                      value={row.personId ? String(row.personId) : ""}
                      onChange={(e) => handleCounterpartyChange(row.id, 3, e.target.value)}
                    >
                      <MenuItem value="">
                        <em>None</em>
                      </MenuItem>
                      {(suppliers as any[]).map((s: any) => (
                        <MenuItem key={s.supplier_id} value={String(s.supplier_id)}>
                          {s.supp_name}
                        </MenuItem>
                      ))}
                    </TextField>
                  ) : (
                    <TextField select size="small" sx={{ minWidth: 180 }} value="" disabled>
                      <MenuItem value="">
                        <em>N/A</em>
                      </MenuItem>
                    </TextField>
                  )}
                </TableCell>
                <TableCell>
                  <FormattedNumberField
                    size="small"
                    fullWidth
                    sx={{ minWidth: 110 }}
                    inputProps={{ step: "0.01" }}
                    placeholder="0.00"
                    fixedDecimals={2}
                    value={row.debit}
                    onChange={(e) => handleDebitCreditChange(row.id, "debit", e.target.value)}
                  />
                </TableCell>
                <TableCell>
                  <FormattedNumberField
                    size="small"
                    fullWidth
                    sx={{ minWidth: 110 }}
                    inputProps={{ step: "0.01" }}
                    placeholder="0.00"
                    fixedDecimals={2}
                    value={row.credit}
                    onChange={(e) => handleDebitCreditChange(row.id, "credit", e.target.value)}
                  />
                </TableCell>
                <TableCell>
                  <TextField size="small" value={row.memo} onChange={(e) => handleChange(row.id, "memo", e.target.value)} />
                </TableCell>
                <TableCell align="center">
                  {index === rows.length - 1 ? (
                    <Button
                      variant="contained"
                      color="primary"
                      size="small"
                      startIcon={<AddIcon />}
                      onClick={handleAddItem}
                      disabled={!row.selectedAccountCode || !(Number(row.debit) > 0 || Number(row.credit) > 0)}
                    >
                      Add
                    </Button>
                  ) : (
                    <Stack direction="row" spacing={1} justifyContent="center">
                      <Button variant="outlined" size="small" startIcon={<EditIcon />} onClick={() => {
                        const rowElement = document.querySelector(`[data-row-id="${row.id}"]`);
                        if (rowElement) {
                          const firstInput = rowElement.querySelector('input') as HTMLInputElement;
                          if (firstInput) firstInput.focus();
                        }
                      }}>Edit</Button>
                      <Button variant="outlined" color="error" size="small" startIcon={<DeleteIcon />} onClick={() => handleRemoveRow(row.id)}>Delete</Button>
                    </Stack>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>

          <TableFooter>
            <TableRow>
              <TableCell colSpan={5}>
                <Typography align="right" sx={{ pr: 2, fontWeight: 600, fontSize: "0.85rem" }}>
                  Entered (+/−)
                </Typography>
              </TableCell>
              <TableCell>
                <Typography sx={{ fontWeight: 600, fontSize: "0.85rem" }}>
                  {journalTotals.signedDebit.toFixed(2)}
                </Typography>
              </TableCell>
              <TableCell>
                <Typography sx={{ fontWeight: 600, fontSize: "0.85rem" }}>
                  {journalTotals.signedCredit.toFixed(2)}
                </Typography>
              </TableCell>
              <TableCell colSpan={2}>
                <Typography
                  sx={{
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    color: journalTotals.isBalanced ? "success.main" : "error.main",
                  }}
                >
                  {journalTotals.isBalanced
                    ? "Balanced (0.00)"
                    : `Diff ${Math.abs(journalTotals.columnDifference).toFixed(2)}`}
                </Typography>
              </TableCell>
            </TableRow>
            <TableRow sx={{ backgroundColor: "action.hover" }}>
              <TableCell colSpan={5}>
                <Typography align="right" sx={{ pr: 2, fontWeight: 600, fontSize: "0.85rem" }}>
                  Posted to GL
                </Typography>
              </TableCell>
              <TableCell>
                <Typography sx={{ fontWeight: 600, fontSize: "0.85rem" }}>
                  {journalTotals.totalDebit.toFixed(2)}
                </Typography>
              </TableCell>
              <TableCell>
                <Typography sx={{ fontWeight: 600, fontSize: "0.85rem" }}>
                  {journalTotals.totalCredit.toFixed(2)}
                </Typography>
              </TableCell>
              <TableCell colSpan={2}>
                <Typography
                  sx={{
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    color: journalTotals.isPostedBalanced ? "success.main" : "error.main",
                  }}
                >
                  {journalTotals.isPostedBalanced
                    ? journalTotals.isBalanced
                      ? "Ready to post"
                      : "Fix column balance first"
                    : `GL diff ${Math.abs(journalTotals.postedDifference).toFixed(2)}`}
                </Typography>
              </TableCell>
            </TableRow>
            {journalTotals.openingBalance.hasBalanceSheetLines && (
              <>
                <TableRow sx={{ backgroundColor: "#e3f2fd" }}>
                  <TableCell colSpan={5}>
                    <Typography align="right" sx={{ pr: 2, fontWeight: 600, fontSize: "0.85rem" }}>
                      Balance Sheet (net)
                    </Typography>
                  </TableCell>
                  <TableCell colSpan={2}>
                    <Typography sx={{ fontSize: "0.8rem" }}>
                      Assets: <strong>{formatBsAmount(journalTotals.openingBalance.totalAssets)}</strong>
                    </Typography>
                  </TableCell>
                  <TableCell colSpan={2}>
                    <Typography
                      sx={{
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        color: journalTotals.openingBalance.equationBalanced
                          ? "success.main"
                          : "error.main",
                      }}
                    >
                      L+E: {formatBsAmount(journalTotals.openingBalance.liabilitiesPlusEquity)}
                      {journalTotals.openingBalance.equationBalanced
                        ? " ✓"
                        : ` (diff ${formatBsAmount(journalTotals.openingBalance.difference)})`}
                    </Typography>
                  </TableCell>
                </TableRow>
                {journalTotals.openingBalanceHint && (
                  <TableRow sx={{ backgroundColor: "#fff3e0" }}>
                    <TableCell colSpan={9}>
                      <Typography sx={{ fontSize: "0.78rem", color: "warning.dark" }}>
                        {journalTotals.openingBalanceHint}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </>
            )}
          </TableFooter>
        </Table>
      </TableContainer>
      </TabPanel>
      <TabPanel value={tabValue} index={1}>
        <Alert severity="info" sx={{ mb: 2 }}>
          Enter net amount and input tax (purchases) or output tax (sales). Tax is saved to the register and
          appears in Banking &amp; GL → Tax Inquiry.
        </Alert>

        <Box sx={{ mb: 2, display: "flex", justifyContent: "center" }}>
          <TextField
            label="VAT Date"
            type="date"
            size="small"
            value={vatDate}
            onChange={(e) => setVatDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ maxWidth: 200 }}
            required
          />
        </Box>

        <TableContainer component={Paper} sx={{ p: 1 }}>
          <Table>
            <TableHead sx={{ backgroundColor: "var(--pallet-lighter-blue)" }}>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Input Tax</TableCell>
                <TableCell>Output Tax</TableCell>
                <TableCell>Net Amount</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {(taxTypes as Array<{ id: number; description?: string; default_rate?: number }>).map((tax) => {
                const row = taxLines[String(tax.id)] ?? emptyTaxLine();
                const rate = Number(tax.default_rate ?? 0);
                return (
                  <TableRow key={tax.id} hover>
                    <TableCell>
                      {tax.description} ({rate}%)
                    </TableCell>
                    <TableCell>
                      <FormattedNumberField
                        size="small"
                        inputProps={{ step: "0.01", min: 0 }}
                        placeholder="0.00"
                        value={row.inputTax}
                        onChange={(e) =>
                          handleTaxFieldChange(tax.id, "inputTax", e.target.value, rate)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <FormattedNumberField
                        size="small"
                        inputProps={{ step: "0.01", min: 0 }}
                        placeholder="0.00"
                        value={row.outputTax}
                        onChange={(e) =>
                          handleTaxFieldChange(tax.id, "outputTax", e.target.value, rate)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <FormattedNumberField
                        size="small"
                        inputProps={{ step: "0.01", min: 0 }}
                        placeholder="0.00"
                        value={row.netAmount}
                        onChange={(e) =>
                          handleTaxFieldChange(tax.id, "netAmount", e.target.value, rate)
                        }
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
              {(taxTypes as unknown[]).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Typography color="text.secondary">
                      No tax types found. Add tax types under Setup → Company Setup → Tax Types.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </TabPanel>
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
          Journal entry saved successfully!
        </Alert>
      )}
      {saveError && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {saveError}
        </Alert>
      )}
      {/*  Submit Button */}
      <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2, p: 1 }}>
        <Button
          variant="contained"
          color="primary"
          disabled={!!dateError || isSaving || !canEdit}
          onClick={handleSaveJournalEntry}
        >
          {isSaving
            ? "Saving..."
            : isEditMode
              ? "Update Journal Entry"
              : "Process Journal Entry"}
        </Button>
      </Box>
    </FormPageLayout>
  );
}
