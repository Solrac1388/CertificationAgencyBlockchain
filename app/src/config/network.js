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
  trustedNodes: TRUSTED_NODES_PLACEHOLDER,
  
  requestTimeout: 30000,
  broadcastInterval: 5000,
  maxBroadcastAttempts: 3,
  
  // Node validation settings
  nodeValidationTimeout: 5000,
  nodeHealthCheckInterval: 60000, // 1 minute
  maxNodeFailures: 3,
};