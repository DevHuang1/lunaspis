/* Focused checks for the camera-free 3D crew link and its presence relay. */
"use strict";

const fs = require("fs");
const path = require("path");
const setupVideoSignaling = require("../../server/video-signaling");

let passed = 0;
let failed = 0;
function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`PASS  ${name}${detail ? `  — ${detail}` : ""}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  }
}

const rooms = new Map();
const sockets = new Map();
const connectionHandlers = [];
const io = {
  on(name, fn) {
    if (name === "connection") connectionHandlers.push(fn);
  },
  sockets: { sockets, adapter: { rooms } }
};

function makeSocket(id) {
  const handlers = {};
  const sent = [];
  const socket = {
    id,
    rooms: new Set([id]),
    videoRoom: null,
    handlers,
    sent,
    on(name, fn) { handlers[name] = fn; },
    emit(name, data) { sent.push({ name, data }); },
    to(roomId) {
      return {
        emit(name, data) {
          const members = rooms.get(roomId) || new Set();
          for (const peerId of members) {
            if (peerId === id) continue;
            const peer = sockets.get(peerId);
            if (peer) peer.sent.push({ name, data, from: id });
          }
        }
      };
    }
  };
  sockets.set(id, socket);
  rooms.set(id, new Set([id]));
  for (const handler of connectionHandlers) handler(socket);
  return socket;
}

function joinRoom(socket, roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  rooms.get(roomId).add(socket.id);
  socket.rooms.add(roomId);
}

function leaveRoom(socket, roomId) {
  const room = rooms.get(roomId);
  if (room) room.delete(socket.id);
  socket.rooms.delete(roomId);
}

setupVideoSignaling(io);

const ground = makeSocket("ground-1");
const crew = makeSocket("crew-1");
joinRoom(ground, "ROOM1");
joinRoom(crew, "ROOM1");

let groundJoinAck = null;
ground.handlers.video_join({ roomId: "ROOM1" }, (ack) => { groundJoinAck = ack; });
check("First video participant joins with no peers", groundJoinAck && groundJoinAck.ok && groundJoinAck.peers.length === 0, JSON.stringify(groundJoinAck));
check("First join does not broadcast to itself", ground.sent.length === 0, `${ground.sent.length} messages`);

let crewJoinAck = null;
crew.handlers.video_join({ roomId: "ROOM1" }, (ack) => { crewJoinAck = ack; });
check("Second participant discovers the first", crewJoinAck && crewJoinAck.peers.some((peer) => peer.id === "ground-1"), JSON.stringify(crewJoinAck));
check("Existing participant receives peer_joined", ground.sent.some((msg) => msg.name === "video_peer_joined" && msg.data.id === "crew-1"));

ground.sent.length = 0;
crew.sent.length = 0;
crew.handlers.video_signal({
  to: "ground-1",
  data: { description: { type: "offer", sdp: "v=0\r\n" } }
});
const relayed = ground.sent.find((msg) => msg.name === "video_signal");
check("SDP offer is relayed to the addressed room peer", relayed && relayed.data.from === "crew-1" && relayed.data.data.description.type === "offer");

ground.sent.length = 0;
crew.handlers.video_signal({ to: "missing-peer", data: { candidate: { candidate: "x" } } });
check("Signals to unknown sockets are dropped", ground.sent.length === 0);

const outsider = makeSocket("outsider");
joinRoom(outsider, "ROOM2");
outsider.handlers.video_signal({ to: "ground-1", data: { candidate: { candidate: "x" } } });
check("Sockets that never joined video cannot signal", ground.sent.length === 0);

const beforeLeave = ground.sent.length;
crew.handlers.video_leave();
const leftNotice = ground.sent.slice(beforeLeave).find((msg) => msg.name === "video_peer_left");
check("Leaving video notifies the other participants", leftNotice && leftNotice.data.id === "crew-1");
check("Leaving clears the video room binding", crew.videoRoom === null);

let afterLeaveAck = null;
crew.handlers.video_join({ roomId: "ROOM2" }, (ack) => { afterLeaveAck = ack; });
check("A socket outside ROOM2 cannot join its 3D crew link", !afterLeaveAck || afterLeaveAck.ok === false, JSON.stringify(afterLeaveAck));

const clientSource = fs.readFileSync(path.join(__dirname, "../../public/js/core/video_link.js"), "utf8");
check("3D crew link never requests real-world camera access", !clientSource.includes("getUserMedia"));
check("3D crew link does not create WebRTC media peers", !clientSource.includes("RTCPeerConnection"));
check("Crew side builds an animated 3D Earth Control room", clientSource.includes("_initGroundView") && clientSource.includes("_syncGroundAvatar"));
check("Ground side builds the animated 3D flight deck", clientSource.includes("_initCabin") && clientSource.includes("_syncSeatAvatar"));
const seatAvatarStart = clientSource.indexOf("_syncSeatAvatar");
const seatAvatarEnd = clientSource.indexOf("_syncSeatScreens", seatAvatarStart);
const seatAvatarSource = seatAvatarStart >= 0 && seatAvatarEnd > seatAvatarStart
  ? clientSource.slice(seatAvatarStart, seatAvatarEnd)
  : "";
check("Flight-deck feed dresses the crew in pressure-suit rigs",
  seatAvatarSource.includes("player.modelId") &&
  seatAvatarSource.includes("astronaut_lod1") &&
  seatAvatarSource.includes("getModelIdForRole") &&
  !seatAvatarSource.includes('seat.seat === "cdr"'), "flight deck must not use unsuited crew_a/crew_b rigs");

leaveRoom(crew, "ROOM1");
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
