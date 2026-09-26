<?php

use App\Http\Controllers\AccountTagController;
use App\Http\Controllers\AccountTypeController;
use App\Http\Controllers\AuditTrailController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\BankAccountController;
use App\Http\Controllers\BankAccountInquiryController;
use App\Http\Controllers\TaxInquiryController;
use App\Http\Controllers\TrialBalanceController;
use App\Http\Controllers\BalanceSheetController;
use App\Http\Controllers\ProfitAndLossController;
use App\Http\Controllers\BankTransController;
use App\Http\Controllers\ChartClassController;
use App\Http\Controllers\ChartMasterController;
use App\Http\Controllers\ChartTypeController;
use App\Http\Controllers\ClassTypeController;
use App\Http\Controllers\CommentsController;
use App\Http\Controllers\CompanySetupController;
use App\Http\Controllers\CreditStatusSetupController;
use App\Http\Controllers\CrmCategoryController;
use App\Http\Controllers\CrmContactsController;
use App\Http\Controllers\CrmPersonsController;
use App\Http\Controllers\CurrencyController;
use App\Http\Controllers\CustomerBranchController;
use App\Http\Controllers\CustomerController;
use App\Http\Controllers\DebtorsMasterController;
use App\Http\Controllers\DebtorTransController;
use App\Http\Controllers\DebtorTransDetailsController;
use App\Http\Controllers\DepartmentController;
use App\Http\Controllers\DepreciationPeriodController;
use App\Http\Controllers\EntityAttachmentController;
use App\Http\Controllers\CostCenterController;
use App\Http\Controllers\CostCenterTagController;
use App\Http\Controllers\ExchangeRateController;
use App\Http\Controllers\FiscalYearController;
use App\Http\Controllers\FaDepreciationController;
use App\Http\Controllers\FixedAssetsInquiryController;
use App\Http\Controllers\SystemDiagnosticsController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\BankBalanceController;
use App\Http\Controllers\BankingTransactionController;
use App\Http\Controllers\FixedAssetsLocationController;
use App\Http\Controllers\GlTypeController;
use App\Http\Controllers\GlTransController;
use App\Http\Controllers\GrnBatchController;
use App\Http\Controllers\GrnItemsController;
use App\Http\Controllers\InventoryLocationController;
use App\Http\Controllers\InvoiceIdentificationController;
use App\Http\Controllers\ItemCategoryController;
use App\Http\Controllers\ItemCodesController;
use App\Http\Controllers\ItemTaxTypeController;
use App\Http\Controllers\ItemUnitController;
use App\Http\Controllers\JournalController;
use App\Http\Controllers\PaymentTermController;
use App\Http\Controllers\PaymentTypeController;
use App\Http\Controllers\RevaluateCurrencyController;
use App\Http\Controllers\SalesAreaController;
use App\Http\Controllers\SalesGroupController;
use App\Http\Controllers\SalesPersonController;
use App\Http\Controllers\SalesPricingController;
use App\Http\Controllers\SalesTypeController;
use App\Http\Controllers\SecurityRolesController;
use App\Http\Controllers\ShippingCompnayController;
use App\Http\Controllers\SupplierController;
use App\Http\Controllers\TaxGroupController;
use App\Http\Controllers\TaxGroupItemController;
use App\Http\Controllers\TaxTypeController;
use App\Http\Controllers\UserManagementController;
use App\Http\Controllers\UserProfileController;
use App\Http\Controllers\WorkCentreController;
use App\Http\Controllers\ItemTaxTypeExceptionController;
use App\Http\Controllers\ItemTypeController;
use App\Http\Controllers\BackupController;
use App\Http\Controllers\BomController;
use App\Http\Controllers\CustAllocationController;
use App\Http\Controllers\DepreciationMethodController;
use App\Http\Controllers\ManufacturingInquiryController;
use App\Http\Controllers\ManufacturingTransactionController;
use App\Http\Controllers\LocStockController;
use App\Http\Controllers\PurchasingPricingController;
use App\Http\Controllers\PurchDataController;
use App\Http\Controllers\PurchOrderDetailsController;
use App\Http\Controllers\PurchOrdersController;
use App\Http\Controllers\PurchGrnController;
use App\Http\Controllers\PurchInquiryController;
use App\Http\Controllers\SupplierCreditNoteController;
use App\Http\Controllers\SupplierInvoiceController;
use App\Http\Controllers\SupplierPaymentController;
use App\Http\Controllers\RecurrentInvoiceController;
use App\Http\Controllers\RefLinesController;
use App\Http\Controllers\RefsController;
use App\Http\Controllers\SalesOrderDetailsController;
use App\Http\Controllers\SalesOrdersController;
use App\Http\Controllers\SalesCreditNoteController;
use App\Http\Controllers\SalesDeliveryController;
use App\Http\Controllers\SalesInquiryController;
use App\Http\Controllers\SalesInvoiceController;
use App\Http\Controllers\SalesPaymentController;
use App\Http\Controllers\SalesPosController;
use App\Http\Controllers\StockFaClassController;
use App\Http\Controllers\StockMasterController;
use App\Http\Controllers\StockMovesController;
use App\Http\Controllers\SuppAllocationsController;
use App\Http\Controllers\SuppInvoiceItemsController;
use App\Http\Controllers\SuppTransController;
use App\Http\Controllers\TaxAlgorithmController;
use App\Http\Controllers\TransTaxDetailController;
use App\Http\Controllers\TransTypesController;
use App\Http\Controllers\WOCostingController;
use App\Http\Controllers\WOIssueItemsController;
use App\Http\Controllers\WOIssuesController;
use App\Http\Controllers\WOManufactureController;
use App\Http\Controllers\WORequirementsController;
use App\Http\Controllers\WorkOrdersController;
use App\Http\Controllers\QuotationController;
use App\Models\Backup;
use App\Models\ItemCode;
use App\Models\UserProfile;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

