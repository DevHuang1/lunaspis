FROM ubuntu:22.04

# Pinned SHA-256 of the GMAT R2026a Ubuntu tarball.
ARG GMAT_SHA256="fe124b4a606b2e3b704a6fbb1c37b87598d5df0d18cb661c304b5f60074a7754"

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_VERSION=20.20.2 \
    NODE_SHA256=df770b2a6f130ed8627c9782c988fda9669fa23898329a61a871e32f965e007d \
    GMAT_VERSION=R2026a \
    GMAT_URL="https://sourceforge.net/projects/gmat/files/GMAT/GMAT-R2026a/gmat-ubuntu-x64-R2026a.tar.gz/download" \
    GMAT_SHA256=${GMAT_SHA256} \
    GMAT_ROOT=/opt/GMAT/R2026a \
    GMAT_CONSOLE_PATH=/opt/GMAT/R2026a/bin/GmatConsole \
    GMAT_TEMP_DIR=/tmp/gmat-runtime \
    GMAT_WORK_DIR=/tmp/gmat-runs \
    LD_LIBRARY_PATH=/opt/GMAT/R2026a/lib:/opt/GMAT/R2026a/bin \
    NODE_ENV=production \
    PORT=3000

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      tar \
      xz-utils \
      libstdc++6 \
      libgomp1 \
      libxml2 \
      libexpat1 \
      libssl3 \
      zlib1g \
      libcurl4 \
      libglib2.0-0 \
      libgl1 \
      libglu1-mesa \
      libopengl0 \
      libgtk-3-0 \
      libpng16-16 \
      libjpeg-turbo8 \
      libtiff5 \
      libfontconfig1 \
      libfreetype6 \
      libsm6 \
      libx11-6 \
      libxext6 \
      libxrender1 \
      libxt6 \
      libxtst6 \
      libxi6 \
      libxrandr2 \
      libxcursor1 \
      libxfixes3 \
      libxinerama1 \
      libpython3.10 \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" -o /tmp/node.tar.xz \
    && echo "${NODE_SHA256}  /tmp/node.tar.xz" | sha256sum -c - \
    && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 \
    && rm -f /tmp/node.tar.xz \
    && node -v \
    && npm -v

RUN mkdir -p /opt /tmp/gmat-runtime /tmp/gmat-runs \
    && chmod 1777 /tmp/gmat-runtime /tmp/gmat-runs \
    && curl -fSL --retry 3 --retry-delay 5 "${GMAT_URL}" -o /tmp/gmat.tar.gz \
    && test -n "${GMAT_SHA256}" \
    && echo "${GMAT_SHA256}  /tmp/gmat.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/gmat.tar.gz -C /opt \
    && rm -f /tmp/gmat.tar.gz \
    && test -x "${GMAT_CONSOLE_PATH}" \
    && printf "%s\n%s\n" "${GMAT_ROOT}/lib" "${GMAT_ROOT}/bin" > /etc/ld.so.conf.d/gmat.conf \
    && ldconfig \
    && if ldd "${GMAT_CONSOLE_PATH}" | grep -q "not found"; then ldd "${GMAT_CONSOLE_PATH}"; exit 1; fi \
    && cd "${GMAT_ROOT}/bin" \
    && printf "%s\n" \
      "Create Spacecraft Sat;" \
      "Sat.DateFormat = UTCGregorian;" \
      "Sat.Epoch = '14 Nov 2026 00:00:00.000';" \
      "Sat.CoordinateSystem = EarthMJ2000Eq;" \
      "Sat.X = 7000;" \
      "Sat.Y = 0;" \
      "Sat.Z = 0;" \
      "Sat.VX = 0;" \
      "Sat.VY = 7.5;" \
      "Sat.VZ = 0;" \
      "Create CoordinateSystem MarsFrame;" \
      "MarsFrame.Origin = Mars;" \
      "MarsFrame.Axes = MJ2000Eq;" \
      "Create ForceModel FM;" \
      "FM.CentralBody = Earth;" \
      "FM.PointMasses = {Earth};" \
      "Create Propagator Prop;" \
      "Prop.FM = FM;" \
      "Prop.Type = RungeKutta89;" \
      "Create ReportFile RF;" \
      "RF.Filename = '/tmp/gmat_smoke.txt';" \
      "RF.WriteHeaders = false;" \
      "BeginMissionSequence;" \
      "Propagate Prop(Sat) {Sat.ElapsedSecs = 60};" \
      "Report RF Sat.ElapsedSecs Sat.EarthMJ2000Eq.X Sat.MarsFrame.X;" \
      > /tmp/gmat_smoke.script \
    && "${GMAT_CONSOLE_PATH}" -r /tmp/gmat_smoke.script \
    && test -s /tmp/gmat_smoke.txt \
    && cat /tmp/gmat_smoke.txt \
    && rm -f /tmp/gmat_smoke.script /tmp/gmat_smoke.txt "${GMAT_ROOT}/output/GmatLog.txt" /tmp/GmatLog.txt

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
