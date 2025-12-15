import { auth } from "@/auth"
import { createImportJob } from "@/services/import-service"
import { getAdminClient } from "@/lib/appwrite"
import { NextResponse } from "next/server"
import { InputFile } from "node-appwrite/file"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get("file") as File
    const mode = formData.get("mode") as "merge" | "overwrite"

    if (file === null || mode === null) {
      return NextResponse.json({ error: "Missing file or mode" }, { status: 400 })
    }

    const admin = getAdminClient();
    const buffer = Buffer.from(await file.arrayBuffer())
    const filename = `${Date.now()}-${file.name}`;

    const inputFile = InputFile.fromBuffer(buffer, filename);
    
    const uploadedFile = await admin.storage.createFile(
        'exports',
        'unique()',
        inputFile
    );

    const job = await createImportJob(session.user.id, uploadedFile.$id, mode)
    return NextResponse.json(job)
  } catch (error: any) {
    console.error("Import upload error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