Route::get('/user', function (Request $request) {
    $user = $request->user();

    if (!$user) {
        return response()->json(null, 204);
    }

    // fetch role row from security_roles by role name (the user_profiles.role column)
    $roleRow = DB::table('security_roles')->where('role', $user->role)->first();

    $sections = [];
    $areas = [];

    // Per-user permissions take precedence over the role's permissions.
    // If the user has no permissions of their own assigned, fall back to
    // whatever their role grants (mirrors AuthRepository::login()).
    if (!empty($user->sections) || !empty($user->areas)) {
        if (!empty($user->sections)) {
            $sections = array_values(array_filter(explode(';', $user->sections)));
        }
        if (!empty($user->areas)) {
            $areas = array_values(array_filter(explode(';', $user->areas)));
        }
    } elseif ($roleRow) {
        if (!empty($roleRow->sections)) {
            $sections = array_values(array_filter(explode(';', $roleRow->sections)));
        }
        if (!empty($roleRow->areas)) {
            $areas = array_values(array_filter(explode(';', $roleRow->areas)));
        }
    }

    return response()->json([
        'id' => $user->id ?? null,
        'email' => $user->email ?? null,
        'telephone' => $user->telephone ?? null,
        'image' => $user->image ?? null,
        'image_url' => $user->image_url,
        'role' => $user->role ?? null,
        'role_id' => $roleRow->id ?? null,
        'sections' => $sections,
        'areas' => $areas,
        'status' => $user->status ?? null,
        'first_name' => $user->first_name ?? ($user->firstName ?? null),
        'last_name' => $user->last_name ?? ($user->lastName ?? null),
        'strict_access' => (bool) ($user->strict_access ?? false),
    ]);
})->middleware('auth:sanctum');

Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:login');
Route::post('/logout', [AuthController::class, 'logout'])->middleware('auth:sanctum');

// Public — the login/signup page itself isn't authenticated yet.
Route::get('login-slideshow-images', [\App\Http\Controllers\LoginSlideshowImageController::class, 'index']);

// Public — serves files from the "public" storage disk directly, working
// the same locally and on hosting regardless of whether the storage:link
// symlink exists (see StorageFileController for why).
Route::get('storage-file/{path}', [\App\Http\Controllers\StorageFileController::class, 'show'])
    ->where('path', '.*');

