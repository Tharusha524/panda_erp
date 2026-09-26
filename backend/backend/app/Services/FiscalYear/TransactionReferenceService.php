<?php

namespace App\Services\FiscalYear;

use App\Support\ActiveFiscalYear;
use App\Support\CompanySetupSettings;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class TransactionReferenceService
{
    /**
     * @return array{
     *     reference: string,
     *     suffix: string,
     *     sequence: int,
     *     fiscal_year_id: int|null,
     *     fiscal_year_from: string,
     *     fiscal_year_to: string,
     *     trans_type: int
     * }
     */
    public function next(int $transType, ?string $asOfDate = null): array
    {
        $range = ActiveFiscalYear::range($asOfDate);
        $suffix = ActiveFiscalYear::referenceSuffix($range['fiscal_year_from'], $range['fiscal_year_to']);
        $autoIncrease = CompanySetupSettings::autoIncreaseDocumentReferences();

        $refLine = Schema::hasTable('reflines')
            ? DB::table('reflines')->where('trans_type', $transType)->where('inactive', 0)->orderByDesc('default')->first()
            : null;
        $prefix = $refLine->prefix ?? '';
        $pattern = $refLine->pattern ?? '{001}/{YYYY}';

        if (! $autoIncrease) {
            return [
                'reference' => null,
                'suffix' => $suffix,
                'sequence' => null,
                'fiscal_year_id' => $range['id'],
                'fiscal_year_from' => $range['fiscal_year_from'],
                'fiscal_year_to' => $range['fiscal_year_to'],
                'trans_type' => $transType,
                'auto_increase_of_document_references' => false,
                'manual_entry_required' => true,
            ];
        }

        // A pattern with {MM} resets the sequence every month — only count
        // references from the current month, not the whole fiscal year.
        $date = $asOfDate ? \Carbon\Carbon::parse($asOfDate) : \Carbon\Carbon::now();
        $countFrom = str_contains($pattern, '{MM}') ? $date->copy()->startOfMonth()->toDateString() : $range['fiscal_year_from'];
        $countTo = str_contains($pattern, '{MM}') ? $date->copy()->endOfMonth()->toDateString() : $range['fiscal_year_to'];

        $references = $this->collectReferences(
            $transType,
            $countFrom,
            $countTo
        );

        $maxSequence = 0;
        foreach ($references as $reference) {
            $sequence = $this->parseSequenceFromPattern($reference, $prefix, $pattern);
            if ($sequence > $maxSequence) {
                $maxSequence = $sequence;
            }
        }

        $nextSequence = $maxSequence + 1;
        $reference = $this->formatReference($prefix, $pattern, $nextSequence, $range, $asOfDate);

        return [
            'reference' => $reference,
            'suffix' => $suffix,
            'sequence' => $nextSequence,
            'fiscal_year_id' => $range['id'],
            'fiscal_year_from' => $range['fiscal_year_from'],
            'fiscal_year_to' => $range['fiscal_year_to'],
            'trans_type' => $transType,
            'auto_increase_of_document_references' => true,
            'manual_entry_required' => false,
        ];
    }

    /** Turn a reflines pattern like "{001}/{MM}/{YY}" into an actual reference string. */
    private function formatReference(string $prefix, string $pattern, int $sequence, array $range, ?string $asOfDate): string
    {
        $date = $asOfDate ? \Carbon\Carbon::parse($asOfDate) : \Carbon\Carbon::now();
        $fromYear = (string) \Carbon\Carbon::parse($range['fiscal_year_from'])->year;
        $toYear = (string) \Carbon\Carbon::parse($range['fiscal_year_to'])->year;
        $yyyySeen = 0;

        return preg_replace_callback('/\{(0*\d*|MM|YY|YYYY)\}/', function ($m) use ($sequence, $date, $fromYear, $toYear, &$yyyySeen) {
            $token = $m[1];

            return match (true) {
                $token === 'MM' => $date->format('m'),
                $token === 'YY' => $date->format('y'),
                // First {YYYY} in the pattern is the fiscal year's start year, a
                // second one (e.g. "{YYYY}-{YYYY}") is the fiscal year's end year.
                $token === 'YYYY' => $yyyySeen++ === 0 ? $fromYear : $toYear,
                default => str_pad((string) $sequence, max(strlen($token), 1), '0', STR_PAD_LEFT),
            };
        }, $prefix.$pattern);
    }

    /** Extract the sequence number out of an existing reference built from this same pattern. */
    private function parseSequenceFromPattern(string $reference, string $prefix, string $pattern): int
    {
        $template = $prefix.$pattern;
        $sequenceTokenSeen = false;

        // Quote everything except our {...} tokens, then swap the numeric token for a
        // capturing group and the date tokens for non-capturing wildcards of the right width.
        $regex = preg_replace_callback('/\{(0*\d*|MM|YY|YYYY)\}|[^{]+/', function ($m) use (&$sequenceTokenSeen) {
            if (! isset($m[1])) {
                return preg_quote($m[0], '/');
            }
            $token = $m[1];

            return match (true) {
                $token === 'MM' => '\d{2}',
                $token === 'YY' => '\d{2}',
                $token === 'YYYY' => '\d{4}',
                default => (function () use (&$sequenceTokenSeen) {
                    $sequenceTokenSeen = true;

                    return '(\d+)';
                })(),
            };
        }, $template);

        if (! $sequenceTokenSeen || ! preg_match('/^'.$regex.'$/', trim($reference), $matches)) {
            return 0;
        }

        return max(0, (int) ($matches[1] ?? 0));
    }

    /**
     * @return list<string>
     */
    private function collectReferences(int $transType, string $from, string $to): array
    {
        $references = [];

        foreach ($this->sourcesForType($transType) as $source) {
            if (! Schema::hasTable($source['table'])) {
                continue;
            }

            $query = DB::table($source['table'])
                ->whereNotNull($source['reference_column'])
                ->where($source['reference_column'], '!=', '');

            // Restrict to the specific type being requested, not the source's
            // whole type list — otherwise Payment/Deposit/Transfer/Journal
            // (which all live in the same 'journal' source entry) would count
            // each other's references and hand out colliding sequence numbers.
            if (! empty($source['type_column'])) {
                $query->where($source['type_column'], $transType);
            }

            if (! empty($source['date_column']) && Schema::hasColumn($source['table'], $source['date_column'])) {
                $query->whereDate($source['date_column'], '>=', $from)
                    ->whereDate($source['date_column'], '<=', $to);
            }

            $rows = $query->pluck($source['reference_column']);

            foreach ($rows as $row) {
                $value = trim((string) $row);
                if ($value !== '') {
                    $references[] = $value;
                }
            }
        }

        return $references;
    }

    /**
     * @return list<array{
     *     table: string,
     *     types: list<int>,
     *     type_column: string|null,
     *     date_column: string|null,
     *     reference_column: string
     * }>
     */
    private function sourcesForType(int $transType): array
    {
        $all = [
            [
                'table' => 'sales_orders',
                'types' => [30, 32],
                'type_column' => 'trans_type',
                'date_column' => 'ord_date',
                'reference_column' => 'reference',
            ],
            [
                'table' => 'debtor_trans',
                'types' => [10, 11, 12, 13],
                'type_column' => 'trans_type',
                'date_column' => 'tran_date',
                'reference_column' => 'reference',
            ],
            [
                'table' => 'supp_trans',
                'types' => [20, 21, 22],
                'type_column' => 'trans_type',
                'date_column' => 'tran_date',
                'reference_column' => 'reference',
            ],
            [
                'table' => 'stock_moves',
                'types' => [16, 17],
                'type_column' => 'type',
                'date_column' => 'tran_date',
                'reference_column' => 'reference',
            ],
            [
                'table' => 'journal',
                'types' => [0, 1, 2, 4],
                'type_column' => 'type',
                'date_column' => 'tran_date',
                'reference_column' => 'reference',
            ],
            // Bank Payment (1), Bank Deposit (2), and Funds Transfer (4) are
            // actually recorded in bank_trans, not 'journal' — without this,
            // their reference counter never sees previously used references
            // and keeps handing out the same "next" number for every save.
            [
                'table' => 'bank_trans',
                'types' => [1, 2, 4],
                'type_column' => 'type',
                'date_column' => 'trans_date',
                'reference_column' => 'ref',
            ],
            [
                'table' => 'grn_batch',
                'types' => [25],
                'type_column' => null,
                'date_column' => 'delivery_date',
                'reference_column' => 'reference',
            ],
            [
                'table' => 'purch_orders',
                'types' => [18],
                'type_column' => null,
                'date_column' => 'ord_date',
                'reference_column' => 'reference',
            ],
        ];

        return array_values(array_filter(
            $all,
            fn (array $source) => in_array($transType, $source['types'], true)
        ));
    }

    private function parseSequence(string $reference, string $suffix): int
    {
        $reference = trim($reference);
        $suffixPattern = preg_quote($suffix, '/');

        if (! preg_match('/^(\d+)\/'.$suffixPattern.'$/', $reference, $matches)) {
            return 0;
        }

        return max(0, (int) $matches[1]);
    }
}
