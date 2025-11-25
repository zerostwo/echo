import Link from "next/link";
import { Button } from "@/components/ui/button";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <h1 className="text-6xl font-bold text-blue-900 mb-6">Echo</h1>
      <p className="text-xl text-gray-600 mb-8 max-w-2xl text-center">
        Master any language through intensive listening. Upload audio, transcribe, and practice sentence by sentence.
      </p>
      <div className="flex gap-4">
        <Link href="/login">
          <Button size="lg">Login</Button>
        </Link>
        <Link href="/register">
          <Button variant="outline" size="lg">Register</Button>
        </Link>
      </div>
    </div>
  );
}
