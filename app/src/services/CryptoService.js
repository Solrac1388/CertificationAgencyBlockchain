import { RSA } from 'react-native-rsa-native';
import CryptoJS from 'crypto-js';
import { Buffer } from 'buffer';
import { encode as base64Encode, decode as base64Decode } from 'base64-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';

export class CryptoService {
  constructor() {
    this.keySize = 4096;
    this.keyCache = new Map();
    this.cacheTimeout = 300000; // 5 minutes
    this.devicePerformanceLevel = null;
  }

  async initialize() {
    // Determine device performance level for dynamic iteration adjustment
    try {
      const totalMemory = await DeviceInfo.getTotalMemory();
      
      if (totalMemory > 4 * 1024 * 1024 * 1024) { // > 4GB RAM
        this.devicePerformanceLevel = 'high';
      } else if (totalMemory > 2 * 1024 * 1024 * 1024) { // > 2GB RAM
        this.devicePerformanceLevel = 'medium';
      } else {
        this.devicePerformanceLevel = 'low';
      }
    } catch (error) {
      this.devicePerformanceLevel = 'medium'; // Default fallback
    }
  }

  getIterationCount() {
    // Dynamic iteration count based on device performance
    switch (this.devicePerformanceLevel) {
      case 'high':
        return 100000;
      case 'medium':
        return 50000;
      case 'low':
        return 25000;
      default:
        return 50000;
    }
  }

  validatePassword(password) {
    // Strong password validation
    const minLength = 12;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    
    if (password.length < minLength) {
      throw new Error(`Password must be at least ${minLength} characters long`);
    }
    
    if (!hasUpperCase || !hasLowerCase || !hasNumbers || !hasSpecialChar) {
      throw new Error('Password must contain uppercase, lowercase, numbers and special characters');
    }
    
    // Check for common patterns
    const commonPatterns = ['password', '12345', 'qwerty', 'admin'];
    const lowerPassword = password.toLowerCase();
    for (const pattern of commonPatterns) {
      if (lowerPassword.includes(pattern)) {
        throw new Error('Password contains common patterns');
      }
    }
    
    return true;
  }

  async generateRSAKeypair() {
    try {
      const keys = await RSA.generateKeys(this.keySize);
      return {
        privateKey: keys.private,
        publicKey: keys.public,
      };
    } catch (error) {
      throw new Error('Failed to generate RSA keypair: ' + error.message);
    }
  }

  async deriveKey(password, salt, iterations = null) {
    // Check cache first
    const cacheKey = `${password}_${salt}`;
    const cached = this.keyCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.key;
    }
    
    // Use dynamic iterations if not specified
    const iterationCount = iterations || this.getIterationCount();
    
    // Derive key with SHA-512
    const key = CryptoJS.PBKDF2(password, salt, {
      keySize: 256 / 32,
      iterations: iterationCount,
      hasher: CryptoJS.algo.SHA512 // Changed from SHA256
    });
    
    // Cache the derived key
    this.keyCache.set(cacheKey, {
      key,
      timestamp: Date.now()
    });
    
    // Clean old cache entries
    if (this.keyCache.size > 10) {
      const oldestKey = Array.from(this.keyCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
      this.keyCache.delete(oldestKey);
    }
    
    return key;
  }

  async encryptPrivateKey(privateKey, password) {
    try {
      // Validate password strength
      this.validatePassword(password);
      
      // Generate random salt and IV
      const salt = CryptoJS.lib.WordArray.random(256 / 8); // Increased salt size
      const iv = CryptoJS.lib.WordArray.random(128 / 8);
      
      // Derive key with caching
      const key = await this.deriveKey(password, salt);
      
      // Encrypt with AES-CTR (more secure than CBC)
      const encrypted = CryptoJS.AES.encrypt(privateKey, key, {
        iv: iv,
        mode: CryptoJS.mode.CTR, // GCM not available in crypto-js, using CTR as alternative
        padding: CryptoJS.pad.NoPadding
      });
      
      // Generate authentication tag manually (since crypto-js doesn't support GCM)
      const authTag = CryptoJS.HmacSHA256(
        encrypted.ciphertext.toString() + iv.toString(),
        key
      ).toString().substring(0, 32);

      return {
        salt: salt.toString(CryptoJS.enc.Base64),
        iv: iv.toString(CryptoJS.enc.Base64),
        ciphertext: encrypted.ciphertext.toString(CryptoJS.enc.Base64),
        authTag: authTag,
        algorithm: 'AES-256-CTR',
        kdf: 'PBKDF2-SHA512',
        iterations: this.getIterationCount()
      };
    } catch (error) {
      throw new Error('Failed to encrypt private key: ' + error.message);
    }
  }

