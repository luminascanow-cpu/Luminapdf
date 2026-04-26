## Razorpay Edge Functions

Before deploying the functions, run the SQL in:

- `supabase/migrations/20260425_secure_payment_access.sql`

Set these secrets before deploying:

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`

Suggested commands:

```bash
supabase secrets set RAZORPAY_KEY_ID=your_key_id
supabase secrets set RAZORPAY_KEY_SECRET=your_key_secret
supabase functions deploy razorpay-create-payment-link
supabase functions deploy razorpay-verify-payment
```

The mobile app calls:

- `razorpay-create-payment-link`
- `razorpay-verify-payment`