Route::middleware('auth:sanctum')->group(function () {
    Route::post('login-slideshow-images', [\App\Http\Controllers\LoginSlideshowImageController::class, 'store']);
    Route::delete('login-slideshow-images/{id}', [\App\Http\Controllers\LoginSlideshowImageController::class, 'destroy']);
    Route::post('login-slideshow-images/reorder', [\App\Http\Controllers\LoginSlideshowImageController::class, 'reorder']);
    Route::get('ai-agent/status', [\App\Http\Controllers\AiAgentController::class, 'status']);
    Route::post('ai-agent/chat', [\App\Http\Controllers\AiAgentController::class, 'chat']);
    Route::post('ai-agent/transcribe', [\App\Http\Controllers\AiAgentController::class, 'transcribe']);
    Route::get('user-login-logs', [\App\Http\Controllers\UserLoginLogController::class, 'index']);
    Route::get('user-activity-logs', [\App\Http\Controllers\UserActivityLogController::class, 'index']);
    Route::get('user-activity-logs/daily-overview', [\App\Http\Controllers\UserActivityLogController::class, 'dailyOverview']);
    Route::get('user-activity-logs/daily', [\App\Http\Controllers\UserActivityLogController::class, 'daily']);
    Route::get('user-activity-logs/{id}', [\App\Http\Controllers\UserActivityLogController::class, 'show']);
    Route::get('login-ip-settings', [\App\Http\Controllers\LoginIpSettingsController::class, 'show']);
    Route::put('login-ip-settings', [\App\Http\Controllers\LoginIpSettingsController::class, 'update']);
    Route::get('void-transactions', [\App\Http\Controllers\VoidTransactionController::class, 'index']);
    Route::post('void-transactions', [\App\Http\Controllers\VoidTransactionController::class, 'store']);
    Route::get('allocations/customer/{transNo}/{transType}', [\App\Http\Controllers\AllocationController::class, 'customerOpen']);
    Route::get('allocations/supplier/{transNo}/{transType}', [\App\Http\Controllers\AllocationController::class, 'supplierOpen']);
    Route::post('allocations/customer/process', [\App\Http\Controllers\AllocationController::class, 'processCustomer']);
    Route::post('allocations/supplier/process', [\App\Http\Controllers\AllocationController::class, 'processSupplier']);
    Route::get('budget-trans', [\App\Http\Controllers\BudgetController::class, 'index']);
    Route::post('budget-trans', [\App\Http\Controllers\BudgetController::class, 'store']);
    Route::delete('budget-trans', [\App\Http\Controllers\BudgetController::class, 'destroy']);
    Route::apiResource('quick-entries', \App\Http\Controllers\QuickEntryController::class);
    Route::apiResource('printers', \App\Http\Controllers\PrinterController::class);
    Route::apiResource('app-languages', \App\Http\Controllers\AppLanguageController::class)->except(['show']);
    Route::apiResource('app-themes', \App\Http\Controllers\AppThemeController::class)->except(['show']);
    Route::apiResource('app-extensions', \App\Http\Controllers\AppExtensionController::class)->except(['show']);
    Route::post('fixed-assets/purchase', [\App\Http\Controllers\FaTransactionController::class, 'purchase'])
        ->middleware('company.module:fixed_assets');
    Route::post('fixed-assets/opening-balance', [\App\Http\Controllers\FaTransactionController::class, 'openingBalance'])
        ->middleware('company.module:fixed_assets');
    Route::post('fixed-assets/transfer', [\App\Http\Controllers\FaTransactionController::class, 'transfer'])
        ->middleware('company.module:fixed_assets');
    Route::post('fixed-assets/disposal', [\App\Http\Controllers\FaTransactionController::class, 'disposal'])
        ->middleware('company.module:fixed_assets');
    Route::post('fixed-assets/sale', [\App\Http\Controllers\FaTransactionController::class, 'sale'])
        ->middleware('company.module:fixed_assets');
});
Route::resource("user-managements", UserManagementController::class);
Route::resource("currencies", CurrencyController::class);
Route::get('fiscal-years/active', [FiscalYearController::class, 'active']);
Route::get('fiscal-years/active/next-reference', [FiscalYearController::class, 'nextReference']);
Route::post('fiscal-years/rollover', [FiscalYearController::class, 'rollover']);
Route::post('fiscal-years/{id}/rollover', [FiscalYearController::class, 'rolloverOne']);
Route::resource("fiscal-years", FiscalYearController::class);
Route::apiResource('tax-types', TaxTypeController::class);
Route::apiResource('tax-groups', TaxGroupController::class);
Route::delete('tax-group-items/{tax_group_id}/{tax_type_id}', [TaxGroupItemController::class, 'destroy']);
Route::apiResource('tax-group-items', TaxGroupItemController::class)->except(['destroy']);
Route::put('tax-group-items/{taxGroupId}/{taxTypeId}', [TaxGroupItemController::class, 'update']);


