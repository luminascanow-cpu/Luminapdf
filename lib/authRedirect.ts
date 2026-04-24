import * as Linking from 'expo-linking';
import { EmailOtpType } from '@supabase/supabase-js';
import { supabase } from './supabase';

const supportedOtpTypes = new Set<EmailOtpType>([
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
]);

const getParamsFromUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    const queryParams = new URLSearchParams(parsed.search);
    const hashParams = new URLSearchParams(parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash);

    return {
      accessToken: queryParams.get('access_token') ?? hashParams.get('access_token'),
      refreshToken: queryParams.get('refresh_token') ?? hashParams.get('refresh_token'),
      tokenHash: queryParams.get('token_hash') ?? hashParams.get('token_hash'),
      type: queryParams.get('type') ?? hashParams.get('type'),
      errorCode: queryParams.get('error_code') ?? hashParams.get('error_code'),
      errorDescription:
        queryParams.get('error_description') ?? hashParams.get('error_description'),
    };
  } catch {
    return {
      accessToken: null,
      refreshToken: null,
      tokenHash: null,
      type: null,
      errorCode: null,
      errorDescription: null,
    };
  }
};

export const getAuthRedirectUrl = () => Linking.createURL('/auth/callback');

export const establishSessionFromAuthUrl = async (url: string) => {
  const { accessToken, refreshToken, tokenHash, type, errorCode, errorDescription } =
    getParamsFromUrl(url);

  if (errorCode) {
    throw new Error(errorDescription || 'Authentication link could not be completed.');
  }

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      throw error;
    }

    return;
  }

  if (tokenHash && type && supportedOtpTypes.has(type as EmailOtpType)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });

    if (error) {
      throw error;
    }
  }
};
