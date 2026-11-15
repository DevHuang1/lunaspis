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
  const MAX_CHUNK_BYTES = 8 * 1024;

  function chunkByteLength(chunk) {
    if (!chunk) return 0;
    if (chunk instanceof ArrayBuffer) return chunk.byteLength;
    if (ArrayBuffer.isView(chunk)) return chunk.byteLength;
    if (Buffer.isBuffer(chunk)) return chunk.length;
    if (chunk && chunk.type === "Buffer" && Array.isArray(chunk.data)) return chunk.data.length;
    if (chunk && Array.isArray(chunk.data)) return chunk.data.length;
    return 0;
  }

  io.on("connection", (socket) => {
    // 1. High-Reliability Voice Audio Chunk Relay
    socket.on("voice_chunk", (data) => {
      if (!data || !data.chunk) return;
      const roomId = typeof data.roomId === "string" ? data.roomId.slice(0, 16) : null;
      if (!roomId || !socket.rooms.has(roomId)) return;
      if (chunkByteLength(data.chunk) > MAX_CHUNK_BYTES) return;

      // Token bucket: sustain ~12 chunks/sec (100ms audio chunks) while
      // allowing short bursts from devices that emit multiple buffers at once.
      const now = Date.now();
      const bucket = socket.voiceBucket || (socket.voiceBucket = { tokens: 4, last: now });
      bucket.tokens = Math.min(4, bucket.tokens + ((now - bucket.last) / 1000) * 12);
      bucket.last = now;
      if (bucket.tokens < 1) return;
      bucket.tokens -= 1;

      const payload = {
        senderId: socket.id,
        chunk: data.chunk
      };

      socket.to(roomId).emit("voice_chunk", payload);
    });

    // 2. Announce microphone readiness in a room
    socket.on("voice_join", (data) => {
      const roomId = data && typeof data.roomId === "string" ? data.roomId.slice(0, 16) : null;
      if (!roomId || !socket.rooms.has(roomId)) return;
      socket.to(roomId).emit("voice_peer_joined", { id: socket.id });
    });

    // 3. Broadcast speaking/mute/radio status (for 3D nametag rings, S-Band radio & HUD indicators)
    socket.on("voice_state_update", (data) => {
      const roomId = data && typeof data.roomId === "string" ? data.roomId.slice(0, 16) : null;
      if (!roomId || !socket.rooms.has(roomId)) return;
      const payload = {
        senderId: socket.id,
        isMuted: !!(data && data.isMuted),
        isSpeaking: !!(data && data.isSpeaking),
        isRadio: !!(data && data.isRadio)
      };
      socket.to(roomId).emit("voice_peer_state", payload);
    });

    // 4. Notify peers when a player leaves voice or disconnects
    socket.on("voice_leave", (data) => {
      const roomId = data && typeof data.roomId === "string" ? data.roomId.slice(0, 16) : null;
      if (!roomId || !socket.rooms.has(roomId)) return;
      socket.to(roomId).emit("voice_peer_left", { id: socket.id });
    });
  });

  console.log("🎙️  [VOICE] High-Reliability Always-On Proximity Voice Relay active.");
};
