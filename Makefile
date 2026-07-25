PNPM := corepack pnpm@11.16.0

.PHONY: setup lint test verify

setup:
	$(PNPM) install --frozen-lockfile

lint:
	$(PNPM) run lint

test:
	$(PNPM) run test:unit

verify:
	$(PNPM) run verify
