import api from "../apiClient";

export interface BankingLine {
  account_code?: string;
  accountCode?: string;
  selectedAccountCode?: string;
  amount?: number;
  debit?: number;
  credit?: number;
  memo?: string;
  costCenter?: string;
}

export interface JournalTaxLine {
  tax_type_id: number;
  rate?: number;
  net_amount?: number;
  input_tax?: number;
  output_tax?: number;
}

export interface BankingJournalPayload {
  tran_date: string;
  reference?: string;
  currency?: string;
  source_ref?: string;
  event_date?: string;
  doc_date?: string;
  memo?: string;
  include_in_tax_register?: boolean;
  vat_date?: string;
  tax_lines?: JournalTaxLine[];
  lines: BankingLine[];
}

export const postBankingPayment = async (payload: {
  bank_account_id: number;
  trans_date: string;
  reference?: string;
  memo?: string;
  cost_center_id?: number;
  lines: BankingLine[];
}) => {
  const { data } = await api.post("/banking/payment", payload);
  return data;
};

export const getBankingPayment = async (transNo: number) => {
  const { data } = await api.get(`/banking/payment/${transNo}`);
  return data;
};

export const putBankingPayment = async (
  transNo: number,
  payload: {
    bank_account_id: number;
    trans_date: string;
    reference?: string;
    memo?: string;
    cost_center_id?: number;
    lines: BankingLine[];
  }
) => {
  const { data } = await api.put(`/banking/payment/${transNo}`, payload);
  return data;
};

export const postBankingDeposit = async (payload: {
  bank_account_id: number;
  trans_date: string;
  reference?: string;
  memo?: string;
  lines: BankingLine[];
}) => {
  const { data } = await api.post("/banking/deposit", payload);
  return data;
};

export interface BankingTransferPayload {
  from_account_id: number;
  to_account_id: number;
  amount: number;
  trans_date: string;
  reference?: string;
  bank_charge?: number;
  memo?: string;
  cost_center_id?: number;
}

export const postBankingTransfer = async (payload: BankingTransferPayload) => {
  const { data } = await api.post("/banking/transfer", payload);
  return data;
};

export const getBankingTransfer = async (transNo: number) => {
  const { data } = await api.get(`/banking/transfer/${transNo}`);
  return data;
};

export const putBankingTransfer = async (transNo: number, payload: BankingTransferPayload) => {
  const { data } = await api.put(`/banking/transfer/${transNo}`, payload);
  return data;
};

export const postBankingJournal = async (payload: BankingJournalPayload) => {
  const { data } = await api.post("/banking/journal", payload);
  return data;
};

export const getBankingJournal = async (transNo: number) => {
  const { data } = await api.get(`/banking/journal/${transNo}`);
  return data;
};

export const putBankingJournal = async (transNo: number, payload: BankingJournalPayload) => {
  const { data } = await api.put(`/banking/journal/${transNo}`, payload);
  return data;
};

export const getUnreconciledBankTrans = async (bankAccountId: number) => {
  const { data } = await api.get(`/banking/reconcile/${bankAccountId}`);
  return data;
};

export const postBankReconcile = async (payload: {
  bank_account_id: number;
  reconcile_date: string;
  ending_balance: number;
  transaction_ids: number[];
}) => {
  const { data } = await api.post("/banking/reconcile", payload);
  return data;
};

export interface AccrualPreviewRow {
  date: string;
  amount: number;
  acc_act: string;
  res_act: string;
}

export const previewAccruals = async (payload: Record<string, unknown>) => {
  const { data } = await api.post("/banking/accruals/preview", payload);
  return data as { rows: AccrualPreviewRow[]; periods: number; total_amount: number };
};

export const processAccruals = async (payload: Record<string, unknown>) => {
  const { data } = await api.post("/banking/accruals/process", payload);
  return data as { message?: string; periods: number; journals: unknown[] };
};

export function mapFormLines(
  rows: Array<{
    selectedAccountCode?: string;
    accountCode?: string;
    amount?: string;
    debit?: string;
    credit?: string;
    memo?: string;
    costCenter?: string;
  }>
): BankingLine[] {
  return rows
    .filter((r) => r.selectedAccountCode || r.accountCode)
    .map((r) => ({
      account_code: String(r.selectedAccountCode || r.accountCode || ""),
      amount: parseFloat(String(r.amount || "0")) || undefined,
      debit: parseFloat(String(r.debit || "0")) || undefined,
      credit: parseFloat(String(r.credit || "0")) || undefined,
      memo: r.memo,
      costCenter: r.costCenter,
      cost_center_id: r.costCenter, // Backend expects cost_center_id
    }))
    .filter((l) => l.account_code);
}

