FROM rust:1.88-bookworm AS build
WORKDIR /src
COPY interceptor-providers ./interceptor-providers
COPY countermeasure-demo ./countermeasure-demo
RUN cargo build --release --manifest-path countermeasure-demo/Cargo.toml

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/countermeasure-demo/target/release/sentinel-countermeasure-demo /usr/local/bin/sentinel-countermeasure-demo
ENV SENTINEL_DEMO_ADDR=0.0.0.0:10000
EXPOSE 10000
CMD ["sentinel-countermeasure-demo"]
