/**
 * ============================================================================
 * INTERFELLAS LIVE CREW VIDEO SIGNALING
 * ============================================================================
 * WebRTC signalling relay for the Earth Control <-> Flight Crew video link.
 *
 * Audio already travels over the always-on voice relay; this module carries
 * only the SDP/ICE handshake. Media is peer-to-peer between the two crews, so
 * the server never sees or stores camera frames.
 */

module.exports = function setupVideoSignaling(io) {
  const MAX_SIGNAL_BYTES = 64 * 1024;

  function roomIdFrom(data) {
    return data && typeof data.roomId === "string" ? data.roomId.slice(0, 16) : null;
  }

  function leaveVideo(socket, broadcast = true) {
    const roomId = socket.videoRoom;
    if (!roomId) return;
    socket.videoRoom = null;
    if (broadcast) socket.to(roomId).emit("video_peer_left", { id: socket.id });
  }

  io.on("connection", (socket) => {
    socket.on("video_join", (data = {}, callback) => {
      const roomId = roomIdFrom(data);
      if (!roomId || !socket.rooms.has(roomId)) {
        if (typeof callback === "function") callback({ ok: false, error: "Join the room before starting video." });
        return;
      }

      if (socket.videoRoom && socket.videoRoom !== roomId) leaveVideo(socket);
      socket.videoRoom = roomId;

      const peers = [];
      const room = io.sockets.adapter.rooms.get(roomId);
      if (room) {
        for (const peerId of room) {
          if (peerId === socket.id) continue;
          const peer = io.sockets.sockets.get(peerId);
          if (peer && peer.videoRoom === roomId) peers.push({ id: peerId });
        }
      }

      // Existing callers are told about the new participant. The signalling
      // client uses a deterministic offerer (lower socket id) to avoid glare.
      socket.to(roomId).emit("video_peer_joined", { id: socket.id });
      if (typeof callback === "function") callback({ ok: true, peers });
    });

    socket.on("video_signal", (data = {}) => {
      const to = data && typeof data.to === "string" ? data.to : null;
      const payload = data && data.data;
      if (!to || !payload || typeof payload !== "object") return;
      if (!socket.videoRoom || !socket.rooms.has(socket.videoRoom)) return;

      // Signalling packets are tiny; reject accidental media blobs early.
      try {
        if (JSON.stringify(payload).length > MAX_SIGNAL_BYTES) return;
      } catch (e) {
        return;
      }

      const target = io.sockets.sockets.get(to);
      if (!target || target.videoRoom !== socket.videoRoom) return;
      target.emit("video_signal", { from: socket.id, data: payload });
    });

    socket.on("video_leave", () => leaveVideo(socket));
    // "disconnecting" still has the room membership needed to reach the peers.
    socket.on("disconnecting", () => leaveVideo(socket));
    socket.on("disconnect", () => { socket.videoRoom = null; });
  });

  console.log("🎥 [VIDEO] Earth Control <-> Flight Crew WebRTC signalling active.");
};
