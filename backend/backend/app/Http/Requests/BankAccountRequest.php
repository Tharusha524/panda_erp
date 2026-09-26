<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use App\Models\AccountType;

class BankAccountRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Laravel's ConvertEmptyStringsToNull middleware turns the empty
     * bank_name/bank_account_number sent for Cash accounts into null before
     * validation. Those columns have a default of '' but aren't nullable in
     * the database, so a null there would pass "nullable" validation and
     * then crash at the SQL insert. Put the empty string back for them.
     */
    protected function prepareForValidation(): void
    {
        $this->merge([
            'bank_name' => $this->input('bank_name') ?? '',
            'bank_account_number' => $this->input('bank_account_number') ?? '',
        ]);
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        // Cash-style accounts (Petty Cash / Cash In Hand) have no real bank
        // details, so the frontend hides Bank Name/Account Number/Address
        // and sends them empty for those. Matched by name, same as the
        // frontend, so this stays in sync with whatever account types exist.
        $accountType = AccountType::find($this->input('account_type'));
        $isCashAccountType = str_contains(strtolower($accountType->type_name ?? ''), 'cash');

        $bankFieldRule = $isCashAccountType ? 'nullable|string' : 'required|string';

        return [
            'bank_account_name' => 'required|string|max:60',
            'account_type' => 'required|exists:account_types,id',
            'bank_curr_code' => 'required|exists:currencies,currency_abbreviation',
            'default_curr_act' => 'boolean',
            'account_gl_code' => 'required|exists:chart_master,account_code',
            'bank_charges_act' => 'required|exists:chart_master,account_code',
            'bank_name' => $bankFieldRule . '|max:60',
            'bank_account_number' => $bankFieldRule . '|max:100',
            'bank_address' => 'nullable|string',
            'last_reconciled_date' => 'nullable|date',
            'ending_reconcile_balance' => 'numeric',
            'inactive' => 'boolean',
        ];
    }
}
