import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {
  Text,
  Card,
  Title,
  Paragraph,
  Divider,
  List,
  Snackbar,
  Chip,
  Surface,
  Avatar,
  IconButton,
} from 'react-native-paper';
import RNFS from 'react-native-fs';
import CryptoJS from 'crypto-js';

import { BlockchainClient } from '../services/BlockchainClient';
import { CryptoService } from '../services/CryptoService';
import { DocumentSignatureService } from '../services/DocumentSignatureService';

const DocumentVerificationScreen = ({ route, navigation }) => {
  const { fileUri, fileName } = route.params;
  const [loading, setLoading] = useState(true);
  const [documentInfo, setDocumentInfo] = useState(null);
  const [signatures, setSignatures] = useState([]);
  const [verifiedSigners, setVerifiedSigners] = useState([]);
  const [error, setError] = useState(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [documentHash, setDocumentHash] = useState('');

  useEffect(() => {
    analyzeDocument();
  }, []);

  const analyzeDocument = async () => {
    try {
      setLoading(true);
      
      const signatureService = new DocumentSignatureService();
      const client = BlockchainClient.getInstance();
      
      // Read file content
      let fileContent;
      const fileExtension = fileName.split('.').pop().toLowerCase();
      
      if (fileExtension === 'pdf') {
        // For PDFs, read as base64 and extract signatures
        fileContent = await RNFS.readFile(fileUri, 'base64');
        const extractedSignatures = await signatureService.extractPDFSignatures(fileContent);
        setSignatures(extractedSignatures);
      } else {
        // For text files, read content and look for signature block
        fileContent = await RNFS.readFile(fileUri, 'utf8');
        const extractedSignatures = await signatureService.extractTextSignatures(fileContent);
        setSignatures(extractedSignatures);
      }

      // Calculate document hash
      const hash = CryptoJS.SHA256(fileContent).toString();
      setDocumentHash(hash);

      setDocumentInfo({
        fileName,
        fileType: fileExtension,
        size: fileContent.length,
        hash: hash.substring(0, 16) + '...',
        fullHash: hash,
      });

      // Verify each signature against blockchain
      const verifiedList = [];
      
      for (const sig of signatures) {
        try {
          // Query blockchain for public key owner
          const identity = await client.queryIdentity(sig.publicKey);
          
          if (identity) {
            // Verify signature
            const cryptoService = new CryptoService();
            const isValid = await cryptoService.verifyDocumentSignature(
              sig.publicKey,
              documentInfo.fullHash,
              sig.signature
            );

            verifiedList.push({
              publicKey: sig.publicKey,
              identity: identity.identity || 'Unknown',
              signatureValid: isValid,
              timestamp: sig.timestamp,
              personaVerified: identity.verified || false,
              blockchainVerified: true,
            });
          } else {
            // Signer not found in blockchain
            verifiedList.push({
              publicKey: sig.publicKey,
              identity: 'Not in blockchain',
              signatureValid: false,
              timestamp: sig.timestamp,
              personaVerified: false,
              blockchainVerified: false,
            });
          }
        } catch (error) {
          console.error('Error verifying signature:', error);
          verifiedList.push({
            publicKey: sig.publicKey,
            identity: 'Verification error',
            signatureValid: false,
            timestamp: sig.timestamp,
            personaVerified: false,
            blockchainVerified: false,
          });
        }
      }

      setVerifiedSigners(verifiedList);

      // Show summary
      const validCount = verifiedList.filter(s => s.signatureValid && s.blockchainVerified).length;
      const totalCount = signatures.length;
      
      if (totalCount === 0) {
        showSnackbar('No signatures found in document');
      } else {
        showSnackbar(`Found ${totalCount} signatures, ${validCount} verified from blockchain`);
      }

    } catch (error) {
      console.error('Error analyzing document:', error);
      setError(error.message);
      showSnackbar('Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const showSnackbar = (message) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  const getSignerIcon = (signer) => {
    if (signer.signatureValid && signer.blockchainVerified) {
      return 'check-circle';
    } else if (signer.blockchainVerified) {
      return 'alert-circle';
    } else {
      return 'close-circle';
    }
  };

  const getSignerIconColor = (signer) => {
    if (signer.signatureValid && signer.blockchainVerified) {
      return '#4CAF50';
    } else if (signer.blockchainVerified) {
      return '#FF9800';
    } else {
      return '#F44336';
    }
  };

  const renderSigner = (signer, index) => (
    <Card key={index} style={styles.signerCard}>
      <Card.Content>
        <View style={styles.signerHeader}>
          <Avatar.Icon 
            size={48} 
            icon={getSignerIcon(signer)}
            color="#fff"
            style={{ backgroundColor: getSignerIconColor(signer) }}
          />
          <View style={styles.signerInfo}>
            <Title style={styles.signerName}>{signer.identity}</Title>
            <Paragraph style={styles.publicKey}>
              {signer.publicKey.substring(0, 32)}...
            </Paragraph>
          </View>
        </View>
        
        <View style={styles.chipContainer}>
          {signer.signatureValid && (
            <Chip 
              icon="check" 
              style={[styles.chip, styles.validChip]}
              textStyle={styles.chipText}
            >
              Valid Signature
            </Chip>
          )}
          {signer.blockchainVerified && (
            <Chip 
              icon="link" 
              style={[styles.chip, styles.blockchainChip]}
              textStyle={styles.chipText}
            >
              Blockchain Verified
            </Chip>
          )}
          {signer.personaVerified && (
            <Chip 
              icon="account-check" 
              style={[styles.chip, styles.personaChip]}
              textStyle={styles.chipText}
            >
              Persona Verified
            </Chip>
          )}
          {!signer.signatureValid && signer.blockchainVerified && (
            <Chip 
              icon="alert" 
              style={[styles.chip, styles.invalidChip]}
              textStyle={styles.chipText}
            >
              Invalid Signature
            </Chip>
          )}
          {!signer.blockchainVerified && (
            <Chip 
              icon="help-circle" 
              style={[styles.chip, styles.unknownChip]}
              textStyle={styles.chipText}
            >
              Unknown Signer
            </Chip>
          )}
        </View>

        {signer.timestamp && (
          <Text style={styles.timestamp}>
            Signed: {new Date(signer.timestamp).toLocaleString()}
          </Text>
        )}
      </Card.Content>
    </Card>
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Verifying document signatures...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Error: {error}</Text>
      </View>
    );
  }

  const validSignatures = verifiedSigners.filter(s => s.signatureValid && s.blockchainVerified);
  const invalidSignatures = verifiedSigners.filter(s => !s.signatureValid || !s.blockchainVerified);

  return (
    <View style={styles.container}>
      <ScrollView>
        <Card style={styles.documentCard}>
          <Card.Content>
            <Title>Document Information</Title>
            <View style={styles.documentInfo}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>File:</Text>
                <Text style={styles.infoValue}>{documentInfo.fileName}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Type:</Text>
                <Text style={styles.infoValue}>{documentInfo.fileType.toUpperCase()}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Hash:</Text>
                <Text style={styles.infoValueMono}>{documentInfo.hash}</Text>
              </View>
            </View>
            
            <Divider style={styles.divider} />
            
            <View style={styles.statsContainer}>
              <View style={styles.stat}>
                <Text style={[styles.statValue, styles.validColor]}>{validSignatures.length}</Text>
                <Text style={styles.statLabel}>Valid Signatures</Text>
              </View>
              <View style={styles.stat}>
                <Text style={[styles.statValue, styles.invalidColor]}>{invalidSignatures.length}</Text>
                <Text style={styles.statLabel}>Invalid/Unknown</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{signatures.length}</Text>
                <Text style={styles.statLabel}>Total Signatures</Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {validSignatures.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>✓ Valid Blockchain Signatures</Text>
            {validSignatures.map((signer, index) => renderSigner(signer, index))}
          </View>
        )}

        {invalidSignatures.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, styles.invalidHeader]}>✗ Invalid or Unknown Signatures</Text>
            {invalidSignatures.map((signer, index) => renderSigner(signer, index))}
          </View>
        )}

        {signatures.length === 0 && (
          <Card style={styles.emptyCard}>
            <Card.Content>
              <Text style={styles.emptyText}>
                No digital signatures found in this document.
              </Text>
              <Text style={styles.emptySubtext}>
                The document may not be digitally signed or the signatures are in an unsupported format.
              </Text>
            </Card.Content>
          </Card>
        )}
      </ScrollView>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={4000}
      >
        {snackbarMessage}
      </Snackbar>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: '#c33',
    textAlign: 'center',
  },
  documentCard: {
    margin: 16,
    elevation: 4,
  },
  documentInfo: {
    marginTop: 8,
  },
  infoRow: {
    flexDirection: 'row',
    marginVertical: 4,
  },
  infoLabel: {
    width: 60,
    fontWeight: 'bold',
    color: '#666',
  },
  infoValue: {
    flex: 1,
    color: '#333',
  },
  infoValueMono: {
    flex: 1,
    color: '#333',
    fontFamily: 'monospace',
    fontSize: 12,
  },
  divider: {
    marginVertical: 12,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  stat: {
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
    marginTop: 4,
    textAlign: 'center',
  },
  validColor: {
    color: '#4CAF50',
  },
  invalidColor: {
    color: '#F44336',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    marginHorizontal: 16,
    marginBottom: 12,
    color: '#4CAF50',
  },
  invalidHeader: {
    color: '#F44336',
  },
  signerCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    elevation: 2,
  },
  signerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  signerInfo: {
    marginLeft: 12,
    flex: 1,
  },
  signerName: {
    fontSize: 18,
    marginBottom: 4,
  },
  publicKey: {
    fontSize: 12,
    color: '#666',
    fontFamily: 'monospace',
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  chip: {
    marginRight: 8,
    marginBottom: 8,
  },
  chipText: {
    fontSize: 11,
  },
  validChip: {
    backgroundColor: '#E8F5E9',
  },
  blockchainChip: {
    backgroundColor: '#E3F2FD',
  },
  personaChip: {
    backgroundColor: '#F3E5F5',
  },
  invalidChip: {
    backgroundColor: '#FFEBEE',
  },
  unknownChip: {
    backgroundColor: '#FFF3E0',
  },
  timestamp: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  emptyCard: {
    margin: 16,
    elevation: 2,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
    color: '#999',
  },
});

export default DocumentVerificationScreen;