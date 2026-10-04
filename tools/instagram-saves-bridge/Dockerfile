FROM python:3.12-slim-trixie

ARG CAROLOS_SOURCE_REVISION=unknown
LABEL org.opencontainers.image.source="https://github.com/pedrocvm/portfolio-ugc" \
      org.opencontainers.image.revision="${CAROLOS_SOURCE_REVISION}"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    CAROLOS_BRIDGE_LOCATION=server

RUN groupadd --gid 10001 carolos \
    && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin carolos \
    && install -d -m 0700 -o carolos -g carolos /state

# Preserve the repository-relative layout used to exclude state from source.
WORKDIR /app/tools/instagram-saves-bridge
COPY --chmod=0444 requirements.txt ./
RUN python -m pip install --no-cache-dir --only-binary=:all: -r requirements.txt \
    && python -m pip check
COPY --chmod=0444 bridge.py bridge_core.py bridge_service.py ./

USER 10001:10001
ENTRYPOINT ["python", "-u", "bridge.py", "--state-dir", "/state"]
CMD ["serve"]
