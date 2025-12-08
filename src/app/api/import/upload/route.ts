import { auth } from "@/auth"
import { createImportJob } from "@/services/import-service"
import { supabaseAdmin } from "@/lib/supabase"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get("file") as File
    const mode = formData.get("mode") as "merge" | "overwrite"

    if (!file || !mode) {
      return NextResponse.json({ error: "Missing file or mode" }, { status: 400 })
    }

    if (!supabaseAdmin) {
        return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const filePath = `imports/${session.user.id}/${Date.now()}-${file.name}`

    const { error: uploadError } = await supabaseAdmin.storage
      .from("exports")
      .upload(filePath, buffer, {
        contentType: "application/zip",
        upsert: true
      })

    if (uploadError) {
      throw uploadError
    }

    const job = await createImportJob(session.user.id, filePath, mode)
    return NextResponse.json(job)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
