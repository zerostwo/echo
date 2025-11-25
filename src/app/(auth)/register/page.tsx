'use client';

import { useActionState, useEffect } from 'react';
import { registerUser } from '@/actions/auth-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export default function RegisterPage() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(registerUser, undefined);

  useEffect(() => {
    if (state === 'success') {
      toast.success('Registration successful! Please login.');
      router.push('/login');
    }
  }, [state, router]);

  return (
    <Card className="border-none shadow-none">
      <CardHeader>
        <CardTitle className="text-center text-2xl font-bold">Create Account</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" type="text" required placeholder="Your Name" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required placeholder="user@example.com" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required placeholder="••••••" minLength={6} />
          </div>
          {state && state !== 'success' && (
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

