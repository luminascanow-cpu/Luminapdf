import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const encoder = new TextEncoder();
const RAZORPAY_API_BASE = 'https://api.razorpay.com/v1';
const LIFETIME_UNLOCK_AMOUNT = 29900;
const LIFETIME_UNLOCK_CURRENCY = 'INR';

const getServerConfig = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const keyId = Deno.env.get('RAZORPAY_KEY_ID');
  const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET');

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey || !keyId || !keySecret) {
    throw new Error('Missing server configuration for payment verification.');
  }

  return {
    authHeader: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
    keySecret,
    serviceRoleKey,
    supabaseAnonKey,
    supabaseUrl,
  };
};

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const createSignature = async (payload: string, secret: string) => {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const digest = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(payload));
  return toHex(digest);
};

const getUserFromRequest = async (request: Request, supabaseUrl: string, supabaseAnonKey: string) => {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    throw new Response(JSON.stringify({ error: 'Missing authorization header.' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new Response(JSON.stringify({ error: 'Unauthorized request.' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return data.user;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { authHeader, keySecret, serviceRoleKey, supabaseAnonKey, supabaseUrl } = getServerConfig();
    const user = await getUserFromRequest(request, supabaseUrl, supabaseAnonKey);
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const body = await request.json().catch(() => ({}));
    const orderId =
      typeof body.orderId === 'string' && body.orderId.trim().length > 0
        ? body.orderId.trim()
        : null;
    const paymentId =
      typeof body.paymentId === 'string' && body.paymentId.trim().length > 0
        ? body.paymentId.trim()
        : null;
    const signature =
      typeof body.signature === 'string' && body.signature.trim().length > 0
        ? body.signature.trim()
        : null;

    if (!orderId || !paymentId || !signature) {
      return new Response(
        JSON.stringify({ error: 'orderId, paymentId and signature are required.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const expectedSignature = await createSignature(`${orderId}|${paymentId}`, keySecret);

    if (signature !== expectedSignature) {
      return new Response(
        JSON.stringify({ paymentId, verified: false, error: 'Invalid Razorpay signature.' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: paymentAccess, error: accessError } = await serviceClient
      .from('payment_access')
      .select('last_order_id, is_unlocked')
      .eq('user_id', user.id)
      .maybeSingle();

    if (accessError) {
      throw new Error(`Unable to load payment access record: ${accessError.message}`);
    }

    if (!paymentAccess?.last_order_id || paymentAccess.last_order_id !== orderId) {
      return new Response(
        JSON.stringify({ paymentId, verified: false, error: 'Payment order does not match the active user.' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const paymentResponse = await fetch(`${RAZORPAY_API_BASE}/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
    });
    const payment = await paymentResponse.json().catch(() => null);

    if (!paymentResponse.ok) {
      const message =
        typeof payment?.error?.description === 'string'
          ? payment.error.description
          : 'Unable to fetch payment details from Razorpay.';
      throw new Error(message);
    }

    const isValidPayment =
      payment?.id === paymentId &&
      payment?.order_id === orderId &&
      payment?.amount === LIFETIME_UNLOCK_AMOUNT &&
      payment?.currency === LIFETIME_UNLOCK_CURRENCY &&
      payment?.status === 'captured' &&
      payment?.captured === true;

    if (!isValidPayment) {
      return new Response(
        JSON.stringify({ paymentId, verified: false, error: 'Payment was not captured for the expected amount and order.' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { error: unlockError } = await serviceClient.from('payment_access').upsert({
      user_id: user.id,
      is_unlocked: true,
      last_order_id: orderId,
      last_payment_id: paymentId,
      unlocked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (unlockError) {
      throw new Error(`Unable to store payment access: ${unlockError.message}`);
    }

    return new Response(
      JSON.stringify({
        paymentId,
        verified: true,
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