  async decryptPrivateKey(encryptedData, password, onProgress = null) {
    try {
      // Parse encrypted data
      const salt = CryptoJS.enc.Base64.parse(encryptedData.salt);
      const iv = CryptoJS.enc.Base64.parse(encryptedData.iv);
      const ciphertext = CryptoJS.enc.Base64.parse(encryptedData.ciphertext);
      
      // Report progress
      if (onProgress) onProgress(0.2, 'Deriving key...');
      
      // Derive key with specified iterations or default
      const iterations = encryptedData.iterations || this.getIterationCount();
      const key = await this.deriveKey(password, salt, iterations);
      
      if (onProgress) onProgress(0.5, 'Verifying integrity...');
      
      // Verify authentication tag
      if (encryptedData.authTag) {
        const expectedTag = CryptoJS.HmacSHA256(
          ciphertext.toString() + iv.toString(),
          key
        ).toString().substring(0, 32);
        
        if (expectedTag !== encryptedData.authTag) {
          throw new Error('Authentication failed - data may be corrupted');
        }
      }
      
      if (onProgress) onProgress(0.8, 'Decrypting...');
      
      // Decrypt
      const decrypted = CryptoJS.AES.decrypt(
        { ciphertext: ciphertext },
        key,
        {
          iv: iv,
          mode: CryptoJS.mode.CTR,
          padding: CryptoJS.pad.NoPadding
        }
      );

      const privateKey = decrypted.toString(CryptoJS.enc.Utf8);
      
      if (!privateKey || privateKey.length === 0) {
        throw new Error('Invalid password or corrupted data');
      }
      
      if (onProgress) onProgress(1.0, 'Complete');
      
      return privateKey;
    } catch (error) {
      throw new Error('Failed to decrypt private key: ' + error.message);
    }
  }

  async signMessage(privateKey, message) {
    try {
      // Use RSA-PSS for better security
      const signature = await RSA.signWithAlgorithm(
        message,
        privateKey,
        RSA.SignatureAlgorithm.RSA_PSS
      );
      return Buffer.from(signature, 'base64');
    } catch (error) {
      // Fallback to regular RSA if PSS not available
      try {
        const signature = await RSA.sign(message, privateKey);
        return Buffer.from(signature, 'base64');
      } catch (fallbackError) {
        throw new Error('Failed to sign message: ' + error.message);
      }
    }
  }

  async verifySignature(publicKey, message, signature) {
    try {
      const signatureBase64 = Buffer.from(signature).toString('base64');
      
      // Try RSA-PSS first
      try {
        const isValid = await RSA.verifyWithAlgorithm(
          signatureBase64,
          message,
          publicKey,
          RSA.SignatureAlgorithm.RSA_PSS
        );
        return isValid;
      } catch (error) {
        // Fallback to regular RSA verification
        return await RSA.verify(signatureBase64, message, publicKey);
      }
    } catch (error) {
      // Silent fail for invalid signatures
      return false;
    }
  }

  async verifyDocumentSignature(publicKey, documentHash, signature) {
    try {
      // Proper document signature verification
      if (!publicKey || !documentHash || !signature) {
        return false;
      }
      
      // Verify signature format
      if (typeof signature !== 'string' || signature.length < 64) {
        return false;
      }
      
      // Use the same verification method as regular signatures
      return await this.verifySignature(publicKey, documentHash, signature);
    } catch (error) {
      return false;
    }
  }

  async getPublicKeyPem(publicKey) {
    return publicKey;
  }

  async getPublicKeyHash(publicKey) {
    const hash = CryptoJS.SHA512(publicKey); // Changed to SHA-512
    return hash.toString(CryptoJS.enc.Hex);
  }

  generateClientId() {
    const random = CryptoJS.lib.WordArray.random(32);
    const hash = CryptoJS.SHA512(random); // Changed to SHA-512
    return hash.toString(CryptoJS.enc.Hex).substring(0, 16);
  }

  // Clear cache method for memory management
  clearCache() {
    this.keyCache.clear();
  }
}