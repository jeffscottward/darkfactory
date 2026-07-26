.PHONY: setup lint test verify

setup:
	sh scripts/install-prerequisites.sh

lint:
	bun run lint

test:
	bun run test:unit

verify:
	bun run verify
