"use client"

import { useState } from "react"
import { createAuthClient } from "@darkfactory/auth/client"
import { Button, Input, Label } from "@darkfactory/ui"

import { safeOperatorCallbackPath } from "../server/operator-environment.ts"

export type OperatorSignInResult = Readonly<{
  error: unknown | null
}>

export interface OperatorSignInGateway {
  readonly signIn: (email: string, password: string) => Promise<OperatorSignInResult>
}

const browserGateway: OperatorSignInGateway = Object.freeze({
  signIn: async (email: string, password: string) => {
    const result = await createAuthClient().signIn.email({ email, password })
    return { error: result.error ?? null }
  }
})

const replaceBrowserLocation = (destination: string): void => {
  window.location.replace(destination)
}

export interface OperatorSignInProps {
  readonly callbackURL?: string | null
  readonly gateway?: OperatorSignInGateway
  readonly onAuthenticated?: (destination: string) => void
}

export const OperatorSignIn = ({
  callbackURL,
  gateway = browserGateway,
  onAuthenticated = replaceBrowserLocation,
}: OperatorSignInProps) => {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isPending, setIsPending] = useState(false)
  const [failure, setFailure] = useState("")

  return (
    <form
      className="grid gap-5"
      onSubmit={async (event) => {
        event.preventDefault()
        if (isPending) return
        setFailure("")
        setIsPending(true)
        try {
          const result = await gateway.signIn(email.trim(), password)
          if (result.error !== null) {
            setFailure("Sign-in failed. Check the development administrator credentials.")
            return
          }
          return onAuthenticated(safeOperatorCallbackPath(callbackURL))
        }
        catch {
          return setFailure("Sign-in failed. Check the development administrator credentials.")
        }
        finally {
          setIsPending(false)
        }
  }
      }
    >
      <div className="grid gap-2">
        <Label htmlFor="operator-email">Administrator email
        </Label>
        <Input
          autoComplete="email"
          className="min-h-11"
          disabled={isPending}
          id="operator-email"
          inputMode="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="operator-password">Password
        </Label>
        <Input
          autoComplete="current-password"
          className="min-h-11"
          disabled={isPending}
          id="operator-password"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </div>
      {failure.length === 0 ? null : (
        <p className="text-sm font-medium text-destructive" role="alert">{failure}
      </p>
      )}
      <Button className="min-h-11 w-full" disabled={isPending} type="submit">
        {isPending ? "Signing in…" : "Sign in"}
      </Button>
  </form>
  )
}
