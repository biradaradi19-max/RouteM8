import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
  Lock,
  ArrowRight,
  DollarSign,
  Globe,
} from 'lucide-react';
import { paymentApi, type PaymentOrderInfo } from '../../services/api';
import {
  getStoredCurrency,
  getCurrencyConfig,
  formatCurrency,
} from '../../services/currency';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  deliveryId: string;
  deliveryTitle?: string;
  compensationInr: number;
  currencyCode?: string;
  onPaymentSuccess?: (order: PaymentOrderInfo) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  deliveryId,
  deliveryTitle = 'Delivery Request',
  compensationInr,
  currencyCode,
  onPaymentSuccess,
}) => {
  const [step, setStep] = useState<'summary' | 'processing' | 'success' | 'failed'>('summary');
  const [commissionRate, setCommissionRate] = useState<number>(12);
  const [activeOrder, setActiveOrder] = useState<PaymentOrderInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeQuote, setActiveQuote] = useState<any>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState<boolean>(false);

  const activeCurrency = (currencyCode || getStoredCurrency()).toUpperCase().trim();
  const currencyConfig = getCurrencyConfig(activeCurrency);
  const isInternational = activeCurrency !== 'INR';

  // Base INR paise
  const baseInrPaise = Math.round(compensationInr * 100);

  // Fetch exchange quote if international currency
  useEffect(() => {
    if (!isOpen) return;

    if (isInternational) {
      setIsLoadingQuote(true);
      paymentApi
        .getExchangeQuote({
          sourceAmountMinorUnits: baseInrPaise,
          sourceCurrency: 'INR',
          targetCurrency: activeCurrency,
        })
        .then((res) => {
          if (res.success && res.quote) {
            setActiveQuote(res.quote);
          }
        })
        .catch(() => {})
        .finally(() => {
          setIsLoadingQuote(false);
        });
    } else {
      setActiveQuote(null);
    }
  }, [isOpen, isInternational, baseInrPaise, activeCurrency]);

  // Load commission rate and check if order already exists
  useEffect(() => {
    if (!isOpen) {
      setStep('summary');
      setErrorMessage(null);
      return;
    }

    let isMounted = true;

    async function loadData() {
      try {
        const [commRes, orderRes] = await Promise.all([
          paymentApi.getCommissionRate(),
          paymentApi.getOrder(deliveryId),
        ]);

        if (isMounted) {
          setCommissionRate(commRes.ratePercent);
          if (orderRes.success && orderRes.order) {
            setActiveOrder(orderRes.order);
            if (orderRes.order.status === 'paid' || orderRes.order.status === 'settled') {
              setStep('success');
            }
          }
        }
      } catch {
        // Fallback default
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [isOpen, deliveryId]);

  if (!isOpen) return null;

  // Calculate presentation amounts in selected currency
  const targetMinorUnits = activeQuote ? activeQuote.targetAmountMinorUnits : baseInrPaise;
  const platformShareMinor = Math.round((targetMinorUnits * commissionRate) / 100);
  const transporterShareMinor = targetMinorUnits - platformShareMinor;

  const handlePay = async (simulateFail = false) => {
    setStep('processing');
    setErrorMessage(null);

    try {
      // 1. Create or retrieve payment order
      let order = activeOrder;
      let providerOrderId = order?.providerOrderId;

      if (!order || order.status === 'created') {
        const createRes = await paymentApi.createOrder({
          deliveryId,
          idempotencyKey: `order_${deliveryId}_${Date.now()}`,
          currencyCode: activeCurrency,
          conversionQuoteId: activeQuote?.quoteId,
        });

        if (!createRes.success || !createRes.order) {
          setErrorMessage(createRes.error || 'Failed to initialize payment order');
          setStep('failed');
          return;
        }

        order = createRes.order;
        providerOrderId = createRes.providerOrderId || order.providerOrderId;
        setActiveOrder(order);
      }

      // Simulate network interaction delay
      await new Promise((resolve) => setTimeout(resolve, 600));

      if (simulateFail) {
        setErrorMessage('Simulated bank gateway timeout or rejected transaction.');
        setStep('failed');
        return;
      }

      // 2. Server-side verification (never trust client alone)
      const verifyRes = await paymentApi.verifyPayment({
        providerOrderId: providerOrderId || `mock_order_${Date.now()}`,
        providerPaymentId: `mock_pay_${Date.now()}`,
        paymentSignature: 'mock_valid_signature_sha256',
      });

      if (!verifyRes.success || !verifyRes.order) {
        setErrorMessage(verifyRes.error || 'Server-side payment verification failed');
        setStep('failed');
        return;
      }

      setActiveOrder(verifyRes.order);
      setStep('success');
      onPaymentSuccess?.(verifyRes.order);
    } catch (err: any) {
      setErrorMessage(err.message || 'Payment processing error');
      setStep('failed');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
        {/* Sandbox Notice Banner */}
        <div className={`px-4 py-2 flex items-center justify-between text-xs font-medium border-b ${
          isInternational
            ? 'bg-blue-500/10 border-blue-200/50 text-blue-900'
            : 'bg-amber-500/10 border-amber-200/50 text-amber-800'
        }`}>
          <div className="flex items-center gap-1.5">
            {isInternational ? (
              <>
                <Globe className="w-4 h-4 text-blue-600 shrink-0" />
                <span>INTERNATIONAL SIMULATION — {currencyConfig.code} ({currencyConfig.name})</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                <span>CASHFREE SANDBOX SIMULATION — Test Mode</span>
              </>
            )}
          </div>
          <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
            isInternational ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
          }`}>
            {isInternational ? 'MOCK SANDBOX' : 'NO REAL CHARGES'}
          </span>
        </div>

        {/* Modal Header */}
        <div className="p-5 pb-3 flex items-center justify-between border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-slate-900">Requester Checkout</h3>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                isInternational ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
              }`}>
                {isInternational ? 'Mock Sandbox Provider' : 'Cashfree PG'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">Secure payment escrow simulation for delivery</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6">
          {step === 'summary' && (
            <div className="space-y-5">
              {/* Order Info */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/70">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Item / Trip</span>
                <div className="font-semibold text-slate-800 mt-0.5 text-base">{deliveryTitle}</div>
                <div className="text-xs text-slate-500 font-mono mt-1">Delivery ID: {deliveryId}</div>
              </div>

              {/* International Exchange Rate Notice */}
              {isInternational && (
                <div className="bg-blue-50/60 rounded-xl p-3 border border-blue-200/60 text-xs text-blue-900 flex items-start gap-2">
                  <Globe className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="font-semibold">
                      Exchange Quote: ₹{compensationInr.toFixed(2)} INR → {formatCurrency(targetMinorUnits, activeCurrency, { isMinorUnits: true })}
                    </div>
                    <div className="text-[11px] text-blue-700">
                      Benchmark Rate: 1 INR = {activeQuote?.exchangeRate ?? '...'} {activeCurrency} (Domestic Cashfree routes international payments via sandbox mock)
                    </div>
                  </div>
                </div>
              )}

              {/* Financial Breakdown Card */}
              <div className="bg-emerald-50/40 rounded-xl p-4 border border-emerald-100 space-y-2.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600 font-medium">Total Delivery Compensation</span>
                  <span className="font-bold text-slate-900">
                    {formatCurrency(targetMinorUnits, activeCurrency, { isMinorUnits: true })}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-emerald-100/60">
                  <div className="flex items-center gap-1">
                    <span>RouteM8 Marketplace Fee ({commissionRate}%)</span>
                    {commissionRate === 0 && (
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-semibold px-1 rounded">Beta 0%</span>
                    )}
                  </div>
                  <span className="font-mono font-medium">
                    {formatCurrency(platformShareMinor, activeCurrency, { isMinorUnits: true })}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Transporter Net Share ({100 - commissionRate}%)</span>
                  <span className="font-mono font-semibold text-emerald-700">
                    {formatCurrency(transporterShareMinor, activeCurrency, { isMinorUnits: true })}
                  </span>
                </div>
              </div>

              {/* Payment Methods Simulation */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Payment Method</label>
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-3 border-2 border-emerald-600 bg-emerald-50/50 rounded-xl text-center cursor-pointer">
                    <DollarSign className="w-5 h-5 mx-auto text-emerald-600 mb-1" />
                    <span className="text-xs font-bold text-slate-800 block">
                      {isInternational ? 'Sandbox Card' : 'UPI Mock'}
                    </span>
                    <span className="text-[10px] text-slate-400">Instant</span>
                  </div>
                  <div className="p-3 border border-slate-200 rounded-xl text-center opacity-60">
                    <CreditCard className="w-5 h-5 mx-auto text-slate-500 mb-1" />
                    <span className="text-xs font-bold text-slate-700 block">Card</span>
                    <span className="text-[10px] text-slate-400">Sandbox</span>
                  </div>
                  <div className="p-3 border border-slate-200 rounded-xl text-center opacity-60">
                    <Lock className="w-5 h-5 mx-auto text-slate-500 mb-1" />
                    <span className="text-xs font-bold text-slate-700 block">NetBanking</span>
                    <span className="text-[10px] text-slate-400">Test</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-2 space-y-2">
                <button
                  onClick={() => handlePay(false)}
                  disabled={isLoadingQuote}
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-semibold rounded-xl shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition disabled:opacity-50"
                >
                  <span>Authorize & Pay {formatCurrency(targetMinorUnits, activeCurrency, { isMinorUnits: true })}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => handlePay(true)}
                  className="w-full py-2 px-3 text-xs text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition text-center"
                >
                  Test Payment Failure Simulation
                </button>
              </div>
            </div>
          )}

          {step === 'processing' && (
            <div className="py-12 text-center space-y-4">
              <div className="relative w-16 h-16 mx-auto">
                <RefreshCw className="w-16 h-16 text-emerald-600 animate-spin" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-slate-800">Verifying Sandbox Payment</h4>
                <p className="text-xs text-slate-500">Contacting server payment gateway adapter...</p>
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="py-6 text-center space-y-4">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h4 className="text-lg font-bold text-slate-900">Payment Successfully Verified</h4>
                <p className="text-xs text-slate-500">
                  {formatCurrency(targetMinorUnits, activeCurrency, { isMinorUnits: true })} is held in marketplace escrow until delivery handover.
                </p>
              </div>

              {activeOrder && (
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 text-left text-xs space-y-1.5 font-mono">
                  <div className="flex justify-between text-slate-600">
                    <span>Order Reference:</span>
                    <span className="font-semibold text-slate-800">{activeOrder.providerOrderId || activeOrder._id}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Currency:</span>
                    <span className="font-semibold text-slate-800">{activeOrder.currency || activeCurrency}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Transporter Share:</span>
                    <span className="font-semibold text-emerald-600">
                      {formatCurrency(activeOrder.commissionSnapshot.partnerSharePaise, activeCurrency, { isMinorUnits: true })}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Platform Commission:</span>
                    <span>
                      {formatCurrency(activeOrder.commissionSnapshot.platformSharePaise, activeCurrency, { isMinorUnits: true })}
                    </span>
                  </div>
                </div>
              )}

              <button
                onClick={onClose}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl transition"
              >
                Done
              </button>
            </div>
          )}

          {step === 'failed' && (
            <div className="py-6 text-center space-y-4">
              <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h4 className="text-lg font-bold text-slate-900">Payment Unsuccessful</h4>
                <p className="text-xs text-rose-600 max-w-sm mx-auto">
                  {errorMessage || 'The simulated payment was rejected or failed verification.'}
                </p>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  onClick={() => setStep('summary')}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition"
                >
                  Back to Summary
                </button>
                <button
                  onClick={() => handlePay(false)}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Retry Payment</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
