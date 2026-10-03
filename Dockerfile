# syntax=docker/dockerfile:1
# Lyra browser build image. Multi-stage, rootless builder.
#
#   podman build --output type=local,dest=out .
#
# Writes lyra-<version>-linux-x86_64.tar.xz into ./out. Use
# --target build to keep the full toolchain image instead:
#
#   podman build --target build -t lyra-build .
#   podman run --rm -it lyra-build bash

FROM docker.io/library/ubuntu:24.04@sha256:a853f94d226358a79c740cfc7bce0c289748f3fe3488d921d038ccd752c61b60 AS base

ARG DEBIAN_FRONTEND=noninteractive
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
# hadolint ignore=DL3008
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv python3-dev \
    build-essential ccache curl git pkg-config \
    libasound2-dev libdbus-glib-1-dev libgtk-3-dev libpulse-dev \
    libx11-xcb-dev libxt-dev libxrandr-dev libxcomposite-dev \
    libxdamage-dev libxfixes-dev libdrm-dev libpango1.0-dev \
    libatk1.0-dev libcairo2-dev libgdk-pixbuf-2.0-dev \
    m4 unzip zip nasm xz-utils \
    clang llvm lld \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -m -u 1001 -s /bin/bash builder
USER 1001
WORKDIR /home/builder/lyra
ENV HOME=/home/builder \
    MOZBUILD_STATE_PATH=/home/builder/.mozbuild \
    PATH=/home/builder/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

FROM base AS source
COPY --chown=1001:1001 . .
RUN ./scripts/fetch-firefox.sh firefox-src \
 && ./scripts/apply-overlay.sh firefox-src \
 && ./extensions/ublock/fetch.sh

FROM source AS toolchain
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
RUN curl -sSf https://sh.rustup.rs | sh -s -- -y -q --profile minimal --default-toolchain stable
ENV PATH=/home/builder/.cargo/bin:/home/builder/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
WORKDIR /home/builder/lyra/firefox-src
RUN cat /home/builder/lyra/mozconfig /home/builder/lyra/mozconfig.linux > mozconfig \
 && MOZCONFIG=/home/builder/lyra/firefox-src/mozconfig \
    ./mach --no-interactive bootstrap --application-choice browser --no-system-changes
WORKDIR /home/builder/lyra

FROM toolchain AS build
ARG JOBS=2
ENV JOBS=${JOBS}
RUN ./scripts/container-build.sh

FROM scratch AS artifact
COPY --from=build /home/builder/lyra/out/ /
