import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { auth } from "@/auth";
import { getAdminClient, APPWRITE_DATABASE_ID, Query } from "@/lib/appwrite";
import { AppSidebar } from "@/components/app-sidebar";
import { getFolders } from "@/actions/folder-actions";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { DynamicBreadcrumb } from "@/components/dynamic-breadcrumb";
import { BreadcrumbProvider } from "@/context/breadcrumb-context";
import { UserSettingsProvider } from "@/components/user-settings-provider";
import { headers } from "next/headers";
import Script from "next/script";
import { siteConfig } from "@/config/site";
import { QueryProvider } from "@/components/query-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: siteConfig.name,
  description: siteConfig.description,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  const folders = await getFolders();
  const umamiWebsiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  const umamiScriptUrl = process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL || "https://cloud.umami.is/script.js";
  
  // Get pathname from middleware header
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') || '';
  
  // Auth pages should not show sidebar even if user is logged in
  const authPaths = ['/login', '/register', '/verify-email', '/forgot-password', '/reset-password'];
  const isAuthPage = authPaths.some(path => pathname.startsWith(path));

  let userSettings = {};
  let twoFactorEnabled = false;
  let displayName: string | null = null;
  let username: string | null = null;
  let userImage: string | null = null;
  let quota: number = 10737418240; // 10GB default
  let usedSpace: number = 0;
  let materials: { id: string; title: string; folderId: string | null; mimeType?: string }[] = [];
  
  if (session?.user?.id) {
    const admin = getAdminClient();
    try {
        const user = await admin.databases.getDocument(
            APPWRITE_DATABASE_ID,
            'users',
            session.user.id
        );

        if (user) {
          twoFactorEnabled = user.two_factor_enabled || false;
          displayName = user.display_name;
          username = user.username;
          userImage = user.image;
          quota = Number(user.quota) || 10737418240;
          usedSpace = Number(user.used_space) || 0;
          if (user.settings) {
            try {
              userSettings = typeof user.settings === 'string' ? JSON.parse(user.settings) : user.settings;
            } catch (e) {
              console.error("Failed to parse user settings", e);
            }
          }
        }
        
        // Fetch materials for the add materials dialog
        const { documents: materialsList } = await admin.databases.listDocuments(
            APPWRITE_DATABASE_ID,
            'materials',
            [
                Query.equal('user_id', session.user.id),
                Query.isNull('deleted_at'),
                Query.orderAsc('title')
            ]
        );
        
        if (materialsList) {
          materials = materialsList.map(m => ({
            id: m.$id,
            title: m.title,
            folderId: m.folder_id,
            mimeType: m.mime_type,
          }));
        }
    } catch (e) {
        console.error("Failed to fetch user data in layout", e);
    }
  }
  
  // Show sidebar only for logged in users on non-auth pages
  const showSidebar = session?.user && !isAuthPage;

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased h-full`}
        suppressHydrationWarning
      >
        {umamiWebsiteId && (
          <Script
            async
            defer
            src={umamiScriptUrl}
            data-website-id={umamiWebsiteId}
          />
        )}
        <QueryProvider>
          <UserSettingsProvider initialSettings={userSettings}>
            <BreadcrumbProvider>
            {showSidebar ? (
                <SidebarProvider>
                    <AppSidebar 
                      user={{ 
                          ...session.user, 
                          image: userImage || session.user.image,
                          twoFactorEnabled, 
                          displayName, 
                          username, 
                          quota, 
                          usedSpace 
                      } as any} 
                      settings={userSettings}
                      folders={folders}
                      materials={materials}
                    />
                    <SidebarInset>
                        <header className="flex h-16 shrink-0 items-center gap-2 pl-4 pr-12 sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                            <SidebarTrigger className="-ml-1" />
                            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
                            <DynamicBreadcrumb folders={folders} />
                            <div id="header-actions" className="ml-auto flex items-center gap-2 pointer-events-auto" />
                        </header>
                        <div className="flex flex-1 flex-col gap-4 px-12 pt-0 pb-4">
                            {children}
                        </div>
                    </SidebarInset>
                </SidebarProvider>
            ) : (
                <main className="h-full">
                    {children}
                </main>
            )}
            <Toaster />
            </BreadcrumbProvider>
          </UserSettingsProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
