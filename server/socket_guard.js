/**
 * @fileoverview Per-socket error boundary.
 *
 * Socket.IO invokes event listeners from a `process.nextTick` callback without
 * a try/catch. An exception in a listener therefore becomes an uncaught
 * exception and terminates the process. This helper wraps every listener the
 * application registers on a socket so a malformed payload can never take the
 * whole server down.
 *
 * The guard is idempotent: server.js, voice-signaling.js and video-signaling.js
 * can all call it for the same socket.
 */
"use strict";

const GUARDED = Symbol("lunaspis.socket.guarded");

function guardSocket(socket) {
  if (!socket || socket[GUARDED] || typeof socket.on !== "function") return false;
  socket[GUARDED] = true;

  const rawOn = socket.on.bind(socket);
  socket.on = function guardedOn(event, handler) {
    if (typeof handler !== "function") return rawOn(event, handler);
    const wrapped = function guardedListener(...args) {
      try {
        const result = handler.apply(this, args);
        if (result && typeof result.catch === "function") {
          result.catch((error) => {
            console.error(`[SOCKET] Async handler "${event}" failed:`, error && error.stack ? error.stack : error);
          });
        }
        return result;
      } catch (error) {
        console.error(`[SOCKET] Handler "${event}" failed:`, error && error.stack ? error.stack : error);
        return undefined;
      }
    };
    return rawOn(event, wrapped);
  };

  return true;
}

module.exports = { guardSocket };