Route::resource("sales-groups", SalesGroupController::class);
Route::resource("sales-areas", SalesAreaController::class);
Route::resource("sales-types", SalesTypeController::class);
Route::resource("sales-persons", SalesPersonController::class);

Route::apiResource('account-tags', AccountTagController::class);
Route::apiResource('exchange-rates', ExchangeRateController::class);

Route::apiResource("customers", CustomerController::class);
Route::get('suppliers/{supplierId}/credit-summary', [SupplierController::class, 'creditSummary']);
Route::apiResource("suppliers", SupplierController::class);

Route::apiResource("item-tax-types", ItemTaxTypeController::class);
Route::delete('item-tax-type-exceptions/{item_id}/{tax_type_id}',[ItemTaxTypeExceptionController::class, 'destroy']);
Route::apiResource("item-tax-type-exceptions", ItemTaxTypeExceptionController::class);

Route::apiResource("work-centres", WorkCentreController::class);
Route::apiResource("credit-status-setup", CreditStatusSetupController::class);
Route::apiResource("item-units", ItemUnitController::class);

Route::middleware('company.module:cost_centers')->group(function () {
    Route::apiResource('cost-center-tags', CostCenterTagController::class);
    Route::get('cost-centers/{id}/gl-balance', [CostCenterController::class, 'glBalance']);
    Route::apiResource('cost-centers', CostCenterController::class);
    Route::post('cost-centers/search', [CostCenterController::class, 'search']);
});
Route::middleware('company.module:fixed_assets')->group(function () {
    Route::apiResource('fixed-assets-locations', FixedAssetsLocationController::class);
    Route::post('fa-depreciation/preview', [FaDepreciationController::class, 'preview']);
    Route::post('fa-depreciation/process', [FaDepreciationController::class, 'process']);
    Route::get('fa-depreciation/batches', [FaDepreciationController::class, 'batches']);
    Route::post('fixed-assets-inquiry/search', [FixedAssetsInquiryController::class, 'search']);
    Route::post('fixed-assets-inquiry/movements', [FixedAssetsInquiryController::class, 'movements']);
    Route::apiResource('stock-fa-classes', StockFaClassController::class);
});
Route::get('system-diagnostics', [SystemDiagnosticsController::class, 'index']);
Route::get('dashboard', [DashboardController::class, 'index']);
Route::get('dashboard/alerts', [DashboardController::class, 'alerts']);
Route::apiResource('sales-pricings', SalesPricingController::class);

Route::apiResource('inventory-locations', InventoryLocationController::class);
Route::get('company-setup/settings', [CompanySetupController::class, 'settings']);
Route::get('company-setup/logo', [CompanySetupController::class, 'logo']);
Route::get('mail-settings', [\App\Http\Controllers\MailSettingsController::class, 'show']);
Route::put('mail-settings', [\App\Http\Controllers\MailSettingsController::class, 'update']);
Route::post('mail-settings/test', [\App\Http\Controllers\MailSettingsController::class, 'sendTest']);
Route::apiResource("company-setup", CompanySetupController::class);
Route::put('/company-setup/{id}', [CompanySetupController::class, 'update']);
Route::get('entity-attachments', [EntityAttachmentController::class, 'index']);
Route::post('entity-attachments', [EntityAttachmentController::class, 'store']);
Route::get('entity-attachments/{id}/download', [EntityAttachmentController::class, 'download']);
Route::apiResource('entity-attachments', EntityAttachmentController::class)->except(['index', 'store']);

