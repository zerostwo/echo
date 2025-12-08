import { auth } from "@/auth"
import { createExportJob } from "@/services/export-service"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { include } = body

    if (!include) {
      return NextResponse.json({ error: "Missing options" }, { status: 400 })
    }

    const job = await createExportJob(session.user.id, { include })
    return NextResponse.json(job)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
