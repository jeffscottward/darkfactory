ALTER TABLE "user_preferences" DROP CONSTRAINT "user_preferences_mode_check";--> statement-breakpoint
ALTER TABLE "user_preferences" DROP CONSTRAINT "user_preferences_color_scheme_check";--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "theme" text DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "font_size" text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "density" text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "radius" text DEFAULT 'small' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" DROP COLUMN "mode";--> statement-breakpoint
ALTER TABLE "user_preferences" DROP COLUMN "color_scheme";--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_theme_check" CHECK ("user_preferences"."theme" in (
        'system', 'default-dark', 'default-light', 'tokyo-night',
        'catppuccin-mocha', 'catppuccin-latte', 'gruvbox-dark', 'nord',
        'everforest', 'rose-pine', 'kanagawa'
      ));--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_font_size_check" CHECK ("user_preferences"."font_size" in ('small', 'default', 'large'));--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_density_check" CHECK ("user_preferences"."density" in ('compact', 'default', 'comfortable'));--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_radius_check" CHECK ("user_preferences"."radius" in ('none', 'small', 'medium', 'large'));