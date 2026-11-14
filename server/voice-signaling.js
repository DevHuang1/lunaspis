/**
 * ============================================================================
 * INTERFELLAS HIGH-RELIABILITY ALWAYS-ON PROXIMITY VOICE RELAY
 * ============================================================================
 * Zero-NAT, 100% firewall-traversing WebSocket audio relay for multiplayer crew comms.
 *
 * Always-on crew communications: All crew members can hear each other at all times,
 * with real-time 3D spatial acoustic modulation (louder and crisper when near,
 * soft station intercom tone when far).
 */

module.exports = function setupVoiceSignaling(io) {
  io.on("connection", (socket) => {
    // 1. High-Reliability Voice Audio Chunk Relay
    socket.on("voice_chunk", (data) => {
      if (!data || !data.chunk) return;
      const roomId = data.roomId;
      const payload = {
        senderId: socket.id,
        chunk: data.chunk
      };

      if (roomId) {
        socket.to(roomId).emit("voice_chunk", payload);
      } else {
        socket.broadcast.emit("voice_chunk", payload);
      }
    });

    // 2. Announce microphone readiness in a room
    socket.on("voice_join", (data) => {
      const roomId = data && data.roomId;
      const payload = { id: socket.id };
      if (roomId) {
        socket.to(roomId).emit("voice_peer_joined", payload);
      } else {
        socket.broadcast.emit("voice_peer_joined", payload);
      }
    });

    // 3. Broadcast speaking/mute status (for 3D nametag rings & HUD indicators)
    socket.on("voice_state_update", (data) => {
      const roomId = data && data.roomId;
      const payload = {
        senderId: socket.id,
        isMuted: !!(data && data.isMuted),
        isSpeaking: !!(data && data.isSpeaking)
      };

      if (roomId) {
        socket.to(roomId).emit("voice_peer_state", payload);
      } else {
        socket.broadcast.emit("voice_peer_state", payload);
      }
    });

    // 4. Notify peers when a player leaves voice or disconnects
    socket.on("voice_leave", (data) => {
      const roomId = data && data.roomId;
      if (roomId) {
        socket.to(roomId).emit("voice_peer_left", { id: socket.id });
      } else {
        socket.broadcast.emit("voice_peer_left", { id: socket.id });
      }
    });

    socket.on("disconnect", () => {
      socket.broadcast.emit("voice_peer_left", { id: socket.id });
    });
  });

  console.log("🎙️  [VOICE] High-Reliability Always-On Proximity Voice Relay active.");
};
