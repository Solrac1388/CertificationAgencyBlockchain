package blockchain

import (
    "bytes"
    "crypto/sha256"
    "encoding/binary"
    "encoding/hex"
    "fmt"
    "time"
)

// Block represents a block in the blockchain
type Block struct {
    Header       BlockHeader    `json:"header"`
    Transactions []*Transaction `json:"transactions"`
}

// BlockHeader contains the block metadata
type BlockHeader struct {
    Version        uint32    `json:"version"`
    PrevBlockHash  string    `json:"prev_block_hash"`
    MerkleRoot     string    `json:"merkle_root"`
    Timestamp      time.Time `json:"timestamp"`
    Bits           uint32    `json:"bits"`
    Nonce          uint32    `json:"nonce"`
    Height         uint64    `json:"height"`
}

// NewBlock creates a new block
func NewBlock(transactions []*Transaction, prevBlockHash string, height uint64) *Block {
    block := &Block{
        Header: BlockHeader{
            Version:       1,
            PrevBlockHash: prevBlockHash,
            Timestamp:     time.Now(),
            Height:        height,
        },
        Transactions: transactions,
    }
    
    // Calculate merkle root
    block.Header.MerkleRoot = block.CalculateMerkleRoot()
    
    return block
}

// GenesisBlock creates the genesis block
func GenesisBlock() *Block {
    // Create genesis transaction
    genesisTx := &Transaction{
        ID:        "genesis",
        PublicKey: "0000000000000000000000000000000000000000",
        Name:      "Genesis",
        Surname:   "Block",
        InquiryID: "genesis",
        Datetime:  time.Now(),
        Signature: "",
    }
    
    return NewBlock([]*Transaction{genesisTx}, "0", 0)
}

// Hash calculates the hash of the block header
func (b *Block) Hash() string {
    var buf bytes.Buffer
    
    // Write header fields in order
    binary.Write(&buf, binary.BigEndian, b.Header.Version)
    buf.WriteString(b.Header.PrevBlockHash)
    buf.WriteString(b.Header.MerkleRoot)
    binary.Write(&buf, binary.BigEndian, b.Header.Timestamp.Unix())
    binary.Write(&buf, binary.BigEndian, b.Header.Bits)
    binary.Write(&buf, binary.BigEndian, b.Header.Nonce)
    
    hash := sha256.Sum256(buf.Bytes())
    return hex.EncodeToString(hash[:])
}

// CalculateMerkleRoot calculates the merkle root of transactions
func (b *Block) CalculateMerkleRoot() string {
    if len(b.Transactions) == 0 {
        return ""
    }
    
    var hashes [][]byte
    
    // Get transaction hashes
    for _, tx := range b.Transactions {
        hash, _ := hex.DecodeString(tx.Hash())
        hashes = append(hashes, hash)
    }
    
    // Build merkle tree
    for len(hashes) > 1 {
        var newHashes [][]byte
        
        for i := 0; i < len(hashes); i += 2 {
            var combined []byte
            combined = append(combined, hashes[i]...)
            
            if i+1 < len(hashes) {
                combined = append(combined, hashes[i+1]...)
            } else {
                // If odd number, duplicate last hash
                combined = append(combined, hashes[i]...)
            }
            
            hash := sha256.Sum256(combined)
            newHashes = append(newHashes, hash[:])
        }
        
        hashes = newHashes
    }
    
    return hex.EncodeToString(hashes[0])
}

// Validate validates the block
func (b *Block) Validate() error {
    // Check if block has transactions
    if len(b.Transactions) == 0 {
        return fmt.Errorf("block has no transactions")
    }
    
    // Validate merkle root
    calculatedRoot := b.CalculateMerkleRoot()
    if calculatedRoot != b.Header.MerkleRoot {
        return fmt.Errorf("invalid merkle root")
    }
    
    // Validate each transaction
    for _, tx := range b.Transactions {
        if err := tx.Validate(); err != nil {
            return fmt.Errorf("invalid transaction %s: %w", tx.ID, err)
        }
    }
    
    return nil
}

// Serialize serializes the block to bytes
func (b *Block) Serialize() ([]byte, error) {
    var buf bytes.Buffer
    
    // Magic value
    binary.Write(&buf, binary.BigEndian, uint32(0xD9B4BEF9))
    
    // Create temporary buffer for block data
    var blockBuf bytes.Buffer
    
    // Header
    binary.Write(&blockBuf, binary.BigEndian, b.Header.Version)
    
    // Previous block hash (32 bytes)
    prevHash, _ := hex.DecodeString(b.Header.PrevBlockHash)
    if len(prevHash) < 32 {
        prevHash = append(prevHash, make([]byte, 32-len(prevHash))...)
    }
    blockBuf.Write(prevHash[:32])
    
    // Merkle root (32 bytes)
    merkleRoot, _ := hex.DecodeString(b.Header.MerkleRoot)
    if len(merkleRoot) < 32 {
        merkleRoot = append(merkleRoot, make([]byte, 32-len(merkleRoot))...)
    }
    blockBuf.Write(merkleRoot[:32])
    
    // Timestamp
    binary.Write(&blockBuf, binary.BigEndian, b.Header.Timestamp.Unix())
    
    // Bits and nonce
    binary.Write(&blockBuf, binary.BigEndian, b.Header.Bits)
    binary.Write(&blockBuf, binary.BigEndian, b.Header.Nonce)
    
    // Height
    binary.Write(&blockBuf, binary.BigEndian, b.Header.Height)
    
    // Transaction count
    binary.Write(&blockBuf, binary.BigEndian, uint32(len(b.Transactions)))
    
    // Transactions
    for _, tx := range b.Transactions {
        txBytes, err := tx.Serialize()
        if err != nil {
            return nil, err
        }
        blockBuf.Write(txBytes)
    }
    
    // Write block size
    blockData := blockBuf.Bytes()
    binary.Write(&buf, binary.BigEndian, uint32(len(blockData)))
    
    // Write block data
    buf.Write(blockData)
    
    return buf.Bytes(), nil
}

// GetTransactionByID finds a transaction by ID
func (b *Block) GetTransactionByID(id string) *Transaction {
    for _, tx := range b.Transactions {
        if tx.ID == id {
            return tx
        }
    }
    return nil
}

// GetCertificationByPublicKey finds a certification by public key
func (b *Block) GetCertificationByPublicKey(publicKey string) *Transaction {
    for _, tx := range b.Transactions {
        if tx.PublicKey == publicKey {
            return tx
        }
    }
    return nil
}

// GetCertificationByIdentity finds a certification by name and surname
func (b *Block) GetCertificationByIdentity(name, surname string) *Transaction {
    for _, tx := range b.Transactions {
        if tx.Name == name && tx.Surname == surname {
            return tx
        }
    }
    return nil
}