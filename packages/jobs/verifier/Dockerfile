# syntax=docker/dockerfile:1.7
# Verifier base: oven/bun:1.3.14 (multi-arch index), pinned by digest.
# `verifier:image:setup` may override it with another digest-pinned image.
ARG BUN_BASE_IMAGE=oven/bun@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4
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

WORKDIR /opt/darkfactory-verifier
COPY packages/jobs/verifier/checks.json ./checks.json
COPY packages/jobs/verifier/runner.ts ./runner.ts
RUN chmod 0555 ./runner.ts \
  && chmod 0444 ./checks.json \
  && chmod -R a-w /opt/darkfactory-verifier

USER 65532:65532
ENTRYPOINT []
CMD ["/usr/local/bin/bun","/opt/darkfactory-verifier/runner.ts","--config","/opt/darkfactory-verifier/checks.json","--workspace","/workspace","--output","/output/result.json"]
