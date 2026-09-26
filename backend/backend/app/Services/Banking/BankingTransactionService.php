<?php

namespace App\Services\Banking;

use App\Support\CompanySetupSettings;
use App\Support\AuditTrailRecorder;
use App\Support\CustomerExchangeRate;
use App\Support\GlTransHelper;
use App\Support\JournalEntryDisplay;
use App\Support\ChartAccountTypeResolver;
use App\Support\OpeningBalanceJournal;
use App\Support\TrialAccountBalance;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * FrontAccounting-style banking: bank_trans + balanced gl_trans per transaction.
 */
class BankingTransactionService
{
    public const TYPE_JOURNAL = 0;

    public const TYPE_PAYMENT = 1;

    public const TYPE_DEPOSIT = 2;

    public const TYPE_TRANSFER = 4;

    public function postPayment(array $data): array
    {
        return $this->postBankWithLines(
            self::TYPE_PAYMENT,
            $data,
            creditBank: true
        );
    }

    public function getPayment(int $transNo): array
    {
        return $this->getBankWithLines(self::TYPE_PAYMENT, $transNo, creditBank: true);
    }

    public function updatePayment(int $transNo, array $data): array
    {
        return $this->updateBankWithLines(self::TYPE_PAYMENT, $transNo, $data, creditBank: true);
    }

    public function postDeposit(array $data): array
    {
        return $this->postBankWithLines(
            self::TYPE_DEPOSIT,
            $data,
            creditBank: false
        );
    }

    public function postTransfer(array $data): array
    {
        return DB::transaction(function () use ($data) {
            $transNo = $this->nextTransNo(self::TYPE_TRANSFER);

            return $this->persistTransfer($transNo, $data, false);
        });
    }

    public function getTransfer(int $transNo): array
    {
        if ($transNo <= 0) {
            throw new \InvalidArgumentException('Invalid transfer transaction number.');
        }

        if (! Schema::hasTable('bank_trans')) {
            throw new \InvalidArgumentException('Bank transfer not found.');
        }

        $rows = DB::table('bank_trans')
            ->where('type', self::TYPE_TRANSFER)
            ->where('trans_no', $transNo)
            ->get();

        if ($rows->isEmpty()) {
            throw new \InvalidArgumentException('Bank transfer not found.');
        }

        if ($rows->contains(fn ($r) => ! empty($r->reconciled))) {
            throw new \InvalidArgumentException('This bank transfer has been reconciled and cannot be edited.');
        }

        $outRow = $rows->first(fn ($r) => (float) $r->amount < 0);
        $inRow = $rows->first(fn ($r) => (float) $r->amount > 0);

        if (! $outRow || ! $inRow) {
            throw new \InvalidArgumentException('Bank transfer is incomplete and cannot be edited.');
        }

        $charge = 0.0;
        $memo = '';
        if (Schema::hasColumn('gl_trans', 'type_no')) {
            $chargeLine = DB::table('gl_trans')
                ->where('type', (string) self::TYPE_TRANSFER)
                ->where('type_no', $transNo)
                ->where('memo', 'Bank charge')
                ->where('credit', '>', 0)
                ->first();
            if ($chargeLine) {
                $charge = (float) $chargeLine->credit;
            }

            $memoLine = DB::table('gl_trans')
                ->where('type', (string) self::TYPE_TRANSFER)
                ->where('type_no', $transNo)
                ->whereNotIn('memo', ['Transfer in', 'Transfer out', 'Bank charge'])
                ->value('memo');
            $memo = (string) ($memoLine ?? '');
        }

        return [
            'trans_no' => $transNo,
            'trans_type' => self::TYPE_TRANSFER,
            'from_account_id' => (int) $outRow->bank_act,
            'to_account_id' => (int) $inRow->bank_act,
            'amount' => round((float) $inRow->amount, 2),
            'trans_date' => $outRow->trans_date,
            'reference' => $outRow->ref ?? '',
            'bank_charge' => round($charge, 2),
            'memo' => $memo,
            'cost_center_id' => $outRow->cost_center_id ?? null,
        ];
    }

    public function updateTransfer(int $transNo, array $data): array
    {
        return DB::transaction(function () use ($transNo, $data) {
            // Validates the transfer exists and isn't already reconciled.
            $this->getTransfer($transNo);

            DB::table('gl_trans')
                ->where('type', (string) self::TYPE_TRANSFER)
                ->where('type_no', $transNo)
                ->delete();

            return $this->persistTransfer($transNo, $data, true);
        });
    }

