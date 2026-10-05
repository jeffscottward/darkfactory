// What: Appearance tab form: theme, font size, density and roundness as radio groups that apply and save on change.
// Used by: apps/web/src/app/(portal)/settings/appearance/page.tsx.
// See: apps/web/src/components/theme-menu.tsx#useAppearanceSelection; packages/ui/src/client/theme.ts#APPEARANCE_SETTINGS.
"use client";

import { cn } from "@darkfactory/ui";
import {
  APPEARANCE_SETTINGS,
  type ThemePreference,
  useTheme,
} from "@darkfactory/ui/client/theme";

import { useState } from "react";

import { useAppearanceSelection } from "../theme-menu.tsx";

export const AppearanceSettings = () => {
  const { preference: saved } = useTheme();
  const selection = useAppearanceSelection();
  // A trusted save applies after the server confirms it. Show the chosen
  // option as checked while the save is in flight, then the saved value.
  const [chosen, setChosen] = useState<Readonly<ThemePreference> | null>(null);
  const preference = selection.disabled && chosen !== null ? chosen : saved;

  return (
    <div className="space-y-6" id="appearance-settings">
      <p aria-atomic="true" aria-live="polite" className="sr-only">
        {selection.statusMessage}
      </p>
      {selection.error === null ? null : (
        <p className="text-destructive text-sm" role="alert">
          {selection.error}
        </p>
      )}
      {APPEARANCE_SETTINGS.map((setting) => (
        <fieldset
          className="min-w-0 space-y-2"
          disabled={selection.disabled}
          key={setting.key}
        >
          <legend className="mb-2 font-medium text-foreground text-sm">
            {setting.label}
          </legend>
          <div
            className={cn(
              "grid gap-2",
              setting.key === "theme"
                ? "sm:grid-cols-2 lg:grid-cols-3"
                : "grid-cols-2 sm:grid-cols-4"
            )}
          >
            {setting.options.map((option) => {
              const id = `appearance-${setting.key}-${option.value}`;
              const next: Readonly<ThemePreference> = {
                ...preference,
                [setting.key]: option.value,
              };
              return (
                <label
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-foreground text-sm transition-colors duration-base ease-out hover:bg-accent has-[:disabled]:cursor-not-allowed has-[:checked]:border-primary has-[:disabled]:opacity-60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background"
                  htmlFor={id}
                  key={option.value}
                >
                  <input
                    checked={preference[setting.key] === option.value}
                    className="size-4 shrink-0 accent-primary focus-visible:outline-none"
                    id={id}
                    name={`appearance-${setting.key}`}
                    onChange={() => {
                      setChosen(next);
                      selection.select(next);
                    }}
                    type="radio"
                    value={option.value}
                  />
                  {setting.key === "theme" ? (
                    <span
                      aria-hidden="true"
                      className="theme-swatch"
                      data-theme-swatch={option.value}
                    />
                  ) : null}
                  <span className="min-w-0 truncate">{option.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
};