Route::apiResource('shipping-companies', ShippingCompnayController::class);
Route::apiResource('payment-terms', PaymentTermController::class);
Route::apiResource('payment-types', PaymentTypeController::class);

Route::get('debtors-master/{debtorNo}/credit-summary', [DebtorsMasterController::class, 'creditSummary']);
Route::apiResource('debtors-master', DebtorsMasterController::class);
Route::apiResource('crm-persons', CrmPersonsController::class);
Route::apiResource('customer-branch', CustomerBranchController::class);
Route::apiResource('crm-categories', CrmCategoryController::class);

Route::apiResource('chart-classes', ChartClassController::class);
Route::apiResource('chart-types', ChartTypeController::class);
Route::apiResource('chart-masters', ChartMasterController::class);
Route::apiResource('class-types', ClassTypeController::class);
Route::apiResource('account-types', AccountTypeController::class);
Route::get('inventory/qoh', [\App\Http\Controllers\StockQuantityController::class, 'show']);
Route::get('inventory/inquiries/item-movements', [\App\Http\Controllers\InventoryInquiryController::class, 'itemMovements']);
Route::get('inventory/inquiries/item-status/{stockId}', [\App\Http\Controllers\InventoryInquiryController::class, 'itemStatus']);
Route::post('inventory/transfers', [\App\Http\Controllers\InventoryTransactionController::class, 'transfer']);
Route::get('inventory/transfers/{transNo}', [\App\Http\Controllers\InventoryTransactionController::class, 'showTransfer']);
Route::post('inventory/adjustments', [\App\Http\Controllers\InventoryTransactionController::class, 'adjustment']);
Route::get('inventory/adjustments/{transNo}', [\App\Http\Controllers\InventoryTransactionController::class, 'showAdjustment']);
Route::post('banking/payment', [BankingTransactionController::class, 'payment']);
Route::get('banking/payment/{transNo}', [BankingTransactionController::class, 'showPayment']);
Route::put('banking/payment/{transNo}', [BankingTransactionController::class, 'updatePayment']);
Route::post('banking/deposit', [BankingTransactionController::class, 'deposit']);
Route::post('banking/transfer', [BankingTransactionController::class, 'transfer']);
Route::get('banking/transfer/{transNo}', [BankingTransactionController::class, 'showTransfer']);
Route::put('banking/transfer/{transNo}', [BankingTransactionController::class, 'updateTransfer']);
Route::post('banking/journal', [BankingTransactionController::class, 'journal']);
Route::get('banking/journal/{transNo}', [BankingTransactionController::class, 'showJournal']);
Route::put('banking/journal/{transNo}', [BankingTransactionController::class, 'updateJournal']);
Route::get('banking/reconcile/{bankAccountId}', [BankingTransactionController::class, 'unreconciled']);
Route::post('banking/reconcile', [BankingTransactionController::class, 'reconcile']);
Route::post('banking/accruals/preview', [BankingTransactionController::class, 'accrualsPreview']);
Route::post('banking/accruals/process', [BankingTransactionController::class, 'accrualsProcess']);
Route::get('bank-balances', [BankBalanceController::class, 'index']);
Route::get('bank-accounts/{id}/balance', [BankBalanceController::class, 'show']);
Route::apiResource('bank-accounts', BankAccountController::class);

Route::apiResource('user-profiles', UserProfileController::class);

Route::apiResource('revaluate-currencies', RevaluateCurrencyController::class);
Route::apiResource('crm-contacts', CrmContactsController::class);

Route::apiResource('security-roles', SecurityRolesController::class);

Route::apiResource('departments', DepartmentController::class)->except(['index']);

Route::apiResource('item-categories', ItemCategoryController::class);
Route::apiResource('item-types', ItemTypeController::class);

Route::apiResource('stock-masters', StockMasterController::class);

Route::apiResource('purchasing-pricings', PurchasingPricingController::class);
Route::get('purchasing-pricings/{supplier_id}/{stock_id}', [PurchasingPricingController::class, 'showToUpdate']);
Route::put('purchasing-pricings/{supplier_id}/{stock_id}', [PurchasingPricingController::class, 'update']);
Route::delete('purchasing-pricings/{supplier_id}/{stock_id}', [PurchasingPricingController::class, 'destroy']);

