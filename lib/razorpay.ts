import { supabase } from './supabase';

export interface RazorpayOrderResult {
  amount: number;
  currency: string;
  description: string;
  keyId: string;
  name: string;
  orderId: string;
}

interface CreateOrderParams {
  customerEmail?: string | null;
  customerName?: string | null;
}

interface VerifyPaymentParams {
  orderId: string;
  paymentId: string;
  signature: string;
}

export interface VerifyPaymentResult {
  paymentId: string;
  verified: boolean;
}

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

export const createRazorpayOrder = async ({
  customerEmail,
  customerName,
}: CreateOrderParams): Promise<RazorpayOrderResult> => {
  const { data, error } = await supabase.functions.invoke('razorpay-create-payment-link', {
    body: {
      customerEmail,
      customerName,
    },
  });

  if (error) {
    throw new Error(
      extractFunctionErrorMessage(
        error,
        'Unable to create a Razorpay order right now.'
      )
    );
  }

  if (
    !data ||
    typeof data.orderId !== 'string' ||
    typeof data.keyId !== 'string' ||
    typeof data.amount !== 'number' ||
    typeof data.currency !== 'string' ||
    typeof data.name !== 'string' ||
    typeof data.description !== 'string'
  ) {
    throw new Error('Razorpay order response was incomplete.');
  }

  return data as RazorpayOrderResult;
};

export const verifyRazorpayPayment = async ({
  orderId,
  paymentId,
  signature,
}: VerifyPaymentParams): Promise<VerifyPaymentResult> => {
  const { data, error } = await supabase.functions.invoke('razorpay-verify-payment', {
    body: {
      orderId,
      paymentId,
      signature,
    },
  });

  if (error) {
    throw new Error(
      extractFunctionErrorMessage(
        error,
        'Unable to verify the Razorpay payment right now.'
      )
    );
  }

  if (
    !data ||
    typeof data.verified !== 'boolean' ||
    typeof data.paymentId !== 'string'
  ) {
    throw new Error('Payment verification response was incomplete.');
  }

  return data as VerifyPaymentResult;
};
