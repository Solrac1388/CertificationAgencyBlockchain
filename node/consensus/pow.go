package consensus

import (
    "bytes"
    "crypto/sha256"
    "encoding/binary"
    "encoding/hex"
    "fmt"
    "math"
    "math/big"
)

// ProofOfWork represents a proof of work consensus mechanism
type ProofOfWork struct {
    targetBits uint32
    target     *big.Int
}

// NewProofOfWork creates a new proof of work instance
func NewProofOfWork(bits uint32) *ProofOfWork {
    target := big.NewInt(1)
    target.Lsh(target, uint(256-bits))
    
    return &ProofOfWork{
        targetBits: bits,
        target:     target,
    }
}

// Block interface for proof of work
type Block interface {
    Hash() string
    GetHeader() BlockHeader
    SetNonce(nonce uint32)
}

// BlockHeader interface
type BlockHeader interface {
    GetVersion() uint32
    GetPrevBlockHash() string
    GetMerkleRoot() string
    GetTimestamp() int64
    GetBits() uint32
    GetNonce() uint32
}

// Mine mines a block
func (pow *ProofOfWork) Mine(block interface{}) bool {
    // Type assertion to access block methods
    b, ok := block.(interface {
        Hash() string
        Header interface {
            Version       uint32
            PrevBlockHash string
            MerkleRoot    string
            Timestamp     interface{ Unix() int64 }
            Bits          uint32
            Nonce         uint32
        }
    })
    
    if !ok {
        return false
    }
    
    var hashInt big.Int
    var hash [32]byte
    nonce := uint32(0)
    
    fmt.Printf("Mining block with target bits: %d\n", pow.targetBits)
    
    for nonce < math.MaxUint32 {
        // Update nonce in block header
        if setter, ok := block.(interface{ SetNonce(uint32) }); ok {
            setter.SetNonce(nonce)
        } else {
            // Direct field access for our block type
            if header, ok := getBlockHeader(block); ok {
                header.Nonce = nonce
            }
        }
        
        // Calculate hash
        hash = pow.calculateHash(block)
        hashInt.SetBytes(hash[:])
        
        // Check if hash meets target
        if hashInt.Cmp(pow.target) == -1 {
            fmt.Printf("Found valid nonce: %d\n", nonce)
            return true
        }
        
        nonce++
        
        // Show progress
        if nonce%100000 == 0 {
            fmt.Printf("Mining progress: %d hashes tried\n", nonce)
        }
    }
    
    return false
}

// Validate validates a block's proof of work
func (pow *ProofOfWork) Validate(block interface{}) bool {
    var hashInt big.Int
    
    hash := pow.calculateHash(block)
    hashInt.SetBytes(hash[:])
    
    return hashInt.Cmp(pow.target) == -1
}

// calculateHash calculates the hash of a block
func (pow *ProofOfWork) calculateHash(block interface{}) [32]byte {
    var buf bytes.Buffer
    
    // Get block header fields
    if header, ok := getBlockHeader(block); ok {
        binary.Write(&buf, binary.BigEndian, header.Version)
        buf.WriteString(header.PrevBlockHash)
        buf.WriteString(header.MerkleRoot)
        binary.Write(&buf, binary.BigEndian, header.Timestamp.Unix())
        binary.Write(&buf, binary.BigEndian, header.Bits)
        binary.Write(&buf, binary.BigEndian, header.Nonce)
    }
    
    return sha256.Sum256(buf.Bytes())
}

// getBlockHeader extracts header from block using reflection or type assertion
func getBlockHeader(block interface{}) (struct {
    Version       uint32
    PrevBlockHash string
    MerkleRoot    string
    Timestamp     interface{ Unix() int64 }
    Bits          uint32
    Nonce         uint32
}, bool) {
    // Try to access Header field
    if b, ok := block.(interface {
        Header struct {
            Version       uint32
            PrevBlockHash string
            MerkleRoot    string
            Timestamp     interface{ Unix() int64 }
            Bits          uint32
            Nonce         uint32
        }
    }); ok {
        return b.Header, true
    }
    
    return struct {
        Version       uint32
        PrevBlockHash string
        MerkleRoot    string
        Timestamp     interface{ Unix() int64 }
        Bits          uint32
        Nonce         uint32
    }{}, false
}

// GetTarget returns the current target as a hex string
func (pow *ProofOfWork) GetTarget() string {
    return hex.EncodeToString(pow.target.Bytes())
}

// SetDifficulty updates the difficulty
func (pow *ProofOfWork) SetDifficulty(bits uint32) {
    pow.targetBits = bits
    pow.target = big.NewInt(1)
    pow.target.Lsh(pow.target, uint(256-bits))
}

// GetDifficulty returns the current difficulty bits
func (pow *ProofOfWork) GetDifficulty() uint32 {
    return pow.targetBits
}

// CalculateDifficulty calculates new difficulty based on time taken
func CalculateDifficulty(currentBits uint32, actualTime, targetTime int64) uint32 {
    // Simple difficulty adjustment algorithm
    // If blocks are being mined too quickly, increase difficulty
    // If blocks are being mined too slowly, decrease difficulty
    
    if actualTime < targetTime/2 {
        // Too fast, increase difficulty
        if currentBits < 32 {
            return currentBits + 1
        }
    } else if actualTime > targetTime*2 {
        // Too slow, decrease difficulty
        if currentBits > 1 {
            return currentBits - 1
        }
    }
    
    return currentBits
}