Route::apiResource('loc-stocks', LocStockController::class);
Route::get('loc-stocks/{loc_code}/{stock_id}', [LocStockController::class, 'show']);
Route::put('loc-stocks/{loc_code}/{stock_id}', [LocStockController::class, 'update']);
Route::apiResource('item-codes', ItemCodesController::class);

Route::delete('journals/trans/{transType}/{transNo}', [JournalController::class, 'destroyTransaction']);
Route::apiResource('journals', JournalController::class);
Route::post('journals/search', [JournalController::class, 'search']);

Route::apiResource('gl-trans', GlTransController::class);
Route::post('gl-trans/search', [GlTransController::class, 'search']);
Route::post('gl-trans/by-transaction', [GlTransController::class, 'byTransaction']);
Route::post('gl-trans/backfill-missing', [GlTransController::class, 'backfillMissing']);

Route::post('bank-account-inquiry/search', [BankAccountInquiryController::class, 'search']);

Route::post('tax-inquiry/search', [TaxInquiryController::class, 'search']);

Route::post('trial-balance/search', [TrialBalanceController::class, 'search']);

Route::post('balance-sheet/search', [BalanceSheetController::class, 'search']);

Route::post('profit-loss/search', [ProfitAndLossController::class, 'search']);

Route::apiResource('refs', RefsController::class);
Route::apiResource('audit-trails', AuditTrailController::class);
Route::apiResource('stock-moves', StockMovesController::class);
Route::apiResource('comments', CommentsController::class);

Route::apiResource('trans-types', TransTypesController::class);
Route::apiResource('ref-lines', RefLinesController::class);

Route::get('sales-orders/next-order-no', [SalesOrdersController::class, 'nextOrderNo']);
Route::post('sales-orders/post-with-details', [SalesOrdersController::class, 'postWithDetails']);
Route::post('sales/delivery/dispatch', [SalesDeliveryController::class, 'dispatch']);
Route::post('sales/delivery/direct', [SalesDeliveryController::class, 'directDispatch']);
Route::post('sales/delivery/{transNo}/void', [SalesDeliveryController::class, 'void']);
Route::put('sales/delivery/{transNo}', [SalesDeliveryController::class, 'update']);
Route::post('sales/invoice/from-delivery', [SalesInvoiceController::class, 'invoiceFromDelivery']);
Route::post('sales/invoice/direct', [SalesInvoiceController::class, 'directInvoice']);
Route::post('sales/invoice/{transNo}/void', [SalesInvoiceController::class, 'void']);
Route::put('sales/invoice/{transNo}', [SalesInvoiceController::class, 'update']);
Route::post('sales/payments', [SalesPaymentController::class, 'store']);
Route::put('sales/payments/{transNo}', [SalesPaymentController::class, 'update']);
Route::post('sales/payments/{transNo}/void', [SalesPaymentController::class, 'void']);
Route::post('sales/credit-notes', [SalesCreditNoteController::class, 'store']);
Route::put('sales/credit-notes/{transNo}', [SalesCreditNoteController::class, 'update']);
Route::post('sales/credit-notes/{transNo}/void', [SalesCreditNoteController::class, 'void']);
Route::get('sales/inquiries/quotations', [SalesInquiryController::class, 'quotations']);
Route::get('sales/inquiries/orders', [SalesInquiryController::class, 'orders']);
Route::get('sales/inquiries/customer-transactions', [SalesInquiryController::class, 'customerTransactions']);
Route::get('sales/inquiries/customer-allocations', [SalesInquiryController::class, 'customerAllocations']);
Route::post('recurrent-invoices/{id}/generate', [RecurrentInvoiceController::class, 'generate']);
Route::post('recurrent-invoices/generate-all-due', [RecurrentInvoiceController::class, 'generateAllDue']);
Route::post('sales/delivery/template/{orderNo}', [SalesDeliveryController::class, 'dispatchTemplate']);
Route::post('sales/invoice/template/{orderNo}', [SalesInvoiceController::class, 'directInvoiceFromTemplate']);
Route::post('sales/invoice/prepaid-final/{orderNo}', [SalesInvoiceController::class, 'prepaidFinalInvoice']);
Route::apiResource('sales-orders', SalesOrdersController::class);
Route::apiResource('sales-order-details', SalesOrderDetailsController::class);
Route::apiResource('quotations', QuotationController::class);
Route::post('quotations/{id}/send-email', [QuotationController::class, 'sendEmail']);
Route::post('documents/send-email', [\App\Http\Controllers\TransactionDocumentEmailController::class, 'send']);
Route::get('quotations/{id}/print-pdf', [QuotationController::class, 'printPdf']);
Route::patch('quotations/{id}/status', [QuotationController::class, 'updateStatus']);
Route::get('quotations-statistics', [QuotationController::class, 'statistics']);
Route::apiResource('debtor-trans', DebtorTransController::class);
Route::apiResource('debtor-trans-details', DebtorTransDetailsController::class);

