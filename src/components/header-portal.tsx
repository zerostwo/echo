"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

export function HeaderPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  const container = document.getElementById("header-actions")
  if (!container) return null

  return createPortal(children, container)
}

