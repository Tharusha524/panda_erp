<?php

namespace App\Http\Controllers;

use App\Services\Banking\AccrualsService;
use App\Services\Banking\BankingTransactionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BankingTransactionController extends Controller
{
    public function __construct(
        private BankingTransactionService $service,
        private AccrualsService $accruals
    ) {
    }

    public function payment(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'bank_account_id' => 'required|integer',
            'trans_date' => 'required|date',
            'reference' => 'nullable|string|max:60',
            'memo' => 'nullable|string',
            'cost_center_id' => 'nullable|integer',
            'lines' => 'required|array|min:1',
            'lines.*.account_code' => 'nullable|string',
            'lines.*.amount' => 'required|numeric|min:0.01',
        ]);

        try {
            return response()->json($this->service->postPayment($validated), 201);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (\Throwable $e) {
            report($e);

            return response()->json(['message' => 'Failed to create bank payment.'], 500);
        }
    }

    public function showPayment(int $transNo): JsonResponse
    {
        try {
            return response()->json($this->service->getPayment($transNo));
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 404);
        } catch (\Throwable $e) {
            report($e);

            return response()->json(['message' => 'Failed to load bank payment.'], 500);
        }
    }

    public function updatePayment(Request $request, int $transNo): JsonResponse
    {
        $validated = $request->validate([
            'bank_account_id' => 'required|integer',
            'trans_date' => 'required|date',
            'reference' => 'nullable|string|max:60',
            'memo' => 'nullable|string',
            'cost_center_id' => 'nullable|integer',
            'lines' => 'required|array|min:1',
            'lines.*.account_code' => 'nullable|string',
            'lines.*.amount' => 'required|numeric|min:0.01',
        ]);

        try {
            return response()->json($this->service->updatePayment($transNo, $validated));
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (\Throwable $e) {
            report($e);

            return response()->json(['message' => 'Failed to update bank payment.'], 500);
        }
    }

    public function deposit(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'bank_account_id' => 'required|integer',
            'trans_date' => 'required|date',
            'reference' => 'nullable|string|max:60',
            'memo' => 'nullable|string',
            'lines' => 'required|array|min:1',
            'lines.*.account_code' => 'nullable|string',
            'lines.*.amount' => 'required|numeric|min:0.01',
        ]);

        return response()->json($this->service->postDeposit($validated), 201);
    }

    public function transfer(Request $request): JsonResponse
    {
        $validated = $this->validateTransfer($request);

        try {
            return response()->json($this->service->postTransfer($validated), 201);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (\Throwable $e) {
            report($e);

            return response()->json(['message' => 'Failed to create bank transfer.'], 500);
        }
    }

    public function showTransfer(int $transNo): JsonResponse
    {
        try {
            return response()->json($this->service->getTransfer($transNo));
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 404);
        } catch (\Throwable $e) {
            report($e);

            return response()->json(['message' => 'Failed to load bank transfer.'], 500);
        }
    }

    public function updateTransfer(Request $request, int $transNo): JsonResponse
    {
        $validated = $this->validateTransfer($request);

        try {
            return response()->json($this->service->updateTransfer($transNo, $validated));
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (\Throwable $e) {
            report($e);

            return response()->json(['message' => 'Failed to update bank transfer.'], 500);
        }
    }

    /** @return array<string, mixed> */
    private function validateTransfer(Request $request): array
    {
        return $request->validate([
            'from_account_id' => 'required|integer',
            'to_account_id' => 'required|integer',
            'amount' => 'required|numeric|min:0.01',
            'trans_date' => 'required|date',
            'reference' => 'nullable|string|max:60',
            'bank_charge' => 'nullable|numeric|min:0',
            'memo' => 'nullable|string',
            'cost_center_id' => 'nullable|integer',
        ]);
    }

    public function journal(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'tran_date' => 'required|date',
            'reference' => 'nullable|string|max:60',
            'currency' => 'nullable|string|max:10',
            'source_ref' => 'nullable|string|max:60',
            'event_date' => 'nullable|date',
            'doc_date' => 'nullable|date',
            'memo' => 'nullable|string',
            'include_in_tax_register' => 'nullable|boolean',
            'vat_date' => 'nullable|date',
            'tax_lines' => 'nullable|array',
            'tax_lines.*.tax_type_id' => 'nullable|integer|min:0',
            'tax_lines.*.rate' => 'nullable|numeric|min:0',
            'tax_lines.*.net_amount' => 'nullable|numeric|min:0',
            'tax_lines.*.input_tax' => 'nullable|numeric|min:0',
            'tax_lines.*.output_tax' => 'nullable|numeric|min:0',
            'lines' => 'required|array|min:2',
            'lines.*.account_code' => 'nullable|string',
            'lines.*.debit' => 'nullable|numeric',
            'lines.*.credit' => 'nullable|numeric',
            'lines.*.memo' => 'nullable|string',
            'lines.*.cost_center_id' => 'nullable|integer',
            'lines.*.cost_center2_id' => 'nullable|integer',
            'lines.*.person_type_id' => 'nullable|integer',
            'lines.*.person_id' => 'nullable|integer',
        ]);

        try {
            return response()->json($this->service->postJournal($validated), 201);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'message' => self::journalErrorMessage($e),
            ], 422);
        }
    }

    public function showJournal(int $transNo): JsonResponse
    {
        try {
            return response()->json($this->service->getJournal($transNo));
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 404);
        } catch (\Throwable $e) {
            report($e);

            return response()->json(['message' => 'Failed to load journal entry.'], 500);
        }
    }

    public function updateJournal(Request $request, int $transNo): JsonResponse
    {
        $validated = $request->validate([
            'tran_date' => 'required|date',
            'reference' => 'nullable|string|max:60',
            'currency' => 'nullable|string|max:10',
            'source_ref' => 'nullable|string|max:60',
            'event_date' => 'nullable|date',
            'doc_date' => 'nullable|date',
            'memo' => 'nullable|string',
            'include_in_tax_register' => 'nullable|boolean',
            'vat_date' => 'nullable|date',
            'tax_lines' => 'nullable|array',
            'tax_lines.*.tax_type_id' => 'nullable|integer|min:0',
            'tax_lines.*.rate' => 'nullable|numeric|min:0',
            'tax_lines.*.net_amount' => 'nullable|numeric|min:0',
            'tax_lines.*.input_tax' => 'nullable|numeric|min:0',
            'tax_lines.*.output_tax' => 'nullable|numeric|min:0',
            'lines' => 'required|array|min:2',
            'lines.*.account_code' => 'nullable|string',
            'lines.*.debit' => 'nullable|numeric',
            'lines.*.credit' => 'nullable|numeric',
            'lines.*.memo' => 'nullable|string',
            'lines.*.cost_center_id' => 'nullable|integer',
            'lines.*.cost_center2_id' => 'nullable|integer',
            'lines.*.person_type_id' => 'nullable|integer',
            'lines.*.person_id' => 'nullable|integer',
        ]);

        try {
            return response()->json($this->service->updateJournal($transNo, $validated));
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'message' => self::journalErrorMessage($e),
            ], 422);
        }
    }

    private static function journalErrorMessage(\Throwable $e): string
    {
        $message = trim($e->getMessage());
        if ($message === '') {
            return 'Failed to save journal entry. Check server logs or contact support.';
        }

        if (preg_match('/sqlstate|SQL:|PDOException|vendor\\\\/i', $message)) {
            if (stripos($message, 'foreign key') !== false && stripos($message, 'currency') !== false) {
                return 'Currency is not set up. Add the currency under Setup → Currencies and set Company home currency.';
            }
            if (stripos($message, 'foreign key') !== false && stripos($message, 'reflines') !== false) {
                return 'Journal reference lines are not configured. Run database seeders or add trans_type 0 in Reference Lines.';
            }
            if (stripos($message, 'Unknown column') !== false) {
                return 'Database schema is out of date. Run php artisan migrate on the server, then try again.';
            }

            return 'Database error while posting the journal. Run php artisan migrate on the server and verify Chart of Accounts.';
        }

        if (stripos($message, 'ChartAccountMetadata') !== false || stripos($message, 'ChartAccountTypeResolver') !== false) {
            return 'Backend files are incomplete. Upload all files in app/Support/ (ChartAccountMetadata.php, ChartAccountTypeResolver.php, OpeningBalanceJournal.php, GlTransHelper.php).';
        }

        return $message;
    }

    public function unreconciled(int $bankAccountId): JsonResponse
    {
        return response()->json($this->service->getUnreconciled($bankAccountId));
    }

    public function reconcile(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'bank_account_id' => 'required|integer',
            'reconcile_date' => 'required|date',
            'ending_balance' => 'required|numeric',
            'transaction_ids' => 'nullable|array',
            'transaction_ids.*' => 'integer',
        ]);

        return response()->json($this->service->postReconcile($validated));
    }

    public function accrualsPreview(Request $request): JsonResponse
    {
        $validated = $this->validateAccruals($request);

        try {
            return response()->json($this->accruals->preview($validated));
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function accrualsProcess(Request $request): JsonResponse
    {
        $validated = $this->validateAccruals($request);

        try {
            return response()->json($this->accruals->process($validated), 201);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (\Throwable $e) {
            report($e);

            return response()->json(['message' => 'Failed to process accruals.'], 500);
        }
    }

    /** @return array<string, mixed> */
    private function validateAccruals(Request $request): array
    {
        return $request->validate([
            'date' => 'required|date',
            'acc_act' => 'required|string|max:15',
            'res_act' => 'required|string|max:15',
            'amount' => 'required|numeric|min:0.01',
            'freq' => 'required|integer|in:1,2,3,4',
            'periods' => 'required|integer|min:1',
            'cost_center_id' => 'nullable|integer|min:0',
            'cost_center2_id' => 'nullable|integer|min:0',
            'memo' => 'nullable|string',
        ]);
    }
}
