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
  Paper,
  TextField,
  Grid,
  useMediaQuery,
  Theme,
  TableFooter,
  TablePagination,
  Checkbox,
  FormControlLabel,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useNavigate, useLocation } from "react-router-dom";
import { useFiscalYearFormDefaults } from "../../../../hooks/useFiscalYearFormDefaults";
import { useQuery } from "@tanstack/react-query";
import Breadcrumb from "../../../../components/BreadCrumb";
import PageTitle from "../../../../components/PageTitle";
import theme from "../../../../theme";
import api from "../../../../api/apiClient";
import CostCenterSelect from "../../../../components/CostCenterSelect";
import GlHomeCurrencyNotice from "../../../../components/GlHomeCurrencyNotice";
import {
  GlReportMoneyProvider,
  useGlReportMoney,
} from "../../../../hooks/useGlReportMoney";
import {
  buildAccountTypeLabelMap,
  buildAccountTypeToClassMap,
  resolveRowClass,
  resolveRowGroupName,
  rowHasActivity,
} from "../../../../utils/trialBalanceGrouping";
import GlAccountTransactionsDialog from "./GlAccountTransactionsDialog";

interface Row {
  id: number;
  account: string;
  accountName: string;
  accountType: number;
  classId: string;
  className: string;
  typeName: string;
  broughtForwardDebit: string;
  broughtForwardCredit: string;
  thisPeriodDebit: string;
  thisPeriodCredit: string;
  balanceCredit: string;
  balanceDebit: string;
}

