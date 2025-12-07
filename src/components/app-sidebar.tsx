"use client"

import * as React from "react"
import { Book, ChevronRight, LayoutDashboard, Library, WholeWord, Settings, Trash2 } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarRail,
} from "@/components/ui/sidebar"
import { NavUser } from "@/components/nav-user"
import { SidebarFolderTree } from "@/components/sidebar"
import type { Folder } from "@/lib/folder-utils"

interface Material {
  id: string
  title: string
  folderId: string | null
  mimeType?: string
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user: {
    name?: string | null
    email?: string | null
    image?: string | null
    role?: string
    displayName?: string | null
    username?: string | null
    quota?: number
    usedSpace?: number
  }
  settings?: any
  folders?: Folder[]
  materials?: Material[]
}

export function AppSidebar({ user, settings, folders = [], materials = [], ...props }: AppSidebarProps) {
  const pathname = usePathname()

  const navItems = [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: LayoutDashboard,
    },
    {
      title: "Material",
      url: "/materials",
      icon: Library,
    },
    {
      title: "Word",
      url: "/words",
      icon: WholeWord,
    },
    {
      title: "Dictionary",
      url: "/dictionaries",
      icon: Book,
    },
    {
      title: "Trash",
      url: "/trash",
      icon: Trash2,
    },
  ]

  if (user?.role === 'ADMIN') {
    navItems.push({
      title: 'Admin',
      url: '/admin/users',
      icon: Settings,
    })
  }

  const userData = {
    // Username for account form
    username: user?.username || "",
    // Display name for account form (can be empty)
    displayName: user?.displayName || "",
    email: user?.email || "",
    avatar: user?.image || "",
    quota: user?.quota || 10737418240,
    usedSpace: user?.usedSpace || 0,
  }

  return (
    <Sidebar {...props}>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Echo</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item, index) => (
                <Tree key={index} item={item} pathname={pathname} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        
        {/* Folder tree section - Always show for folder organization */}
        <SidebarGroup className="flex-1 min-h-0 overflow-hidden">
          <SidebarFolderTree folders={folders} materials={materials} />
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={userData} settings={settings} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function Tree({ item, pathname }: { item: any, pathname: string }) {
  const { title, url, icon: Icon, items } = item
  const isActive = url === pathname

  if (!items?.length) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={isActive}
          className="data-[active=true]:bg-transparent"
        >
          <Link href={url || "#"}>
            {Icon && <Icon />}
            {title}
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  return (
    <SidebarMenuItem>
      <Collapsible
        className="group/collapsible [&[data-state=open]>button>svg:first-child]:rotate-90"
        defaultOpen={items.some((i: any) => i.url === pathname) || title === "Material"}
      >
        <CollapsibleTrigger asChild>
          <SidebarMenuButton>
            <ChevronRight className="transition-transform" />
            {Icon && <Icon />}
            {title}
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {items.map((subItem: any, index: number) => (
              <Tree key={index} item={subItem} pathname={pathname} />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  )
}
