import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator, ScrollView, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, CheckCircle2, CreditCard, ShieldCheck, Sparkles } from 'lucide-react-native';
import { Palette, Gradients, Radius, Shadows } from '../constants/Theme';
import { FREE_PAGE_LIMIT, FREE_SCAN_LIMIT, ONE_TIME_PAYMENT_LABEL, getUsageGateState } from '../lib/paymentGate';
import { setPaymentUnlocked } from '../lib/storage';
import { createRazorpayPaymentLink, verifyRazorpayPaymentLink } from '../lib/razorpay';
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
  const [pendingPaymentLinkId, setPendingPaymentLinkId] = useState<string | null>(null);

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

  const handlePayment = async () => {
    try {
      setIsPaying(true);
      const paymentLink = await createRazorpayPaymentLink({
        customerEmail: user?.email ?? null,
        customerName: user?.user_metadata?.full_name ?? null,
      });

      setPendingPaymentLinkId(paymentLink.paymentLinkId);

      const canOpenCheckout = await Linking.canOpenURL(paymentLink.shortUrl);
      if (!canOpenCheckout) {
        throw new Error('This device could not open the Razorpay checkout link.');
      }

      await Linking.openURL(paymentLink.shortUrl);
    } catch (error: any) {
      Alert.alert('Payment Failed', error?.message || 'We could not complete the payment right now.');
    } finally {
      setIsPaying(false);
    }
  };

  const handleVerifyPayment = async () => {
    if (!pendingPaymentLinkId) {
      Alert.alert('No Payment In Progress', 'Start the Razorpay checkout first, then come back to verify it.');
      return;
    }

    try {
      setIsVerifying(true);
      const result = await verifyRazorpayPaymentLink(pendingPaymentLinkId);

      if (!result.verified) {
        Alert.alert(
          'Payment Pending',
          'Razorpay still shows this payment as pending. Complete the checkout, then tap verify again.'
        );
        return;
      }

      await setPaymentUnlocked(true);
      setIsUnlocked(true);
      setPendingPaymentLinkId(null);
      await loadState();

      Alert.alert('Payment Successful', 'Your one-time unlock is active now.', [
        {
          text: 'Continue',
          onPress: () => router.back(),
        },
      ]);
    } catch (error: any) {
      Alert.alert('Verification Failed', error?.message || 'We could not verify the Razorpay payment.');
    } finally {
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
            <Text style={styles.metaLabel}>Razorpay hosted checkout</Text>
          </View>
          <View style={styles.metaCard}>
            <ShieldCheck size={18} color={Palette.primary} />
            <Text style={styles.metaLabel}>Verified before local unlock</Text>
          </View>
        </View>

        {pendingPaymentLinkId ? (
          <View style={styles.pendingCard}>
            <Text style={styles.pendingTitle}>Checkout started</Text>
            <Text style={styles.pendingBody}>
              Complete the Razorpay test payment in your browser, then come back here and verify it to unlock unlimited scans.
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.verifyButton,
                (pressed || isVerifying) && { opacity: 0.88 },
              ]}
              onPress={() => void handleVerifyPayment()}
              disabled={isVerifying}
            >
              <LinearGradient
                colors={Gradients.primary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.verifyButtonGradient}
              >
                {isVerifying ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.verifyButtonText}>I Completed Payment</Text>
                )}
              </LinearGradient>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [
            styles.payButton,
            (pressed || isUnlocked || isPaying) && { opacity: 0.88 },
          ]}
          onPress={() => void handlePayment()}
          disabled={isUnlocked || isPaying}
        >
          <LinearGradient colors={Gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.payButtonGradient}>
            {isPaying ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.payButtonText}>{isUnlocked ? 'Already Unlocked' : `Pay ${ONE_TIME_PAYMENT_LABEL}`}</Text>
            )}
          </LinearGradient>
        </Pressable>
      </View>
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
  verifyButton: {
    marginTop: 16,
    borderRadius: Radius.xxl,
    overflow: 'hidden',
  },
  verifyButtonGradient: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  verifyButtonText: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 15,
    color: '#FFF',
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