function TrialBalancePage() {
  const { formatAmount, amountColumnLabel } = useGlReportMoney();
  const navigate = useNavigate();
  const location = useLocation();
  const navState = (location.state as {
    fromDate?: string;
    toDate?: string;
    autoSearch?: boolean;
    journalPosted?: boolean;
    reference?: string;
    journalDate?: string;
  }) || {};
  const { fiscalYearFrom, fiscalYearTo } = useFiscalYearFormDefaults();
  const isMobile = useMediaQuery((theme: Theme) => theme.breakpoints.down("md"));

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(-1);
  const [drillDownAccount, setDrillDownAccount] = useState<{ code: string; name: string } | null>(null);

  // Fetch GL accounts, chart classes, and chart types
  const { data: chartMasters = [] } = useQuery({
    queryKey: ["chartMasters"],
    queryFn: () => import("../../../../api/GLAccounts/ChartMasterApi").then(m => m.getChartMasters()),
  });

  const { data: chartClasses = [] } = useQuery({
    queryKey: ["chartClasses"],
    queryFn: () => import("../../../../api/GLAccounts/ChartClassApi").then(m => m.getChartClasses()),
  });

  const { data: chartTypes = [] } = useQuery({
    queryKey: ["chartTypes"],
    queryFn: () => import("../../../../api/GLAccounts/ChartTypeApi").then(m => m.getChartTypes()),
  });

  const accountTypeMap = useMemo(
    () => buildAccountTypeLabelMap(chartTypes as any[]),
    [chartTypes]
  );

  const accountTypeToClassMap = useMemo(
    () => buildAccountTypeToClassMap(chartTypes as any[], chartClasses as any[]),
    [chartTypes, chartClasses]
  );

  // Search form state
  const [fromDate, setFromDate] = useState(navState.fromDate || "");
  const [toDate, setToDate] = useState(navState.toDate || "");
  const [costCenter, setCostCenter] = useState("");
  const [noZeroValues, setNoZeroValues] = useState(true);
  const [onlyBalance, setOnlyBalance] = useState(false);
  const [groupTotalsOnly, setGroupTotalsOnly] = useState(false);
  useEffect(() => {
    if (navState.fromDate) {
      setFromDate(navState.fromDate);
    } else if (fiscalYearFrom) {
      setFromDate((prev) => prev || fiscalYearFrom);
    }
    if (navState.toDate) {
      setToDate(navState.toDate);
    } else if (fiscalYearTo) {
      setToDate((prev) => prev || fiscalYearTo);
    }
  }, [navState.fromDate, navState.toDate, fiscalYearFrom, fiscalYearTo]);

  // Fetch trial balance data
  const { data: tbData, isLoading, refetch } = useQuery({
    queryKey: ["trialBalance", fromDate, toDate, costCenter, noZeroValues, onlyBalance, groupTotalsOnly],
    queryFn: async () => {
      try {
        const response = await api.post("/trial-balance/search", {
          fromDate,
          toDate,
          costCenter,
          noZeroValues,
          onlyBalance,
          groupTotalsOnly,
          syncGl: true,
        });
        const payload = response.data;
        if (Array.isArray(payload)) {
          return { rows: payload, summary: null };
        }
        return { rows: payload?.rows || [], summary: payload?.summary ?? null };
      } catch (error) {
        console.error("Trial balance search failed:", error);
        return { rows: [], summary: null };
      }
    },
    enabled: false,
    staleTime: 0,
  });

  const apiRows = tbData?.rows ?? [];
  const summary = tbData?.summary as Record<string, any> | null;

  useEffect(() => {
    if (!navState.autoSearch) return;
    if (!fromDate || !toDate) return;
    refetch();
  }, [navState.autoSearch, fromDate, toDate, refetch]);

  // Transform API data to Row format
  const rows: Row[] = useMemo(() => {
    return (apiRows as any[]).map((item: any, index: number) => ({
      id: item.id || index + 1,
      account: item.account || "",
      accountName: item.accountName || "",
      accountType: Number(item.accountType) || 0,
      classId: String(item.classId ?? ""),
      className: String(item.className ?? ""),
      typeName: String(item.typeName ?? ""),
      broughtForwardDebit: item.broughtForwardDebit?.toString() || "0.00",
      broughtForwardCredit: item.broughtForwardCredit?.toString() || "0.00",
      thisPeriodDebit: item.thisPeriodDebit?.toString() || "0.00",
      thisPeriodCredit: item.thisPeriodCredit?.toString() || "0.00",
      balanceCredit: item.balanceCredit?.toString() || "0.00",
      balanceDebit: item.balanceDebit?.toString() || "0.00",
    }));
  }, [apiRows]);

  const paginatedRows = React.useMemo(() => {
    if (rowsPerPage === -1) return rows;
    return rows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  }, [rows, page, rowsPerPage]);

  // Group rows by class and account type for display
  const groupedRows = useMemo(() => {
    const classGroups: Record<string, Record<string, Row[]>> = {};

    (chartClasses as any[]).forEach((chartClass: any) => {
      const className = chartClass.class_name;
      if (!classGroups[className]) {
        classGroups[className] = {};
      }
    });

    rows.forEach((row) => {
      if (noZeroValues && !rowHasActivity(row)) return;

      const classInfo = resolveRowClass(row, accountTypeToClassMap, chartClasses as any[]);
      const className = classInfo.className;
      if (!classGroups[className]) {
        classGroups[className] = {};
      }

      const typeText = resolveRowGroupName(row, accountTypeMap);
      if (!classGroups[className][typeText]) {
        classGroups[className][typeText] = [];
      }
      classGroups[className][typeText].push(row);
    });

    return classGroups;
  }, [rows, accountTypeMap, accountTypeToClassMap, chartClasses, noZeroValues]);

  const handleChangePage = (_event: unknown, newPage: number) => setPage(newPage);
  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  return (
    <Stack spacing={2}>
      <Box sx={{ padding: theme.spacing(2), boxShadow: 2, borderRadius: 1, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
        <Box>
          <PageTitle title="Trial Balance" />
          <Breadcrumb breadcrumbs={[{ title: "Home", href: "/dashboard" }, { title: "Trial Balance" }]} />
        </Box>

        <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)}>Back</Button>
      </Box>

      <GlHomeCurrencyNotice />

      <Paper sx={{ p: 2, borderRadius: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              size="small"
              label="From"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              size="small"
              label="To"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          <Grid item xs={12} sm={4}>
            <CostCenterSelect
              label="Cost Center"
              value={costCenter}
              onChange={setCostCenter}
              emptyLabel="All costCenters"
            />
          </Grid>

          <Grid item xs={12} sm={3}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={noZeroValues}
                  onChange={(e) => setNoZeroValues(e.target.checked)}
                />
              }
              label="No zero values"
            />
          </Grid>

          <Grid item xs={12} sm={3}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={onlyBalance}
                  onChange={(e) => setOnlyBalance(e.target.checked)}
                />
              }
              label="Only balance"
            />
          </Grid>

          <Grid item xs={12} sm={3}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={groupTotalsOnly}
                  onChange={(e) => setGroupTotalsOnly(e.target.checked)}
                />
              }
              label="Group totals only"
            />
          </Grid>

          <Grid item xs={12} sm={3}>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                onClick={() => refetch()}
                disabled={isLoading}
                sx={{ height: '40px', width: '200px' }}
              >
                {isLoading ? "Loading..." : "Show"}
              </Button>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      <TableContainer component={Paper} sx={{ p: 1 }}>
        <Table>
          <TableHead sx={{ backgroundColor: "var(--pallet-lighter-blue)" }}>
            <TableRow>
              <TableCell rowSpan={2} align="center" sx={{ fontWeight: "bold", borderRight: "2px solid #e0e0e0" }}>Account</TableCell>
              <TableCell rowSpan={2} align="center" sx={{ fontWeight: "bold", borderRight: "2px solid #e0e0e0" }}>Account Name</TableCell>
              <TableCell colSpan={2} align="center" sx={{ fontWeight: "bold", borderRight: "2px solid #e0e0e0" }}>Brought Forward</TableCell>
              <TableCell colSpan={2} align="center" sx={{ fontWeight: "bold", borderRight: "2px solid #e0e0e0" }}>This Period</TableCell>
              <TableCell colSpan={2} align="center" sx={{ fontWeight: "bold" }}>Balance</TableCell>
            </TableRow>
            <TableRow>
              <TableCell align="center" sx={{ fontWeight: "bold", borderRight: "1px solid #e0e0e0" }}>{amountColumnLabel("Debit")}</TableCell>
              <TableCell align="center" sx={{ fontWeight: "bold", borderRight: "2px solid #e0e0e0" }}>{amountColumnLabel("Credit")}</TableCell>
              <TableCell align="center" sx={{ fontWeight: "bold", borderRight: "1px solid #e0e0e0" }}>{amountColumnLabel("Debit")}</TableCell>
              <TableCell align="center" sx={{ fontWeight: "bold", borderRight: "2px solid #e0e0e0" }}>{amountColumnLabel("Credit")}</TableCell>
              <TableCell align="center" sx={{ fontWeight: "bold", borderRight: "1px solid #e0e0e0" }}>{amountColumnLabel("Debit")}</TableCell>
              <TableCell align="center" sx={{ fontWeight: "bold" }}>{amountColumnLabel("Credit")}</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {Object.entries(groupedRows).map(([className, typeGroups]) => {
              const allClassRows = Object.values(typeGroups).flat();
              if (allClassRows.length === 0) return null;

              const classTotals = {
                broughtForwardDebit: allClassRows.reduce((sum, r) => sum + (parseFloat(r.broughtForwardDebit) || 0), 0),
                broughtForwardCredit: allClassRows.reduce((sum, r) => sum + (parseFloat(r.broughtForwardCredit) || 0), 0),
                thisPeriodDebit: allClassRows.reduce((sum, r) => sum + (parseFloat(r.thisPeriodDebit) || 0), 0),
                thisPeriodCredit: allClassRows.reduce((sum, r) => sum + (parseFloat(r.thisPeriodCredit) || 0), 0),
                balanceCredit: allClassRows.reduce((sum, r) => sum + (parseFloat(r.balanceCredit) || 0), 0),
                balanceDebit: allClassRows.reduce((sum, r) => sum + (parseFloat(r.balanceDebit) || 0), 0),
              };

              return (
                <React.Fragment key={className}>
                  <TableRow sx={{ backgroundColor: "#1565c0", borderTop: "3px solid #0d47a1" }}>
                    <TableCell colSpan={8} sx={{ fontWeight: "bold", fontSize: "1.2em", color: "white", textAlign: "center" }}>
                      {(() => {
                        const chartClass = (chartClasses as any[]).find(c => c.class_name === className);
                        const classId = chartClass?.cid || chartClass?.id || '?';
                        return `Class ${classId} - ${className}`;
                      })()}
                    </TableCell>
                  </TableRow>

                  {Object.entries(typeGroups).map(([typeName, groupRows]) => {
                    const groupTotals = {
                      broughtForwardDebit: groupRows.reduce((sum, r) => sum + (parseFloat(r.broughtForwardDebit) || 0), 0),
                      broughtForwardCredit: groupRows.reduce((sum, r) => sum + (parseFloat(r.broughtForwardCredit) || 0), 0),
                      thisPeriodDebit: groupRows.reduce((sum, r) => sum + (parseFloat(r.thisPeriodDebit) || 0), 0),
                      thisPeriodCredit: groupRows.reduce((sum, r) => sum + (parseFloat(r.thisPeriodCredit) || 0), 0),
                      balanceCredit: groupRows.reduce((sum, r) => sum + (parseFloat(r.balanceCredit) || 0), 0),
                      balanceDebit: groupRows.reduce((sum, r) => sum + (parseFloat(r.balanceDebit) || 0), 0),
                    };

                    return (
                      <React.Fragment key={typeName}>
                        <TableRow sx={{ backgroundColor: "#e3f2fd", borderTop: "2px solid #1976d2" }}>
                          <TableCell colSpan={8} sx={{ fontWeight: "bold", fontSize: "1.1em", color: "#1976d2" }}>
                            {typeName}
                          </TableCell>
                        </TableRow>

                        {groupRows.map((r) => (
                          <TableRow key={r.id} hover>
                            <TableCell
                              sx={{ borderRight: "2px solid #e0e0e0", color: "primary.main", cursor: "pointer", textDecoration: "underline" }}
                              onClick={() => setDrillDownAccount({ code: r.account, name: r.accountName })}
                            >
                              {r.account}
                            </TableCell>
                            <TableCell
                              sx={{ borderRight: "2px solid #e0e0e0", color: "primary.main", cursor: "pointer", textDecoration: "underline" }}
                              onClick={() => setDrillDownAccount({ code: r.account, name: r.accountName })}
                            >
                              {r.accountName}
                            </TableCell>
                            <TableCell align="right" sx={{ borderRight: "1px solid #e0e0e0" }}>{formatAmount(r.broughtForwardDebit)}</TableCell>
                            <TableCell align="right" sx={{ borderRight: "2px solid #e0e0e0" }}>{formatAmount(r.broughtForwardCredit)}</TableCell>
                            <TableCell align="right" sx={{ borderRight: "1px solid #e0e0e0" }}>{formatAmount(r.thisPeriodDebit)}</TableCell>
                            <TableCell align="right" sx={{ borderRight: "2px solid #e0e0e0" }}>{formatAmount(r.thisPeriodCredit)}</TableCell>
                            <TableCell align="right" sx={{ borderRight: "1px solid #e0e0e0" }}>{formatAmount(r.balanceDebit)}</TableCell>
                            <TableCell align="right">{formatAmount(r.balanceCredit)}</TableCell>
                          </TableRow>
                        ))}

                        <TableRow sx={{ backgroundColor: "action.hover", borderTop: "1px solid #e0e0e0" }}>
                          <TableCell colSpan={2} sx={{ fontWeight: "bold", borderRight: "2px solid #e0e0e0", paddingLeft: 4 }}>
                            Subtotal - {typeName}:
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: "bold", borderRight: "1px solid #e0e0e0" }}>
                            {formatAmount(groupTotals.broughtForwardDebit)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: "bold", borderRight: "2px solid #e0e0e0" }}>
                            {formatAmount(groupTotals.broughtForwardCredit)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: "bold", borderRight: "1px solid #e0e0e0" }}>
                            {formatAmount(groupTotals.thisPeriodDebit)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: "bold", borderRight: "2px solid #e0e0e0" }}>
                            {formatAmount(groupTotals.thisPeriodCredit)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: "bold", borderRight: "1px solid #e0e0e0" }}>
                            {formatAmount(groupTotals.balanceDebit)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: "bold" }}>
                            {formatAmount(groupTotals.balanceCredit)}
                          </TableCell>
                        </TableRow>
                      </React.Fragment>
                    );
                  })}

                  <TableRow sx={{ backgroundColor: "#e8eaf6", borderTop: "2px solid #3f51b5" }}>
                    <TableCell colSpan={2} sx={{ fontWeight: "bold", borderRight: "2px solid #e0e0e0", paddingLeft: 2, fontSize: "1.1em", color: "#3f51b5" }}>
                      {(() => {
                        const chartClass = (chartClasses as any[]).find(c => c.class_name === className);
                        const classId = chartClass?.cid || chartClass?.id || '?';
                        return `Class ${classId} Total - ${className}`;
                      })()}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: "bold", borderRight: "1px solid #e0e0e0", fontSize: "1.1em", color: "#3f51b5" }}>
                      {formatAmount(classTotals.broughtForwardDebit)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: "bold", borderRight: "2px solid #e0e0e0", fontSize: "1.1em", color: "#3f51b5" }}>
                      {formatAmount(classTotals.broughtForwardCredit)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: "bold", borderRight: "1px solid #e0e0e0", fontSize: "1.1em", color: "#3f51b5" }}>
                      {formatAmount(classTotals.thisPeriodDebit)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: "bold", borderRight: "2px solid #e0e0e0", fontSize: "1.1em", color: "#3f51b5" }}>
                      {formatAmount(classTotals.thisPeriodCredit)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: "bold", borderRight: "1px solid #e0e0e0", fontSize: "1.1em", color: "#3f51b5" }}>
                      {formatAmount(classTotals.balanceDebit)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: "bold", fontSize: "1.1em", color: "#3f51b5" }}>
                      {formatAmount(classTotals.balanceCredit)}
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              );
            })}

            <TableRow sx={{ backgroundColor: "#e8f5e8", borderTop: "3px solid #4caf50" }}>
              <TableCell colSpan={2} sx={{ fontWeight: "bold", borderRight: "2px solid #e0e0e0", fontSize: "1.1em", color: "#2e7d32" }}>
                Grand Total{toDate ? ` — ${toDate}` : ""}:
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: "bold", borderRight: "1px solid #e0e0e0", fontSize: "1.1em", color: "#2e7d32" }}>
                {formatAmount(summary?.trial_balance?.brought_forward_debit ?? rows.reduce((s, r) => s + (parseFloat(r.broughtForwardDebit) || 0), 0))}
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: "bold", borderRight: "2px solid #e0e0e0", fontSize: "1.1em", color: "#2e7d32" }}>
                {formatAmount(summary?.trial_balance?.brought_forward_credit ?? rows.reduce((s, r) => s + (parseFloat(r.broughtForwardCredit) || 0), 0))}
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: "bold", borderRight: "1px solid #e0e0e0", fontSize: "1.1em", color: "#2e7d32" }}>
                {formatAmount(summary?.trial_balance?.period_debit ?? rows.reduce((s, r) => s + (parseFloat(r.thisPeriodDebit) || 0), 0))}
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: "bold", borderRight: "2px solid #e0e0e0", fontSize: "1.1em", color: "#2e7d32" }}>
                {formatAmount(summary?.trial_balance?.period_credit ?? rows.reduce((s, r) => s + (parseFloat(r.thisPeriodCredit) || 0), 0))}
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: "bold", borderRight: "1px solid #e0e0e0", fontSize: "1.1em", color: "#2e7d32" }}>
                {formatAmount(summary?.trial_balance?.balance_debit ?? rows.reduce((s, r) => s + (parseFloat(r.balanceDebit) || 0), 0))}
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: "bold", fontSize: "1.1em", color: "#2e7d32" }}>
                {formatAmount(summary?.trial_balance?.balance_credit ?? rows.reduce((s, r) => s + (parseFloat(r.balanceCredit) || 0), 0))}
              </TableCell>
            </TableRow>
          </TableBody>

          <TableFooter>
            <TableRow>
              <TablePagination
                rowsPerPageOptions={[5, 10, 25, { label: "All", value: -1 }]}
                colSpan={8}
                count={rows.length}
                rowsPerPage={rowsPerPage}
                page={page}
                onPageChange={handleChangePage}
                onRowsPerPageChange={handleChangeRowsPerPage}
                showFirstButton
                showLastButton
              />
            </TableRow>
          </TableFooter>
        </Table>
      </TableContainer>

      <GlAccountTransactionsDialog
        open={!!drillDownAccount}
        onClose={() => setDrillDownAccount(null)}
        accountCode={drillDownAccount?.code ?? null}
        accountName={drillDownAccount?.name}
      />
    </Stack>
  );
}

export default function TrialBalance() {
  return (
    <GlReportMoneyProvider>
      <TrialBalancePage />
    </GlReportMoneyProvider>
  );
}
