import React from "react";
import { Stack } from "@mui/material";
import CostCenterSelect from "./CostCenterSelect";
import { useCompanySetupSettings } from "../hooks/useCompanySetupSettings";

interface ReportCostCenterSelectProps {
  value: string;
  onChange: (value: string) => void;
  costCenter2Value?: string;
  onCostCenter2Change?: (value: string) => void;
  disabled?: boolean;
}

/** CostCenter filter(s) for report PDF forms — FA dim1 / dim2 when enabled. */
export default function ReportCostCenterSelect({
  value,
  onChange,
  costCenter2Value = "",
  onCostCenter2Change,
  disabled,
}: ReportCostCenterSelectProps) {
  const { useCostCenters, costCenterLevel } = useCompanySetupSettings();

  if (!useCostCenters) {
    return null;
  }

  return (
    <Stack spacing={2}>
      <CostCenterSelect
        value={value}
        onChange={onChange}
        allowEmpty
        emptyLabel="No costCenter filter"
        label="Cost Center"
        costCenterType={1}
        disabled={disabled}
      />
      {costCenterLevel >= 2 && onCostCenter2Change && (
        <CostCenterSelect
          value={costCenter2Value}
          onChange={onCostCenter2Change}
          allowEmpty
          emptyLabel="No costCenter 2 filter"
          label="CostCenter 2"
          costCenterType={2}
          disabled={disabled}
        />
      )}
    </Stack>
  );
}
