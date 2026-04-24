## Razorpay Edge Functions

Set these secrets before deploying:

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`

Suggested commands:

```bash
supabase secrets set RAZORPAY_KEY_ID=rzp_test_SgyWXbGQ9WGZkR
supabase secrets set RAZORPAY_KEY_SECRET=GCyGppZKvZnhmTXN0x0YOrfj
supabase functions deploy razorpay-create-payment-link
supabase functions deploy razorpay-verify-payment
```

The mobile app calls:

- `razorpay-create-payment-link`
- `razorpay-verify-payment`
