# Copyright (c) 2026 Roman Barinov <rbarinov@gmail.com>
# Licensed under the FSL-1.1-NC.

# Use native compilation for each platform (QEMU handles arm64 on amd64 hosts)
# This avoids cross-compilation issues with ring's C code
FROM --platform=$TARGETPLATFORM rust:1.92-alpine AS builder

ARG TARGETPLATFORM
ARG BINARY_NAME

RUN apk add --no-cache musl-dev

RUN case "$TARGETPLATFORM" in \
      "linux/amd64") echo "x86_64-unknown-linux-musl" > /tmp/target ;; \
      "linux/arm64") echo "aarch64-unknown-linux-musl" > /tmp/target ;; \
      *) echo "Unsupported platform: $TARGETPLATFORM" && exit 1 ;; \
    esac

RUN TARGET=$(cat /tmp/target) && rustup target add $TARGET

WORKDIR /build

COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
COPY tests ./tests

RUN TARGET=$(cat /tmp/target) && \
    cargo build --release --bin ${BINARY_NAME} --target $TARGET && \
    cp /build/target/$TARGET/release/${BINARY_NAME} /build/app

FROM alpine:3.23

RUN apk add --no-cache ca-certificates

COPY --from=builder /build/app /usr/local/bin/app

ENTRYPOINT ["/usr/local/bin/app"]
