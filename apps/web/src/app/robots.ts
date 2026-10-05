export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/account",
        "/account/",
        "/admin/",
        "/api/",
        "/dashboard",
        "/feature-items",
        "/forgot-password",
        "/reset-password",
        "/settings",
        "/settings/",
        "/sign-in",
        "/sign-up",
      ],
    },
  };
}
