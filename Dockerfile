# GMAT R2026a is prebuilt in this base image, so routine deploys do not
# download the ~383 MB SourceForge tarball. Rebuild the base with
# .github/workflows/gmat-base-image.yml (docker/gmat-base.Dockerfile).
# GMAT runtime settings (GMAT_CONSOLE_PATH, GMAT_TEMP_DIR, GMAT_WORK_DIR,
# LD_LIBRARY_PATH) are inherited from the base image.
FROM ghcr.io/devhuang1/lunaspis-gmat:r2026a

ENV NODE_VERSION=20.20.2 \
    NODE_SHA256=df770b2a6f130ed8627c9782c988fda9669fa23898329a61a871e32f965e007d \
    NODE_ENV=production \
    PORT=3000

RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" -o /tmp/node.tar.xz \
    && echo "${NODE_SHA256}  /tmp/node.tar.xz" | sha256sum -c - \
    && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 \
    && rm -f /tmp/node.tar.xz \
    && node -v \
    && npm -v

WORKDIR /app
RUN useradd --create-home --uid 10001 --shell /usr/sbin/nologin lunaspis \
    && mkdir -p "${GMAT_ROOT}/output" \
    && chown -R lunaspis:lunaspis "${GMAT_ROOT}/output"
COPY package*.json ./
RUN npm ci --omit=dev
COPY --chown=lunaspis:lunaspis . .
RUN chown -R lunaspis:lunaspis /app
USER lunaspis
ENV HOME=/home/lunaspis

EXPOSE 3000
CMD ["node", "server.js"]
