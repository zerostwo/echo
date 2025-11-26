'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { verifyEmail } from '@/actions/verify-email-action';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const REDIRECT_DELAY = 5; // seconds

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const newEmail = searchParams.get('email');
  const type = searchParams.get('type');
  const router = useRouter();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [countdown, setCountdown] = useState(REDIRECT_DELAY);
  const isEmailChange = type === 'change';

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Missing verification token.');
      return;
    }

    verifyEmail(token, newEmail || undefined, type || undefined).then((res) => {
      if (res.success) {
        setStatus('success');
        setSuccessMessage(res.message || 'Email verified successfully!');
      } else {
        setStatus('error');
        setMessage(res.error || 'Verification failed.');
      }
    });
  }, [token, newEmail, type]);

  // Auto redirect countdown
  useEffect(() => {
    if (status === 'success') {
      if (countdown <= 0) {
        router.push(isEmailChange ? '/dashboard' : '/login');
        return;
      }
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [status, countdown, router, isEmailChange]);

  return (
    <Card className="border-none shadow-none w-full max-w-md mx-auto mt-20">
      <CardHeader>
        <CardTitle className="text-center text-2xl font-bold">Email Verification</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        {status === 'verifying' && (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p>Verifying your email...</p>
          </div>
        )}
        {status === 'success' && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <p className="text-green-600 font-medium text-lg">{successMessage}</p>
            <p className="text-sm text-gray-500">
              Redirecting to {isEmailChange ? 'dashboard' : 'login'} in <span className="font-semibold">{countdown}</span> seconds...
            </p>
            <Button onClick={() => router.push(isEmailChange ? '/dashboard' : '/login')} className="mt-2">
              {isEmailChange ? 'Go to Dashboard Now' : 'Go to Login Now'}
            </Button>
          </div>
        )}
        {status === 'error' && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
              <XCircle className="h-10 w-10 text-red-600" />
            </div>
            <p className="text-red-600 font-medium">{message}</p>
            <Button variant="outline" onClick={() => router.push('/login')}>
              Back to Login
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}

