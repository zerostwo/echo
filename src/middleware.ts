import { withAuth } from "next-auth/middleware"
import { NextFetchEvent, NextRequest, NextResponse } from "next/server"

const authMiddleware = withAuth({
  pages: {
    signIn: '/login',
  },
})
const runAuthMiddleware = authMiddleware as (
  req: NextRequest,
  ev: NextFetchEvent
) => NextResponse

const protectedPrefixes = ["/dashboard", "/materials", "/study", "/words", "/admin", "/trash"]

export default function middleware(req: NextRequest, ev: NextFetchEvent) {
  const start = Date.now()
  const url = new URL(req.url)
  const pathname = url.pathname

  let response: NextResponse
  if (protectedPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    response = runAuthMiddleware(req, ev)
  } else {
    response = NextResponse.next()
  }

  if (pathname.startsWith("/api")) {
    const durationMs = Date.now() - start
    console.log(`[Request] ${req.method} ${pathname} ${durationMs}ms`)
  }

  return response
}

export const config = {
  matcher: ["/dashboard/:path*", "/materials/:path*", "/study/:path*", "/words/:path*", "/admin/:path*", "/trash/:path*", "/api/:path*"],
}
