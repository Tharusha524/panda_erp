<?php

namespace App\Services\Reports;

use Illuminate\Http\Request;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

/**
 * Excel export for reports built from ReportPdfBuilder's generic
 * headers/rows/totals structure. Reports that use a custom nested view
 * (Balance Sheet, Profit & Loss, grouped Journal Entries) aren't backed by
 * that structure and aren't supported here yet.
 */
class ReportExcelBuilder
{
    public function __construct(private ReportPdfBuilder $pdfBuilder)
    {
    }

    /**
     * @throws \InvalidArgumentException when the report has no generic
     *                                    headers/rows to export
     */
    public function build(string $reportKey, Request $request): string
    {
        $payload = $this->pdfBuilder->build($reportKey, $request);

        if (($payload['view'] ?? null) === 'reports.balance_sheet') {
            return $this->buildBalanceSheet($payload);
        }

        if (($payload['view'] ?? null) === 'reports.profit_and_loss_statement') {
            return $this->buildProfitAndLoss($payload);
        }

        if (($payload['view'] ?? null) === 'reports.journal_entries_grouped') {
            return $this->buildJournalEntries($payload);
        }

        if (!isset($payload['headers'], $payload['rows'])) {
            throw new \InvalidArgumentException(
                'Excel export is not available yet for this report — please use PDF.'
            );
        }

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle(substr(preg_replace('/[\\\\\/\?\*\[\]:]/', ' ', (string) $payload['title']), 0, 31) ?: 'Report');

        $row = 1;

        $sheet->setCellValue("A{$row}", (string) $payload['title']);
        $sheet->getStyle("A{$row}")->getFont()->setBold(true)->setSize(14);
        $row++;

        if (!empty($payload['subtitle'])) {
            $sheet->setCellValue("A{$row}", (string) $payload['subtitle']);
            $sheet->getStyle("A{$row}")->getFont()->setItalic(true);
            $row++;
        }

        $row++; // blank spacer row

        $headers = array_values($payload['headers']);
        $colCount = count($headers);

        foreach ($headers as $i => $header) {
            $col = $this->columnLetter($i);
            $sheet->setCellValue("{$col}{$row}", $header);
        }
        $headerRange = "A{$row}:" . $this->columnLetter($colCount - 1) . $row;
        $sheet->getStyle($headerRange)->getFont()->setBold(true)->getColor()->setRGB('FFFFFF');
        $sheet->getStyle($headerRange)->getFill()
            ->setFillType(Fill::FILL_SOLID)
            ->getStartColor()->setRGB('1565C0');
        $row++;

        foreach ($payload['rows'] as $dataRow) {
            foreach (array_values($dataRow) as $i => $cell) {
                $col = $this->columnLetter($i);
                $sheet->setCellValue("{$col}{$row}", $this->cellValue($cell));
            }
            $row++;
        }

        if (!empty($payload['totals'])) {
            foreach (array_values($payload['totals']) as $i => $cell) {
                $col = $this->columnLetter($i);
                $sheet->setCellValue("{$col}{$row}", $this->cellValue($cell));
            }
            $totalsRange = "A{$row}:" . $this->columnLetter($colCount - 1) . $row;
            $sheet->getStyle($totalsRange)->getFont()->setBold(true);
            $row++;
        }

        foreach (range(0, $colCount - 1) as $i) {
            $sheet->getColumnDimension($this->columnLetter($i))->setAutoSize(true);
        }
        $sheet->getStyle('A1')->getAlignment()->setHorizontal(Alignment::HORIZONTAL_LEFT);

        $writer = new Xlsx($spreadsheet);
        $tmpPath = tempnam(sys_get_temp_dir(), 'report_xlsx_');
        $writer->save($tmpPath);
        $contents = file_get_contents($tmpPath);
        unlink($tmpPath);

        return $contents;
    }

