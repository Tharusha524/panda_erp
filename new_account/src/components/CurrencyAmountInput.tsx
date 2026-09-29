import React, { useEffect, useState } from "react";
import { InputAdornment, TextField, TextFieldProps } from "@mui/material";
import { formatTransactionAmount } from "../utils/transactionMoney";

function parseAmountInput(raw: string): number {
  const cleaned = raw.replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-" || cleaned === ".") {
    return 0;
  }
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** Add thousand separators to the integer part while typing, without
 * touching decimals — so cents the user is still typing aren't forced. */
function formatWithCommas(raw: string): string {
  if (raw === "" || raw === "-") return raw;
  const [intPart, decPart] = raw.split(".");
  const negative = intPart.startsWith("-");
  const digits = intPart.replace("-", "");
  const withCommas = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (negative ? "-" : "") + withCommas + (decPart !== undefined ? "." + decPart : "");
}

export interface CurrencyAmountInputProps
  extends Omit<TextFieldProps, "value" | "onChange" | "type"> {
  value: number;
  currencyCode?: string | null;
  onChange: (value: number) => void;
  decimals?: number;
}

/** Editable amount with currency prefix; formats with commas on blur. */
export default function CurrencyAmountInput({
  value,
  currencyCode,
  onChange,
  decimals = 2,
  size = "small",
  disabled,
  ...rest
}: CurrencyAmountInputProps) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!focused) {
      setDraft("");
    }
  }, [value, focused]);

  const code = String(currencyCode ?? "")
    .trim()
    .toUpperCase();

  const displayValue = focused
    ? draft
    : formatTransactionAmount(value, decimals);

  return (
    <TextField
      {...rest}
      size={size}
      disabled={disabled}
      value={displayValue}
      onFocus={() => {
        setFocused(true);
        setDraft(Number.isFinite(value) ? formatWithCommas(String(value)) : "");
      }}
      onBlur={() => {
        setFocused(false);
        onChange(parseAmountInput(draft));
      }}
      onChange={(e) => {
        if (!focused) return;
        const raw = e.target.value.replace(/,/g, "");
        // Only allow valid number input (digits, one decimal point, leading minus)
        if (!/^-?\d*\.?\d*$/.test(raw)) return;
        setDraft(formatWithCommas(raw));
        onChange(parseAmountInput(raw));
      }}
      InputProps={{
        ...rest.InputProps,
        startAdornment: code ? (
          <InputAdornment position="start">{code}</InputAdornment>
        ) : (
          rest.InputProps?.startAdornment
        ),
      }}
      inputProps={{
        inputMode: "decimal",
        ...rest.inputProps,
      }}
    />
  );
}
