'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { generateTwoFactorSecret, enableTwoFactor, disableTwoFactor } from '@/actions/security-actions';
import { toast } from 'sonner';
import { Loader2, QrCode, ShieldCheck, ShieldAlert, Copy, Check, Keyboard } from 'lucide-react';
import QRCode from 'qrcode';

interface SecuritySettingsProps {
  twoFactorEnabled: boolean;
}

export function SecuritySettings({ twoFactorEnabled: initialEnabled }: SecuritySettingsProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, setIsPending] = useState(false);
  const [setupStep, setSetupStep] = useState<'idle' | 'qr' | 'verify'>('idle');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [secret, setSecret] = useState<string>('');
  const [verificationCode, setVerificationCode] = useState('');
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopySecret = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      toast.success('Secret key copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy secret key');
    }
  };

  // Format secret for easier reading (groups of 4)
  const formatSecret = (s: string) => {
    return s.match(/.{1,4}/g)?.join(' ') || s;
  };

  const handleEnableClick = async () => {
    setIsPending(true);
    try {
      const res = await generateTwoFactorSecret();
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (res.otpauth && res.secret) {
        setSecret(res.secret);
        const url = await QRCode.toDataURL(res.otpauth);
        setQrCodeUrl(url);
        setSetupStep('qr');
      }
    } catch (error) {
      toast.error('Failed to generate 2FA secret');
    } finally {
      setIsPending(false);
    }
  };

  const handleVerifyAndEnable = async () => {
    if (!verificationCode) return;
    setIsPending(true);
    try {
      const res = await enableTwoFactor(secret, verificationCode);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success('Two-factor authentication enabled');
        setEnabled(true);
        setSetupStep('idle');
        setVerificationCode('');
      }
    } catch (error) {
      toast.error('Failed to enable 2FA');
    } finally {
      setIsPending(false);
    }
  };

  const handleDisable = async () => {
    setIsPending(true);
    try {
      const res = await disableTwoFactor();
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success('Two-factor authentication disabled');
        setEnabled(false);
      }
    } catch (error) {
      toast.error('Failed to disable 2FA');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <h3 className="text-base font-medium">Two-Factor Authentication</h3>
          <p className="text-sm text-muted-foreground">
            Add an extra layer of security to your account using TOTP apps like Google Authenticator.
          </p>
        </div>
        {enabled ? (
          <div className="flex items-center gap-2 text-green-600">
            <ShieldCheck className="h-5 w-5" />
            <span className="font-medium">Enabled</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-amber-600">
            <ShieldAlert className="h-5 w-5" />
            <span className="font-medium">Disabled</span>
          </div>
        )}
      </div>

      {enabled ? (
        <Button variant="destructive" onClick={handleDisable} disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Disable 2FA
        </Button>
      ) : (
        <div className="space-y-4">
          {setupStep === 'idle' && (
            <Button onClick={handleEnableClick} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Setup 2FA
            </Button>
          )}

          {setupStep === 'qr' && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                1. Scan this QR code with your authenticator app.
              </div>
              <div className="flex justify-center p-4 bg-white rounded-md w-fit mx-auto">
                 {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrCodeUrl} alt="2FA QR Code" className="w-48 h-48" />
              </div>
              
              {/* Manual entry option */}
              <div className="border-t pt-4">
                <button
                  type="button"
                  onClick={() => setShowManualEntry(!showManualEntry)}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Keyboard className="h-4 w-4" />
                  {showManualEntry ? 'Hide manual entry' : "Can't scan? Enter code manually"}
                </button>
                
                {showManualEntry && (
                  <div className="mt-3 p-4 bg-muted/50 rounded-lg space-y-3">
                    <div className="text-sm text-muted-foreground">
                      Enter this key in your authenticator app:
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-2 bg-background border rounded-md font-mono text-sm tracking-wider select-all">
                        {formatSecret(secret)}
                      </code>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={handleCopySecret}
                        className="shrink-0"
                      >
                        {copied ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Account name: <span className="font-medium">Echo</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="text-sm text-muted-foreground">
                2. Enter the 6-digit code from your app to verify.
              </div>
              <div className="flex gap-2">
                <Input
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  placeholder="123456"
                  className="max-w-[200px]"
                  maxLength={6}
                />
                <Button onClick={handleVerifyAndEnable} disabled={isPending || verificationCode.length !== 6}>
                  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Verify & Enable
                </Button>
                <Button variant="ghost" onClick={() => setSetupStep('idle')}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

