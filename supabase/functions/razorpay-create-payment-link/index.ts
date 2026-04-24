const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RAZORPAY_API_BASE = 'https://api.razorpay.com/v1';
const LIFETIME_UNLOCK_AMOUNT = 29900;
const LIFETIME_UNLOCK_DESCRIPTION = 'LuminaScan Lifetime Unlock';

const getAuthHeader = () => {
  const keyId = Deno.env.get('RAZORPAY_KEY_ID');
  const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET');

  if (!keyId || !keySecret) {
    throw new Error('Missing Razorpay server secrets.');
  }

  return `Basic ${btoa(`${keyId}:${keySecret}`)}`;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const customerName =
      typeof body.customerName === 'string' && body.customerName.trim().length > 0
        ? body.customerName.trim()
        : undefined;
    const customerEmail =
      typeof body.customerEmail === 'string' && body.customerEmail.trim().length > 0
        ? body.customerEmail.trim()
        : undefined;

    const payload = {
      amount: LIFETIME_UNLOCK_AMOUNT,
      currency: 'INR',
      accept_partial: false,
      description: LIFETIME_UNLOCK_DESCRIPTION,
      reminder_enable: false,
      notify: {
        sms: false,
        email: Boolean(customerEmail),
      },
      customer: {
        name: customerName,
        email: customerEmail,
      },
      notes: {
        product: 'luminascan_lifetime_unlock',
      },
    };

    const response = await fetch(`${RAZORPAY_API_BASE}/payment_links`, {
      method: 'POST',
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      const message =
        typeof data?.error?.description === 'string'
          ? data.error.description
          : 'Razorpay rejected the payment link request.';
      return new Response(JSON.stringify({ error: message }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        paymentLinkId: data.id,
        paymentLinkStatus: data.status,
        shortUrl: data.short_url,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create Razorpay payment link.';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
