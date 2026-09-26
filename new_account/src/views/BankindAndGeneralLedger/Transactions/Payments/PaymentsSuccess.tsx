import { FormPageLayout } from "../../../../components/Layout/FormPageLayout";
import React from "react";
import { Box, Button, Stack, Typography, Paper } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import PrintIcon from "@mui/icons-material/Print";
import { useLocation, useNavigate } from "react-router-dom";
import PageTitle from "../../../../components/PageTitle";
import Breadcrumb from "../../../../components/BreadCrumb";

export default function PaymentsSuccess() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const glState = {
    ...(state as Record<string, unknown>),
    transactionKind: "payment",
  };

  const breadcrumbItems = [
    { title: "Home", href: "/dashboard" },
    { title: "Payments" },
  ];

  return (
    <FormPageLayout>
      <Box
        sx={{
          padding: 2,
          boxShadow: 2,
          borderRadius: 1,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <Box>
          <PageTitle title="Payment" />
          <Breadcrumb breadcrumbs={breadcrumbItems} />
        </Box>

        <Button
          variant="outlined"
          startIcon={<CloseIcon />}
          onClick={() => navigate("/bankingandgeneralledger/transactions")}
        >
          Close
        </Button>
      </Box>
      <Paper sx={{ p: 2 }}>
        <Typography sx={{ mb: 2 }}>Your payment has been processed successfully.</Typography>

        <Stack spacing={3} direction="column" alignItems="center">
          <Button
            variant="outlined"
            sx={{ width: "500px" }}
            onClick={() => {
              navigate("/bankingandgeneralledger/transactions/gl-postings", { state: glState });
            }}
          >
            1. View the GL Postings for this payment
          </Button>

          <Button
            variant="contained"
            startIcon={<PrintIcon />}
            sx={{ width: "500px" }}
            onClick={() => {
              navigate("/bankingandgeneralledger/transactions/gl-postings", {
                state: { ...glState, autoPrint: true },
              });
            }}
          >
            2. Print voucher
          </Button>

          <Button
            variant="outlined"
            sx={{ width: "500px" }}
            onClick={() => navigate("/bankingandgeneralledger/transactions/payments")}
          >
            3. Enter another payment
          </Button>

          <Button
            variant="outlined"
            sx={{ width: "500px" }}
            onClick={() => navigate("/bankingandgeneralledger/transactions/deposits")}
          >
            4. Enter a deposit
          </Button>
        </Stack>
      </Paper>
    </FormPageLayout>
  );
}
