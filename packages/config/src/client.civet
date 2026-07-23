export const CANONICAL_APP_URL = "https://darkfactory.localhost" as const

export type AppEnvironment = "development" | "test" | "production"

export type ClientEnvironmentSource = Readonly<{
  APP_ENV: AppEnvironment
  APP_URL: string
  APP_NAME: string
}>

export type ClientEnv = ClientEnvironmentSource

export const toClientEnv = (env: ClientEnvironmentSource): ClientEnv => ({
  APP_ENV: env.APP_ENV,
  APP_URL: env.APP_URL,
  APP_NAME: env.APP_NAME,
})
