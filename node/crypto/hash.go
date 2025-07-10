package crypto

import (
    "crypto/sha256"
    "encoding/hex"
    "fmt"
)

// HashData computes SHA256 hash of data
func HashData(data []byte) string {
    hash := sha256.Sum256(data)
    return hex.EncodeToString(hash[:])
}

// HashString computes SHA256 hash of a string
func HashString(s string) string {
    return HashData([]byte(s))
}

// HashMultiple computes SHA256 hash of multiple byte arrays concatenated
func HashMultiple(data ...[]byte) string {
    hasher := sha256.New()
    for _, d := range data {
        hasher.Write(d)
    }
    return hex.EncodeToString(hasher.Sum(nil))
}

// ValidateHash checks if a hash is valid (correct length and hex format)
func ValidateHash(hash string) error {
    if len(hash) != 64 {
        return fmt.Errorf("invalid hash length: expected 64, got %d", len(hash))
    }
    
    _, err := hex.DecodeString(hash)
    if err != nil {
        return fmt.Errorf("invalid hash format: %w", err)
    }
    
    return nil
}

// CompareHashes compares two hashes
func CompareHashes(hash1, hash2 string) bool {
    return hash1 == hash2
}

// MerkleHash computes the hash of two hashes concatenated (for Merkle trees)
func MerkleHash(left, right string) string {
    leftBytes, _ := hex.DecodeString(left)
    rightBytes, _ := hex.DecodeString(right)
    
    combined := append(leftBytes, rightBytes...)
    hash := sha256.Sum256(combined)
    
    return hex.EncodeToString(hash[:])
}

// CalculateMerkleRoot calculates the Merkle root from a list of hashes
func CalculateMerkleRoot(hashes []string) string {
    if len(hashes) == 0 {
        return ""
    }
    
    if len(hashes) == 1 {
        return hashes[0]
    }
    
    // Create a copy to avoid modifying the original
    currentLevel := make([]string, len(hashes))
    copy(currentLevel, hashes)
    
    for len(currentLevel) > 1 {
        nextLevel := make([]string, 0)
        
        for i := 0; i < len(currentLevel); i += 2 {
            left := currentLevel[i]
            
            var right string
            if i+1 < len(currentLevel) {
                right = currentLevel[i+1]
            } else {
                // If odd number of hashes, duplicate the last one
                right = left
            }
            
            nextLevel = append(nextLevel, MerkleHash(left, right))
        }
        
        currentLevel = nextLevel
    }
    
    return currentLevel[0]
}

// DoubleHash performs SHA256(SHA256(data))
func DoubleHash(data []byte) string {
    hash1 := sha256.Sum256(data)
    hash2 := sha256.Sum256(hash1[:])
    return hex.EncodeToString(hash2[:])
}

// HashObject serializes and hashes an object
func HashObject(obj interface{}) (string, error) {
    // This is a simplified version - in production you'd use proper serialization
    data := fmt.Sprintf("%v", obj)
    return HashString(data), nil
}