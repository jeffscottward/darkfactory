ALTER TABLE "user_preferences" DROP CONSTRAINT "user_preferences_theme_check";--> statement-breakpoint
ALTER TABLE "user_preferences" ALTER COLUMN "radius" SET DEFAULT 'medium';--> statement-breakpoint
UPDATE "user_preferences" SET "theme" = 'system' WHERE "theme" in ('catppuccin-mocha', 'catppuccin-latte', 'gruvbox-dark', 'nord', 'everforest', 'rose-pine', 'kanagawa');--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_theme_check" CHECK ("user_preferences"."theme" in (
        'system', 'default-light', 'default-dark', 'graphite', 'dracula',
        'monokai', 'tokyo-night', 'one-dark', 'night-owl', 'synthwave-84',
        'github-dark', 'github-light'
      ));