    /**
     * Excel export for the Balance Sheet, which is grouped into class →
     * type → account rows (see balanceSheetReport() in ReportPdfBuilder and
     * resources/views/reports/balance_sheet.blade.php) rather than the
     * generic headers/rows/totals shape the exporter above expects.
     */
    private function buildBalanceSheet(array $payload): string
    {
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Balance Sheet');

        $row = 1;
        $sheet->setCellValue("A{$row}", (string) $payload['title']);
        $sheet->getStyle("A{$row}")->getFont()->setBold(true)->setSize(14);
        $row++;

        if (!empty($payload['subtitle'])) {
            $sheet->setCellValue("A{$row}", (string) $payload['subtitle']);
            $sheet->getStyle("A{$row}")->getFont()->setItalic(true);
            $row++;
        }
        $row++; // blank spacer row

        $headers = ['Account', 'Account Name', 'Open Balance', 'Period', 'Close Balance'];
        foreach ($headers as $i => $header) {
            $sheet->setCellValue("{$this->columnLetter($i)}{$row}", $header);
        }
        $headerRange = "A{$row}:" . $this->columnLetter(count($headers) - 1) . $row;
        $sheet->getStyle($headerRange)->getFont()->setBold(true)->getColor()->setRGB('FFFFFF');
        $sheet->getStyle($headerRange)->getFill()
            ->setFillType(Fill::FILL_SOLID)
            ->getStartColor()->setRGB('1565C0');
        $row++;

        $grouped = $payload['grouped'] ?? [];

        $writeRow = function (array $cells) use ($sheet, &$row, $headers) {
            foreach (array_values($cells) as $i => $value) {
                $sheet->setCellValue("{$this->columnLetter($i)}{$row}", $value);
            }
            $row++;
        };

        foreach ($grouped as $className => $typeGroups) {
            $classOpening = 0.0;
            $classPeriod = 0.0;
            $classClosing = 0.0;

            $writeRow([strtoupper((string) $className)]);
            $sheet->getStyle("A" . ($row - 1))->getFont()->setBold(true);

            foreach ($typeGroups as $typeName => $accounts) {
                if ($typeName === '_meta') {
                    continue;
                }

                $writeRow([strtoupper((string) $typeName)]);

                $grpOpening = 0.0;
                $grpPeriod = 0.0;
                $grpClosing = 0.0;

                foreach ($accounts as $account) {
                    $opening = (float) ($account['opening'] ?? 0);
                    $period = (float) ($account['period'] ?? 0);
                    $closing = (float) ($account['closing'] ?? 0);
                    $grpOpening += $opening;
                    $grpPeriod += $period;
                    $grpClosing += $closing;

                    $writeRow([
                        $account['code'] ?? '',
                        $account['description'] ?? '',
                        $opening,
                        $period,
                        $closing,
                    ]);
                }

                $classOpening += $grpOpening;
                $classPeriod += $grpPeriod;
                $classClosing += $grpClosing;

                $writeRow(['Total ' . strtoupper((string) $typeName), '', $grpOpening, $grpPeriod, $grpClosing]);
                $sheet->getStyle("A" . ($row - 1) . ":E" . ($row - 1))->getFont()->setBold(true);
            }

            $writeRow(['Total ' . strtoupper((string) $className), '', $classOpening, $classPeriod, $classClosing]);
            $sheet->getStyle("A" . ($row - 1) . ":E" . ($row - 1))->getFont()->setBold(true);
            $row++; // blank spacer row between classes
        }

        $closingTotals = $payload['totals']['closing'] ?? [];
        $openingTotals = $payload['totals']['opening'] ?? [];
        $periodTotals = $payload['totals']['period'] ?? [];

        $writeRow([
            'Total LIABILITIES', '',
            (float) ($openingTotals['liabilities_plus_equity'] ?? 0),
            (float) ($periodTotals['liabilities_plus_equity'] ?? 0),
            (float) ($closingTotals['liabilities_plus_equity'] ?? 0),
        ]);
        $sheet->getStyle("A" . ($row - 1) . ":E" . ($row - 1))->getFont()->setBold(true);
        $row++;

        $writeRow(['Calculated Return', '', 0, 0, 0]);

        $writeRow([
            'Total Liabilities and Equities', '',
            (float) ($openingTotals['liabilities_plus_equity'] ?? 0),
            (float) ($periodTotals['liabilities_plus_equity'] ?? 0),
            (float) ($closingTotals['liabilities_plus_equity'] ?? 0),
        ]);
        $sheet->getStyle("A" . ($row - 1) . ":E" . ($row - 1))->getFont()->setBold(true);

        foreach (range(0, count($headers) - 1) as $i) {
            $sheet->getColumnDimension($this->columnLetter($i))->setAutoSize(true);
        }

        $writer = new Xlsx($spreadsheet);
        $tmpPath = tempnam(sys_get_temp_dir(), 'report_xlsx_');
        $writer->save($tmpPath);
        $contents = file_get_contents($tmpPath);
        unlink($tmpPath);

        return $contents;
    }

