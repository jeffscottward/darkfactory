# syntax=docker/dockerfile:1.7
# Verifier base: oven/bun:1.4.2 (multi-arch index), pinned by digest.
# `verifier:image:setup` may override it with another digest-pinned image.
ARG BUN_BASE_IMAGE=oven/bun@sha256:9114c058aeae42162ee16dd5084b95fe9473970bb6bcb5b232ab1630f0546895
FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS dependencies

WORKDIR /opt/darkfactory-verifier/dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/ ./apps/
COPY packages/ ./packages/
# pnpm from its registry tarball, pinned by version and checksum; the version
# matches mise.toml and package.json#packageManager.
ADD --checksum=sha256:3f2a848545f82fce6966f3ecaa8b7d87b5563f901a170e2bd573b02296b382fa https://registry.npmjs.org/pnpm/-/pnpm-11.16.0.tgz /tmp/pnpm.tgz
RUN mkdir /opt/pnpm \
  && tar --extract --gzip --file /tmp/pnpm.tgz --directory /opt/pnpm --strip-components=1 \
  && rm /tmp/pnpm.tgz \
  && node /opt/pnpm/bin/pnpm.mjs install --frozen-lockfile --ignore-scripts \
  && rm -rf node_modules/@darkfactory \
  && chmod -R a+rX /opt/darkfactory-verifier/dependencies

FROM ${BUN_BASE_IMAGE}
ARG VERIFIER_CONFIG_DIGEST
ARG VERIFIER_ARGV_DIGEST
LABEL org.darkfactory.verifier.identity="darkfactory-verify-core-v2" \
      org.darkfactory.verifier.config-digest="${VERIFIER_CONFIG_DIGEST}" \
      org.darkfactory.verifier.argv-digest="${VERIFIER_ARGV_DIGEST}"

USER root
RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/darkfactory-verifier/dependencies
COPY --from=dependencies /opt/darkfactory-verifier/dependencies ./
# pnpm's .bin shims exec `node`, and the runner's clean PATH (runner.ts) holds
# only /usr/local/bin and the system bins, so the pinned Node goes there.
COPY --from=dependencies /usr/local/bin/node /usr/local/bin/node

WORKDIR /opt/darkfactory-verifier
COPY packages/jobs/verifier/checks.json ./checks.json
COPY packages/jobs/verifier/runner.ts ./runner.ts
RUN chmod 0555 ./runner.ts \
  && chmod 0444 ./checks.json \
  && chmod -R a-w /opt/darkfactory-verifier

USER 65532:65532
# Every executable in runner.ts must start under its exact clean environment;
# otherwise each verification would fail on its first check.
RUN env -i HOME=/tmp PATH=/opt/darkfactory-verifier/dependencies/node_modules/.bin:/usr/local/bin:/usr/bin:/bin sh -ec '\
  bin=/opt/darkfactory-verifier/dependencies/node_modules/.bin; \
  for tool in "$bin/biome" "$bin/markdownlint-cli2" "$bin/tsc" "$bin/vitest" \
    /opt/darkfactory-verifier/dependencies/apps/web/node_modules/.bin/vinext \
    /usr/local/bin/bun; do "$tool" --version >/dev/null; done'

ENTRYPOINT []
CMD ["/usr/local/bin/bun","/opt/darkfactory-verifier/runner.ts","--config","/opt/darkfactory-verifier/checks.json","--workspace","/workspace","--output","/output/result.json"]
