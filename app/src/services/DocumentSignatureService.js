import RNFS from 'react-native-fs';
import RNBlobUtil from 'react-native-blob-util';
import { Buffer } from 'buffer';

export class DocumentSignatureService {
  constructor() {
    this.signaturePatterns = {
      // Pattern for text files with embedded signatures
      textSignature: /-----BEGIN SIGNATURE BLOCK-----\n([\s\S]*?)\n-----END SIGNATURE BLOCK-----/g,
      // Pattern for JSON signature blocks
      jsonSignature: /"signatures":\s*\[([\s\S]*?)\]/,
      // Pattern for public keys
      publicKey: /-----BEGIN PUBLIC KEY-----([\s\S]*?)-----END PUBLIC KEY-----/,
    };
  }

  async extractPDFSignatures(base64Content) {
    try {
      const signatures = [];
      
      // Convert base64 to buffer for analysis
      const buffer = Buffer.from(base64Content, 'base64');
      const content = buffer.toString('utf8', 0, Math.min(buffer.length, 10000)); // Check first 10KB
      
      // Look for digital signature objects in PDF
      // PDFs can have signatures in different formats:
      // 1. Embedded in /Sig dictionary
      // 2. In XMP metadata
      // 3. As form fields
      
      // Pattern for signature dictionaries in PDF
      const sigPattern = /\/Type\s*\/Sig[\s\S]*?\/Contents\s*<([0-9A-Fa-f]+)>/g;
      let match;
      
      while ((match = sigPattern.exec(content)) !== null) {
        const hexSignature = match[1];
        // Convert hex to base64
        const signatureBuffer = Buffer.from(hexSignature, 'hex');
        
        // Try to extract signer info from the signature
        const signerInfo = this.extractSignerInfoFromPKCS7(signatureBuffer);
        
        if (signerInfo) {
          signatures.push(signerInfo);
        }
      }
      
      // Also check for signatures in XMP metadata
      const xmpPattern = /<xmp:signatures>([\s\S]*?)<\/xmp:signatures>/g;
      while ((match = xmpPattern.exec(content)) !== null) {
        const xmpSignatures = this.parseXMPSignatures(match[1]);
        signatures.push(...xmpSignatures);
      }
      
      // If no PDF signatures found, check if the PDF contains embedded text signatures
      const textSignatures = await this.extractEmbeddedTextSignatures(content);
      signatures.push(...textSignatures);
      
      return signatures;
    } catch (error) {
      console.error('Error extracting PDF signatures:', error);
      return [];
    }
  }

  async extractTextSignatures(content) {
    try {
      const signatures = [];
      
      // Look for signature blocks in text
      let match;
      while ((match = this.signaturePatterns.textSignature.exec(content)) !== null) {
        const signatureBlock = match[1];
        
        try {
          // Parse signature block (expected format: JSON with signature details)
          const sigData = JSON.parse(signatureBlock);
          
          if (sigData.publicKey && sigData.signature) {
            signatures.push({
              publicKey: sigData.publicKey,
              signature: sigData.signature,
              timestamp: sigData.timestamp || null,
              signerInfo: sigData.signerInfo || null,
            });
          }
        } catch (parseError) {
          // Try alternative format: base64 encoded signature
          const lines = signatureBlock.trim().split('\n');
          if (lines.length >= 2) {
            // First line: public key reference
            // Second line: signature
            const publicKeyRef = lines[0].replace('Public-Key:', '').trim();
            const signature = lines[1].replace('Signature:', '').trim();
            
            signatures.push({
              publicKey: publicKeyRef,
              signature: signature,
              timestamp: null,
            });
          }
        }
      }
      
      // Also check for JSON format signatures
      const jsonMatch = this.signaturePatterns.jsonSignature.exec(content);
      if (jsonMatch) {
        try {
          const jsonSignatures = JSON.parse('[' + jsonMatch[1] + ']');
          jsonSignatures.forEach(sig => {
            if (sig.publicKey && sig.signature) {
              signatures.push({
                publicKey: sig.publicKey,
                signature: sig.signature,
                timestamp: sig.timestamp || null,
              });
            }
          });
        } catch (error) {
          console.error('Error parsing JSON signatures:', error);
        }
      }
      
      // Look for appended signatures at the end of file
      const appendedSig = this.extractAppendedSignature(content);
      if (appendedSig) {
        signatures.push(appendedSig);
      }
      
      return signatures;
    } catch (error) {
      console.error('Error extracting text signatures:', error);
      return [];
    }
  }

