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

  async sendVerification(publicKey, name, surname, inquiryId, signature) {
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

    const datetime = new Date().toISOString();
    
    const payload = {
      public_key: publicKey,
      name: name,
      surname: surname,
      inquiry_id: inquiryId,
      datetime: datetime,
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
        ? `${nodeAddress}/api/certifications` 
        : `http://${nodeAddress}/api/certifications`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      const messageData = JSON.parse(message);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messageData.payload),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error: ${response.status} - ${errorText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`Failed to send to ${nodeAddress}:`, error);
      throw error;
    }
  }

  async queryByPublicKey(publicKey) {
    const nodes = this.nodeDiscovery.getAllNodes();
    
    for (const node of nodes) {
      try {
        const url = node.includes('://') 
          ? `${node}/api/v1/certifications/by-public-key/${encodeURIComponent(publicKey)}`
          : `http://${node}/api/v1/certifications/by-public-key/${encodeURIComponent(publicKey)}`;
        
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        });

        if (response.ok) {
          const data = await response.json();
          return {
            identity: `${data.name} ${data.surname}`,
            publicKey: data.public_key,
            inquiryId: data.inquiry_id,
            datetime: data.datetime,
            verified: true,
          };
        }
      } catch (error) {
        // Try next node
      }
    }
    
    return null;
  }

  async queryByIdentity(name, surname) {
    const nodes = this.nodeDiscovery.getAllNodes();
    
    for (const node of nodes) {
      try {
        const url = node.includes('://') 
          ? `${node}/api/v1/certifications/by-identity?name=${encodeURIComponent(name)}&surname=${encodeURIComponent(surname)}`
          : `http://${node}/api/v1/certifications/by-identity?name=${encodeURIComponent(name)}&surname=${encodeURIComponent(surname)}`;
        
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        });

        if (response.ok) {
          const data = await response.json();
          return {
            identity: `${data.name} ${data.surname}`,
            publicKey: data.public_key,
            inquiryId: data.inquiry_id,
            datetime: data.datetime,
            verified: true,
          };
        }
      } catch (error) {
        // Try next node
      }
    }
    
    return null;
  }

  async queryIdentity(publicKey) {
    return this.queryByPublicKey(publicKey);
  }

  getNodeStats() {
    return this.nodeDiscovery.getCascadeStats();
  }
}