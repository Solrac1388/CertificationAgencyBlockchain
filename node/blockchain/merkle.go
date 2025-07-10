package blockchain

import (
    "crypto/sha256"
    "encoding/hex"
    "fmt"
)

// MerkleNode represents a node in the Merkle tree
type MerkleNode struct {
    Left  *MerkleNode
    Right *MerkleNode
    Hash  string
}

// MerkleTree represents a Merkle tree
type MerkleTree struct {
    Root *MerkleNode
}

// NewMerkleNode creates a new Merkle node
func NewMerkleNode(left, right *MerkleNode, data []byte) *MerkleNode {
    node := &MerkleNode{}
    
    if left == nil && right == nil {
        // Leaf node
        hash := sha256.Sum256(data)
        node.Hash = hex.EncodeToString(hash[:])
    } else {
        // Non-leaf node
        var prevHashes []byte
        if left != nil {
            h, _ := hex.DecodeString(left.Hash)
            prevHashes = append(prevHashes, h...)
        }
        if right != nil {
            h, _ := hex.DecodeString(right.Hash)
            prevHashes = append(prevHashes, h...)
        }
        
        hash := sha256.Sum256(prevHashes)
        node.Hash = hex.EncodeToString(hash[:])
    }
    
    node.Left = left
    node.Right = right
    
    return node
}

// NewMerkleTree creates a new Merkle tree from transaction data
func NewMerkleTree(data [][]byte) *MerkleTree {
    var nodes []*MerkleNode
    
    // Create leaf nodes
    for _, datum := range data {
        node := NewMerkleNode(nil, nil, datum)
        nodes = append(nodes, node)
    }
    
    // If odd number of nodes, duplicate the last one
    if len(nodes)%2 != 0 {
        nodes = append(nodes, nodes[len(nodes)-1])
    }
    
    // Build tree
    for len(nodes) > 1 {
        var level []*MerkleNode
        
        for i := 0; i < len(nodes); i += 2 {
            node := NewMerkleNode(nodes[i], nodes[i+1], nil)
            level = append(level, node)
        }
        
        nodes = level
        
        // If odd number of nodes at this level, duplicate the last one
        if len(nodes) > 1 && len(nodes)%2 != 0 {
            nodes = append(nodes, nodes[len(nodes)-1])
        }
    }
    
    tree := &MerkleTree{Root: nodes[0]}
    return tree
}

// GetRootHash returns the root hash of the Merkle tree
func (mt *MerkleTree) GetRootHash() string {
    if mt.Root != nil {
        return mt.Root.Hash
    }
    return ""
}

// VerifyTransaction verifies that a transaction is in the Merkle tree
func (mt *MerkleTree) VerifyTransaction(transactionHash string, merkleProof []string, index int) bool {
    computedHash := transactionHash
    
    for i, proofElement := range merkleProof {
        var combinedHash []byte
        h1, _ := hex.DecodeString(computedHash)
        h2, _ := hex.DecodeString(proofElement)
        
        // Determine order based on index
        if (index>>uint(i))&1 == 0 {
            combinedHash = append(h1, h2...)
        } else {
            combinedHash = append(h2, h1...)
        }
        
        hash := sha256.Sum256(combinedHash)
        computedHash = hex.EncodeToString(hash[:])
    }
    
    return computedHash == mt.Root.Hash
}

// GenerateMerkleProof generates a Merkle proof for a transaction
func GenerateMerkleProof(transactions []*Transaction, targetIndex int) ([]string, error) {
    if targetIndex < 0 || targetIndex >= len(transactions) {
        return nil, fmt.Errorf("invalid transaction index")
    }
    
    // Convert transactions to byte arrays
    var data [][]byte
    for _, tx := range transactions {
        txBytes, _ := tx.Serialize()
        data = append(data, txBytes)
    }
    
    // Build proof
    proof := []string{}
    nodes := make([]string, len(data))
    
    // Create leaf hashes
    for i, datum := range data {
        hash := sha256.Sum256(datum)
        nodes[i] = hex.EncodeToString(hash[:])
    }
    
    currentIndex := targetIndex
    
    for len(nodes) > 1 {
        // If odd number, duplicate last node
        if len(nodes)%2 != 0 {
            nodes = append(nodes, nodes[len(nodes)-1])
        }
        
        // Add sibling to proof
        siblingIndex := currentIndex ^ 1
        if siblingIndex < len(nodes) {
            proof = append(proof, nodes[siblingIndex])
        }
        
        // Build next level
        var nextLevel []string
        for i := 0; i < len(nodes); i += 2 {
            h1, _ := hex.DecodeString(nodes[i])
            h2, _ := hex.DecodeString(nodes[i+1])
            combined := append(h1, h2...)
            hash := sha256.Sum256(combined)
            nextLevel = append(nextLevel, hex.EncodeToString(hash[:]))
        }
        
        nodes = nextLevel
        currentIndex = currentIndex / 2
    }
    
    return proof, nil
}

// CalculateMerkleRootFromTransactions calculates the Merkle root from a list of transactions
func CalculateMerkleRootFromTransactions(transactions []*Transaction) string {
    if len(transactions) == 0 {
        return ""
    }
    
    // Convert transactions to byte arrays
    var data [][]byte
    for _, tx := range transactions {
        txBytes, _ := tx.Serialize()
        data = append(data, txBytes)
    }
    
    tree := NewMerkleTree(data)
    return tree.GetRootHash()
}