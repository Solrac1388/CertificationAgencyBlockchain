import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Alert,
} from 'react-native';
import {
  Text,
  Card,
  Title,
  Paragraph,
  Button,
  Snackbar,
  Portal,
  Dialog,
  TextInput,
  IconButton,
  Menu,
  Divider,
  ProgressBar,
  HelperText,
} from 'react-native-paper';
import Share from 'react-native-share';
import RNFS from 'react-native-fs';
import { useFocusEffect } from '@react-navigation/native';

import { SecureStorage } from '../services/SecureStorage';
import { CryptoService } from '../services/CryptoService';

const CertificatesScreen = ({ navigation }) => {
  const [certificates, setCertificates] = useState([]);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [selectedCert, setSelectedCert] = useState(null);
  const [menuVisible, setMenuVisible] = useState({});
  const [passwordDialogVisible, setPasswordDialogVisible] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  const [certToExport, setCertToExport] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');

  useFocusEffect(
    useCallback(() => {
      loadCertificates();
    }, [])
  );

  const loadCertificates = async () => {
    try {
      const storage = new SecureStorage();
      const certs = await storage.listCertificates();
      setCertificates(certs);
    } catch (error) {
      showSnackbar('Error loading certificates');
    }
  };

  const showSnackbar = (message) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  const showCertificateDetails = async (certId) => {
    try {
      const storage = new SecureStorage();
      const cert = await storage.getCertificate(certId);
      
      const details = `
Name: ${cert.friendlyName}
ID: ${cert.id.substring(0, 32)}...
Created: ${new Date(cert.createdAt).toLocaleString()}
Verified: ${cert.verified ? 'Yes' : 'No'}
${cert.personaInquiryId ? `\nInquiry ID: ${cert.personaInquiryId}` : ''}
\nPublic Key Preview: ${cert.publicKey.split('\n')[1].substring(0, 50)}...
      `.trim();

      Alert.alert('Certificate Details', details, [{ text: 'OK' }]);
    } catch (error) {
      showSnackbar('Error showing details');
    }
  };

  const deleteCertificate = (certId) => {
    Alert.alert(
      'Delete Certificate',
      'Are you sure you want to delete this certificate? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              const storage = new SecureStorage();
              await storage.deleteCertificate(certId);
              showSnackbar('Certificate deleted');
              loadCertificates();
            } catch (error) {
              showSnackbar('Error deleting certificate');
            }
          }
        }
      ]
    );
  };

  const exportCertificate = (certId) => {
    setCertToExport(certId);
    setPasswordDialogVisible(true);
  };

  const performExport = async () => {
    if (!exportPassword) {
      showSnackbar('Please enter password');
      return;
    }

    setPasswordDialogVisible(false);
    setIsProcessing(true);
    setProgress(0);
    setProgressMessage('Decrypting certificate...');

    try {
      const storage = new SecureStorage();
      const cryptoService = new CryptoService();
      
      // Get certificate data
      setProgress(0.2);
      const cert = await storage.getCertificate(certToExport);
      
      // Decrypt private key with progress
      setProgress(0.4);
      setProgressMessage('Verifying password...');
      
      const privateKey = await cryptoService.decryptPrivateKey(
        cert.privateKeyEncrypted,
        exportPassword,
        (p, msg) => {
          setProgress(0.4 + p * 0.4);
          setProgressMessage(msg);
        }
      );
      
      setProgress(0.8);
      setProgressMessage('Preparing export file...');
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `cert_${certToExport.substring(0, 8)}_${timestamp}.pem`;
      const exportPath = `${RNFS.DocumentDirectoryPath}/${filename}`;
      
      // Create export file
      let content = privateKey + '\n\n' + cert.publicKey;
      if (cert.personaInquiryId) {
        content += `\n\n# Persona Inquiry ID: ${cert.personaInquiryId}`;
      }
      
      await RNFS.writeFile(exportPath, content, 'utf8');
      
      setProgress(1);
      
      // Share the file
      await Share.open({
        url: `file://${exportPath}`,
        type: 'application/x-pem-file',
        title: 'Export Certificate',
        subject: 'Blockchain Certificate Export',
      });

      showSnackbar('Certificate exported successfully');
    } catch (error) {
      if (error.message !== 'User did not share') {
        showSnackbar('Export failed: Invalid password');
      }
    } finally {
      setIsProcessing(false);
      setProgress(0);
      setProgressMessage('');
      setExportPassword('');
      setCertToExport(null);
    }
  };

  const renderCertificate = ({ item }) => {
    const verified = item.verified ? '✓ ' : '';
    const createdDate = new Date(item.createdAt).toLocaleDateString();

    return (
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.cardHeader}>
            <Title>{verified}{item.friendlyName}</Title>
            <Menu
              visible={menuVisible[item.id] || false}
              onDismiss={() => setMenuVisible({ ...menuVisible, [item.id]: false })}
              anchor={
                <IconButton
                  icon="dots-vertical"
                  onPress={() => setMenuVisible({ ...menuVisible, [item.id]: true })}
                />
              }
            >
              <Menu.Item 
                onPress={() => {
                  setMenuVisible({ ...menuVisible, [item.id]: false });
                  showCertificateDetails(item.id);
                }} 
                title="View Details" 
              />
              <Menu.Item 
                onPress={() => {
                  setMenuVisible({ ...menuVisible, [item.id]: false });
                  exportCertificate(item.id);
                }} 
                title="Export" 
              />
              <Divider />
              <Menu.Item 
                onPress={() => {
                  setMenuVisible({ ...menuVisible, [item.id]: false });
                  deleteCertificate(item.id);
                }} 
                title="Delete" 
                titleStyle={{ color: 'red' }}
              />
            </Menu>
          </View>
          <Paragraph>ID: {item.id.substring(0, 16)}...</Paragraph>
          <Paragraph>Created: {createdDate}</Paragraph>
        </Card.Content>
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      {isProcessing && (
        <Card style={styles.progressCard}>
          <Card.Content>
            <Paragraph>{progressMessage}</Paragraph>
            <ProgressBar progress={progress} style={styles.progressBar} />
          </Card.Content>
        </Card>
      )}

      {certificates.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No certificates stored</Text>
          <Button 
            mode="contained" 
            onPress={() => navigation.navigate('Wallet')}
            style={styles.emptyButton}
          >
            Generate Certificate
          </Button>
        </View>
      ) : (
        <FlatList
          data={certificates}
          renderItem={renderCertificate}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContainer}
        />
      )}

      <Portal>
        <Dialog 
          visible={passwordDialogVisible} 
          onDismiss={() => setPasswordDialogVisible(false)}
        >
          <Dialog.Title>Export Certificate</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Certificate Password"
              value={exportPassword}
              onChangeText={setExportPassword}
              mode="outlined"
              secureTextEntry
              autoFocus
            />
            <HelperText type="info">
              Enter the password used to encrypt this certificate
            </HelperText>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setPasswordDialogVisible(false)}>Cancel</Button>
            <Button onPress={performExport}>Export</Button>
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
  progressCard: {
    margin: 16,
    elevation: 2,
  },
  progressBar: {
    marginTop: 8,
    height: 8,
    borderRadius: 4,
  },
  listContainer: {
    padding: 16,
  },
  card: {
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
  },
  emptyButton: {
    paddingHorizontal: 24,
  },
});

export default CertificatesScreen;