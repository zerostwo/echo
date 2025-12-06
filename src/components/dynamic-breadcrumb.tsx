"use client"

import { usePathname, useSearchParams } from "next/navigation"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import React from "react"
import { useBreadcrumb } from "@/context/breadcrumb-context"
import { getFolderPath } from "@/lib/folder-utils"

interface DynamicBreadcrumbProps {
  folders: any[]
}

export function DynamicBreadcrumb({ folders }: DynamicBreadcrumbProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { items: contextItems } = useBreadcrumb()
  
  const getBreadcrumbs = () => {
    // Only use context items for pages that explicitly set them via SetBreadcrumbs
    // This prevents stale breadcrumbs from persisting across navigations
    const shouldUseContextItems = pathname.match(/^\/materials\/[^/]+/) || // /materials/[id]
                                  pathname.match(/^\/listening\//) || // listening pages
                                  pathname.startsWith("/dictionaries") // /dictionaries and /dictionaries/[id]
    
    if (shouldUseContextItems && contextItems && contextItems.length > 0) {
        return contextItems;
    }

    if (pathname === "/dashboard") {
      return [{ title: "Dashboard" }]
    }
    if (pathname === "/vocab") {
      return [{ title: "Vocabulary" }]
    }
    if (pathname === "/learn") {
      return [
        { title: "Vocabulary", href: "/vocab" },
        { title: "Learn" }
      ]
    }
    if (pathname === "/trash") {
      return [{ title: "Trash" }]
    }
    if (pathname === "/settings") {
        return [{ title: "Settings" }]
    }
    if (pathname === "/account") {
        return [{ title: "Account" }]
    }
    if (pathname.startsWith("/admin")) {
        return [{ title: "Admin" }]
    }
    
    if (pathname.startsWith("/materials")) {
      // Handle /materials?folderId=...
      if (pathname === "/materials") {
          const folderId = searchParams.get("folderId")
          if (folderId && folders?.length > 0) {
              // Get full folder path from root to current folder
              const folderPath = getFolderPath(folders, folderId)
              
              const items: { title: string; href?: string }[] = [
                  { title: "Material", href: "/materials" },
              ]
              
              // Add each folder in the path
              folderPath.forEach((folder, index) => {
                const isLast = index === folderPath.length - 1
                if (isLast) {
                  items.push({ title: folder.name })
                } else {
                  items.push({ 
                    title: folder.name, 
                    href: `/materials?folderId=${folder.id}` 
                  })
                }
              })
              
              return items
          }
          return [{ title: "Material" }]
      }
      
      // Handle /materials/[id] -> Material Detail
      // If contextItems are not set yet (server/client mismatch or loading), 
      // fallback to simple "Material Details" or let the page set it.
      // We return minimal fallback here, but SetBreadcrumbs in page should override.
      return [
          { title: "Material", href: "/materials" },
          { title: "Details" } 
      ]
    }
    
    // Default fallback
    return [{ title: "Echo" }]
  }

  const items = getBreadcrumbs()

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {items.map((item, index) => (
          <React.Fragment key={index}>
            <BreadcrumbItem>
               {index === items.length - 1 ? (
                 <BreadcrumbPage>{item.title}</BreadcrumbPage>
               ) : (
                 <BreadcrumbLink href={item.href}>{item.title}</BreadcrumbLink>
               )}
            </BreadcrumbItem>
            {index < items.length - 1 && <BreadcrumbSeparator />}
          </React.Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
