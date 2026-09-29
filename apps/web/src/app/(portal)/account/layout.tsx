import type { ReactNode } from "react"

import { AccountNavigationClient } from "../../../components/account/account-navigation-client.tsx"

export default function AccountLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-portal space-y-8">
      <AccountNavigationClient />
      {children}
  </div>
  )
}
