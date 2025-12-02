import { auth } from "@/auth"
import { DashboardContent } from "@/components/dashboard"
import { redirect } from "next/navigation"

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  return <DashboardContent />
}
