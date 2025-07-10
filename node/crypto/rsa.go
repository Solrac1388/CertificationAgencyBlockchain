package crypto

import (
    "crypto"
    "crypto/rand"
    "crypto/rsa"
    "crypto/sha256"
    "crypto/x509"
    "encoding/base64"
    "encoding/pem"
    "fmt"
)

// GenerateRSAKeyPair generates a new RSA key pair
func GenerateRSAKeyPair(bits int) (*rsa.PrivateKey, *rsa.PublicKey, error) {
    privateKey, err := rsa.GenerateKey(rand.Reader, bits)
    if err != nil {
        return nil, nil, fmt.Errorf("failed to generate RSA key pair: %w", err)
    }
    
    return privateKey, &privateKey.PublicKey, nil
}

// PublicKeyToPEM converts an RSA public key to PEM format
func PublicKeyToPEM(pubKey *rsa.PublicKey) (string, error) {
    pubKeyBytes, err := x509.MarshalPKIXPublicKey(pubKey)
    if err != nil {
        return "", fmt.Errorf("failed to marshal public key: %w", err)
    }
    
    pubKeyPEM := &pem.Block{
        Type:  "PUBLIC KEY",
        Bytes: pubKeyBytes,
    }
    
    return string(pem.EncodeToMemory(pubKeyPEM)), nil
}

// PEMToPublicKey converts a PEM encoded public key to RSA public key
func PEMToPublicKey(pemStr string) (*rsa.PublicKey, error) {
    block, _ := pem.Decode([]byte(pemStr))
    if block == nil {
        return nil, fmt.Errorf("failed to decode PEM block")
    }
    
    pub, err := x509.ParsePKIXPublicKey(block.Bytes)
    if err != nil {
        return nil, fmt.Errorf("failed to parse public key: %w", err)
    }
    
    rsaPub, ok := pub.(*rsa.PublicKey)
    if !ok {
        return nil, fmt.Errorf("not an RSA public key")
    }
    
    return rsaPub, nil
}

// PrivateKeyToPEM converts an RSA private key to PEM format
func PrivateKeyToPEM(privKey *rsa.PrivateKey) string {
    privKeyBytes := x509.MarshalPKCS1PrivateKey(privKey)
    
    privKeyPEM := &pem.Block{
        Type:  "RSA PRIVATE KEY",
        Bytes: privKeyBytes,
    }
    
    return string(pem.EncodeToMemory(privKeyPEM))
}

// PEMToPrivateKey converts a PEM encoded private key to RSA private key
func PEMToPrivateKey(pemStr string) (*rsa.PrivateKey, error) {
    block, _ := pem.Decode([]byte(pemStr))
    if block == nil {
        return nil, fmt.Errorf("failed to decode PEM block")
    }
    
    privKey, err := x509.ParsePKCS1PrivateKey(block.Bytes)
    if err != nil {
        return nil, fmt.Errorf("failed to parse private key: %w", err)
    }
    
    return privKey, nil
}

// SignMessage signs a message with an RSA private key
func SignMessage(privKey *rsa.PrivateKey, message string) (string, error) {
    msgHash := sha256.Sum256([]byte(message))
    
    signature, err := rsa.SignPKCS1v15(rand.Reader, privKey, crypto.SHA256, msgHash[:])
    if err != nil {
        return "", fmt.Errorf("failed to sign message: %w", err)
    }
    
    return base64.StdEncoding.EncodeToString(signature), nil
}

// VerifyRSASignature verifies an RSA signature
func VerifyRSASignature(publicKeyPEM, message, signatureBase64 string) error {
    // Parse public key
    pubKey, err := PEMToPublicKey(publicKeyPEM)
    if err != nil {
        return fmt.Errorf("failed to parse public key: %w", err)
    }
    
    // Decode signature
    signature, err := base64.StdEncoding.DecodeString(signatureBase64)
    if err != nil {
        return fmt.Errorf("failed to decode signature: %w", err)
    }
    
    // Hash the message
    msgHash := sha256.Sum256([]byte(message))
    
    // Verify signature
    err = rsa.VerifyPKCS1v15(pubKey, crypto.SHA256, msgHash[:], signature)
    if err != nil {
        return fmt.Errorf("signature verification failed: %w", err)
    }
    
    return nil
}

// ValidatePublicKey validates that a string is a valid RSA public key
func ValidatePublicKey(publicKeyPEM string) error {
    _, err := PEMToPublicKey(publicKeyPEM)
    return err
}

// GetPublicKeyFingerprint returns a fingerprint of the public key
func GetPublicKeyFingerprint(publicKeyPEM string) (string, error) {
    pubKey, err := PEMToPublicKey(publicKeyPEM)
    if err != nil {
        return "", err
    }
    
    pubKeyBytes, err := x509.MarshalPKIXPublicKey(pubKey)
    if err != nil {
        return "", err
    }
    
    hash := sha256.Sum256(pubKeyBytes)
    return fmt.Sprintf("%x", hash), nil
}

// ComparePublicKeys checks if two public keys are the same
func ComparePublicKeys(pubKey1PEM, pubKey2PEM string) (bool, error) {
    fp1, err := GetPublicKeyFingerprint(pubKey1PEM)
    if err != nil {
        return false, err
    }
    
    fp2, err := GetPublicKeyFingerprint(pubKey2PEM)
    if err != nil {
        return false, err
    }
    
    return fp1 == fp2, nil
}