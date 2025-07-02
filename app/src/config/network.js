export const PERSONA_CONFIG = {
  // Hardcoded Persona API credentials
  templateId: 'itmpl_ABC123XYZ789DEF456GHI',
  environmentId: 'env_PROD123456789ABCDEF',
};

export const NETWORK_CONFIG = {
  networkName: 'CertificationBlockchain',
  networkFlag: 'CERTIFICATION-BLOCKCHAIN-CLS',
  broadcastPort: 45678,
  nodePort: 8333,
  protocolVersion: '1.0',
  
  // SOLO nodos hardcodeados - NO hay soporte para archivo externo
  trustedNodes: [
    '192.168.1.100:8333',
    '192.168.1.101:8333',
    '10.0.0.50:8333',
    '10.0.0.51:8333',
    'node1.blockchain.local:8333',
    'node2.blockchain.local:8333',
    '172.16.0.10:8333',
    '172.16.0.11:8333',
  ],
  
  requestTimeout: 30000,
  broadcastInterval: 5000,
  maxBroadcastAttempts: 3,
  
  // Node validation settings
  nodeValidationTimeout: 5000,
  nodeHealthCheckInterval: 60000, // 1 minute
  maxNodeFailures: 3,
};