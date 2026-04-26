import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RAZORPAY_API_BASE = 'https://api.razorpay.com/v1';
const LIFETIME_UNLOCK_AMOUNT = 29900;
const LIFETIME_UNLOCK_DESCRIPTION = 'Lumina Scan Lifetime Unlock';
const LIFETIME_UNLOCK_NAME = 'Lumina Scan';

const getServerConfig = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const keyId = Deno.env.get('RAZORPAY_KEY_ID');
  const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET');

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey || !keyId || !keySecret) {
    throw new Error('Missing server configuration for Razorpay checkout.');
  }

  return {
    serviceRoleKey,
    supabaseAnonKey,
    supabaseUrl,
    authHeader: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
    keyId,
  };
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
    const body = await request.json().catch(() => ({}));
    const customerName =
      typeof body.customerName === 'string' && body.customerName.trim().length > 0
        ? body.customerName.trim()
        : undefined;
    const customerEmail =
      typeof body.customerEmail === 'string' && body.customerEmail.trim().length > 0
        ? body.customerEmail.trim()
        : undefined;
    const { authHeader, keyId, serviceRoleKey, supabaseAnonKey, supabaseUrl } = getServerConfig();
    const user = await getUserFromRequest(request, supabaseUrl, supabaseAnonKey);
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: existingAccess, error: accessError } = await serviceClient
      .from('payment_access')
      .select('is_unlocked')
      .eq('user_id', user.id)
      .maybeSingle();

    if (accessError) {
      throw new Error(`Unable to check payment access: ${accessError.message}`);
    }

    if (existingAccess?.is_unlocked) {
      return new Response(JSON.stringify({ error: 'Premium access is already active for this account.' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = {
      amount: LIFETIME_UNLOCK_AMOUNT,
      currency: 'INR',
      receipt: `lumina_${crypto.randomUUID().slice(0, 12)}`,
      notes: {
        product: 'luminascan_lifetime_unlock',
        customer_email: customerEmail ?? user.email ?? '',
        customer_name: customerName ?? '',
        user_id: user.id,
      },
    };

    const response = await fetch(`${RAZORPAY_API_BASE}/orders`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        typeof data?.error?.description === 'string'
          ? data.error.description
          : 'Razorpay rejected the order request.';
      return new Response(JSON.stringify({ error: message }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: upsertError } = await serviceClient.from('payment_access').upsert({
      user_id: user.id,
      last_order_id: data.id,
      updated_at: new Date().toISOString(),
    });

    if (upsertError) {
      throw new Error(`Unable to store pending payment order: ${upsertError.message}`);
    }

    return new Response(
      JSON.stringify({
        amount: LIFETIME_UNLOCK_AMOUNT,
        currency: 'INR',
        description: LIFETIME_UNLOCK_DESCRIPTION,
        keyId,
        name: LIFETIME_UNLOCK_NAME,
        orderId: data.id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create Razorpay order.';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
