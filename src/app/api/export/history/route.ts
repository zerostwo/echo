import { auth } from "@/auth"
import { getAdminClient, APPWRITE_DATABASE_ID, Query } from "@/lib/appwrite"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const admin = getAdminClient();
    const { documents: jobs } = await admin.databases.listDocuments(
        APPWRITE_DATABASE_ID,
        'export_jobs',
        [
            Query.equal('user_id', session.user.id),
            Query.orderDesc('created_at'),
            Query.limit(5)
        ]
    );
    
    const mappedJobs = jobs.map(job => ({
        id: job.$id,
        userId: job.user_id,
        status: job.status,
        options: job.options,
        filePath: job.file_path,
        error: job.error,
        createdAt: job.created_at,
        updatedAt: job.$updatedAt
    }));

    return NextResponse.json(mappedJobs)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
