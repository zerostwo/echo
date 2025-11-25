import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { AppSidebar } from "@/components/app-sidebar";
import { getFolders } from "@/actions/folder-actions";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { DynamicBreadcrumb } from "@/components/dynamic-breadcrumb";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Echo",
  description: "A platform for deep listening and precision learning.",
};

import { BreadcrumbProvider } from "@/context/breadcrumb-context";

// ... existing code ...

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  const folders = await getFolders();

  let userSettings = {};
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { settings: true }
    });
    if (user?.settings) {
      try {
        userSettings = JSON.parse(user.settings);
      } catch (e) {
        console.error("Failed to parse user settings", e);
      }
    }
  }

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased h-full`}
        suppressHydrationWarning
      >
        <BreadcrumbProvider>
        {session?.user ? (
            <SidebarProvider>
                <AppSidebar user={session.user as any} folders={folders} settings={userSettings} />
                <SidebarInset>
                    <header className="flex h-16 shrink-0 items-center gap-2 px-4">
                        <SidebarTrigger className="-ml-1" />
                        <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
                        <DynamicBreadcrumb folders={folders} />
                        <div id="header-actions" className="ml-auto flex items-center gap-2" />
                    </header>
                    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
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
      </body>
    </html>
  );
}
