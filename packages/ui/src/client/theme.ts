// What: Client appearance context: ThemeProvider, useTheme, AppearanceMenuItems and the standalone ThemePicker.
// Used by: apps/web/src/components/theme-controller.tsx, apps/web/src/components/theme-menu.tsx, apps/web/src/components/user-menu.tsx.
// See: packages/ui/src/themes.ts; packages/api/src/contract.ts#ThemePreferenceSchema.
"use client";

import { Palette as PaletteIcon } from "lucide-react";
import {
  createContext,
  createElement,
  Fragment,
  type ReactElement,
  type ReactNode,
  useContext,
  useMemo,
} from "react";

import { IconButton } from "../icon-button.tsx";
import {
  type Appearance,
  type AppearanceOption,
  DENSITY_OPTIONS,
  FONT_SIZE_OPTIONS,
  optionLabel,
  RADIUS_OPTIONS,
  THEME_OPTIONS,
} from "../themes.ts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./dropdown-menu.ts";

export type ThemePreference = Appearance;

export interface ThemeContextValue {
  readonly onPreferenceChange: (preference: Readonly<ThemePreference>) => void;
  readonly preference: Readonly<ThemePreference>;
}

export interface ThemeProviderProps extends ThemeContextValue {
  readonly children: ReactNode;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider = ({
  children,
  onPreferenceChange,
  preference,
}: ThemeProviderProps) => {
  const value = useMemo<ThemeContextValue>(
    () => ({
      onPreferenceChange,
      preference,
    }),
    [
      onPreferenceChange,
      preference.theme,
      preference.fontSize,
      preference.density,
      preference.radius,
    ]
  );

  return createElement(ThemeContext.Provider, { value }, children);
};

export const useTheme = (): ThemeContextValue => {
  const theme = useContext(ThemeContext);
  if (theme === null) throw new Error("ThemeProvider is required.");
  return theme;
};

type AppearanceKey = keyof ThemePreference;

interface AppearanceSetting {
  readonly key: AppearanceKey;
  readonly label: string;
  readonly options: readonly AppearanceOption<string>[];
}

export const APPEARANCE_SETTINGS: readonly AppearanceSetting[] = Object.freeze([
  { key: "theme", label: "Theme", options: THEME_OPTIONS },
  { key: "fontSize", label: "Font size", options: FONT_SIZE_OPTIONS },
  { key: "density", label: "Density", options: DENSITY_OPTIONS },
  { key: "radius", label: "Roundness", options: RADIUS_OPTIONS },
]);

const optionContent = (
  setting: AppearanceSetting,
  option: AppearanceOption<string>
): ReactNode =>
  setting.key === "theme"
    ? createElement(
        "span",
        { className: "flex items-center gap-[0.75rem]" },
        createElement("span", {
          "aria-hidden": "true",
          className: "theme-swatch",
          "data-theme-swatch": option.value,
        }),
        createElement("span", {}, option.label)
      )
    : option.label;

export interface AppearanceMenuItemsProps {
  readonly disabled?: boolean;
  readonly idPrefix: string;
  readonly onPreferenceChange?:
    | ((preference: Readonly<ThemePreference>) => void)
    | undefined;
}

/** Appearance submenus (theme, font size, density, roundness) for use inside any DropdownMenuContent. */
export const AppearanceMenuItems = ({
  disabled = false,
  idPrefix,
  onPreferenceChange,
}: AppearanceMenuItemsProps): ReactElement => {
  const theme = useTheme();
  const selectPreference = onPreferenceChange ?? theme.onPreferenceChange;
  const { preference } = theme;

  const select = (setting: AppearanceSetting, value: string): void => {
    if (disabled) return;
    if (!setting.options.some((option) => option.value === value)) return;
    selectPreference({ ...preference, [setting.key]: value });
  };

  return createElement(
    Fragment,
    {},
    createElement(
      DropdownMenuLabel,
      { id: `${idPrefix}-appearance-label` },
      "Appearance"
    ),
    APPEARANCE_SETTINGS.map((setting) =>
      createElement(
        DropdownMenuSub,
        { key: setting.key },
        createElement(
          DropdownMenuSubTrigger,
          {
            disabled,
            id: `${idPrefix}-${setting.key}-trigger`,
          },
          createElement("span", {}, setting.label),
          createElement(
            "span",
            { className: "ml-auto pl-3 text-xs" },
            optionLabel(setting.options, preference[setting.key])
          )
        ),
        createElement(
          DropdownMenuSubContent,
          {
            "aria-labelledby": `${idPrefix}-${setting.key}-trigger`,
            className:
              "max-h-[calc(100dvh-var(--space-8))] overflow-y-auto overscroll-contain",
          },
          createElement(
            DropdownMenuRadioGroup,
            {
              "aria-label": setting.label,
              onValueChange: (value: string) => select(setting, value),
              value: preference[setting.key],
            },
            setting.options.map((option) =>
              createElement(
                DropdownMenuRadioItem,
                {
                  disabled,
                  key: option.value,
                  value: option.value,
                },
                optionContent(setting, option)
              )
            )
          )
        )
      )
    )
  );
};

export interface ThemePickerProps {
  readonly disabled?: boolean;
  readonly error?: ReactNode;
  readonly idPrefix: string;
  readonly onPreferenceChange?:
    | ((preference: Readonly<ThemePreference>) => void)
    | undefined;
  readonly statusMessage?: ReactNode;
  readonly triggerLabel?: string;
}

/** Standalone appearance menu with an icon trigger, for shells without a user menu. */
export const ThemePicker = ({
  disabled = false,
  error,
  idPrefix,
  onPreferenceChange,
  statusMessage,
  triggerLabel = "Appearance",
}: ThemePickerProps): ReactElement => {
  return createElement(
    DropdownMenu,
    // Non-modal: a modal menu hides the rest of the page with aria-hidden while it stays focusable.
    { modal: false },
    createElement(
      "span",
      {
        "aria-atomic": "true",
        "aria-live": "polite",
        className: "sr-only",
      },
      statusMessage
    ),
    createElement(
      "span",
      {
        "aria-atomic": "true",
        className: "sr-only",
        role: "alert",
      },
      error
    ),
    createElement(
      DropdownMenuTrigger,
      {
        // aria-controls is optional for menu buttons; axe cannot verify it next to aria-haspopup.
        "aria-controls": undefined,
        asChild: true,
        id: `${idPrefix}-trigger`,
      },
      createElement(
        IconButton,
        { "aria-label": triggerLabel, variant: "ghost" },
        createElement(PaletteIcon, { "aria-hidden": "true" })
      )
    ),
    createElement(
      DropdownMenuContent,
      {
        align: "end",
        "aria-labelledby": `${idPrefix}-trigger`,
        className:
          "max-h-[calc(100dvh-var(--space-8))] w-60 overflow-y-auto overscroll-contain",
        id: `${idPrefix}-content`,
      },
      error === undefined || error === null
        ? null
        : createElement(
            "p",
            {
              "aria-hidden": "true",
              className: "px-2 pb-1 text-destructive text-xs",
            },
            error
          ),
      createElement(AppearanceMenuItems, {
        disabled,
        idPrefix,
        onPreferenceChange,
      })
    )
  );
};
