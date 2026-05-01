const { EventEmitter } = require('events');

/**
 * Singleton event emitter for real-time admin notifications.
 * Student routes emit events here; the SSE route in admin.js
 * forwards them to all connected admin browsers.
 */
const emitter = new EventEmitter();
emitter.setMaxListeners(50); // support many concurrent admin tabs

module.exports = emitter;
