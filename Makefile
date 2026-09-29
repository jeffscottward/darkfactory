.PHONY: setup lint test verify

setup:
	bun run setup

lint:
	bun run lint

test:
	bun run test:unit

verify:
	bun run verify
