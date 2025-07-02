import { NodeDiscovery } from './NodeDiscovery';
import { FlagProtocol } from '../utils/FlagProtocol';
import { SecureStorage } from './SecureStorage';

export class BlockchainClient {
  static instance = null;

  static getInstance() {
    if (!BlockchainClient.instance) {
      BlockchainClient.instance = new BlockchainClient();
    }
    return BlockchainClient.instance;
  }

  constructor() {
    this.protocol = new FlagProtocol();
    this.nodeDiscovery = new NodeDiscovery(this.protocol);
    this.storage = new SecureStorage();
    this.isRunning = false;
  }

  async initialize() {
    try {
      this.isRunning = true;
      
      // Initialize storage
      await this.storage.initialize();
      
      // Start node discovery
      await this.nodeDiscovery.start();
      
      console.log('Blockchain client initialized');
      
      // Periodic cascade discovery (every 30 minutes)
      setInterval(() => {
        this.nodeDiscovery.executeCascadeDiscovery();
      }, 1800000);
      
    } catch (error) {
      console.error('Failed to initialize blockchain client:', error);
      throw error;
    }
  }

  async executeCascadeDiscovery(callbacks = {}) {
    // Set callbacks for UI updates
    this.nodeDiscovery.setCascadeCallbacks(callbacks);
    
    // Execute cascade discovery
    await this.nodeDiscovery.executeCascadeDiscovery(true);
    
    // Return final stats
    return this.nodeDiscovery.getCascadeStats();
  }

  async sendVerification(publicKey, inquiryId, signature) {
    // Execute cascade discovery if needed (before important operations)
    const stats = this.nodeDiscovery.getCascadeStats();
    if (Date.now() - stats.lastCascade > 300000) { // 5 minutes
      console.log('Updating network before sending verification...');
      await this.nodeDiscovery.executeCascadeDiscovery();
    }

    const nodes = this.nodeDiscovery.getAllNodes();
    
    if (nodes.length === 0) {
      throw new Error('No nodes available');
    }

    console.log(`Sending verification to ${nodes.length} nodes`);

    const payload = {
      public_key: publicKey,
      inquiry_id: inquiryId,
      signature: Buffer.from(signature).toString('base64')
    };

    const message = this.protocol.createNodeMessage('verify_identity', payload);
    
    const results = [];
    const batchSize = 10; // Send in batches to avoid overwhelming the network
    
    for (let i = 0; i < nodes.length; i += batchSize) {
      const batch = nodes.slice(i, i + batchSize);
      const batchPromises = batch.map(node => 
        this.sendToNode(node, message).then(response => ({
          node,
          response,
          success: response !== null
        })).catch(error => ({
          node,
          error: error.message,
          success: false
        }))
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults.map(r => r.value || r.reason));
    }

    return results;
  }

  async sendToNode(nodeAddress, message) {
    try {
      const url = nodeAddress.includes('://') 
        ? nodeAddress 
        : `http://${nodeAddress}/api`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: message,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.text();
        return this.protocol.parseNodeMessage(data);
      }
      
      return null;
    } catch (error) {
      if (error.name === 'AbortError') {
        console.error(`Timeout sending to node ${nodeAddress}`);
      } else {
        console.error(`Failed to send to node ${nodeAddress}:`, error);
      }
      return null;
    }
  }

  async queryIdentity(publicKey) {
    const nodes = this.nodeDiscovery.getAllNodes();
    
    if (nodes.length === 0) {
      return null;
    }

    const payload = { public_key: publicKey };
    const message = this.protocol.createNodeMessage('query_identity', payload);
    
    // Query nodes in parallel with limited concurrency
    const concurrency = 5;
    
    for (let i = 0; i < nodes.length; i += concurrency) {
      const batch = nodes.slice(i, i + concurrency);
      const batchPromises = batch.map(node => this.sendToNode(node, message));
      
      try {
        const responses = await Promise.all(batchPromises);
        
        for (const response of responses) {
          if (response && response.payload) {
            return response.payload;
          }
        }
      } catch (error) {
        continue;
      }
    }

    return null;
  }

  async queryPublicKey(identity) {
    const nodes = this.nodeDiscovery.getAllNodes();
    
    if (nodes.length === 0) {
      return null;
    }

    const payload = { identity: identity };
    const message = this.protocol.createNodeMessage('query_public_key', payload);
    
    for (const node of nodes) {
      try {
        const response = await this.sendToNode(node, message);
        if (response && response.payload) {
          return response.payload.public_key;
        }
      } catch (error) {
        continue;
      }
    }

    return null;
  }

  async getConnectedNodesCount() {
    return this.nodeDiscovery.getAllNodes().length;
  }

  getNodeStats() {
    return this.nodeDiscovery.getCascadeStats();
  }

  async stop() {
    this.isRunning = false;
    await this.nodeDiscovery.stop();
  }
}