    /**
     * @return array{trans_no:int, trans_type:int, reference:string, bank_trans: array<int, array<string, mixed>>}
     */
    private function persistTransfer(int $transNo, array $data, bool $isUpdate): array
    {
        $fromId = (int) ($data['from_account_id'] ?? 0);
        $toId = (int) ($data['to_account_id'] ?? 0);
        $amount = abs((float) ($data['amount'] ?? 0));
        $charge = abs((float) ($data['bank_charge'] ?? 0));
        $date = $data['trans_date'] ?? now()->toDateString();
        $reference = trim((string) ($data['reference'] ?? ''));
        if ($reference === '') {
            $reference = 'TRF-'.$transNo;
        }
        $memo = $data['memo'] ?? '';
        $costCenterId = (int) ($data['cost_center_id'] ?? 0) ?: null;

        if ($fromId <= 0 || $toId <= 0 || $amount <= 0) {
            throw new \InvalidArgumentException('From account, to account, and amount are required.');
        }
        if ($fromId === $toId) {
            throw new \InvalidArgumentException('From account and to account must be different.');
        }

        $this->assertSufficientBankBalance($fromId, $amount + $charge, $date, self::TYPE_TRANSFER, $transNo, $isUpdate);

        if ($isUpdate) {
            $outId = (int) DB::table('bank_trans')
                ->where('type', self::TYPE_TRANSFER)->where('trans_no', $transNo)
                ->where('amount', '<', 0)->value('id');
            $inId = (int) DB::table('bank_trans')
                ->where('type', self::TYPE_TRANSFER)->where('trans_no', $transNo)
                ->where('amount', '>', 0)->value('id');

            DB::table('bank_trans')->where('id', $outId)->update([
                'bank_act' => $fromId,
                'ref' => $reference,
                'trans_date' => $date,
                'amount' => -$amount,
                'cost_center_id' => $costCenterId,
                'updated_at' => now(),
            ]);
            DB::table('bank_trans')->where('id', $inId)->update([
                'bank_act' => $toId,
                'ref' => $reference,
                'trans_date' => $date,
                'amount' => $amount,
                'cost_center_id' => $costCenterId,
                'updated_at' => now(),
            ]);

            $out = ['id' => $outId, 'bank_act' => $fromId, 'amount' => -$amount];
            $in = ['id' => $inId, 'bank_act' => $toId, 'amount' => $amount];
        } else {
            $out = $this->insertBankTrans([
                'bank_act' => $fromId,
                'trans_no' => $transNo,
                'type' => self::TYPE_TRANSFER,
                'ref' => $reference,
                'trans_date' => $date,
                'amount' => -$amount,
                'cost_center_id' => $costCenterId,
            ]);

            $in = $this->insertBankTrans([
                'bank_act' => $toId,
                'trans_no' => $transNo,
                'type' => self::TYPE_TRANSFER,
                'ref' => $reference,
                'trans_date' => $date,
                'amount' => $amount,
                'cost_center_id' => $costCenterId,
            ]);
        }

        $fromGl = $this->bankGlCode($fromId);
        $toGl = $this->bankGlCode($toId);
        $chargeGl = $this->pref('bank_charge_act') ?? $fromGl;

        if ($fromGl && $toGl) {
            $this->postGlLine(self::TYPE_TRANSFER, $transNo, $reference, $date, $toGl, $amount, 0, $memo ?: 'Transfer in', $costCenterId);
            $this->postGlLine(self::TYPE_TRANSFER, $transNo, $reference, $date, $fromGl, 0, $amount, $memo ?: 'Transfer out', $costCenterId);
            if ($charge > 0 && $chargeGl) {
                $this->postGlLine(self::TYPE_TRANSFER, $transNo, $reference, $date, $chargeGl, $charge, 0, 'Bank charge', $costCenterId);
                $this->postGlLine(self::TYPE_TRANSFER, $transNo, $reference, $date, $fromGl, 0, $charge, 'Bank charge', $costCenterId);
            }
        }

        if (! $isUpdate) {
            AuditTrailRecorder::record(self::TYPE_TRANSFER, $transNo, $date, 'Bank transfer');
        }

        return [
            'trans_no' => $transNo,
            'trans_type' => self::TYPE_TRANSFER,
            'reference' => $reference,
            'bank_trans' => [$out, $in],
        ];
    }

    public function postJournal(array $data): array
    {
        return DB::transaction(function () use ($data) {
            $transNo = $this->nextTransNo(self::TYPE_JOURNAL);

            return $this->persistJournal($transNo, $data, false);
        });
    }

    public function getJournal(int $transNo): array
    {
        if ($transNo <= 0) {
            throw new \InvalidArgumentException('Invalid journal transaction number.');
        }

        $header = Schema::hasTable('journal')
            ? DB::table('journal')
                ->where('type', self::TYPE_JOURNAL)
                ->where('trans_no', $transNo)
                ->first()
            : null;

        $lineQuery = DB::table('gl_trans as gt')
            ->leftJoin('chart_master as cm', 'gt.account', '=', 'cm.account_code')
            ->where('gt.type', (string) self::TYPE_JOURNAL);
        if (Schema::hasColumn('gl_trans', 'type_no')) {
            $lineQuery->where('gt.type_no', $transNo);
        } else {
            $lineQuery->where('gt.reference', 'like', '%'.$transNo.'%');
        }

        $rawLines = $lineQuery
            ->select('gt.*', DB::raw('COALESCE(cm.account_type, 0) as account_type'))
            ->orderBy('gt.id')
            ->get();

        if (! $header && $rawLines->isEmpty()) {
            throw new \InvalidArgumentException('Journal entry not found.');
        }

        $headerMemo = '';
        if (Schema::hasTable('comments')) {
            $headerMemo = (string) (DB::table('comments')
                ->where('type', self::TYPE_JOURNAL)
                ->where('id', $transNo)
                ->value('memo_') ?? '');
        }

        $firstLine = $rawLines->first();
        $tranDate = $header->tran_date ?? $firstLine->tran_date ?? $firstLine->date ?? now()->toDateString();

        $tax = $this->loadJournalTaxDetails($transNo);

        return [
            'trans_no' => $transNo,
            'trans_type' => self::TYPE_JOURNAL,
            'tran_date' => $tranDate,
            'reference' => $header->reference ?? ($firstLine->reference ?? ''),
            'source_ref' => $header->source_ref ?? '',
            'event_date' => $header->event_date ?? $tranDate,
            'doc_date' => $header->doc_date ?? $tranDate,
            'currency' => $header->currency ?? $this->resolveCurrency(null),
            'amount' => (float) ($header->amount ?? 0),
            'memo' => $headerMemo,
            'include_in_tax_register' => $tax['include_in_tax_register'],
            'vat_date' => $tax['vat_date'],
            'tax_lines' => $tax['tax_lines'],
            'lines' => $rawLines->map(function ($line) {
                $columns = JournalEntryDisplay::postedGlToJournalColumns(
                    (float) ($line->debit ?? 0),
                    (float) ($line->credit ?? 0),
                    $line->account_type ?? 0
                );

                return [
                    'account_code' => (string) ($line->account ?? ''),
                    'debit' => $columns['debit'],
                    'credit' => $columns['credit'],
                    'memo' => (string) ($line->memo ?? ''),
                    'cost_center_id' => $line->cost_center_id ?? null,
                    'person_type_id' => $line->person_type_id ?? null,
                    'person_id' => $line->person_id ?? null,
                ];
            })->values()->all(),
        ];
    }