    /**
     * Excel export for Profit and Loss, whose PDF (see
     * resources/views/reports/profit_and_loss_statement.blade.php) renders
     * $statement['detailedSections'] — a list of sections, each with
     * group/account/subtotal lines — plus a final Calculated Return row.
     */
    private function buildProfitAndLoss(array $payload): string
    {
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Profit and Loss');

        $row = 1;
        $sheet->setCellValue("A{$row}", (string) $payload['title']);
        $sheet->getStyle("A{$row}")->getFont()->setBold(true)->setSize(14);
        $row++;

        if (!empty($payload['subtitle'])) {
            $sheet->setCellValue("A{$row}", (string) $payload['subtitle']);
            $sheet->getStyle("A{$row}")->getFont()->setItalic(true);
            $row++;
        }
        $row++; // blank spacer row

        $compareLabel = (string) ($payload['compareLabel'] ?? 'Accumulated');
        $headers = ['Account', 'Account Name', 'Period', $compareLabel, 'Achieved %'];
        foreach ($headers as $i => $header) {
            $sheet->setCellValue("{$this->columnLetter($i)}{$row}", $header);
        }
        $headerRange = "A{$row}:" . $this->columnLetter(count($headers) - 1) . $row;
        $sheet->getStyle($headerRange)->getFont()->setBold(true)->getColor()->setRGB('FFFFFF');
        $sheet->getStyle($headerRange)->getFill()
            ->setFillType(Fill::FILL_SOLID)
            ->getStartColor()->setRGB('1565C0');
        $row++;

        $writeRow = function (array $cells) use ($sheet, &$row) {
            foreach (array_values($cells) as $i => $value) {
                $sheet->setCellValue("{$this->columnLetter($i)}{$row}", $value);
            }
            $row++;
        };

        $sections = $payload['statement']['detailedSections'] ?? [];

        foreach ($sections as $section) {
            $writeRow([strtoupper((string) ($section['title'] ?? ''))]);
            $sheet->getStyle("A" . ($row - 1))->getFont()->setBold(true);

            foreach ($section['lines'] ?? [] as $line) {
                $kind = $line['kind'] ?? 'account';
                if ($kind === 'group') {
                    $writeRow([(string) ($line['label'] ?? '')]);
                } elseif ($kind === 'account') {
                    $writeRow([
                        $line['account_code'] ?? '',
                        $line['label'] ?? '',
                        (float) ($line['period'] ?? 0),
                        (float) ($line['compareValue'] ?? 0),
                        (string) ($line['achievePercent'] ?? ''),
                    ]);
                } elseif ($kind === 'subtotal') {
                    $writeRow([
                        $line['label'] ?? '', '',
                        (float) ($line['period'] ?? 0),
                        (float) ($line['compareValue'] ?? 0),
                        (string) ($line['achievePercent'] ?? ''),
                    ]);
                    $sheet->getStyle("A" . ($row - 1) . ":E" . ($row - 1))->getFont()->setBold(true);
                }
            }

            foreach ($section['subtotals'] ?? [] as $subtotal) {
                $writeRow([
                    'Total ' . strtoupper((string) ($section['title'] ?? '')), '',
                    (float) ($subtotal['period'] ?? 0),
                    (float) ($subtotal['compareValue'] ?? 0),
                    (string) ($subtotal['achievePercent'] ?? ''),
                ]);
                $sheet->getStyle("A" . ($row - 1) . ":E" . ($row - 1))->getFont()->setBold(true);
            }
        }

        $calculatedReturn = $payload['statement']['detailedSummary']['calculatedReturn'] ?? ['period' => 0, 'compare' => 0, 'achievePercent' => '999.0'];
        $writeRow([
            'Calculated Return', '',
            (float) ($calculatedReturn['period'] ?? 0),
            (float) ($calculatedReturn['compare'] ?? 0),
            (string) ($calculatedReturn['achievePercent'] ?? ''),
        ]);
        $sheet->getStyle("A" . ($row - 1) . ":E" . ($row - 1))->getFont()->setBold(true);

        foreach (range(0, count($headers) - 1) as $i) {
            $sheet->getColumnDimension($this->columnLetter($i))->setAutoSize(true);
        }

        $writer = new Xlsx($spreadsheet);
        $tmpPath = tempnam(sys_get_temp_dir(), 'report_xlsx_');
        $writer->save($tmpPath);
        $contents = file_get_contents($tmpPath);
        unlink($tmpPath);

        return $contents;
    }

