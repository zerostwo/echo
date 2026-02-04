import { BUCKETS } from "@/lib/schema";

export function getAppwriteFileViewUrl(
  bucketId: string,
  fileId?: string | null,
  options?: { cacheControl?: string }
) {
  if (!fileId) return null;
  if (/^https?:\/\//i.test(fileId)) return fileId;
  const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
  const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;

  if (!endpoint || !projectId) return null;
  const cacheControl = options?.cacheControl;
  const cacheParam = cacheControl ? `&response-cache-control=${encodeURIComponent(cacheControl)}` : "";
  return `${endpoint}/storage/buckets/${bucketId}/files/${fileId}/view?project=${projectId}${cacheParam}`;
}

export function getMaterialFileViewUrl(fileId?: string | null) {
  return getAppwriteFileViewUrl(BUCKETS.MATERIALS, fileId, {
    cacheControl: "private, max-age=86400, stale-while-revalidate=604800",
  });
}

export function getMaterialFileProxyUrl(materialId?: string | null) {
  if (!materialId) return null;
  return `/api/materials/file?materialId=${encodeURIComponent(materialId)}`;
}

export function getRecordingFileViewUrl(fileId?: string | null) {
  return getAppwriteFileViewUrl(BUCKETS.RECORDINGS, fileId, {
    cacheControl: "private, max-age=86400, stale-while-revalidate=604800",
  });
}
