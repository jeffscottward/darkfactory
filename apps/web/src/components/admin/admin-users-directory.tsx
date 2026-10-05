import type { AdminUserSummaryOutput } from "@darkfactory/api";
import {
  Button,
  buttonVariants,
  Input,
  Label,
  Skeleton,
  StatusBadge,
} from "@darkfactory/ui";
import { RotateCcw, Search } from "lucide-react";
import type { FormEvent } from "react";
import { InlineNotice } from "../inline-notice.tsx";
import type { AdminFailureKind } from "./admin-users-client.ts";

export type AdminUsersDirectoryState =
  | Readonly<{ type: "loading" }>
  | Readonly<{ type: "error"; kind: AdminFailureKind; message: string }>
  | Readonly<{
      type: "ready";
      items: readonly AdminUserSummaryOutput[];
      nextCursor: string | null;
    }>;

export interface AdminUsersDirectoryProps {
  readonly isLoadingMore?: boolean | undefined;
  readonly onClearSearch?: (() => void) | undefined;
  readonly onLoadMore?: (() => void) | undefined;
  readonly onRetry?: (() => void) | undefined;
  readonly onSearch?: ((query: string) => void) | undefined;
  readonly query: string;
  readonly state: AdminUsersDirectoryState;
}

const titleFor = (user: AdminUserSummaryOutput): string => {
  return user.profile?.displayName ?? user.name;
};

const statusTone = (
  status: AdminUserSummaryOutput["status"]
): "success" | "warning" | "neutral" => {
  if (status === "active") return "success";
  if (status === "suspended") return "warning";
  return "neutral";
};

const labelFor = (value: string): string =>
  value.charAt(0).toUpperCase() + value.slice(1);

const SearchForm = ({
  onClearSearch,
  onSearch,
  query,
}: Pick<AdminUsersDirectoryProps, "onClearSearch" | "onSearch" | "query">) => (
  <form
    className="flex flex-col gap-2 sm:flex-row sm:items-end"
    onSubmit={(event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      return onSearch?.(String(formData.get("query") ?? ""));
    }}
    role="search"
  >
    <div className="min-w-0 flex-1 space-y-1">
      <Label htmlFor="admin-user-query">Search users</Label>
      <Input
        defaultValue={query}
        id="admin-user-query"
        key={query}
        maxLength={200}
        name="query"
        placeholder="Search by profile or account fields"
        type="search"
      />
    </div>
    <Button type="submit" variant="secondary">
      <Search aria-hidden="true" className="size-4" />
      Search
    </Button>
    {query.length > 0 ? (
      <Button onClick={onClearSearch} type="button" variant="ghost">
        Clear search
      </Button>
    ) : null}
  </form>
);

const LoadingDirectory = () => (
  <div aria-busy="true" aria-live="polite" className="space-y-1" role="status">
    <span className="sr-only">Loading users</span>
    {["one", "two", "three"].map((key) => (
      <div
        className="flex items-center justify-between gap-3 border-border border-b py-2"
        key={key}
      >
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-6 w-24" />
      </div>
    ))}
  </div>
);

const UserRow = ({ user }: { readonly user: AdminUserSummaryOutput }) => {
  const summary = [user.profile?.jobTitle, user.profile?.businessName]
    .filter(
      (value) => value !== null && value !== undefined && value.length > 0
    )
    .join(" · ");
  return (
    <article
      className="grid min-w-0 gap-2 py-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
      role="listitem"
    >
      <div className="min-w-0 break-words">
        <h3 className="break-words font-heading font-semibold text-foreground text-sm">
          {titleFor(user)}
        </h3>
        {summary.length > 0 ? (
          <p className="break-words text-muted-foreground text-sm">{summary}</p>
        ) : null}
        <p className="text-muted-foreground text-xs">
          {user.emailVerified ? "Email verified" : "Email not verified"} ·
          Account created{" "}
          {user.createdAt.toLocaleDateString("en-US", {
            dateStyle: "medium",
            timeZone: "UTC",
          })}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        <StatusBadge status={user.role === "admin" ? "neutral" : "info"}>
          {labelFor(user.role)}
        </StatusBadge>
        <StatusBadge status={statusTone(user.status)}>
          {labelFor(user.status)}
        </StatusBadge>
      </div>
    </article>
  );
};
export const AdminUsersDirectory = ({
  onClearSearch,
  isLoadingMore = false,
  onLoadMore,
  onRetry,
  onSearch,
  query,
  state,
}: AdminUsersDirectoryProps) => (
  <div className="space-y-3">
    <SearchForm
      onClearSearch={onClearSearch}
      onSearch={onSearch}
      query={query}
    />
    {state.type === "loading" ? (
      <LoadingDirectory />
    ) : state.type === "error" ? (
      <div aria-live="assertive" role="alert">
        <InlineNotice
          action={
            state.kind === "unauthorized" ? (
              <a
                className={buttonVariants({ size: "compact" })}
                href="/sign-in?callbackURL=%2Fsettings%2Fadministration"
              >
                Sign in
              </a>
            ) : state.kind === "forbidden" || state.kind === "not-found" ? (
              <a
                className={buttonVariants({
                  size: "compact",
                  variant: "secondary",
                })}
                href="/dashboard"
              >
                Back to overview
              </a>
            ) : (
              <Button onClick={onRetry} size="compact" variant="secondary">
                <RotateCcw aria-hidden="true" className="size-4" />
                Try again
              </Button>
            )
          }
          message={state.message}
          title="User directory could not be loaded"
        />
      </div>
    ) : state.items.length === 0 ? (
      <div aria-live="polite" role="status">
        {query.length > 0 ? (
          <InlineNotice
            action={
              <Button
                onClick={onClearSearch}
                size="compact"
                variant="secondary"
              >
                Clear search
              </Button>
            }
            title="No users match this search"
          />
        ) : (
          <InlineNotice title="No users" />
        )}
      </div>
    ) : (
      <div className="space-y-2">
        <div
          aria-label="User directory"
          className="divide-y divide-border border-border border-y"
          role="list"
        >
          {state.items.map((user) => (
            <UserRow key={user.id} user={user} />
          ))}
        </div>
        <p
          aria-live="polite"
          className="text-muted-foreground text-xs"
          role="status"
        >
          {state.items.length} {state.items.length === 1 ? "user" : "users"}{" "}
          loaded.{" "}
          {state.nextCursor === null
            ? "End of directory."
            : "More users are available."}
        </p>
        {state.nextCursor === null ? null : (
          <Button
            loading={isLoadingMore}
            loadingLabel="Loading more users"
            onClick={onLoadMore}
            size="compact"
            variant="secondary"
          >
            Load more
          </Button>
        )}
      </div>
    )}
  </div>
);