    /**
     * Excel export for List of Journal Entries, whose PDF (see
     * resources/views/reports/journal_entries_grouped.blade.php) lists each
     * transaction as a header row, its GL detail lines, then a debit/credit
     * total row.
     */
    private function buildJournalEntries(array $payload): string
    {
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Journal Entries');

        $row = 1;
        $sheet->setCellValue("A{$row}", (string) $payload['title']);
        $sheet->getStyle("A{$row}")->getFont()->setBold(true)->setSize(14);
        $row++;

        if (!empty($payload['subtitle'])) {
            $sheet->setCellValue("A{$row}", (string) $payload['subtitle']);
            $sheet->getStyle("A{$row}")->getFont()->setItalic(true);
            $row++;
        }
        $row++; // blank spacer row

        $headers = ['Type/Account', 'Reference/Account Name', 'Date', 'Person/Item/Memo', 'Debit', 'Credit'];
        foreach ($headers as $i => $header) {
            $sheet->setCellValue("{$this->columnLetter($i)}{$row}", $header);
        }
        $headerRange = "A{$row}:" . $this->columnLetter(count($headers) - 1) . $row;
        $sheet->getStyle($headerRange)->getFont()->setBold(true)->getColor()->setRGB('FFFFFF');
        $sheet->getStyle($headerRange)->getFill()
            ->setFillType(Fill::FILL_SOLID)
            ->getStartColor()->setRGB('1565C0');
        $row++;

        $writeRow = function (array $cells) use ($sheet, &$row) {
            foreach (array_values($cells) as $i => $value) {
                $sheet->setCellValue("{$this->columnLetter($i)}{$row}", $value);
            }
            $row++;
        };

        foreach ($payload['grouped'] ?? [] as $group) {
            $header = $group['header'];
            $details = collect($group['details'] ?? []);
            $firstDetail = $details->first();
            $typeLabel = $firstDetail->type_label ?? $header->trans_type ?? '';
            $date = !empty($header->tran_date) ? date('d/m/Y', strtotime($header->tran_date)) : '';

            $writeRow([
                trim($typeLabel . ' # ' . ($header->trans_no ?? '')),
                $header->reference ?? '',
                $date,
                $header->memo ?? '',
            ]);
            $sheet->getStyle("A" . ($row - 1) . ":D" . ($row - 1))->getFont()->setBold(true);

            foreach ($details as $d) {
                $writeRow([
                    $d->account_code ?? '',
                    $d->account_name ?? '',
                    '',
                    $d->memo ?? '',
                    (float) ($d->debit ?? 0),
                    (float) ($d->credit ?? 0),
                ]);
            }

            $writeRow(['', '', '', '', (float) ($group['total_debit'] ?? 0), (float) ($group['total_credit'] ?? 0)]);
            $sheet->getStyle("E" . ($row - 1) . ":F" . ($row - 1))->getFont()->setBold(true);
            $row++; // blank spacer row between transactions
        }

        foreach (range(0, count($headers) - 1) as $i) {
            $sheet->getColumnDimension($this->columnLetter($i))->setAutoSize(true);
        }

        $writer = new Xlsx($spreadsheet);
        $tmpPath = tempnam(sys_get_temp_dir(), 'report_xlsx_');
        $writer->save($tmpPath);
        $contents = file_get_contents($tmpPath);
        unlink($tmpPath);

        return $contents;
    }

    /** Convert "12,345.00"-style formatted strings back to numbers for proper Excel cells. */
    private function cellValue(string $raw): string|float
    {
        $trimmed = trim($raw);
        if ($trimmed === '' || $trimmed === '—' || $trimmed === '-') {
            return '';
        }
        $numericCandidate = str_replace(',', '', $trimmed);
        if (is_numeric($numericCandidate)) {
            return (float) $numericCandidate;
        }

        return $raw;
    }

    private function columnLetter(int $index): string
    {
        $letter = '';
        $n = $index + 1; // 1-based
        while ($n > 0) {
            $rem = ($n - 1) % 26;
            $letter = chr(65 + $rem) . $letter;
            $n = intdiv($n - $rem, 26);
        }

        return $letter;
    }
}
