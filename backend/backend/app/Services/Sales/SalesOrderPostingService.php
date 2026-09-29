<?php

namespace App\Services\Sales;

use App\Models\SalesOrder;
use App\Models\SalesOrderDetail;
use App\Support\SalesOrderPrepAmount;
use Illuminate\Support\Facades\DB;

/**
 * FrontAccounting-style: header + lines in one DB transaction (all or nothing).
 */
class SalesOrderPostingService
{
    /**
     * @param  array<string, mixed>  $header
     * @param  list<array<string, mixed>>  $lines
     * @return array{order: SalesOrder, lines: list<SalesOrderDetail>}
     */
    public function createWithDetails(array $header, array $lines): array
    {
        if ($lines === []) {
            throw new \InvalidArgumentException('At least one order line is required.');
        }

        return DB::transaction(function () use ($header, $lines) {
            $order = $this->createHeader($this->normalizeHeader($header));
            $createdLines = [];
            foreach ($lines as $line) {
                $line['order_no'] = $order->order_no;
                $line['trans_type'] = $line['trans_type'] ?? $order->trans_type;
                $createdLines[] = SalesOrderDetail::query()->create($line);
            }

            return ['order' => $order->fresh(), 'lines' => $createdLines];
        });
    }

    /**
     * @param  array<string, mixed>  $header
     * @param  list<array<string, mixed>>  $lines
     * @param  list<int|string>  $deleteDetailIds
     * @return array{order: SalesOrder, lines: list<SalesOrderDetail>}
     */
    public function updateWithDetails(
        int $orderNo,
        array $header,
        array $lines,
        array $deleteDetailIds = []
    ): array {
        if ($lines === []) {
            throw new \InvalidArgumentException('At least one order line is required.');
        }

        return DB::transaction(function () use ($orderNo, $header, $lines, $deleteDetailIds) {
            $order = SalesOrder::query()->where('order_no', $orderNo)->firstOrFail();
            $order->update($this->normalizeHeader($header));

            if ($deleteDetailIds !== []) {
                SalesOrderDetail::query()
                    ->where('order_no', $orderNo)
                    ->whereIn('id', $deleteDetailIds)
                    ->delete();
            }

            $createdLines = [];
            foreach ($lines as $line) {
                $line['order_no'] = $orderNo;
                $line['trans_type'] = $line['trans_type'] ?? $order->trans_type;
                $detailId = $line['id'] ?? null;
                unset($line['id']);

                if ($detailId) {
                    $detail = SalesOrderDetail::query()
                        ->where('order_no', $orderNo)
                        ->where('id', $detailId)
                        ->first();
                    if ($detail) {
                        $detail->update($line);
                        $createdLines[] = $detail->fresh();
                        continue;
                    }
                }

                $createdLines[] = SalesOrderDetail::query()->create($line);
            }

            return ['order' => $order->fresh(), 'lines' => $createdLines];
        });
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function createHeader(array $data): SalesOrder
    {
        $attempts = 0;
        $lastException = null;
        while ($attempts < 3) {
            try {
                return SalesOrder::query()->create($data);
            } catch (\Illuminate\Database\QueryException $e) {
                $attempts++;
                $lastException = $e;
                // MySQL uses SQLSTATE 23000 for both a duplicate order_no
                // (retryable) and any other foreign-key/constraint failure
                // (not retryable — bumping order_no won't fix it). Only
                // retry when the message actually names the primary key.
                if ($e->getCode() == '23000' && str_contains($e->getMessage(), "for key 'PRIMARY'")) {
                    $max = (int) (DB::table('sales_orders')->max('order_no') ?? 0);
                    $data['order_no'] = $max + 1;
                    continue;
                }
                throw $e;
            }
        }

        throw new \RuntimeException(
            'Unable to allocate unique order_no after retries: '.($lastException?->getMessage() ?? 'unknown error')
        );
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function normalizeHeader(array $data): array
    {
        $data['delivery_address'] = trim((string) ($data['delivery_address'] ?? ''));
        $data['deliver_to'] = trim((string) ($data['deliver_to'] ?? ''));
        $data['customer_ref'] = $data['customer_ref'] ?? null;
        $data['comments'] = $data['comments'] ?? null;
        $data['freight_cost'] = (float) ($data['freight_cost'] ?? 0);
        $data['from_stk_loc'] = (string) ($data['from_stk_loc'] ?? '');

        $orderType = (int) ($data['order_type'] ?? 0);
        if ($orderType <= 0 || ! DB::table('sales_types')->where('id', $orderType)->exists()) {
            throw new \InvalidArgumentException('Invalid or missing price list (sales type). Please select a valid price list.');
        }

        $data['prep_amount'] = SalesOrderPrepAmount::resolve($data);

        return $data;
    }
}
