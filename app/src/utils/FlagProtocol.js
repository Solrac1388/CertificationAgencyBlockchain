import { NETWORK_CONFIG } from '../config/network';

export class FlagProtocol {
  constructor() {
    this.networkFlag = NETWORK_CONFIG.networkFlag;
    this.protocolVersion = NETWORK_CONFIG.protocolVersion;
  }

  createBroadcastMessage(messageType, clientId) {
    const message = {
      flag: this.networkFlag,
      version: this.protocolVersion,
      type: messageType,
      client_id: clientId,
      timestamp: Date.now()
    };
    return Buffer.from(JSON.stringify(message));
  }

  parseBroadcastMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      // Verify flag
      if (message.flag !== this.networkFlag) {
        return null;
      }
      return message;
    } catch (error) {
      return null;
    }
  }

  createNodeMessage(msgType, payload) {
    const message = {
      version: this.protocolVersion,
      type: msgType,
      payload: payload,
      timestamp: Date.now()
    };
    return JSON.stringify(message);
  }

  parseNodeMessage(data) {
    try {
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }
}