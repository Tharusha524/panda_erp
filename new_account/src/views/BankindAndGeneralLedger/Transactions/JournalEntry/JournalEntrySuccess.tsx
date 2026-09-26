import { FormPageLayout } from "../../../../components/Layout/FormPageLayout";
import React from "react";
import { Box, Button, Stack, Typography, Paper } from "@mui/material";
import CloseIcon from '@mui/icons-material/Close';
import { useLocation, useNavigate } from "react-router-dom";
import PageTitle from "../../../../components/PageTitle";
import Breadcrumb from "../../../../components/BreadCrumb";

export default function JournalEntrySuccess() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { reference, date, documentDate, eventDate, currency, lines } = state || {};
  const journalDate = date ? String(date).split("T")[0] : "";

  const breadcrumbItems = [
    { title: "Home", href: "/dashboard" },
    { title: "Journal Entry" },
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
          <PageTitle title="Journal Entry" />
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
        <Typography sx={{ mb: 2 }}>
          Your journal entry has been processed successfully.
        </Typography>

        <Stack spacing={3} direction="column" alignItems="center">
          <Button
            variant="outlined"
            sx={{ width: '500px' }}
            onClick={() =>
              navigate("/bankingandgeneralledger/transactions/gl-postings", { state })
            }
          >
            1. View GL postings for this journal entry
          </Button>

          <Button
            variant="contained"
            sx={{ width: '500px' }}
            onClick={() =>
              navigate("/bankingandgeneralledger/transactions/gl-postings", {
                state: { ...state, autoPrint: true },
              })
            }
          >
            2. Print voucher
          </Button>

          <Button
            variant="outlined"
            sx={{ width: '500px' }}
            onClick={() => navigate("/bankingandgeneralledger/transactions/journal-entry/view", { state })}
          >
            3. View this journal entry
          </Button>

          <Button
            variant="outlined"
            sx={{ width: '500px' }}
            onClick={() => navigate("/bankingandgeneralledger/transactions/journal-entry")}
          >
            4. Enter new journal entry
          </Button>

          <Button
            variant="contained"
            sx={{ width: '500px' }}
            onClick={() =>
              navigate("/bankingandgeneralledger/inquiriesandreports/trial-balance", {
                state: {
                  fromDate: journalDate,
                  toDate: journalDate,
                  autoSearch: true,
                },
              })
            }
            disabled={!journalDate}
          >
            6. View Trial Balance (updated for this date)
          </Button>
        </Stack>
      </Paper>
    </FormPageLayout>
  );
}
