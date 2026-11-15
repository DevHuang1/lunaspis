# Prebuilt GMAT runtime for the Lunaspis production image.
#
# Published to ghcr.io/devhuang1/lunaspis-gmat by
# .github/workflows/gmat-base-image.yml. The application Dockerfile only needs
# to pull this image, so deploys no longer download the ~383 MB GMAT tarball.
# Rebuild (workflow_dispatch or a change to this file) only when the GMAT
# runtime itself needs to change.
FROM ubuntu:22.04

# Pinned SHA-256 of the GMAT R2026a Ubuntu tarball.
ARG GMAT_SHA256="fe124b4a606b2e3b704a6fbb1c37b87598d5df0d18cb661c304b5f60074a7754"

ENV DEBIAN_FRONTEND=noninteractive \
    GMAT_VERSION=R2026a \
    GMAT_URL="https://sourceforge.net/projects/gmat/files/GMAT/GMAT-R2026a/gmat-ubuntu-x64-R2026a.tar.gz/download" \
    GMAT_SHA256=${GMAT_SHA256} \
    GMAT_ROOT=/opt/GMAT/R2026a \
    GMAT_CONSOLE_PATH=/opt/GMAT/R2026a/bin/GmatConsole \
    GMAT_TEMP_DIR=/tmp/gmat-runtime \
    GMAT_WORK_DIR=/tmp/gmat-runs \
    LD_LIBRARY_PATH=/opt/GMAT/R2026a/lib:/opt/GMAT/R2026a/bin

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

RUN mkdir -p "${GMAT_ROOT}" "${GMAT_TEMP_DIR}" "${GMAT_WORK_DIR}" \
    && chmod 1777 "${GMAT_TEMP_DIR}" "${GMAT_WORK_DIR}" \
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

LABEL org.opencontainers.image.title="lunaspis-gmat" \
      org.opencontainers.image.description="Ubuntu 22.04 with the GMAT R2026a console runtime for Lunaspis" \
      org.opencontainers.image.source="https://github.com/DevHuang1/lunaspis"