Route::apiResource('sales-points', SalesPosController::class);

Route::apiResource('bank-trans', BankTransController::class);
Route::get('purch-orders/next-order-no', [PurchOrdersController::class, 'nextOrderNo']);
Route::get('purch-orders/{orderNo}/details', [PurchOrdersController::class, 'details']);
Route::post('purch-orders/post-with-details', [PurchOrdersController::class, 'postWithDetails']);
Route::post('purchases/grn/receive', [PurchGrnController::class, 'receiveFromPo']);
Route::post('purchases/grn/direct', [PurchGrnController::class, 'directGrn']);
Route::post('purchases/grn/{batchId}/void', [PurchGrnController::class, 'void']);
Route::post('purchases/invoice/from-grn', [SupplierInvoiceController::class, 'invoiceFromGrn']);
Route::post('purchases/invoice/direct', [SupplierInvoiceController::class, 'directInvoice']);
Route::post('purchases/invoice/{transNo}/void', [SupplierInvoiceController::class, 'void']);
Route::put('purchases/invoice/{transNo}', [SupplierInvoiceController::class, 'update']);
Route::get('purchases/payments/allocatable', [SupplierPaymentController::class, 'allocatable']);
Route::post('purchases/payments', [SupplierPaymentController::class, 'store']);
Route::post('purchases/payments/{transNo}/void', [SupplierPaymentController::class, 'void']);
Route::put('purchases/payments/{transNo}', [SupplierPaymentController::class, 'update']);
Route::post('purchases/credit-notes', [SupplierCreditNoteController::class, 'store']);
Route::post('purchases/credit-notes/{transNo}/void', [SupplierCreditNoteController::class, 'void']);
Route::put('purchases/credit-notes/{transNo}', [SupplierCreditNoteController::class, 'update']);
Route::get('purchases/inquiries/orders', [PurchInquiryController::class, 'orders']);
Route::get('purchases/inquiries/open-grn-items', [PurchInquiryController::class, 'openGrnItems']);
Route::get('purchases/inquiries/supplier-transactions', [PurchInquiryController::class, 'supplierTransactions']);
Route::get('purchases/inquiries/supplier-allocations', [PurchInquiryController::class, 'supplierAllocations']);
Route::apiResource('purch-orders', PurchOrdersController::class);
Route::apiResource('purch-order-details', PurchOrderDetailsController::class);
Route::apiResource('supp-trans', SuppTransController::class);
Route::apiResource('grn-batch', GrnBatchController::class);
Route::apiResource('grn-items', GrnItemsController::class);
Route::apiResource('supp-invoice-items', SuppInvoiceItemsController::class);
Route::apiResource('supp-allocations', SuppAllocationsController::class);
Route::apiResource('purch-data', PurchDataController::class);