    public function updateJournal(int $transNo, array $data): array
    {
        return DB::transaction(function () use ($transNo, $data) {
            $this->getJournal($transNo);

            $deleteQuery = DB::table('gl_trans')->where('type', (string) self::TYPE_JOURNAL);
            if (Schema::hasColumn('gl_trans', 'type_no')) {
                $deleteQuery->where('type_no', $transNo);
            } else {
                $deleteQuery->where('reference', 'like', '%'.$transNo.'%');
            }
            $deleteQuery->delete();

            return $this->persistJournal($transNo, $data, true);
        });
    }

    /**
     * @return array{trans_no:int, trans_type:int, reference:string, currency:string, gl_lines:int}
     */
    private function persistJournal(int $transNo, array $data, bool $isUpdate): array
    {
        $lines = $data['lines'] ?? [];
        $date = $data['tran_date'] ?? now()->toDateString();
        $reference = trim((string) ($data['reference'] ?? ''));
        if ($reference === '') {
            $reference = 'JV-'.$transNo;
        }
        $currency = $this->resolveCurrency($data['currency'] ?? null);
        $this->ensureJournalPrerequisites(self::TYPE_JOURNAL, $currency);
        $headerMemo = trim((string) ($data['memo'] ?? ''));

        $built = $this->buildJournalGlLines($transNo, $reference, $date, $lines, $headerMemo);

        if ($isUpdate && Schema::hasTable('journal')) {
            $updated = DB::table('journal')
                ->where('type', self::TYPE_JOURNAL)
                ->where('trans_no', $transNo)
                ->update([
                    'tran_date' => $date,
                    'reference' => $reference,
                    'source_ref' => $data['source_ref'] ?? '',
                    'event_date' => $data['event_date'] ?? $date,
                    'doc_date' => $data['doc_date'] ?? $date,
                    'currency' => $currency,
                    'amount' => $built['totalDebit'],
                    'rate' => (float) ($data['rate'] ?? 1),
                    'updated_at' => now(),
                ]);

            if ($updated === 0) {
                $this->insertJournalHeader([
                    'type' => self::TYPE_JOURNAL,
                    'trans_no' => $transNo,
                    'tran_date' => $date,
                    'reference' => $reference,
                    'source_ref' => $data['source_ref'] ?? null,
                    'event_date' => $data['event_date'] ?? $date,
                    'doc_date' => $data['doc_date'] ?? $date,
                    'currency' => $currency,
                    'amount' => $built['totalDebit'],
                    'rate' => (float) ($data['rate'] ?? 1),
                ]);
            }
        } else {
            $this->insertJournalHeader([
                'type' => self::TYPE_JOURNAL,
                'trans_no' => $transNo,
                'tran_date' => $date,
                'reference' => $reference,
                'source_ref' => $data['source_ref'] ?? null,
                'event_date' => $data['event_date'] ?? $date,
                'doc_date' => $data['doc_date'] ?? $date,
                'currency' => $currency,
                'amount' => $built['totalDebit'],
                'rate' => (float) ($data['rate'] ?? 1),
            ]);
        }

        GlTransHelper::insertLines($built['glLines']);
        $this->syncJournalBankTransactions($transNo, $reference, $date, $built['glLines']);
        $this->syncJournalDebtorTransactions($transNo, $reference, $date, $built['glLines']);

        if (Schema::hasTable('comments')) {
            try {
                DB::table('comments')
                    ->where('type', self::TYPE_JOURNAL)
                    ->where('id', $transNo)
                    ->delete();

                if ($headerMemo !== '') {
                    DB::table('comments')->insert([
                        'type' => self::TYPE_JOURNAL,
                        'id' => $transNo,
                        'date_' => $date,
                        'memo_' => $headerMemo,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
            } catch (\Throwable $e) {
                report($e);
            }
        }

        $this->persistJournalTaxDetails($transNo, $date, $data);

        if (! $isUpdate) {
            AuditTrailRecorder::record(
                self::TYPE_JOURNAL,
                $transNo,
                $date,
                'Journal entry'
            );
        }

        return [
            'trans_no' => $transNo,
            'trans_type' => self::TYPE_JOURNAL,
            'reference' => $reference,
            'currency' => $currency,
            'gl_lines' => count($built['glLines']),
        ];
    }

    /**
     * @return array{include_in_tax_register: bool, vat_date: ?string, tax_lines: array<int, array<string, mixed>>}
     */
    private function loadJournalTaxDetails(int $transNo): array
    {
        if (! Schema::hasTable('trans_tax_details')) {
            return [
                'include_in_tax_register' => false,
                'vat_date' => null,
                'tax_lines' => [],
            ];
        }

        $rows = DB::table('trans_tax_details')
            ->where('trans_type', self::TYPE_JOURNAL)
            ->where('trans_no', $transNo)
            ->orderBy('id')
            ->get();

        if ($rows->isEmpty()) {
            return [
                'include_in_tax_register' => false,
                'vat_date' => null,
                'tax_lines' => [],
            ];
        }

        $grouped = [];
        foreach ($rows as $row) {
            $taxTypeId = (int) ($row->tax_type_id ?? 0);
            if (! isset($grouped[$taxTypeId])) {
                $grouped[$taxTypeId] = [
                    'tax_type_id' => $taxTypeId,
                    'rate' => (float) ($row->rate ?? 0),
                    'net_amount' => (float) ($row->net_amount ?? 0),
                    'input_tax' => 0.0,
                    'output_tax' => 0.0,
                ];
            }

            $regType = (int) ($row->reg_type ?? -1);
            $amount = (float) ($row->amount ?? 0);
            if ($regType === 0) {
                $grouped[$taxTypeId]['input_tax'] = $amount;
            } elseif ($regType === 1) {
                $grouped[$taxTypeId]['output_tax'] = $amount;
            }

            if ((float) ($row->net_amount ?? 0) > 0) {
                $grouped[$taxTypeId]['net_amount'] = (float) $row->net_amount;
            }
        }

        $firstDate = $rows->first()->tran_date ?? null;

        return [
            'include_in_tax_register' => true,
            'vat_date' => $firstDate ? (string) $firstDate : null,
            'tax_lines' => array_values($grouped),
        ];
    }

    private function persistJournalTaxDetails(int $transNo, string $journalDate, array $data): void
    {
        if (! Schema::hasTable('trans_tax_details')) {
            return;
        }

        DB::table('trans_tax_details')
            ->where('trans_type', self::TYPE_JOURNAL)
            ->where('trans_no', $transNo)
            ->delete();

        if (empty($data['include_in_tax_register'])) {
            return;
        }

        $vatDate = trim((string) ($data['vat_date'] ?? ''));
        if ($vatDate === '') {
            $vatDate = $journalDate;
        }

        $taxLines = $data['tax_lines'] ?? [];
        $now = now();
        $insertRows = [];

        foreach ($taxLines as $line) {
            $taxTypeId = (int) ($line['tax_type_id'] ?? 0);
            $rate = (float) ($line['rate'] ?? 0);
            $netAmount = round((float) ($line['net_amount'] ?? 0), 2);
            $inputTax = round((float) ($line['input_tax'] ?? 0), 2);
            $outputTax = round((float) ($line['output_tax'] ?? 0), 2);

            if ($taxTypeId <= 0) {
                continue;
            }

            if ($inputTax <= 0 && $outputTax <= 0 && $netAmount <= 0) {
                continue;
            }

            if ($inputTax > 0) {
                $insertRows[] = [
                    'trans_type' => self::TYPE_JOURNAL,
                    'trans_no' => $transNo,
                    'tran_date' => $vatDate,
                    'tax_type_id' => $taxTypeId,
                    'rate' => $rate,
                    'ex_rate' => 1,
                    'included_in_price' => false,
                    'net_amount' => $netAmount,
                    'amount' => $inputTax,
                    'memo' => null,
                    'reg_type' => 0,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }

            if ($outputTax > 0) {
                $insertRows[] = [
                    'trans_type' => self::TYPE_JOURNAL,
                    'trans_no' => $transNo,
                    'tran_date' => $vatDate,
                    'tax_type_id' => $taxTypeId,
                    'rate' => $rate,
                    'ex_rate' => 1,
                    'included_in_price' => false,
                    'net_amount' => $netAmount,
                    'amount' => $outputTax,
                    'memo' => null,
                    'reg_type' => 1,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }
        }

        if ($insertRows !== []) {
            try {
                DB::table('trans_tax_details')->insert($insertRows);
            } catch (\Throwable $e) {
                throw new \InvalidArgumentException(
                    'Journal GL lines are valid but tax register details could not be saved. Check tax types are configured.',
                    previous: $e
                );
            }
        }
    }

    /**
     * @param  array<string, int>  $knownAccounts
     */
    private function accountExistsInChart(string $account, array $knownAccounts): bool
    {
        if (array_key_exists($account, $knownAccounts)) {
            return true;
        }

        $trimmed = ltrim($account, '0');
        if ($trimmed !== '' && array_key_exists($trimmed, $knownAccounts)) {
            return true;
        }

        return false;
    }

    private function ensureJournalPrerequisites(int $transType, string $currency): void
    {
        if (Schema::hasTable('currencies')) {
            $currencyExists = DB::table('currencies')
                ->where('currency_abbreviation', $currency)
                ->exists();
            if (! $currencyExists) {
                throw new \InvalidArgumentException(
                    "Currency \"{$currency}\" is not in Currencies. Add it under Setup → Currencies or set the company home currency."
                );
            }
        }

        if (! Schema::hasTable('reflines')) {
            return;
        }

        $refExists = DB::table('reflines')->where('trans_type', $transType)->exists();
        if ($refExists) {
            return;
        }

        $row = ['trans_type' => $transType, 'prefix' => '', 'pattern' => '{001}/{YYYY}', 'memo' => 'Journal', 'default' => 1, 'inactive' => 0];
        if (Schema::hasColumn('reflines', 'created_at')) {
            $row['created_at'] = now();
            $row['updated_at'] = now();
        }

        try {
            DB::table('reflines')->insert($row);
        } catch (\Throwable $e) {
            throw new \InvalidArgumentException(
                'Journal reference line for trans_type '.$transType.' is missing. Configure Reference Lines (reflines) in setup.',
                previous: $e
            );
        }
    }

    /**
     * @return array{glLines: array<int, array<string, mixed>>, totalDebit: float, totalCredit: float}
     */
    private function buildJournalGlLines(
        int $transNo,
        string $reference,
        string $date,
        array $lines,
        string $headerMemo
    ): array {
        $totalDebit = 0;
        $totalCredit = 0;
        $glLines = [];

        $knownAccounts = ChartAccountTypeResolver::typesByCode();

        foreach ($lines as $line) {
            $account = $this->resolveJournalLineAccount($line);
            $debit = (float) ($line['debit'] ?? 0);
            $credit = (float) ($line['credit'] ?? 0);

            if ($account !== '' && $knownAccounts !== [] && ! $this->accountExistsInChart($account, $knownAccounts)) {
                throw new \InvalidArgumentException("Account code \"{$account}\" is not in Chart of Accounts.");
            }

            if (isset($line['amount']) && abs($debit) < 0.001 && abs($credit) < 0.001) {
                $signed = (float) $line['amount'];
                if ($signed > 0) {
                    $debit = $signed;
                } elseif ($signed < 0) {
                    $credit = abs($signed);
                }
            }

            if ($debit < 0) {
                $credit += abs($debit);
                $debit = 0;
            }
            if ($credit < 0) {
                $debit += abs($credit);
                $credit = 0;
            }

            if (! $account || ($debit <= 0 && $credit <= 0)) {
                continue;
            }
            $totalDebit += $debit;
            $totalCredit += $credit;
            $glLines[] = $this->glLinePayload(
                self::TYPE_JOURNAL,
                $transNo,
                $reference,
                $date,
                $account,
                $debit,
                $credit,
                $line['memo'] ?? ($headerMemo !== '' ? $headerMemo : 'Journal entry'),
                $line['cost_center_id'] ?? null,
                $line['cost_center2_id'] ?? null,
                $line['person_type_id'] ?? null,
                $line['person_id'] ?? null
            );
        }

        if (count($glLines) < 2) {
            throw new \InvalidArgumentException('At least two journal lines with account and debit or credit amounts are required.');
        }

        if (abs($totalDebit - $totalCredit) > 0.01) {
            throw new \InvalidArgumentException('Journal entry must balance: total debits must equal total credits.');
        }

        $this->assertOpeningBalanceEquation($lines);

        return [
            'glLines' => $glLines,
            'totalDebit' => $totalDebit,
            'totalCredit' => $totalCredit,
        ];
    }

    /**
     * When every line is a balance-sheet account, Assets must equal Liabilities + Equity (net).
     *
     * @param  array<int, array<string, mixed>>  $lines
     */
    private function assertOpeningBalanceEquation(array $lines): void
    {
        $codes = [];
        foreach ($lines as $line) {
            $code = trim((string) ($line['account_code'] ?? $line['accountCode'] ?? $line['selectedAccountCode'] ?? ''));
            if ($code !== '') {
                $codes[] = $code;
            }
        }

        if ($codes === [] || ! Schema::hasTable('chart_master')) {
            return;
        }

        $accountTypes = ChartAccountTypeResolver::typesByCode();

        $allBalanceSheet = true;
        foreach ($codes as $code) {
            if (! TrialAccountBalance::isBalanceSheetAccount($accountTypes[trim($code)] ?? 0)) {
                $allBalanceSheet = false;
                break;
            }
        }

        if (! $allBalanceSheet) {
            return;
        }

        $summary = OpeningBalanceJournal::summarizeFromLines($lines, $accountTypes);
        if ($summary['equation_balanced']) {
            return;
        }

        throw new \InvalidArgumentException(sprintf(
            'Opening balance: Total Assets (%s) must equal Liabilities + Equity (%s). Difference: %s',
            number_format($summary['total_assets'], 2, '.', ','),
            number_format($summary['liabilities_plus_equity'], 2, '.', ','),
            number_format(abs($summary['difference']), 2, '.', ',')
        ));
    }

    public function getUnreconciled(int $bankAccountId): array
    {
        if (! Schema::hasTable('bank_trans')) {
            return ['transactions' => [], 'book_balance' => 0];
        }

        $balanceService = app(BankBalanceService::class);

        $rows = DB::table('bank_trans as bt')
            ->leftJoin('trans_types as tt', 'bt.type', '=', 'tt.trans_type')
            ->where('bt.bank_act', $bankAccountId)
            ->whereNull('bt.reconciled')
            ->orderBy('bt.trans_date')
            ->orderBy('bt.id')
            ->get([
                'bt.id',
                'bt.trans_no',
                'bt.type',
                DB::raw('COALESCE(tt.description, CAST(bt.type AS CHAR)) as type_name'),
                'bt.ref as reference',
                'bt.trans_date as date',
                'bt.amount',
            ]);

        $account = DB::table('bank_accounts')->where('id', $bankAccountId)->first();

        return [
            'bank_account_id' => $bankAccountId,
            'book_balance' => $balanceService->getBalance($bankAccountId),
            'ending_reconcile_balance' => (float) ($account->ending_reconcile_balance ?? 0),
            'last_reconciled_date' => $account->last_reconciled_date ?? null,
            'transactions' => $rows->map(function ($row) {
                $amt = (float) $row->amount;

                return [
                    'id' => $row->id,
                    'type' => $row->type_name,
                    'number' => $row->trans_no,
                    'reference' => $row->reference,
                    'date' => $row->date,
                    'debit' => $amt > 0 ? round($amt, 2) : 0,
                    'credit' => $amt < 0 ? round(abs($amt), 2) : 0,
                    'amount' => round($amt, 2),
                ];
            })->values()->all(),
        ];
    }

    public function postReconcile(array $data): array
    {
        return DB::transaction(function () use ($data) {
            $bankId = (int) ($data['bank_account_id'] ?? 0);
            $reconcileDate = $data['reconcile_date'] ?? now()->toDateString();
            $endingBalance = (float) ($data['ending_balance'] ?? 0);
            $ids = $data['transaction_ids'] ?? [];

            if ($bankId <= 0) {
                throw new \InvalidArgumentException('Bank account is required.');
            }

            if (! empty($ids) && Schema::hasTable('bank_trans')) {
                DB::table('bank_trans')
                    ->where('bank_act', $bankId)
                    ->whereIn('id', $ids)
                    ->update(['reconciled' => $reconcileDate]);
            }

            DB::table('bank_accounts')->where('id', $bankId)->update([
                'ending_reconcile_balance' => $endingBalance,
                'last_reconciled_date' => $reconcileDate,
            ]);

            return [
                'bank_account_id' => $bankId,
                'reconcile_date' => $reconcileDate,
                'ending_balance' => $endingBalance,
                'reconciled_count' => count($ids),
                'book_balance' => app(BankBalanceService::class)->getBalance($bankId),
            ];
        });
    }

    private function getBankWithLines(int $transType, int $transNo, bool $creditBank): array
    {
        if ($transNo <= 0) {
            throw new \InvalidArgumentException('Invalid bank transaction number.');
        }

        if (! Schema::hasTable('bank_trans')) {
            throw new \InvalidArgumentException('Bank payment not found.');
        }

        $bankRow = DB::table('bank_trans')
            ->where('type', $transType)
            ->where('trans_no', $transNo)
            ->first();

        if (! $bankRow) {
            throw new \InvalidArgumentException('Bank payment not found.');
        }

        if (! empty($bankRow->reconciled)) {
            throw new \InvalidArgumentException('This bank payment has been reconciled and cannot be edited.');
        }

        $bankId = (int) $bankRow->bank_act;
        $bankGl = $this->bankGlCode($bankId);

        $lineQuery = DB::table('gl_trans')->where('type', (string) $transType);
        if (Schema::hasColumn('gl_trans', 'type_no')) {
            $lineQuery->where('type_no', $transNo);
        } else {
            $lineQuery->where('reference', $bankRow->ref ?? '');
        }

        $rawLines = $lineQuery->orderBy('id')->get();

        $lines = [];
        foreach ($rawLines as $line) {
            if ($bankGl && (string) ($line->account ?? '') === $bankGl) {
                continue;
            }

            $amt = $creditBank
                ? abs((float) ($line->debit ?? 0))
                : abs((float) ($line->credit ?? 0));

            if ($amt <= 0) {
                continue;
            }

            $lines[] = [
                'account_code' => (string) ($line->account ?? ''),
                'amount' => round($amt, 2),
                'memo' => (string) ($line->memo ?? ''),
                'cost_center_id' => $line->cost_center_id ?? null,
            ];
        }

        $headerMemo = '';
        if (Schema::hasTable('comments')) {
            $headerMemo = (string) (DB::table('comments')
                ->where('type', $transType)
                ->where('id', $transNo)
                ->value('memo_') ?? '');
        }

        return [
            'trans_no' => $transNo,
            'trans_type' => $transType,
            'bank_account_id' => $bankId,
            'trans_date' => $bankRow->trans_date,
            'reference' => $bankRow->ref ?? '',
            'memo' => $headerMemo,
            'lines' => $lines,
        ];
    }

    private function updateBankWithLines(int $transType, int $transNo, array $data, bool $creditBank): array
    {
        return DB::transaction(function () use ($transType, $transNo, $data, $creditBank) {
            $this->getBankWithLines($transType, $transNo, $creditBank);

            $deleteQuery = DB::table('gl_trans')->where('type', (string) $transType);
            if (Schema::hasColumn('gl_trans', 'type_no')) {
                $deleteQuery->where('type_no', $transNo);
            } else {
                $existingRef = DB::table('bank_trans')
                    ->where('type', $transType)
                    ->where('trans_no', $transNo)
                    ->value('ref');
                $deleteQuery->where('reference', $existingRef ?? '');
            }
            $deleteQuery->delete();

            return $this->persistBankWithLines($transNo, $transType, $data, $creditBank, true);
        });
    }

    private function postBankWithLines(int $transType, array $data, bool $creditBank): array
    {
        return DB::transaction(function () use ($transType, $data, $creditBank) {
            $transNo = $this->nextTransNo($transType);

            return $this->persistBankWithLines($transNo, $transType, $data, $creditBank, false);
        });
    }

    /**
     * @return array{trans_no:int, trans_type:int, reference:string, bank_trans_id:int|null, amount:float, gl_lines:int, book_balance:float}
     */
    private function persistBankWithLines(
        int $transNo,
        int $transType,
        array $data,
        bool $creditBank,
        bool $isUpdate
    ): array {
        $bankId = (int) ($data['bank_account_id'] ?? $data['bank_act'] ?? 0);
        $lines = $data['lines'] ?? [];
        $date = $data['trans_date'] ?? now()->toDateString();
        $reference = trim((string) ($data['reference'] ?? ''));
        if ($reference === '') {
            $reference = ($transType === self::TYPE_PAYMENT ? 'PAY' : 'DEP').'-'.$transNo;
        }
        $memo = trim((string) ($data['memo'] ?? ''));

        if ($bankId <= 0) {
            throw new \InvalidArgumentException('Bank account is required.');
        }

        if ($creditBank) {
            app(BankBalanceService::class)->assertAllowedPaymentSource($bankId);
        }

        $total = 0;
        foreach ($lines as $line) {
            $total += abs((float) ($line['amount'] ?? 0));
        }
        if ($total <= 0) {
            throw new \InvalidArgumentException('At least one line with amount is required.');
        }

        if ($creditBank) {
            $this->assertSufficientBankBalance($bankId, $total, $date, $transType, $transNo, $isUpdate);
        }

        $bankGl = $this->bankGlCode($bankId);
        if (! $bankGl) {
            throw new \InvalidArgumentException(
                'Selected bank account has no GL code. Set the GL account in Banking & GL → Maintenance → Bank Accounts.'
            );
        }
        $bankAmount = $creditBank ? -$total : $total;
        $bankLabel = $transType === self::TYPE_PAYMENT ? 'Bank payment' : 'Bank deposit';

        if ($isUpdate) {
            DB::table('bank_trans')
                ->where('type', $transType)
                ->where('trans_no', $transNo)
                ->update([
                    'bank_act' => $bankId,
                    'ref' => $reference,
                    'trans_date' => $date,
                    'amount' => $bankAmount,
                    'cost_center_id' => $data['cost_center_id'] ?? null,
                    'updated_at' => now(),
                ]);
            $bankTransId = (int) (DB::table('bank_trans')
                ->where('type', $transType)
                ->where('trans_no', $transNo)
                ->value('id') ?? 0);
        } else {
            $bankRow = $this->insertBankTrans([
                'bank_act' => $bankId,
                'trans_no' => $transNo,
                'type' => $transType,
                'ref' => $reference,
                'trans_date' => $date,
                'amount' => $bankAmount,
                'cost_center_id' => $data['cost_center_id'] ?? null,
            ]);
            $bankTransId = $bankRow['id'] ?? null;
        }

        $glLines = [];
        foreach ($lines as $line) {
            $account = trim((string) ($line['account_code'] ?? $line['accountCode'] ?? $line['selectedAccountCode'] ?? ''));
            $amt = abs((float) ($line['amount'] ?? 0));
            if (! $account || $amt <= 0) {
                continue;
            }
            if ($creditBank) {
                $glLines[] = $this->glLinePayload($transType, $transNo, $reference, $date, $account, $amt, 0, $line['memo'] ?? $memo, $line['cost_center_id'] ?? null);
            } else {
                $glLines[] = $this->glLinePayload($transType, $transNo, $reference, $date, $account, 0, $amt, $line['memo'] ?? $memo, $line['cost_center_id'] ?? null);
            }
        }

        if ($creditBank) {
            $glLines[] = $this->glLinePayload($transType, $transNo, $reference, $date, $bankGl, 0, $total, $memo ?: $bankLabel, $data['cost_center_id'] ?? null);
        } else {
            $glLines[] = $this->glLinePayload($transType, $transNo, $reference, $date, $bankGl, $total, 0, $memo ?: $bankLabel, $data['cost_center_id'] ?? null);
        }

        if ($glLines !== []) {
            GlTransHelper::insertLines($glLines);
        }

        if (Schema::hasTable('comments')) {
            try {
                DB::table('comments')
                    ->where('type', $transType)
                    ->where('id', $transNo)
                    ->delete();

                if ($memo !== '') {
                    DB::table('comments')->insert([
                        'type' => $transType,
                        'id' => $transNo,
                        'date_' => $date,
                        'memo_' => $memo,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
            } catch (\Throwable $e) {
                report($e);
            }
        }

        if (! $isUpdate) {
            $label = match ($transType) {
                self::TYPE_PAYMENT => 'Bank payment',
                self::TYPE_DEPOSIT => 'Bank deposit',
                default => 'Bank transaction',
            };
            AuditTrailRecorder::record($transType, $transNo, $date, $label);
        }

        return [
            'trans_no' => $transNo,
            'trans_type' => $transType,
            'reference' => $reference,
            'bank_trans_id' => $bankTransId ?: null,
            'amount' => $bankAmount,
            'gl_lines' => count($glLines),
            'book_balance' => app(BankBalanceService::class)->getBalance($bankId),
        ];
    }

    private function postGlLine(
        int $type,
        int $typeNo,
        string $reference,
        string $date,
        string $account,
        float $debit,
        float $credit,
        string $memo,
        $costCenterId = null
    ): void {
        GlTransHelper::insertLines([
            $this->glLinePayload($type, $typeNo, $reference, $date, $account, $debit, $credit, $memo, $costCenterId),
        ]);
    }

    private function glLinePayload(
        int $type,
        int $typeNo,
        string $reference,
        string $date,
        string $account,
        float $debit,
        float $credit,
        string $memo,
        $costCenterId = null,
        $costCenter2Id = null,
        $personTypeId = null,
        $personId = null
    ): array {
        $payload = [
            'type' => $type,
            'type_no' => $typeNo,
            'reference' => $reference,
            'date' => $date,
            'account' => trim($account),
            'debit' => $debit,
            'credit' => $credit,
            'memo' => $memo,
            'cost_center_id' => $costCenterId,
        ];

        if ($costCenter2Id !== null && $costCenter2Id !== '' && (int) $costCenter2Id > 0) {
            $payload['cost_center2_id'] = (int) $costCenter2Id;
        }

        if ($personTypeId !== null && $personTypeId !== '' && $personId !== null && $personId !== '') {
            $payload['person_type_id'] = (int) $personTypeId;
            $payload['person_id'] = (int) $personId;
        }

        return $payload;
    }

    private function insertBankTrans(array $row): array
    {
        $id = DB::table('bank_trans')->insertGetId([
            'bank_act' => $row['bank_act'],
            'trans_no' => $row['trans_no'],
            'type' => $row['type'],
            'ref' => $row['ref'] ?? '',
            'trans_date' => $row['trans_date'],
            'amount' => $row['amount'],
            'cost_center_id' => $row['cost_center_id'] ?? null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return ['id' => $id, ...$row];
    }

    private function insertJournalHeader(array $row): void
    {
        if (! Schema::hasTable('journal')) {
            return;
        }

        $payload = [];
        $map = [
            'type' => $row['type'],
            'trans_no' => $row['trans_no'],
            'tran_date' => $row['tran_date'],
            'reference' => $row['reference'] ?? '',
            'source_ref' => $row['source_ref'] ?? '',
            'event_date' => $row['event_date'] ?? $row['tran_date'],
            'doc_date' => $row['doc_date'] ?? $row['tran_date'],
            'currency' => $row['currency'] ?? $this->resolveCurrency(null),
            'amount' => $row['amount'] ?? 0,
            'rate' => $row['rate'] ?? 1,
            'created_at' => now(),
            'updated_at' => now(),
        ];

        foreach ($map as $column => $value) {
            if (Schema::hasColumn('journal', $column)) {
                $payload[$column] = $value;
            }
        }

        if ($payload === []) {
            return;
        }

        try {
            DB::table('journal')->insert($payload);
        } catch (\Throwable $e) {
            throw new \InvalidArgumentException(
                'Could not save journal header. Check that the currency exists in Currencies and journal reference lines (reflines) include trans_type 0.',
                previous: $e
            );
        }
    }

    private function resolveCurrency(?string $currency): string
    {
        $candidate = strtoupper(trim((string) ($currency ?? '')));

        if ($candidate !== '' && Schema::hasTable('currencies')) {
            $exists = DB::table('currencies')
                ->where('currency_abbreviation', $candidate)
                ->exists();
            if ($exists) {
                return $candidate;
            }
        }

        $home = CompanySetupSettings::current()?->homeCurrency?->currency_abbreviation;
        if ($home && Schema::hasTable('currencies')) {
            $home = strtoupper(trim((string) $home));
            $exists = DB::table('currencies')
                ->where('currency_abbreviation', $home)
                ->exists();
            if ($exists) {
                return $home;
            }
        }

        if (Schema::hasTable('currencies')) {
            $fallback = DB::table('currencies')->value('currency_abbreviation');
            if ($fallback) {
                return strtoupper((string) $fallback);
            }
        }

        throw new \InvalidArgumentException(
            'No currency is configured. Add at least one currency under Setup → Currencies and set the company home currency.'
        );
    }

    private function nextTransNo(int $transType): int
    {
        $maxBank = Schema::hasTable('bank_trans')
            ? (int) DB::table('bank_trans')->where('type', $transType)->max('trans_no')
            : 0;
        $maxJournal = Schema::hasTable('journal')
            ? (int) DB::table('journal')->where('type', $transType)->max('trans_no')
            : 0;
        // gl_trans is always written for every posting, even ones (like an
        // opening-balance import) that never got a 'journal'/'bank_trans' header
        // row — without this, nextTransNo() can hand out a number that's already
        // in use there and silently collide with an existing entry.
        $maxGl = Schema::hasColumn('gl_trans', 'type_no')
            ? (int) DB::table('gl_trans')->where('type', (string) $transType)->max('type_no')
            : 0;

        return max($maxBank, $maxJournal, $maxGl, 0) + 1;
    }

    private function bankGlCode(int $bankAccountId): ?string
    {
        $code = DB::table('bank_accounts')->where('id', $bankAccountId)->value('account_gl_code');

        return $code ? trim((string) $code) : null;
    }

    /**
     * Block payments/transfers that exceed the bank book balance (cash in hand, current account, etc.).
     */
    private function assertSufficientBankBalance(
        int $bankAccountId,
        float $requiredAmount,
        string $asAtDate,
        int $transType,
        int $transNo,
        bool $isUpdate
    ): void {
        app(BankBalanceService::class)->assertSufficientBalance(
            $bankAccountId,
            $requiredAmount,
            $asAtDate,
            $transType,
            $transNo,
            $isUpdate
        );
    }

    /**
     * Resolve journal line account: explicit GL code, or bank account → account_gl_code.
     *
     * @param  array<string, mixed>  $line
     */
    private function resolveJournalLineAccount(array $line): string
    {
        $bankAccountId = (int) ($line['bank_account_id'] ?? $line['bankAccountId'] ?? $line['bank_act'] ?? 0);
        if ($bankAccountId > 0) {
            $fromBank = $this->bankGlCode($bankAccountId);
            if ($fromBank) {
                return $fromBank;
            }
        }

        return trim((string) ($line['account_code'] ?? $line['accountCode'] ?? $line['selectedAccountCode'] ?? ''));
    }

    /**
     * Mirror journal bank GL lines into bank_trans so bank inquiry balance matches GL.
     *
     * @param  array<int, array<string, mixed>>  $glLines
     */
    private function syncJournalBankTransactions(int $transNo, string $reference, string $date, array $glLines): void
    {
        if (! Schema::hasTable('bank_trans') || ! Schema::hasTable('bank_accounts')) {
            return;
        }

        DB::table('bank_trans')
            ->where('type', self::TYPE_JOURNAL)
            ->where('trans_no', $transNo)
            ->delete();

        $bankByGl = $this->bankAccountsByGlCode();
        if ($bankByGl === []) {
            return;
        }

        foreach ($glLines as $line) {
            $account = trim((string) ($line['account'] ?? ''));
            if ($account === '' || ! isset($bankByGl[$account])) {
                continue;
            }

            $debit = (float) ($line['debit'] ?? 0);
            $credit = (float) ($line['credit'] ?? 0);
            $amount = $debit > 0.001 ? $debit : ($credit > 0.001 ? -$credit : 0.0);
            if (abs($amount) < 0.001) {
                continue;
            }

            $this->insertBankTrans([
                'bank_act' => $bankByGl[$account],
                'trans_no' => $transNo,
                'type' => self::TYPE_JOURNAL,
                'ref' => $reference,
                'trans_date' => $date,
                'amount' => round($amount, 2),
            ]);
        }
    }

    /**
     * Mirror journal debtor-control GL lines into debtor_trans so Customer Balances
     * (and other AR reports) pick up customer-tagged journal entries.
     *
     * @param  array<int, array<string, mixed>>  $glLines
     */
    private function syncJournalDebtorTransactions(int $transNo, string $reference, string $date, array $glLines): void
    {
        if (! Schema::hasTable('debtor_trans') || ! Schema::hasTable('cust_branch')) {
            return;
        }

        DB::table('debtor_trans')
            ->where('trans_type', self::TYPE_JOURNAL)
            ->where('trans_no', $transNo)
            ->delete();

        foreach ($glLines as $line) {
            if ((int) ($line['person_type_id'] ?? 0) !== 2) {
                continue;
            }

            $debtorNo = (int) ($line['person_id'] ?? 0);
            if ($debtorNo <= 0) {
                continue;
            }

            $debit = (float) ($line['debit'] ?? 0);
            $credit = (float) ($line['credit'] ?? 0);
            $amount = $debit - $credit;
            if (abs($amount) < 0.001) {
                continue;
            }

            $branchCode = DB::table('cust_branch')
                ->where('debtor_no', $debtorNo)
                ->orderBy('branch_code')
                ->value('branch_code');

            if (! $branchCode) {
                continue;
            }

            // $amount is in home currency (gl_trans debit/credit). debtor_trans stores
            // the customer's own currency, so convert using their exchange rate —
            // otherwise a foreign-currency customer's opening balance shows the raw
            // home-currency figure mislabeled as their currency.
            $rate = CustomerExchangeRate::forDebtor($debtorNo, $date);
            $ovAmount = $rate > 0.000001 ? $amount / $rate : $amount;

            DB::table('debtor_trans')->insert([
                'trans_no' => $transNo,
                'trans_type' => self::TYPE_JOURNAL,
                'debtor_no' => $debtorNo,
                'branch_code' => $branchCode,
                'tran_date' => $date,
                'due_date' => $date,
                'reference' => $reference,
                'ov_amount' => round($ovAmount, 2),
                'alloc' => 0,
                'rate' => $rate,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    /**
     * @return array<string, int> GL account code => bank_accounts.id
     */
    private function bankAccountsByGlCode(): array
    {
        if (! Schema::hasTable('bank_accounts')) {
            return [];
        }

        $map = [];
        $rows = DB::table('bank_accounts')
            ->whereNotNull('account_gl_code')
            ->where('account_gl_code', '!=', '')
            ->get(['id', 'account_gl_code']);

        foreach ($rows as $row) {
            $code = trim((string) $row->account_gl_code);
            if ($code !== '') {
                $map[$code] = (int) $row->id;
            }
        }

        return $map;
    }

    /**
     * FA add_wo_costs_journal / write_journal_entries — mirror bank GL credits into bank_trans.
     *
     * @param  array<int, array<string, mixed>>  $glLines
     */
    public function syncJournalBankTransactionsFromGlLines(int $transNo, string $reference, string $date, array $glLines): void
    {
        $this->syncJournalBankTransactions($transNo, $reference, $date, $glLines);
    }

    private function pref(string $name): ?string
    {
        if (! Schema::hasTable('sys_prefs')) {
            return null;
        }

        $v = DB::table('sys_prefs')->where('name', $name)->value('value');

        return $v !== null ? (string) $v : null;
    }
}