  extractSignerInfoFromPKCS7(signatureBuffer) {
    try {
      // This is a simplified extraction - in production you'd use a proper PKCS#7 parser
      // For now, we'll look for common patterns in the signature
      
      const content = signatureBuffer.toString('utf8');
      
      // Look for certificate info (simplified)
      const certPattern = /CN=([^,]+)/;
      const match = certPattern.exec(content);
      
      if (match) {
        return {
          publicKey: this.extractPublicKeyFromCert(signatureBuffer),
          signature: signatureBuffer.toString('base64'),
          timestamp: new Date().toISOString(), // Would extract from signature
          signerInfo: match[1],
        };
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  extractPublicKeyFromCert(certBuffer) {
    // Simplified - would extract actual public key from certificate
    // For now, return a hash of the certificate as identifier
    const crypto = require('crypto-js');
    return crypto.SHA256(certBuffer.toString('base64')).toString();
  }

  parseXMPSignatures(xmpContent) {
    const signatures = [];
    
    try {
      // Parse XMP signature format
      const sigPattern = /<signature[^>]*>([\s\S]*?)<\/signature>/g;
      let match;
      
      while ((match = sigPattern.exec(xmpContent)) !== null) {
        const sigContent = match[1];
        
        // Extract signature details from XMP
        const publicKey = this.extractXMPValue(sigContent, 'publicKey');
        const signature = this.extractXMPValue(sigContent, 'signatureValue');
        const timestamp = this.extractXMPValue(sigContent, 'timestamp');
        
        if (publicKey && signature) {
          signatures.push({
            publicKey,
            signature,
            timestamp,
          });
        }
      }
    } catch (error) {
      console.error('Error parsing XMP signatures:', error);
    }
    
    return signatures;
  }

  extractXMPValue(content, tag) {
    const pattern = new RegExp(`<${tag}>([^<]+)<\/${tag}>`);
    const match = pattern.exec(content);
    return match ? match[1] : null;
  }

  extractEmbeddedTextSignatures(content) {
    const signatures = [];
    
    // Look for base64 encoded signature blocks that might be embedded in PDF as text
    const b64Pattern = /SIGNATURE:([A-Za-z0-9+/=]+)/g;
    let match;
    
    while ((match = b64Pattern.exec(content)) !== null) {
      try {
        const decoded = Buffer.from(match[1], 'base64').toString('utf8');
        const sigData = JSON.parse(decoded);
        
        if (sigData.publicKey && sigData.signature) {
          signatures.push(sigData);
        }
      } catch (error) {
        // Not a valid signature
      }
    }
    
    return signatures;
  }

  extractAppendedSignature(content) {
    // Check if file has appended signature (common in signed text files)
    const lines = content.split('\n');
    const lastLines = lines.slice(-10); // Check last 10 lines
    
    let inSigBlock = false;
    let sigData = {};
    
    for (const line of lastLines) {
      if (line.includes('BEGIN BLOCKCHAIN SIGNATURE')) {
        inSigBlock = true;
        continue;
      }
      
      if (line.includes('END BLOCKCHAIN SIGNATURE')) {
        break;
      }
      
      if (inSigBlock) {
        if (line.startsWith('Public-Key:')) {
          sigData.publicKey = line.replace('Public-Key:', '').trim();
        } else if (line.startsWith('Signature:')) {
          sigData.signature = line.replace('Signature:', '').trim();
        } else if (line.startsWith('Timestamp:')) {
          sigData.timestamp = line.replace('Timestamp:', '').trim();
        }
      }
    }
    
    if (sigData.publicKey && sigData.signature) {
      return sigData;
    }
    
    return null;
  }

  // Method to add a signature to a document (for future use)
  async signDocument(content, privateKey, publicKey) {
    const crypto = require('crypto-js');
    const timestamp = new Date().toISOString();
    
    // Calculate document hash
    const documentHash = crypto.SHA256(content).toString();
    
    // Create signature data
    const signatureData = {
      documentHash,
      timestamp,
      publicKey,
    };
    
    // Sign the data (simplified - would use proper RSA signing)
    const signature = crypto.HmacSHA256(
      JSON.stringify(signatureData),
      privateKey
    ).toString();
    
    // Create signature block
    const signatureBlock = `
-----BEGIN SIGNATURE BLOCK-----
${JSON.stringify({
  publicKey,
  signature,
  timestamp,
  documentHash,
}, null, 2)}
-----END SIGNATURE BLOCK-----`;
    
    return content + '\n\n' + signatureBlock;
  }
}

// Export a singleton instance
export default new DocumentSignatureService();

1. **Crear el proyecto React Native:**
```bash
npx react-native init BlockchainClient
cd BlockchainClient