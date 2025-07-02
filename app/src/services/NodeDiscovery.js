import dgram from 'react-native-udp';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NETWORK_CONFIG } from '../config/network';

export class NodeDiscovery {
  constructor(protocol) {
    this.protocol = protocol;
    this.knownNodes = [...NETWORK_CONFIG.trustedNodes]; // SOLO nodos hardcodeados
    this.validatedNodes = new Map(); // Track validated nodes
    this.nodeFailures = new Map(); // Track node failures
    this.discoveredNodes = new Set();
    this.cascadeDiscoveredNodes = new Set();
    this.broadcastSocket = null;
    this.listening = false;
    this.clientId = this.generateClientId();
    this.cascadeInProgress = false;
    this.lastCascadeTime = 0;
    this.cascadeCallbacks = {
      onProgress: null,
      onComplete: null,
    };
    this.healthCheckInterval = null;
  }

  generateClientId() {
    return Math.random().toString(36).substring(2, 18);
  }

  async start() {
    // ELIMINADO: loadNodesFromFile() - solo usamos nodos hardcodeados
    
    // Validate all known nodes
    await this.validateAllNodes();
    
    // Start services
    this.startBroadcastListener();
    this.startPeriodicBroadcast();
    this.startHealthCheck();
    
    // Execute cascade discovery after initial validation
    setTimeout(() => {
      this.executeCascadeDiscovery();
    }, 2000);
  }

  async validateNode(nodeAddress, timeout = NETWORK_CONFIG.nodeValidationTimeout) {
    try {
      const url = nodeAddress.includes('://') 
        ? `${nodeAddress}/health` 
        : `http://${nodeAddress}/health`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const startTime = Date.now();
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Network-Flag': NETWORK_CONFIG.networkFlag,
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;
      
      if (response.ok) {
        const data = await response.json();
        
        // Validate response contains expected fields
        if (data.status === 'ok' && data.networkFlag === NETWORK_CONFIG.networkFlag) {
          this.validatedNodes.set(nodeAddress, {
            lastValidated: Date.now(),
            responseTime,
            version: data.version || 'unknown',
          });
          
          // Reset failure count on success
          this.nodeFailures.delete(nodeAddress);
          
          return true;
        }
      }
      
      return false;
    } catch (error) {
      // Track failures
      const failures = (this.nodeFailures.get(nodeAddress) || 0) + 1;
      this.nodeFailures.set(nodeAddress, failures);
      
      // Remove node if too many failures
      if (failures >= NETWORK_CONFIG.maxNodeFailures) {
        this.validatedNodes.delete(nodeAddress);
      }
      
      return false;
    }
  }

  async validateAllNodes() {
    const validationPromises = this.knownNodes.map(node => 
      this.validateNode(node).then(isValid => ({ node, isValid }))
    );
    
    const results = await Promise.allSettled(validationPromises);
    
    // Update known nodes to only include validated ones
    this.knownNodes = results
      .filter(r => r.status === 'fulfilled' && r.value.isValid)
      .map(r => r.value.node);
  }

  startHealthCheck() {
    // Periodic health check for validated nodes
    this.healthCheckInterval = setInterval(async () => {
      const nodes = Array.from(this.validatedNodes.keys());
      
      for (const node of nodes) {
        const isValid = await this.validateNode(node);
        if (!isValid) {
          // Remove from validated nodes if health check fails
          this.validatedNodes.delete(node);
        }
      }
    }, NETWORK_CONFIG.nodeHealthCheckInterval);
  }

  async saveNodesToCache() {
    try {
      const validatedNodesList = Array.from(this.validatedNodes.keys());
      await AsyncStorage.setItem('validated_nodes_cache', JSON.stringify(validatedNodesList));
    } catch (error) {
      // Silent fail
    }
  }

  async executeCascadeDiscovery(forceRefresh = false) {
    if (this.cascadeInProgress) return;
    
    if (!forceRefresh && Date.now() - this.lastCascadeTime < 300000) return;

    this.cascadeInProgress = true;
    this.lastCascadeTime = Date.now();
    
    try {
      const trustedNodes = Array.from(this.validatedNodes.keys());
      const allDiscoveredNodes = new Set(trustedNodes);
      let currentLevel = trustedNodes;
      
      for (let hop = 1; hop <= 3; hop++) {
        if (this.cascadeCallbacks.onProgress) {
          this.cascadeCallbacks.onProgress({
            hop,
            currentNodes: allDiscoveredNodes.size,
            querying: currentLevel.length,
          });
        }
        
        const newNodes = await this.queryNodesForPeers(currentLevel);
        
        // Validate new nodes before adding
        const validationResults = await Promise.all(
          newNodes.map(node => this.validateNode(node).then(isValid => ({ node, isValid })))
        );
        
        const validNewNodes = validationResults
          .filter(r => r.isValid)
          .map(r => r.node)
          .filter(node => !allDiscoveredNodes.has(node));
        
        if (validNewNodes.length === 0) break;
        
        validNewNodes.forEach(node => allDiscoveredNodes.add(node));
        currentLevel = validNewNodes;
      }
      
      this.cascadeDiscoveredNodes = new Set(allDiscoveredNodes);
      await this.saveCascadeNodesToCache();
      
      if (this.cascadeCallbacks.onComplete) {
        this.cascadeCallbacks.onComplete({
          totalNodes: this.cascadeDiscoveredNodes.size,
          trustedNodes: trustedNodes.length,
          discoveredNodes: this.cascadeDiscoveredNodes.size - trustedNodes.length,
        });
      }
    } finally {
      this.cascadeInProgress = false;
    }
  }

