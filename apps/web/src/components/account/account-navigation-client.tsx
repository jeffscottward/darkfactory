"use client"

import { usePathname } from "next/navigation"

import { AccountNavigation } from "./account-navigation.tsx"

export const AccountNavigationClient = () => (
  <AccountNavigation currentPath={usePathname()} />
)
