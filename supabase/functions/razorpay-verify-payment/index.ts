const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RAZORPAY_API_BASE = 'https://api.razorpay.com/v1';

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
    const body = await request.json();
    const paymentLinkId =
      typeof body.paymentLinkId === 'string' && body.paymentLinkId.trim().length > 0
        ? body.paymentLinkId.trim()
        : null;

    if (!paymentLinkId) {
      return new Response(JSON.stringify({ error: 'paymentLinkId is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const response = await fetch(`${RAZORPAY_API_BASE}/payment_links/${paymentLinkId}`, {
      method: 'GET',
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      const message =
        typeof data?.error?.description === 'string'
          ? data.error.description
          : 'Razorpay rejected the payment verification request.';
      return new Response(JSON.stringify({ error: message }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const paymentId =
      Array.isArray(data.payments) && data.payments.length > 0 && typeof data.payments[0]?.id === 'string'
        ? data.payments[0].id
        : null;

    return new Response(
      JSON.stringify({
        verified: data.status === 'paid',
        paymentLinkId: data.id,
        paymentLinkStatus: data.status,
        paymentId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to verify Razorpay payment.';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
