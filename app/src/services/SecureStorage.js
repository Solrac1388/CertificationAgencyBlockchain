import SQLite from 'react-native-sqlite-storage';
import * as Keychain from 'react-native-keychain';
import RNFS from 'react-native-fs';
import CryptoJS from 'crypto-js';
import { CryptoService } from './CryptoService';

export class SecureStorage {
  constructor() {
    this.db = null;
    this.encryptionKey = null;
    this.cryptoService = new CryptoService();
  }

  async initialize() {
    try {
      // Get or create encryption key
      this.encryptionKey = await this.getOrCreateEncryptionKey();
      
      // Open database
      this.db = await SQLite.openDatabase({
        name: 'blockchain_client.db',
        location: 'default',
      });

      // Create tables
      await this.createTables();
    } catch (error) {
      throw new Error('Failed to initialize storage: ' + error.message);
    }
  }

  async getOrCreateEncryptionKey() {
    try {
      const credentials = await Keychain.getInternetCredentials('blockchain_client_key');
      if (credentials) {
        return credentials.password;
      }

      // Generate new key
      const key = CryptoJS.lib.WordArray.random(256 / 8).toString(CryptoJS.enc.Base64);
      await Keychain.setInternetCredentials(
        'blockchain_client_key',
        'encryption',
        key
      );
      return key;
    } catch (error) {
      // Fallback to random key if Keychain fails
      return CryptoJS.lib.WordArray.random(256 / 8).toString(CryptoJS.enc.Base64);
    }
  }

  encrypt(data) {
    const encrypted = CryptoJS.AES.encrypt(
      JSON.stringify(data),
      this.encryptionKey
    );
    return encrypted.toString();
  }

  decrypt(encryptedData) {
    const decrypted = CryptoJS.AES.decrypt(encryptedData, this.encryptionKey);
    return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
  }

  async createTables() {
    return new Promise((resolve, reject) => {
      this.db.transaction(tx => {
        tx.executeSql(
          `CREATE TABLE IF NOT EXISTS certificates (
            id TEXT PRIMARY KEY,
            public_key TEXT NOT NULL,
            private_key_encrypted TEXT NOT NULL,
            certificate_data TEXT,
            persona_inquiry_id TEXT,
            created_at INTEGER NOT NULL,
            verified INTEGER DEFAULT 0,
            friendly_name TEXT
          )`,
          [],
          () => {
            tx.executeSql(
              `CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
              )`,
              [],
              () => resolve(),
              (_, error) => reject(error)
            );
          },
          (_, error) => reject(error)
        );
      });
    });
  }

