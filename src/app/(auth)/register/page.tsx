'use client';

import { useActionState, useEffect, useState } from 'react';
import { registerUser, resendVerificationEmail } from '@/actions/auth-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import Link from 'next/link';
import { toast } from 'sonner';
import { Loader2, Mail, RefreshCw } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

export default function RegisterPage() {
  const [state, formAction, isPending] = useActionState(registerUser, undefined);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const searchParams = useSearchParams();
  const prefilledEmail = searchParams.get('email') || '';
  const fromLoginUserNotFound = searchParams.get('reason') === 'user_not_found';

  // Cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleResend = async () => {
    if (!registeredEmail || isResending || resendCooldown > 0) return;
    
    setIsResending(true);
    try {
      const result = await resendVerificationEmail(registeredEmail);
      if (result.success) {
        toast.success('Verification email sent! Please check your inbox.');
        setResendCooldown(60); // 60 second cooldown
      } else {
        toast.error(result.error || 'Failed to resend verification email.');
      }
    } catch (error) {
      toast.error('Failed to resend verification email.');
    } finally {
      setIsResending(false);
    }
  };

  if (state === 'verification-needed') {
    return (
      <Card className="border-none shadow-none">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <Mail className="w-8 h-8 text-green-600" />
            </div>
          </div>
          <CardTitle className="text-center text-2xl font-bold">Check Your Email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <Alert className="bg-green-50 text-green-900 border-green-200">
            <AlertDescription>
              Registration successful! We have sent a verification link to your email address. Please check your inbox (and spam folder) to activate your account.
            </AlertDescription>
          </Alert>
          
          <div className="pt-2">
            <p className="text-sm text-gray-500 mb-3">Didn't receive the email?</p>
            <Button 
              variant="outline" 
              onClick={handleResend}
              disabled={isResending || resendCooldown > 0}
              className="gap-2"
            >
              {isResending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : resendCooldown > 0 ? (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Resend in {resendCooldown}s
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Resend Verification Email
                </>
              )}
            </Button>
          </div>

          <div className="pt-4 border-t">
            <div className="text-center text-sm">
              Already verified?{' '}
              <Link href="/login" className="text-blue-600 hover:underline">
                Login
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-none shadow-none">
      <CardHeader>
        <CardTitle className="text-center text-2xl font-bold">Create Account</CardTitle>
      </CardHeader>
      <CardContent>
        {fromLoginUserNotFound && (
          <Alert className="mb-4">
            <AlertDescription>
              We couldn&apos;t find an account for {prefilledEmail || 'that email'}. Create your account below to get started.
            </AlertDescription>
          </Alert>
        )}
        <form 
          action={(formData) => {
            setRegisteredEmail(formData.get('email') as string);
            formAction(formData);
          }} 
          className="space-y-4"
        >
          <div className="grid gap-2">
            <Label htmlFor="username">Username</Label>
            <Input id="username" name="username" type="text" required placeholder="Your username" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input 
              id="email" 
              name="email" 
              type="email" 
              required 
              placeholder="user@example.com" 
              defaultValue={prefilledEmail}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required placeholder="••••••••" minLength={8} />
          </div>
          {state && (
            <Alert variant="destructive">
              <AlertDescription>{state}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? 'Creating account...' : 'Register'}
          </Button>
        </form>
        <div className="mt-4 text-center text-sm">
          Already have an account?{' '}
          <Link href="/login" className="text-blue-600 hover:underline">
            Login
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
