"use client"

import * as React from "react"
import { ChevronRight, File, Folder, LayoutDashboard, Library, Mic2, Settings, Trash2 } from "lucide-react"
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

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user: {
    name?: string | null
    email?: string | null
    image?: string | null
    role?: string
  }
  folders: any[]
  settings?: any
}

export function AppSidebar({ user, folders, settings, ...props }: AppSidebarProps) {
  const pathname = usePathname()

  const navItems = [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: LayoutDashboard,
    },
    {
      title: "Materials",
      icon: Library,
      items: [
        {
          title: "All Materials",
          url: "/materials",
          icon: Library,
        },
        ...(folders?.map(f => ({
          title: f.name,
          url: `/materials?folderId=${f.id}`,
          icon: Folder
        })) || [])
      ]
    },
    {
      title: "Vocabulary",
      url: "/vocab",
      icon: Mic2,
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
    name: user?.name || "User",
    email: user?.email || "",
    avatar: user?.image || "",
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
        defaultOpen={items.some((i: any) => i.url === pathname) || title === "Materials"}
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
