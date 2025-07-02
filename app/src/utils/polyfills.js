// Polyfills for React Native
import { Buffer } from 'buffer';

global.Buffer = Buffer;

// Process polyfill
global.process = global.process || {};
global.process.env = global.process.env || {};
global.process.version = global.process.version || 'v12.0.0';

// Crypto polyfill setup (minimal)
if (typeof global.crypto === 'undefined') {
  global.crypto = {};
}

// Stream polyfill
import stream from 'stream';
global.stream = stream;