Route::prefix('backups')->group(function () {
    Route::get('/', [BackupController::class, 'index']);
    Route::post('/', [BackupController::class, 'create']);
    Route::post('/upload', [BackupController::class, 'upload']);
    // Backup actions (view, download, restore, delete)
    Route::post('/action', [BackupController::class, 'action']);
    Route::get('/stats', [BackupController::class, 'stats']);
    Route::get('/test', [BackupController::class, 'test']);
    Route::get('/{id}/download', function ($id) {
        $backup = Backup::findOrFail($id);
        
        if (!file_exists($backup->file_path)) {
            abort(404, 'Backup file not found');
        }
        
        $content = file_get_contents($backup->file_path);
        $extension = match($backup->compression) {
            'none' => 'sql',
            'gzip' => 'sql.gz',
            'zip' => 'sql.zip',
            default => 'sql'
        };
        
        return response($content, 200, [
            'Content-Type' => 'application/octet-stream',
            'Content-Disposition' => 'attachment; filename="' . $backup->display_name . '.' . $extension . '"',
        ]);
    });
});
Route::apiResource('gl-types', GlTypeController::class);
Route::apiResource('tax-algorithms', TaxAlgorithmController::class);
Route::apiResource('invoice-identifications', InvoiceIdentificationController::class);
Route::apiResource('depreciation-periods', DepreciationPeriodController::class);

Route::apiResource('depreciation-methods', DepreciationMethodController::class);
Route::apiResource('cust-allocations', CustAllocationController::class);

Route::middleware('company.module:manufacturing')->group(function () {
    Route::get('manufacturing/inquiries/work-orders', [ManufacturingInquiryController::class, 'workOrders']);
    Route::get('manufacturing/inquiries/costed-bom', [ManufacturingInquiryController::class, 'costedBom']);
    Route::get('manufacturing/inquiries/where-used', [ManufacturingInquiryController::class, 'whereUsed']);
    Route::post('manufacturing/work-orders/entry', [ManufacturingTransactionController::class, 'entry']);
    Route::post('manufacturing/work-orders/{id}/release', [ManufacturingTransactionController::class, 'release']);
    Route::post('manufacturing/work-orders/issue', [ManufacturingTransactionController::class, 'issue']);
    Route::post('manufacturing/work-orders/produce', [ManufacturingTransactionController::class, 'produce']);
    Route::post('manufacturing/work-orders/cost', [ManufacturingTransactionController::class, 'cost']);

    Route::apiResource('bom', BomController::class);
    Route::apiResource('work-orders', WorkOrdersController::class);
    Route::apiResource('wo-requirements', WORequirementsController::class);
    Route::apiResource('wo-manufactures', WOManufactureController::class);
    Route::apiResource('wo-issues', WOIssuesController::class);
    Route::apiResource('wo-issue-items', WOIssueItemsController::class);
    Route::apiResource('wo-costing', WOCostingController::class);
    Route::get(
        'wo-costing/workorder/{workorderId}',
        [WOCostingController::class, 'byWorkorder']
    );
});

Route::apiResource('trans-tax-details', TransTaxDetailController::class);
Route::apiResource('recurrent-invoices', RecurrentInvoiceController::class);

Route::post('sys-prefs/bulk', [\App\Http\Controllers\SysPrefsController::class, 'bulkUpdate']);
Route::apiResource('sys-prefs', \App\Http\Controllers\SysPrefsController::class);

Route::post('/reports/generate', [\App\Http\Controllers\ReportController::class, 'generate']);
Route::post('/reports/generate-excel', [\App\Http\Controllers\ReportController::class, 'generateExcel']);
Route::post('/reports/monthly-sales-summary', [\App\Http\Controllers\ReportController::class, 'monthlySalesSummary']);
Route::post('/reports/customer-balances', [\App\Http\Controllers\ReportController::class, 'customerBalances']);
Route::post('/reports/aged-customer-analysis', [\App\Http\Controllers\ReportController::class, 'agedCustomerAnalysis']);
Route::post('/reports/customer-trial-balance', [\App\Http\Controllers\ReportController::class, 'customerTrialBalance']);
Route::post('/reports/customer-detail-listing', [\App\Http\Controllers\ReportController::class, 'customerDetailListing']);
Route::post('/reports/sales-summary', [\App\Http\Controllers\ReportController::class, 'salesSummary']);

// Public routes for Registration dropdowns
// Real data source: departments table (managed via Department Setup, auth-protected below)
Route::get('departments', [DepartmentController::class, 'index']);
Route::get('factory', function () {
    return response()->json([]);
});
Route::get('job-positions', function () {
    return response()->json([]);
});