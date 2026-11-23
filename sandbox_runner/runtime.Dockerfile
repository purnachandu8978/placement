# Hardened, immutable multi-language execution image for student code evaluation.
# Invoked ephemerally per submission with:
#   --network none --read-only --cap-drop=ALL --security-opt=no-new-privileges
#   --pids-limit=64 --memory=... --cpus=... -u 65534:65534 --tmpfs /work:rw,exec,nosuid,nodev,size=64m
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    nodejs \
    openjdk-17-jdk-headless \
    g++ \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/runner /work && chown 65534:65534 /work
COPY run_batch.py /opt/runner/run_batch.py
RUN chmod 0555 /opt/runner/run_batch.py && chmod 0755 /opt/runner

WORKDIR /work
USER 65534:65534

ENTRYPOINT ["python3", "/opt/runner/run_batch.py"]

