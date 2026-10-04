import api from "../apiClient";

export async function getGlAccountTransactions(accountCode: string) {
  const response = await api.get(
    `/gl-accounts/${encodeURIComponent(accountCode)}/transactions`
  );
  return response.data;
}