  async queryNodesForPeers(nodes) {
    const discoveredPeers = new Set();
    const timeout = 30000;
    const concurrency = 5;
    const results = [];
    
    for (let i = 0; i < nodes.length; i += concurrency) {
      const batch = nodes.slice(i, i + concurrency);
      const batchPromises = batch.map(node => this.queryNodeForPeers(node, timeout));
      
      try {
        const batchResults = await Promise.allSettled(batchPromises);
        results.push(...batchResults);
      } catch (error) {
        // Silent fail
      }
    }
    
    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value) {
        result.value.forEach(peer => {
          if (this.isValidNodeAddress(peer)) {
            discoveredPeers.add(peer);
          }
        });
      }
    });
    
    return Array.from(discoveredPeers);
  }

  async queryNodeForPeers(nodeAddress, timeout) {
    try {
      const url = nodeAddress.includes('://') 
        ? `${nodeAddress}/peers` 
        : `http://${nodeAddress}/peers`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-ID': this.clientId,
          'X-Network-Flag': NETWORK_CONFIG.networkFlag,
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        if (data.peers && Array.isArray(data.peers)) {
          return data.peers;
        }
      }
      
      return [];
    } catch (error) {
      return [];
    }
  }

  isValidNodeAddress(address) {
    if (!address || typeof address !== 'string') return false;
    const pattern = /^([a-zA-Z0-9.-]+):(\d+)$/;
    const match = pattern.exec(address);
    if (!match) return false;
    const port = parseInt(match[2]);
    return port > 0 && port <= 65535;
  }

  startBroadcastListener() {
    try {
      this.broadcastSocket = dgram.createSocket('udp4');
      
      this.broadcastSocket.bind(NETWORK_CONFIG.broadcastPort, () => {
        this.listening = true;
      });

      this.broadcastSocket.on('message', (msg, rinfo) => {
        this.handleBroadcast(msg, rinfo);
      });

      this.broadcastSocket.on('error', (err) => {
        // Silent fail
      });
    } catch (error) {
      // Silent fail
    }
  }

  handleBroadcast(data, rinfo) {
    const message = this.protocol.parseBroadcastMessage(data);
    if (!message) return;

    if (message.type === 'node_announce') {
      const nodeAddress = `${rinfo.address}:${message.port || NETWORK_CONFIG.nodePort}`;
      
      // Validate node before adding
      this.validateNode(nodeAddress).then(isValid => {
        if (isValid && !this.discoveredNodes.has(nodeAddress)) {
          this.discoveredNodes.add(nodeAddress);
        }
      });
    }
  }

  startPeriodicBroadcast() {
    setInterval(() => {
      this.sendDiscoveryBroadcast();
    }, NETWORK_CONFIG.broadcastInterval);
  }

  sendDiscoveryBroadcast() {
    try {
      const sock = dgram.createSocket('udp4');
      const message = this.protocol.createBroadcastMessage('client_discovery', this.clientId);

      sock.send(
        message,
        0,
        message.length,
        NETWORK_CONFIG.broadcastPort,
        '255.255.255.255',
        (err) => {
          sock.close();
        }
      );

      // Send to validated nodes only
      this.validatedNodes.forEach((nodeInfo, node) => {
        try {
          const [host, port] = node.split(':');
          const nodeSock = dgram.createSocket('udp4');
          nodeSock.send(
            message,
            0,
            message.length,
            parseInt(port),
            host,
            (err) => {
              nodeSock.close();
            }
          );
        } catch (error) {
          // Silent fail
        }
      });
    } catch (error) {
      // Silent fail
    }
  }

  getAllNodes() {
    // Return only validated nodes
    return Array.from(this.validatedNodes.keys());
  }

  getValidatedNodesInfo() {
    return Array.from(this.validatedNodes.entries()).map(([node, info]) => ({
      address: node,
      ...info,
    }));
  }

  setCascadeCallbacks(callbacks) {
    this.cascadeCallbacks = {
      ...this.cascadeCallbacks,
      ...callbacks,
    };
  }

  getCascadeStats() {
    return {
      trustedNodes: NETWORK_CONFIG.trustedNodes.length,
      validatedNodes: this.validatedNodes.size,
      broadcastNodes: this.discoveredNodes.size,
      cascadeNodes: this.cascadeDiscoveredNodes.size,
      totalNodes: this.getAllNodes().length,
      lastCascade: this.lastCascadeTime,
      cascadeInProgress: this.cascadeInProgress,
    };
  }

  async stop() {
    this.listening = false;
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    if (this.broadcastSocket) {
      this.broadcastSocket.close();
    }

    await this.saveNodesToCache();
  }
}