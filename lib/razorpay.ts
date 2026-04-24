import { Buffer } from 'buffer';
import { supabase } from './supabase';

export interface CreatePaymentLinkResult {
  paymentLinkId: string;
  paymentLinkStatus: string;
  shortUrl: string;
}

export interface VerifyPaymentLinkResult {
  verified: boolean;
  paymentLinkId: string;
  paymentLinkStatus: string;
  paymentId?: string | null;
}

interface CreatePaymentLinkParams {
  customerName?: string | null;
  customerEmail?: string | null;
}

const razorpayKeyId = process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID || '';
const razorpayKeySecret = process.env.EXPO_PUBLIC_RAZORPAY_KEY_SECRET || '';
const razorpayApiBase = 'https://api.razorpay.com/v1';
const razorpayPaymentAmount = 29900;

const canUseDirectRazorpayFallback =
  razorpayKeyId.trim().length > 0 && razorpayKeySecret.trim().length > 0;

const extractFunctionErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }

  return fallback;
};

const getDirectRazorpayAuthHeader = () =>
  `Basic ${Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64')}`;

const directCreatePaymentLink = async ({
  customerEmail,
  customerName,
}: CreatePaymentLinkParams): Promise<CreatePaymentLinkResult> => {
  const response = await fetch(`${razorpayApiBase}/payment_links`, {
    method: 'POST',
    headers: {
      Authorization: getDirectRazorpayAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: razorpayPaymentAmount,
      currency: 'INR',
      accept_partial: false,
      description: 'LuminaScan Lifetime Unlock',
      reminder_enable: false,
      notify: {
        sms: false,
        email: Boolean(customerEmail),
      },
      customer: {
        name: customerName || undefined,
        email: customerEmail || undefined,
      },
      notes: {
        product: 'luminascan_lifetime_unlock',
      },
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof data?.error?.description === 'string'
        ? data.error.description
        : 'Razorpay rejected the payment request.';
    throw new Error(message);
  }

  if (
    !data ||
    typeof data.id !== 'string' ||
    typeof data.status !== 'string' ||
    typeof data.short_url !== 'string'
  ) {
    throw new Error('Razorpay returned an incomplete payment link response.');
  }

  return {
    paymentLinkId: data.id,
    paymentLinkStatus: data.status,
    shortUrl: data.short_url,
  };
};

const directVerifyPaymentLink = async (
  paymentLinkId: string
): Promise<VerifyPaymentLinkResult> => {
  const response = await fetch(`${razorpayApiBase}/payment_links/${paymentLinkId}`, {
    method: 'GET',
    headers: {
      Authorization: getDirectRazorpayAuthHeader(),
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof data?.error?.description === 'string'
        ? data.error.description
        : 'Razorpay rejected the payment verification request.';
    throw new Error(message);
  }

  return {
    verified: data?.status === 'paid',
    paymentLinkId: typeof data?.id === 'string' ? data.id : paymentLinkId,
    paymentLinkStatus: typeof data?.status === 'string' ? data.status : 'unknown',
    paymentId:
      Array.isArray(data?.payments) && typeof data.payments[0]?.id === 'string'
        ? data.payments[0].id
        : null,
  };
};

export const createRazorpayPaymentLink = async ({
  customerEmail,
  customerName,
}: CreatePaymentLinkParams): Promise<CreatePaymentLinkResult> => {
  const { data, error } = await supabase.functions.invoke('razorpay-create-payment-link', {
    body: {
      customerEmail,
      customerName,
    },
  });

  if (error) {
    if (canUseDirectRazorpayFallback) {
      return directCreatePaymentLink({ customerEmail, customerName });
    }

    throw new Error(
      extractFunctionErrorMessage(
        error,
        'Unable to create Razorpay payment link right now. Deploy the Supabase payment functions or configure the direct test fallback.'
      )
    );
  }

  if (
    !data ||
    typeof data.paymentLinkId !== 'string' ||
    typeof data.shortUrl !== 'string' ||
    typeof data.paymentLinkStatus !== 'string'
  ) {
    throw new Error('Payment link response was incomplete.');
  }

  return data as CreatePaymentLinkResult;
};

export const verifyRazorpayPaymentLink = async (
  paymentLinkId: string
): Promise<VerifyPaymentLinkResult> => {
  const { data, error } = await supabase.functions.invoke('razorpay-verify-payment', {
    body: {
      paymentLinkId,
    },
  });

  if (error) {
    if (canUseDirectRazorpayFallback) {
      return directVerifyPaymentLink(paymentLinkId);
    }

    throw new Error(
      extractFunctionErrorMessage(
        error,
        'Unable to verify Razorpay payment right now. Deploy the Supabase payment functions or configure the direct test fallback.'
      )
    );
  }

  if (
    !data ||
    typeof data.paymentLinkId !== 'string' ||
    typeof data.paymentLinkStatus !== 'string' ||
    typeof data.verified !== 'boolean'
  ) {
    throw new Error('Payment verification response was incomplete.');
  }

  return data as VerifyPaymentLinkResult;
};
