# syntax=docker/dockerfile:1.7
ARG BUN_BASE_IMAGE
FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS dependencies

WORKDIR /opt/darkfactory-verifier/dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/ ./apps/
COPY packages/ ./packages/
RUN corepack enable \
  && corepack prepare pnpm@11.16.0 --activate \
  && pnpm install --frozen-lockfile --ignore-scripts \
  && rm -rf node_modules/@darkfactory

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
COPY infra/docker/verifier/checks.json ./checks.json
COPY infra/docker/verifier/runner.ts ./runner.ts
RUN chmod 0555 ./runner.ts \
  && chmod 0444 ./checks.json \
  && chmod -R a-w /opt/darkfactory-verifier

USER 65532:65532
ENTRYPOINT []
CMD ["/usr/local/bin/bun","/opt/darkfactory-verifier/runner.ts","--config","/opt/darkfactory-verifier/checks.json","--workspace","/workspace","--output","/output/result.json"]
