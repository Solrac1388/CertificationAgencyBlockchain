import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  RefreshControl,
} from 'react-native';
import {
  Card,
  Title,
  Paragraph,
  Button,
  Text,
  Snackbar,
  Portal,
  Dialog,
  TextInput,
  ProgressBar,
  HelperText,
} from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DocumentPicker from 'react-native-document-picker';

import StatusCard from '../components/StatusCard';
import { BlockchainClient } from '../services/BlockchainClient';
import { CryptoService } from '../services/CryptoService';
import { SecureStorage } from '../services/SecureStorage';

const WalletScreen = ({ navigation }) => {
  const [nodeCount, setNodeCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [dialogVisible, setDialogVisible] = useState(false);
  const [certName, setCertName] = useState('');
  const [certPassword, setCertPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [importDialogVisible, setImportDialogVisible] = useState(false);
  const [importPassword, setImportPassword] = useState('');
  const [importName, setImportName] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    initializeCrypto();
    updateStatus();
    const interval = setInterval(updateStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const initializeCrypto = async () => {
    const cryptoService = new CryptoService();
    await cryptoService.initialize();
  };

  const updateStatus = async () => {
    try {
      const client = BlockchainClient.getInstance();
      const validatedNodes = client.nodeDiscovery.getValidatedNodesInfo();
      setNodeCount(validatedNodes.length);
      setIsConnected(validatedNodes.length > 0);
    } catch (error) {
      // Silent fail
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const client = BlockchainClient.getInstance();
      await client.nodeDiscovery.validateAllNodes();
      await updateStatus();
      showSnackbar(`${client.nodeDiscovery.getAllNodes().length} validated nodes available`);
    } catch (error) {
      showSnackbar('Network refresh completed');
    }
    setRefreshing(false);
  };

  const showSnackbar = (message) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  const validatePasswordStrength = (password) => {
    try {
      const cryptoService = new CryptoService();
      cryptoService.validatePassword(password);
      setPasswordError('');
      return true;
    } catch (error) {
      setPasswordError(error.message);
      return false;
    }
  };

  const handleGenerateCertificate = async () => {
    if (!certName || !certPassword) {
      showSnackbar('Please fill all fields');
      return;
    }

    if (!validatePasswordStrength(certPassword)) {
      return;
    }

    setDialogVisible(false);
    setIsProcessing(true);
    setProgress(0);
    setProgressMessage('Generating RSA keypair...');

    try {
      const cryptoService = new CryptoService();
      
      setProgress(0.3);
      const { privateKey, publicKey } = await cryptoService.generateRSAKeypair();
      
      setProgress(0.5);
      setProgressMessage('Encrypting private key...');
      
      const certId = await cryptoService.getPublicKeyHash(publicKey);
      const encryptedPrivateKey = await cryptoService.encryptPrivateKey(privateKey, certPassword);
      const publicKeyPem = await cryptoService.getPublicKeyPem(publicKey);

      setProgress(0.8);
      setProgressMessage('Saving certificate...');

      const storage = new SecureStorage();
      await storage.storeCertificate({
        certId,
        publicKey: publicKeyPem,
        privateKeyEncrypted: encryptedPrivateKey,
        friendlyName: certName,
      });

      setProgress(1);
      showSnackbar(`Certificate '${certName}' generated successfully`);
      setCertName('');
      setCertPassword('');
    } catch (error) {
      showSnackbar('Error: ' + error.message);
    } finally {
      setIsProcessing(false);
      setProgress(0);
      setProgressMessage('');
    }
  };

  const handleImportCertificate = async () => {
    try {
      const result = await DocumentPicker.pick({
        type: [DocumentPicker.types.allFiles],
      });

      setSelectedFile(result[0]);
      setImportDialogVisible(true);
    } catch (error) {
      if (!DocumentPicker.isCancel(error)) {
        showSnackbar('Error selecting file');
      }
    }
  };

  const performImport = async () => {
    if (!selectedFile || !importPassword || !importName) {
      showSnackbar('Please fill all fields');
      return;
    }

    setImportDialogVisible(false);
    setIsProcessing(true);
    setProgress(0);
    setProgressMessage('Importing certificate...');

    try {
      setProgress(0.5);
      const storage = new SecureStorage();
      const certId = await storage.importCertificate(
        selectedFile.uri,
        importPassword,
        importName
      );

      setProgress(1);
      if (certId) {
        showSnackbar('Certificate imported successfully');
        setImportPassword('');
        setImportName('');
        setSelectedFile(null);
      } else {
        showSnackbar('Failed to import certificate');
      }
    } catch (error) {
      showSnackbar('Import error');
    } finally {
      setIsProcessing(false);
      setProgress(0);
      setProgressMessage('');
    }
  };

  const handleQueryIdentity = () => {
    Alert.prompt(
      'Query Identity',
      'Enter public key to query:',
      async (publicKey) => {
        if (!publicKey) return;

        setIsProcessing(true);
        setProgressMessage('Querying blockchain...');

        try {
          const client = BlockchainClient.getInstance();
          const result = await client.queryIdentity(publicKey);
          
          if (result) {
            Alert.alert('Identity Found', `Identity: ${result.identity || 'Unknown'}`);
          } else {
            Alert.alert('Not Found', 'No identity found for this public key');
          }
        } catch (error) {
          Alert.alert('Error', 'Query failed');
        } finally {
          setIsProcessing(false);
          setProgressMessage('');
        }
      }
    );
  };

  const handleVerifyDocument = async () => {
    try {
      const result = await DocumentPicker.pick({
        type: [DocumentPicker.types.pdf, DocumentPicker.types.plainText],
      });

      const file = result[0];
      navigation.navigate('DocumentVerification', { fileUri: file.uri, fileName: file.name });
    } catch (error) {
      if (!DocumentPicker.isCancel(error)) {
        showSnackbar('Error selecting file');
      }
    }
  };

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <StatusCard 
        nodeCount={nodeCount}
        isConnected={isConnected}
        onRefresh={updateStatus}
      />

      {isProcessing && (
        <Card style={styles.progressCard}>
          <Card.Content>
            <Paragraph>{progressMessage}</Paragraph>
            <ProgressBar progress={progress} style={styles.progressBar} />
          </Card.Content>
        </Card>
      )}

      <View style={styles.buttonContainer}>
        <Button
          mode="contained"
          onPress={() => navigation.navigate('Persona')}
          style={styles.button}
          icon="account-check"
          disabled={isProcessing}
        >
          Verify Identity
        </Button>

        <Button
          mode="contained"
          onPress={() => setDialogVisible(true)}
          style={styles.button}
          icon="certificate"
          disabled={isProcessing}
        >
          Generate New Certificate
        </Button>

        <Button
          mode="contained"
          onPress={() => navigation.navigate('Certificates')}
          style={styles.button}
          icon="folder-key"
          disabled={isProcessing}
        >
          View Certificates
        </Button>

        <Button
          mode="contained"
          onPress={handleImportCertificate}
          style={styles.button}
          icon="import"
          disabled={isProcessing}
        >
          Import Certificate
        </Button>

        <Button
          mode="contained"
          onPress={handleQueryIdentity}
          style={styles.button}
          icon="magnify"
          disabled={isProcessing}
        >
          Query Identity
        </Button>

        <Button
          mode="contained"
          onPress={handleVerifyDocument}
          style={styles.button}
          icon="file-check"
          disabled={isProcessing}
        >
          Verify Document Signatures
        </Button>
      </View>

      <Portal>
        <Dialog visible={dialogVisible} onDismiss={() => setDialogVisible(false)}>
          <Dialog.Title>Generate New Certificate</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Certificate Name"
              value={certName}
              onChangeText={setCertName}
              mode="outlined"
              style={styles.input}
            />
            <TextInput
              label="Password (min 12 characters)"
              value={certPassword}
              onChangeText={(text) => {
                setCertPassword(text);
                if (text) validatePasswordStrength(text);
              }}
              mode="outlined"
              secureTextEntry
              style={styles.input}
              error={!!passwordError}
            />
            <HelperText type="error" visible={!!passwordError}>
              {passwordError}
            </HelperText>
            <HelperText type="info" visible={!passwordError && certPassword.length > 0}>
              Strong password: 12+ chars, uppercase, lowercase, numbers, special chars
            </HelperText>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDialogVisible(false)}>Cancel</Button>
            <Button 
              onPress={handleGenerateCertificate}
              disabled={!!passwordError || certPassword.length < 12}
            >
              Generate
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={importDialogVisible} onDismiss={() => setImportDialogVisible(false)}>
          <Dialog.Title>Import Certificate</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.fileText}>
              File: {selectedFile?.name || 'No file selected'}
            </Text>
            <TextInput
              label="Certificate Password"
              value={importPassword}
              onChangeText={setImportPassword}
              mode="outlined"
              secureTextEntry
              style={styles.input}
            />
            <TextInput
              label="Certificate Name"
              value={importName}
              onChangeText={setImportName}
              mode="outlined"
              style={styles.input}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setImportDialogVisible(false)}>Cancel</Button>
            <Button onPress={performImport}>Import</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
      >
        {snackbarMessage}
      </Snackbar>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  buttonContainer: {
    padding: 16,
  },
  button: {
    marginVertical: 8,
  },
  input: {
    marginVertical: 8,
  },
  fileText: {
    marginBottom: 16,
    fontStyle: 'italic',
  },
  progressCard: {
    margin: 16,
    elevation: 2,
  },
  progressBar: {
    marginTop: 8,
    height: 8,
    borderRadius: 4,
  },
});

export default WalletScreen;