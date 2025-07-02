import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Card, Title, Paragraph, Chip, Button, ProgressBar, IconButton } from 'react-native-paper';
import { NETWORK_CONFIG } from '../config/network';
import { BlockchainClient } from '../services/BlockchainClient';

const StatusCard = ({ nodeCount, isConnected, onRefresh }) => {
  const [expanded, setExpanded] = useState(false);
  const [nodeStats, setNodeStats] = useState(null);
  const [cascadeProgress, setCascadeProgress] = useState(null);
  const [isDiscovering, setIsDiscovering] = useState(false);

  useEffect(() => {
    updateNodeStats();
  }, [nodeCount]);

  const updateNodeStats = async () => {
    try {
      const client = BlockchainClient.getInstance();
      const stats = client.getNodeStats();
      setNodeStats(stats);
    } catch (error) {
      console.error('Error getting node stats:', error);
    }
  };

  const executeCascadeDiscovery = async () => {
    setIsDiscovering(true);
    setCascadeProgress({ hop: 0, currentNodes: 0, querying: 0 });

    try {
      const client = BlockchainClient.getInstance();
      const result = await client.executeCascadeDiscovery({
        onProgress: (progress) => {
          setCascadeProgress(progress);
        },
        onComplete: (stats) => {
          setIsDiscovering(false);
          setCascadeProgress(null);
          updateNodeStats();
          if (onRefresh) {
            onRefresh();
          }
        }
      });
    } catch (error) {
      console.error('Cascade discovery error:', error);
      setIsDiscovering(false);
      setCascadeProgress(null);
    }
  };

  const formatLastCascade = (timestamp) => {
    if (!timestamp) return 'Never';
    
    const minutes = Math.floor((Date.now() - timestamp) / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} minutes ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hours ago`;
    
    return `${Math.floor(hours / 24)} days ago`;
  };

  return (
    <Card style={styles.card}>
      <TouchableOpacity onPress={() => setExpanded(!expanded)}>
        <Card.Content>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Title>Network Status</Title>
              <Paragraph>Network: {NETWORK_CONFIG.networkName}</Paragraph>
            </View>
            <IconButton 
              icon={expanded ? 'chevron-up' : 'chevron-down'}
              size={24}
              onPress={() => setExpanded(!expanded)}
            />
          </View>
          
          <View style={styles.statusRow}>
            <Paragraph>Total Nodes: {nodeCount}</Paragraph>
            <Chip 
              mode="outlined" 
              selected={isConnected}
              selectedColor={isConnected ? '#4CAF50' : '#F44336'}
            >
              {isConnected ? 'Connected' : 'Disconnected'}
            </Chip>
          </View>

          {expanded && nodeStats && (
            <View style={styles.expandedContent}>
              <View style={styles.divider} />
              
              <Title style={styles.sectionTitle}>Node Distribution</Title>
              <View style={styles.statsGrid}>
                <View style={styles.statItem}>
                  <Paragraph style={styles.statValue}>{nodeStats.trustedNodes}</Paragraph>
                  <Paragraph style={styles.statLabel}>Trusted Nodes</Paragraph>
                </View>
                <View style={styles.statItem}>
                  <Paragraph style={styles.statValue}>{nodeStats.broadcastNodes}</Paragraph>
                  <Paragraph style={styles.statLabel}>Broadcast Found</Paragraph>
                </View>
                <View style={styles.statItem}>
                  <Paragraph style={styles.statValue}>{nodeStats.cascadeNodes}</Paragraph>
                  <Paragraph style={styles.statLabel}>Cascade Found</Paragraph>
                </View>
                <View style={styles.statItem}>
                  <Paragraph style={styles.statValue}>{nodeStats.totalNodes}</Paragraph>
                  <Paragraph style={styles.statLabel}>Total Active</Paragraph>
                </View>
              </View>

              <Paragraph style={styles.lastCascade}>
                Last cascade discovery: {formatLastCascade(nodeStats.lastCascade)}
              </Paragraph>

              {isDiscovering && cascadeProgress && (
                <View style={styles.progressSection}>
                  <Paragraph style={styles.progressText}>
                    Discovering network - Hop {cascadeProgress.hop}/3
                  </Paragraph>
                  <Paragraph style={styles.progressSubtext}>
                    Found {cascadeProgress.currentNodes} nodes, querying {cascadeProgress.querying} more...
                  </Paragraph>
                  <ProgressBar 
                    progress={cascadeProgress.hop / 3} 
                    color="#2196F3"
                    style={styles.progressBar}
                  />
                </View>
              )}

              <Button
                mode="contained"
                onPress={executeCascadeDiscovery}
                loading={isDiscovering}
                disabled={isDiscovering || nodeStats.cascadeInProgress}
                style={styles.cascadeButton}
                icon="lan"
              >
                {isDiscovering ? 'Discovering Network...' : 'Discover Full Network'}
              </Button>
            </View>
          )}
          
          <Paragraph style={styles.flagText}>
            Flag: {NETWORK_CONFIG.networkFlag}
          </Paragraph>
        </Card.Content>
      </TouchableOpacity>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    margin: 16,
    elevation: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flex: 1,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  flagText: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
  },
  expandedContent: {
    marginTop: 16,
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statItem: {
    width: '48%',
    marginBottom: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  lastCascade: {
    fontSize: 12,
    color: '#666',
    marginBottom: 16,
    textAlign: 'center',
  },
  cascadeButton: {
    marginTop: 8,
  },
  progressSection: {
    marginVertical: 16,
  },
  progressText: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  progressSubtext: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
  },
});

export default StatusCard;