  async storeCertificate({
    certId,
    publicKey,
    privateKeyEncrypted,
    certificateData = null,
    personaInquiryId = null,
    friendlyName = null
  }) {
    return new Promise((resolve, reject) => {
      const encryptedPrivateKey = this.encrypt(privateKeyEncrypted);
      
      this.db.transaction(tx => {
        tx.executeSql(
          `INSERT OR REPLACE INTO certificates 
          (id, public_key, private_key_encrypted, certificate_data, 
           persona_inquiry_id, created_at, verified, friendly_name)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            certId,
            publicKey,
            encryptedPrivateKey,
            certificateData,
            personaInquiryId,
            Date.now(),
            personaInquiryId ? 1 : 0,
            friendlyName
          ],
          () => resolve(true),
          (_, error) => reject(error)
        );
      });
    });
  }

  async getCertificate(certId) {
    return new Promise((resolve, reject) => {
      this.db.transaction(tx => {
        tx.executeSql(
          'SELECT * FROM certificates WHERE id = ?',
          [certId],
          (_, { rows }) => {
            if (rows.length > 0) {
              const row = rows.item(0);
              const decryptedPrivateKey = this.decrypt(row.private_key_encrypted);
              
              resolve({
                id: row.id,
                publicKey: row.public_key,
                privateKeyEncrypted: decryptedPrivateKey,
                certificateData: row.certificate_data,
                personaInquiryId: row.persona_inquiry_id,
                createdAt: row.created_at,
                verified: Boolean(row.verified),
                friendlyName: row.friendly_name
              });
            } else {
              resolve(null);
            }
          },
          (_, error) => reject(error)
        );
      });
    });
  }

  async listCertificates() {
    return new Promise((resolve, reject) => {
      this.db.transaction(tx => {
        tx.executeSql(
          'SELECT id, created_at, verified, friendly_name, persona_inquiry_id FROM certificates',
          [],
          (_, { rows }) => {
            const certificates = [];
            for (let i = 0; i < rows.length; i++) {
              const row = rows.item(i);
              certificates.push({
                id: row.id,
                createdAt: row.created_at,
                verified: Boolean(row.verified),
                friendlyName: row.friendly_name || `Certificate ${row.id.substring(0, 8)}...`,
                personaInquiryId: row.persona_inquiry_id
              });
            }
            resolve(certificates);
          },
          (_, error) => reject(error)
        );
      });
    });
  }

  async deleteCertificate(certId) {
    return new Promise((resolve, reject) => {
      this.db.transaction(tx => {
        tx.executeSql(
          'DELETE FROM certificates WHERE id = ?',
          [certId],
          () => resolve(true),
          (_, error) => reject(error)
        );
      });
    });
  }

  async updateCertificate(certId, updates) {
    const cert = await this.getCertificate(certId);
    if (!cert) throw new Error('Certificate not found');

    return this.storeCertificate({
      certId: cert.id,
      publicKey: cert.publicKey,
      privateKeyEncrypted: cert.privateKeyEncrypted,
      certificateData: cert.certificateData,
      personaInquiryId: updates.personaInquiryId || cert.personaInquiryId,
      friendlyName: cert.friendlyName,
      verified: updates.verified !== undefined ? updates.verified : cert.verified
    });
  }

  async exportCertificate(certId, password, exportPath) {
    try {
      const cert = await this.getCertificate(certId);
      if (!cert) return false;

      // Decrypt private key
      const privateKey = await this.cryptoService.decryptPrivateKey(
        cert.privateKeyEncrypted,
        password
      );

      // Create PEM content
      let content = privateKey + '\n\n' + cert.publicKey;
      
      if (cert.personaInquiryId) {
        content += `\n\n# Persona Inquiry ID: ${cert.personaInquiryId}`;
      }

      // Write to file
      await RNFS.writeFile(exportPath, content, 'utf8');
      
      return true;
    } catch (error) {
      console.error('Export certificate error:', error);
      return false;
    }
  }

  async importCertificate(filePath, password, friendlyName) {
    try {
      // Read file content
      const content = await RNFS.readFile(filePath, 'utf8');
      
      // Parse content
      const parts = content.split('\n\n');
      if (parts.length < 2) {
        throw new Error('Invalid certificate file format');
      }

      // Extract private key and public key
      const privateKeyPem = parts[0];
      let publicKeyPem = parts[1];
      
      // Remove comment if present
      if (publicKeyPem.includes('#')) {
        publicKeyPem = publicKeyPem.split('#')[0].trim();
      }

      // Extract inquiry ID if present
      let inquiryId = null;
      if (parts.length > 2 && parts[2].includes('Persona Inquiry ID:')) {
        inquiryId = parts[2].split(':')[1].trim();
      }

      // Generate certificate ID from public key
      const certId = await this.cryptoService.getPublicKeyHash(publicKeyPem);

      // Encrypt private key for storage
      const encryptedPrivateKey = await this.cryptoService.encryptPrivateKey(
        privateKeyPem,
        password
      );

      // Store certificate
      await this.storeCertificate({
        certId,
        publicKey: publicKeyPem,
        privateKeyEncrypted: encryptedPrivateKey,
        personaInquiryId: inquiryId,
        friendlyName
      });

      return certId;
    } catch (error) {
      console.error('Import certificate error:', error);
      return null;
    }
  }
}