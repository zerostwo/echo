'use client';

import { useActionState, useState, useEffect } from 'react';
import { authenticate, resendVerificationEmail } from '@/actions/auth-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import Link from 'next/link';
import { ShieldCheck, MailWarning, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [errorMessage, formAction, isPending] = useActionState(authenticate, undefined);
  const [show2FA, setShow2FA] = useState(false);
  const [showEmailNotVerified, setShowEmailNotVerified] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isResending, setIsResending] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (errorMessage === '2FA_REQUIRED') {
      setShow2FA(true);
      setShowEmailNotVerified(false);
    } else if (errorMessage === 'EMAIL_NOT_VERIFIED') {
      setShowEmailNotVerified(true);
      setShow2FA(false);
    }
  }, [errorMessage]);

  useEffect(() => {
    if (errorMessage === 'USER_NOT_FOUND') {
      const timeout = setTimeout(() => {
        const params = new URLSearchParams();
        if (email) {
          params.set('email', email);
        }
        params.set('reason', 'user_not_found');
        router.push(params.size ? `/register?${params.toString()}` : '/register');
      }, 300);

      return () => clearTimeout(timeout);
    }
  }, [errorMessage, email, router]);

  const handleResendVerification = async () => {
    if (!email || isResending) return;
    setIsResending(true);
    try {
      const result = await resendVerificationEmail(email);
      if (result.success) {
        toast.success('Verification email sent! Please check your inbox.');
      } else {
        toast.error(result.error || 'Failed to send verification email.');
      }
    } catch {
      toast.error('Failed to send verification email.');
    } finally {
      setIsResending(false);
    }
  };

  // Show email not verified state
  if (showEmailNotVerified) {
    return (
      <Card className="border-none shadow-none">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center">
              <MailWarning className="w-8 h-8 text-amber-600" />
            </div>
          </div>
          <CardTitle className="text-center text-2xl font-bold">Email Not Verified</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-gray-600">
            Your email address has not been verified yet. Please check your inbox for the verification link.
          </p>
          <Button 
            onClick={handleResendVerification}
            disabled={isResending}
            className="w-full"
          >
            {isResending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Sending...
              </>
            ) : (
              'Resend Verification Email'
            )}
          </Button>
          <Button 
            variant="outline" 
            onClick={() => {
              setShowEmailNotVerified(false);
              setEmail('');
              setPassword('');
            }}
            className="w-full"
          >
            Back to Login
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-none shadow-none">
      <CardHeader>
        <CardTitle className="text-center text-2xl font-bold">
            {show2FA ? 'Two-Factor Authentication' : 'Login to Echo'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {/* Hidden inputs to preserve credentials during 2FA step */}
          {show2FA && (
            <>
              <input type="hidden" name="email" value={email} />
              <input type="hidden" name="password" value={password} />
              <div className="flex flex-col items-center justify-center space-y-4 py-4">
                <ShieldCheck className="h-12 w-12 text-primary" />
                <div className="space-y-2 w-full">
                  <Label htmlFor="code">Authentication Code</Label>
                  <Input 
                    id="code" 
                    name="code" 
                    type="text" 
                    placeholder="123456" 
                    required 
                    autoFocus
                    autoComplete="one-time-code"
                    maxLength={6}
                    className="text-center text-lg tracking-widest"
                  />
                </div>
              </div>
            </>
          )}

          {!show2FA && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input 
                    id="email" 
                    name="email" 
                    type="email" 
                    required 
                    placeholder="user@example.com" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link href="/forgot-password" className="text-sm text-blue-600 hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <Input 
                    id="password" 
                    name="password" 
                    type="password" 
                    required 
                    placeholder="••••••••" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </>
          )}

          {errorMessage && errorMessage !== '2FA_REQUIRED' && errorMessage !== 'EMAIL_NOT_VERIFIED' && errorMessage !== 'USER_NOT_FOUND' && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}
          
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? (show2FA ? 'Verifying...' : 'Logging in...') : (show2FA ? 'Verify' : 'Login')}
          </Button>
          
          {show2FA && (
             <Button 
                variant="link" 
                type="button" 
                className="w-full" 
                onClick={() => setShow2FA(false)}
             >
                Back to Login
             </Button>
          )}
        </form>
        
        {!show2FA && (
            <div className="mt-4 text-center text-sm">
            Don't have an account?{' '}
            <Link href="/register" className="text-blue-600 hover:underline">
                Register
            </Link>
            </div>
        )}
      </CardContent>
    </Card>
  );
}
