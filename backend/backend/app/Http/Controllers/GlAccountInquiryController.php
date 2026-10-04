<?php

namespace App\Http\Controllers;

use App\Repositories\All\GlTrans\GlTransInterface;
use Illuminate\Http\JsonResponse;

/**
 * Standalone "show me everything posted to this account" lookup — used by
 * the Trial Balance account drill-down popup. Deliberately separate from
 * the Reports module (ReportPdfBuilder) so it isn't routed through the
 * report picker; it reuses the same GlTransInterface::search() the GL
 * Account Transactions report already uses under the hood.
 */
class GlAccountInquiryController extends Controller
{
    public function __construct(private GlTransInterface $glTrans)
    {
    }

    public function show(string $accountCode): JsonResponse
    {
        $result = $this->glTrans->search([
            'selectedAccount' => $accountCode,
        ]);

        return response()->json([
            'account_code' => $accountCode,
            'rows' => $result['rows']->values(),
            'summary' => $result['summary'],
        ]);
    }
}
