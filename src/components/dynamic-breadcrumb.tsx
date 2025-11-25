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

interface DynamicBreadcrumbProps {
  folders: any[]
}

export function DynamicBreadcrumb({ folders }: DynamicBreadcrumbProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { items: contextItems } = useBreadcrumb()
  
  const getBreadcrumbs = () => {
    // If context items are set (e.g. from Material Detail page), use them
    if (contextItems && contextItems.length > 0) {
        return contextItems;
    }

    if (pathname === "/dashboard") {
      return [{ title: "Dashboard" }]
    }
    if (pathname === "/vocab") {
      return [{ title: "Vocabulary" }]
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
          if (folderId) {
              const folder = folders?.find((f: any) => f.id === folderId)
              return [
                  { title: "Materials", href: "/materials" },
                  { title: folder ? folder.name : "Folder" }
              ]
          }
          return [{ title: "Materials" }]
      }
      
      // Handle /materials/[id] -> Material Detail
      // If contextItems are not set yet (server/client mismatch or loading), 
      // fallback to simple "Material Details" or let the page set it.
      // We return minimal fallback here, but SetBreadcrumbs in page should override.
      return [
          { title: "Materials", href: "/materials" },
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
