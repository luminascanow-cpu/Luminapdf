import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator, ScrollView, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, CheckCircle2, CreditCard, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react-native';
import RazorpayCheckout from 'react-native-razorpay';
import { Palette, Gradients, Radius, Shadows } from '../constants/Theme';
import { FREE_PAGE_LIMIT, FREE_SCAN_LIMIT, ONE_TIME_PAYMENT_LABEL, getUsageGateState } from '../lib/paymentGate';
import { createRazorpayOrder, verifyRazorpayPayment } from '../lib/razorpay';
import { useAuth } from '../hooks/useAuth';

export default function PaymentScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isPaying, setIsPaying] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [usedFreeScans, setUsedFreeScans] = useState(0);
  const [remainingFreeScans, setRemainingFreeScans] = useState(FREE_SCAN_LIMIT);
  const [isFailureModalVisible, setIsFailureModalVisible] = useState(false);
  const [failureTitle, setFailureTitle] = useState('Payment Failed');
  const [failureMessage, setFailureMessage] = useState('We could not complete the payment right now.');
  const [failureHint, setFailureHint] = useState('Please try again in a moment.');

  const loadState = useCallback(async () => {
    try {
      setIsLoading(true);
      const state = await getUsageGateState();
      setIsUnlocked(state.isUnlocked);
      setUsedFreeScans(state.usedFreeScans);
      setRemainingFreeScans(state.remainingFreeScans);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadState();
    }, [loadState])
  );

  useEffect(() => {
    setIsUnlocked(false);
    setUsedFreeScans(0);
    setRemainingFreeScans(FREE_SCAN_LIMIT);
    void loadState();
  }, [loadState, user?.id]);

  const showPaymentFailure = useCallback((title: string, message: string, hint: string) => {
    setFailureTitle(title);
    setFailureMessage(message);
    setFailureHint(hint);
    setIsFailureModalVisible(true);
  }, []);

  const getPaymentFailureCopy = useCallback((error: any) => {
    const description =
      typeof error?.description === 'string' && error.description.trim().length > 0
        ? error.description.trim()
        : null;
    const message =
      typeof error?.message === 'string' && error.message.trim().length > 0
        ? error.message.trim()
        : null;
    const rawError =
      typeof error?.error === 'object' && error.error !== null
        ? error.error
        : null;
    const reason =
      typeof rawError?.reason === 'string' && rawError.reason.trim().length > 0
        ? rawError.reason.trim()
        : null;
    const step =
      typeof rawError?.step === 'string' && rawError.step.trim().length > 0
        ? rawError.step.trim()
        : null;

    const combined = `${description ?? ''} ${message ?? ''} ${reason ?? ''} ${step ?? ''}`.toLowerCase();

    if (combined.includes('payment_cancelled') || combined.includes('payment cancelled')) {
      return {
        title: 'Payment Cancelled',
        message: 'You closed the Razorpay checkout before completing payment.',
        hint: 'Nothing was unlocked. You can start the payment again whenever you are ready.',
      };
    }

    if (combined.includes('network')) {
      return {
        title: 'Connection Problem',
        message: 'We could not reach the payment service right now.',
        hint: 'Please check your internet connection and try again.',
      };
    }

    if (
      combined.includes('bad_request_error') ||
      combined.includes('payment_authentication') ||
      combined.includes('payment_error')
    ) {
      return {
        title: 'Payment Could Not Be Completed',
        message: 'Razorpay could not finish this payment attempt.',
        hint: 'Please retry or use a different payment method.',
      };
    }

    if (description) {
      return {
        title: 'Payment Failed',
        message: description,
        hint: 'No premium access was unlocked for this attempt.',
      };
    }

    if (message) {
      return {
        title: 'Payment Failed',
        message,
        hint: 'No premium access was unlocked for this attempt.',
      };
    }

    return {
      title: 'Payment Failed',
      message: 'We could not complete the payment right now.',
      hint: 'Please try again in a moment.',
    };
  }, []);

  const handlePayment = async () => {
    if (!user) {
      Alert.alert('Sign In Required', 'Please sign in before completing payment.');
      return;
    }

    try {
      setIsPaying(true);
      const order = await createRazorpayOrder({
        customerEmail: user?.email ?? null,
        customerName: user?.user_metadata?.full_name ?? null,
      });

      const result = await RazorpayCheckout.open({
        amount: String(order.amount),
        currency: order.currency,
        description: order.description,
        key: order.keyId,
        name: order.name,
        order_id: order.orderId,
        prefill: {
          email: user?.email ?? '',
          name: user?.user_metadata?.full_name ?? '',
        },
        theme: {
          color: Palette.primary,
        },
      });

      setIsVerifying(true);
      const verification = await verifyRazorpayPayment({
        orderId: result.razorpay_order_id,
        paymentId: result.razorpay_payment_id,
        signature: result.razorpay_signature,
      });

      if (!verification.verified) {
        throw new Error('Razorpay payment verification failed. Please contact support if payment was deducted.');
      }

      await loadState();
      setIsUnlocked(true);

      Alert.alert('Payment Successful', 'Your one-time unlock is active now.', [
        {
          text: 'Continue',
          onPress: () => router.back(),
        },
      ]);
    } catch (error: any) {
      await loadState();
      const failureCopy = getPaymentFailureCopy(error);
      showPaymentFailure(failureCopy.title, failureCopy.message, failureCopy.hint);
    } finally {
      setIsPaying(false);
      setIsVerifying(false);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={Gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <SafeAreaView edges={['top']} style={styles.heroContent}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} color="#FFF" />
          </Pressable>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>One-Time Unlock</Text>
            <Text style={styles.heroTitle}>Upgrade Your Scanning Limit</Text>
            <Text style={styles.heroText}>
              Keep everything unlocked forever with a single payment.
            </Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.statusCard}>
          <Text style={styles.cardTitle}>Current Access</Text>
          {isLoading ? (
            <ActivityIndicator color={Palette.primary} />
          ) : isUnlocked ? (
            <>
              <Text style={styles.unlockedTitle}>Premium unlocked</Text>
              <Text style={styles.cardBody}>You can scan unlimited documents and add unlimited pages per session.</Text>
            </>
          ) : (
            <>
              <Text style={styles.cardBody}>Free plan includes up to {FREE_SCAN_LIMIT} completed scans.</Text>
              <Text style={styles.usageLine}>{usedFreeScans}/{FREE_SCAN_LIMIT} free scans used</Text>
              <Text style={styles.usageLine}>{remainingFreeScans} free scan{remainingFreeScans === 1 ? '' : 's'} remaining</Text>
              <Text style={styles.usageLine}>Up to {FREE_PAGE_LIMIT} pages per scan session</Text>
            </>
          )}
        </View>

        <View style={styles.benefitsCard}>
          <Text style={styles.cardTitle}>Unlock Benefits</Text>
          <View style={styles.benefitRow}>
            <CheckCircle2 size={18} color={Palette.primary} />
            <Text style={styles.benefitText}>Unlimited scan sessions</Text>
          </View>
          <View style={styles.benefitRow}>
            <CheckCircle2 size={18} color={Palette.primary} />
            <Text style={styles.benefitText}>Unlimited pages in a single scan</Text>
          </View>
          <View style={styles.benefitRow}>
            <CheckCircle2 size={18} color={Palette.primary} />
            <Text style={styles.benefitText}>One-time payment, no subscription</Text>
          </View>
        </View>

        <View style={styles.priceCard}>
          <View style={styles.priceBadge}>
            <Sparkles size={16} color="#FFF" />
            <Text style={styles.priceBadgeText}>Lifetime Access</Text>
          </View>
          <Text style={styles.priceValue}>{ONE_TIME_PAYMENT_LABEL}</Text>
          <Text style={styles.priceSub}>One-time payment</Text>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaCard}>
            <CreditCard size={18} color={Palette.primary} />
            <Text style={styles.metaLabel}>Razorpay in-app checkout</Text>
          </View>
          <View style={styles.metaCard}>
            <ShieldCheck size={18} color={Palette.primary} />
            <Text style={styles.metaLabel}>Server-verified payment</Text>
          </View>
        </View>

        {!isUnlocked ? (
          <View style={styles.pendingCard}>
            <Text style={styles.pendingTitle}>Secure checkout</Text>
            <Text style={styles.pendingBody}>
              Continue with Razorpay inside the app. We create a secure order on the server and unlock premium only after payment verification succeeds.
            </Text>
            {isVerifying ? (
              <View style={styles.verifyingRow}>
                <ActivityIndicator color={Palette.primary} />
                <Text style={styles.verifyingText}>Verifying your payment...</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [
            styles.payButton,
            (pressed || isUnlocked || isPaying || isVerifying) && { opacity: 0.88 },
          ]}
          onPress={() => void handlePayment()}
          disabled={isUnlocked || isPaying || isVerifying}
        >
          <LinearGradient colors={Gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.payButtonGradient}>
            {isPaying || isVerifying ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.payButtonText}>{isUnlocked ? 'Already Unlocked' : `Pay ${ONE_TIME_PAYMENT_LABEL}`}</Text>
            )}
          </LinearGradient>
        </Pressable>
      </View>

      <Modal
        visible={isFailureModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsFailureModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setIsFailureModalVisible(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <TriangleAlert size={24} color="#FFF" />
            </View>
            <Text style={styles.modalTitle}>{failureTitle}</Text>
            <Text style={styles.modalBody}>{failureMessage}</Text>
            <Text style={styles.modalHint}>{failureHint}</Text>

            <Pressable
              style={({ pressed }) => [styles.modalPrimaryButton, pressed && { opacity: 0.9 }]}
              onPress={() => setIsFailureModalVisible(false)}
            >
              <LinearGradient
                colors={['#C5164E', '#FF7A45']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.modalPrimaryGradient}
              >
                <Text style={styles.modalPrimaryText}>Try Again</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Palette.background,
  },
  hero: {
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  heroContent: {
    paddingHorizontal: 24,
    paddingBottom: 28,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  heroCopy: {
    marginTop: 20,
    marginBottom: 8,
  },
  heroEyebrow: {
    fontFamily: 'Manrope-Bold',
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  heroTitle: {
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 28,
    color: '#FFF',
    marginTop: 8,
  },
  heroText: {
    fontFamily: 'Manrope-Medium',
    fontSize: 14,
    color: 'rgba(255,255,255,0.82)',
    marginTop: 8,
    lineHeight: 22,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 140,
    gap: 18,
  },
  statusCard: {
    backgroundColor: Palette.surfaceContainerLowest,
    borderRadius: Radius.xxxl,
    padding: 20,
    ...Shadows.ambient,
  },
  cardTitle: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 16,
    color: Palette.onSurface,
    marginBottom: 10,
  },
  unlockedTitle: {
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 22,
    color: Palette.primary,
    marginBottom: 6,
  },
  cardBody: {
    fontFamily: 'Manrope-Medium',
    fontSize: 14,
    color: Palette.onSurfaceVariant,
    lineHeight: 22,
  },
  usageLine: {
    fontFamily: 'Manrope-SemiBold',
    fontSize: 14,
    color: Palette.onSurface,
    marginTop: 8,
  },
  benefitsCard: {
    backgroundColor: Palette.surfaceContainerLowest,
    borderRadius: Radius.xxxl,
    padding: 20,
    ...Shadows.ambient,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  benefitText: {
    flex: 1,
    fontFamily: 'Manrope-SemiBold',
    fontSize: 14,
    color: Palette.onSurface,
  },
  priceCard: {
    backgroundColor: '#08111F',
    borderRadius: Radius.xxxl,
    padding: 24,
    ...Shadows.ambient,
  },
  priceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.full,
  },
  priceBadgeText: {
    fontFamily: 'Manrope-Bold',
    fontSize: 12,
    color: '#FFF',
  },
  priceValue: {
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 36,
    color: '#FFF',
    marginTop: 20,
  },
  priceSub: {
    fontFamily: 'Manrope-Medium',
    fontSize: 14,
    color: 'rgba(255,255,255,0.72)',
    marginTop: 6,
  },
  metaRow: {
    gap: 12,
  },
  metaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Palette.surfaceContainerLowest,
    borderRadius: Radius.xxl,
    padding: 16,
  },
  metaLabel: {
    flex: 1,
    fontFamily: 'Manrope-SemiBold',
    fontSize: 13,
    color: Palette.onSurfaceVariant,
  },
  pendingCard: {
    backgroundColor: Palette.surfaceContainerLowest,
    borderRadius: Radius.xxxl,
    padding: 20,
    ...Shadows.ambient,
  },
  pendingTitle: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 16,
    color: Palette.onSurface,
  },
  pendingBody: {
    marginTop: 8,
    fontFamily: 'Manrope-Medium',
    fontSize: 14,
    lineHeight: 22,
    color: Palette.onSurfaceVariant,
  },
  verifyingRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  verifyingText: {
    fontFamily: 'Manrope-SemiBold',
    fontSize: 13,
    color: Palette.onSurface,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingBottom: 24,
    paddingTop: 12,
    backgroundColor: 'rgba(246,246,255,0.96)',
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(10, 12, 20, 0.45)',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: Radius.xxxl,
    backgroundColor: Palette.surfaceContainerLowest,
    padding: 24,
    alignItems: 'center',
    ...Shadows.ambient,
  },
  modalIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#C5164E',
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 24,
    color: Palette.onSurface,
    textAlign: 'center',
  },
  modalBody: {
    marginTop: 10,
    fontFamily: 'Manrope-SemiBold',
    fontSize: 15,
    lineHeight: 24,
    color: Palette.onSurface,
    textAlign: 'center',
  },
  modalHint: {
    marginTop: 8,
    fontFamily: 'Manrope-Medium',
    fontSize: 14,
    lineHeight: 22,
    color: Palette.onSurfaceVariant,
    textAlign: 'center',
  },
  modalPrimaryButton: {
    width: '100%',
    marginTop: 20,
    borderRadius: Radius.xxl,
    overflow: 'hidden',
  },
  modalPrimaryGradient: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalPrimaryText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 15,
    color: '#FFF',
  },
  payButton: {
    borderRadius: Radius.xxxl,
    overflow: 'hidden',
  },
  payButtonGradient: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payButtonText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 16,
    color: '#FFF',
  },
});
