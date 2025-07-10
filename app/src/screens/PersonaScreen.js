import React, { useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  Alert,
} from 'react-native';
import {
  Text,
  Button,
  Snackbar,
  Portal,
  Dialog,
  List,
  TextInput,
} from 'react-native-paper';

import PersonaWebView from '../components/PersonaWebView';
import { BlockchainClient } from '../services/BlockchainClient';
import { CryptoService } from '../services/CryptoService';
import { SecureStorage } from '../services/SecureStorage';

const PersonaScreen = ({ navigation }) => {
  const [inquiryId, setInquiryId] = useState(null);
  const [verificationFields, setVerificationFields] = useState(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [certificateDialogVisible, setCertificateDialogVisible] = useState(false);
  const [certificates, setCertificates] = useState([]);
  const [selectedCertId, setSelectedCertId] = useState(null);
  const [passwordDialogVisible, setPasswordDialogVisible] = useState(false);
  const [password, setPassword] = useState('');
  const [selectedCertData, setSelectedCertData] = useState(null);

  const showSnackbar = (message) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  const onVerificationComplete = async (inquiryId, status, fields) => {
    setInquiryId(inquiryId);
    setVerificationFields(fields);
    showSnackbar(`Verification completed: ${status}`);
    
    // Load certificates for selection
    const storage = new SecureStorage();
    const certs = await storage.listCertificates();
    
    if (certs.length === 0) {
      Alert.alert(
        'No Certificates',
        'Please generate a certificate first.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
      return;
    }

    setCertificates(certs);
    setCertificateDialogVisible(true);
  };

  const onVerificationError = (error) => {
    showSnackbar(`Verification error: ${error}`);
    setTimeout(() => navigation.goBack(), 2000);
  };

  const onVerificationCancel = () => {
    showSnackbar('Verification cancelled');
    navigation.goBack();
  };

  const selectCertificate = async (certId) => {
    setCertificateDialogVisible(false);
    setSelectedCertId(certId);

    try {
      const storage = new SecureStorage();
      const certData = await storage.getCertificate(certId);
      setSelectedCertData(certData);
      setPasswordDialogVisible(true);
    } catch (error) {
      showSnackbar('Error loading certificate: ' + error.message);
    }
  };

  const submitVerification = async () => {
    if (!password) {
      showSnackbar('Please enter password');
      return;
    }

    setPasswordDialogVisible(false);

    try {
      const cryptoService = new CryptoService();
      const client = BlockchainClient.getInstance();

      // Decrypt private key
      const privateKey = await cryptoService.decryptPrivateKey(
        selectedCertData.privateKeyEncrypted,
        password
      );

      // Extract name and surname from Persona fields
      const name = verificationFields?.name_first || verificationFields?.nameFirst || '';
      const surname = verificationFields?.name_last || verificationFields?.nameLast || '';
      
      if (!name || !surname) {
        showSnackbar('Error: Could not extract name from verification');
        return;
      }

      // Create message with all required fields
      const datetime = new Date().toISOString();
      const message = `${selectedCertData.publicKey}|${name}|${surname}|${inquiryId}|${Math.floor(new Date(datetime).getTime() / 1000)}`;
      const signature = await cryptoService.signMessage(privateKey, message);

      // Send to blockchain network
      showSnackbar('Preparing to send verification to blockchain...');
      
      // Execute cascade discovery before sending
      const nodeStats = await client.getNodeStats();
      if (nodeStats.totalNodes < 10 || Date.now() - nodeStats.lastCascade > 300000) {
        showSnackbar('Discovering full network before sending...');
        await client.executeCascadeDiscovery();
      }
      
      const results = await client.sendVerification(
        selectedCertData.publicKey,
        name,
        surname,
        inquiryId,
        signature
      );

      const successful = results.filter(r => r.success).length;
      const total = results.length;

      if (successful > 0) {
        // Update certificate with inquiry ID
        const storage = new SecureStorage();
        await storage.updateCertificate(selectedCertId, {
          personaInquiryId: inquiryId,
          verified: true,
        });

        showSnackbar(`Verification sent to ${successful}/${total} nodes across the network`);
        setTimeout(() => navigation.goBack(), 2000);
      } else {
        showSnackbar('Failed to send to any nodes');
      }
    } catch (error) {
      showSnackbar('Error: ' + error.message);
    }

    // Reset state
    setPassword('');
    setSelectedCertData(null);
  };

  return (
    <View style={styles.container}>
      <View style={styles.instructions}>
        <Text style={styles.instructionText}>
          Complete the identity verification process to link your identity to your public key.
        </Text>
      </View>

      <PersonaWebView
        onComplete={onVerificationComplete}
        onError={onVerificationError}
        onCancel={onVerificationCancel}
      />

      <Portal>
        <Dialog 
          visible={certificateDialogVisible} 
          onDismiss={() => setCertificateDialogVisible(false)}
        >
          <Dialog.Title>Select a Certificate</Dialog.Title>
          <Dialog.Content>
            <List.Section>
              {certificates.map((cert) => (
                <List.Item
                  key={cert.id}
                  title={cert.friendlyName + (cert.verified ? ' ✓' : '')}
                  description={`Created: ${new Date(cert.createdAt).toLocaleDateString()}`}
                  onPress={() => selectCertificate(cert.id)}
                />
              ))}
            </List.Section>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setCertificateDialogVisible(false)}>Cancel</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog 
          visible={passwordDialogVisible} 
          onDismiss={() => setPasswordDialogVisible(false)}
        >
          <Dialog.Title>Enter Certificate Password</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Password"
              value={password}
              onChangeText={setPassword}
              mode="outlined"
              secureTextEntry
              autoFocus
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setPasswordDialogVisible(false)}>Cancel</Button>
            <Button onPress={submitVerification}>Continue</Button>
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  instructions: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  instructionText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});

export default PersonaScreen;