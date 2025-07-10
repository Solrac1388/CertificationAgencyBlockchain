package blockchain

import (
    "context"
    "fmt"
    "sync"
    "time"
    
    "github.com/CertificationAgencyBlockchain/node/consensus"
    "github.com/CertificationAgencyBlockchain/node/storage"
    "github.com/CertificationAgencyBlockchain/node/utils"
)

// Blockchain represents the blockchain
type Blockchain struct {
    mu              sync.RWMutex
    blocks          []*Block
    currentHeight   uint64
    db              *storage.Database
    logger          *utils.Logger
    
    // Mining
    miningPool      []*Transaction
    miningMu        sync.Mutex
    difficulty      uint32
    miningEnabled   bool
    
    // Consensus
    pow             *consensus.ProofOfWork
}

// NewBlockchain creates a new blockchain
func NewBlockchain(db *storage.Database, logger *utils.Logger) (*Blockchain, error) {
    bc := &Blockchain{
        blocks:        make([]*Block, 0),
        db:            db,
        logger:        logger,
        miningPool:    make([]*Transaction, 0),
        difficulty:    16, // Initial difficulty
        miningEnabled: false,
    }
    
    // Initialize proof of work
    bc.pow = consensus.NewProofOfWork(bc.difficulty)
    
    // Load blockchain from database
    if err := bc.loadFromDB(); err != nil {
        // If no blockchain exists, create genesis block
        bc.logger.Info("Creating new blockchain with genesis block")
        genesis := GenesisBlock()
        if err := bc.AddBlock(genesis); err != nil {
            return nil, fmt.Errorf("failed to add genesis block: %w", err)
        }
    }
    
    return bc, nil
}

// loadFromDB loads the blockchain from the database
func (bc *Blockchain) loadFromDB() error {
    // Load blocks from database
    blocks, err := bc.db.GetAllBlocks()
    if err != nil {
        return err
    }
    
    if len(blocks) == 0 {
        return fmt.Errorf("no blocks found")
    }
    
    bc.blocks = blocks
    bc.currentHeight = uint64(len(blocks) - 1)
    
    bc.logger.Info("Loaded %d blocks from database", len(blocks))
    return nil
}

// AddBlock adds a new block to the blockchain
func (bc *Blockchain) AddBlock(block *Block) error {
    bc.mu.Lock()
    defer bc.mu.Unlock()
    
    // Validate block
    if err := block.Validate(); err != nil {
        return fmt.Errorf("invalid block: %w", err)
    }
    
    // Check previous block hash
    if len(bc.blocks) > 0 {
        lastBlock := bc.blocks[len(bc.blocks)-1]
        if block.Header.PrevBlockHash != lastBlock.Hash() {
            return fmt.Errorf("invalid previous block hash")
        }
        
        // Check height
        if block.Header.Height != lastBlock.Header.Height+1 {
            return fmt.Errorf("invalid block height")
        }
    }
    
    // Verify proof of work
    if !bc.pow.Validate(block) {
        return fmt.Errorf("invalid proof of work")
    }
    
    // Add block to chain
    bc.blocks = append(bc.blocks, block)
    bc.currentHeight = block.Header.Height
    
    // Save to database
    if err := bc.db.SaveBlock(block); err != nil {
        // Rollback
        bc.blocks = bc.blocks[:len(bc.blocks)-1]
        bc.currentHeight--
        return fmt.Errorf("failed to save block: %w", err)
    }
    
    // Update database with certifications
    for _, tx := range block.Transactions {
        cert := &storage.Certification{
            PublicKey: tx.PublicKey,
            Name:      tx.Name,
            Surname:   tx.Surname,
            InquiryID: tx.InquiryID,
            Datetime:  tx.Datetime,
            BlockHash: block.Hash(),
            Height:    block.Header.Height,
        }
        
        if err := bc.db.SaveCertification(cert); err != nil {
            bc.logger.Error("Failed to save certification: %v", err)
        }
    }
    
    // Remove mined transactions from pool
    bc.removeMinedTransactions(block.Transactions)
    
    bc.logger.Info("Added block %d with hash %s", block.Header.Height, block.Hash())
    return nil
}

// GetBlock gets a block by height
func (bc *Blockchain) GetBlock(height uint64) (*Block, error) {
    bc.mu.RLock()
    defer bc.mu.RUnlock()
    
    if height >= uint64(len(bc.blocks)) {
        return nil, fmt.Errorf("block not found")
    }
    
    return bc.blocks[height], nil
}

// GetBlockByHash gets a block by hash
func (bc *Blockchain) GetBlockByHash(hash string) (*Block, error) {
    bc.mu.RLock()
    defer bc.mu.RUnlock()
    
    for _, block := range bc.blocks {
        if block.Hash() == hash {
            return block, nil
        }
    }
    
    return nil, fmt.Errorf("block not found")
}

// GetLatestBlock gets the latest block
func (bc *Blockchain) GetLatestBlock() *Block {
    bc.mu.RLock()
    defer bc.mu.RUnlock()
    
    if len(bc.blocks) == 0 {
        return nil
    }
    
    return bc.blocks[len(bc.blocks)-1]
}

// GetHeight returns the current blockchain height
func (bc *Blockchain) GetHeight() uint64 {
    bc.mu.RLock()
    defer bc.mu.RUnlock()
    
    return bc.currentHeight
}

// AddTransaction adds a transaction to the mining pool
func (bc *Blockchain) AddTransaction(tx *Transaction) error {
    bc.miningMu.Lock()
    defer bc.miningMu.Unlock()
    
    // Validate transaction
    if err := tx.Validate(); err != nil {
        return err
    }
    
    // Verify signature
    if err := tx.VerifySignature(); err != nil {
        return fmt.Errorf("invalid signature: %w", err)
    }
    
    // Check if inquiry ID already exists
    if bc.inquiryExists(tx.InquiryID) {
        return fmt.Errorf("inquiry ID already exists")
    }
    
    // Check if already in pool
    for _, poolTx := range bc.miningPool {
        if poolTx.ID == tx.ID {
            return fmt.Errorf("transaction already in pool")
        }
    }
    
    // Add to pool
    bc.miningPool = append(bc.miningPool, tx)
    bc.logger.Info("Added transaction %s to mining pool", tx.ID)
    
    return nil
}

// GetMiningPool returns transactions in the mining pool
func (bc *Blockchain) GetMiningPool() []*Transaction {
    bc.miningMu.Lock()
    defer bc.miningMu.Unlock()
    
    pool := make([]*Transaction, len(bc.miningPool))
    copy(pool, bc.miningPool)
    return pool
}

// StartMining starts the mining process
func (bc *Blockchain) StartMining(ctx context.Context) {
    bc.miningEnabled = true
    bc.logger.Info("Mining started")
    
    ticker := time.NewTicker(30 * time.Second)
    defer ticker.Stop()
    
    for {
        select {
        case <-ctx.Done():
            bc.logger.Info("Mining stopped")
            return
        case <-ticker.C:
            if len(bc.GetMiningPool()) > 0 {
                bc.mineBlock()
            }
        }
    }
}

// StopMining stops the mining process
func (bc *Blockchain) StopMining() {
    bc.miningEnabled = false
}

// mineBlock mines a new block
func (bc *Blockchain) mineBlock() {
    bc.miningMu.Lock()
    
    // Get transactions to mine (max 1000)
    var transactions []*Transaction
    maxTx := 1000
    if len(bc.miningPool) < maxTx {
        transactions = make([]*Transaction, len(bc.miningPool))
        copy(transactions, bc.miningPool)
    } else {
        transactions = make([]*Transaction, maxTx)
        copy(transactions, bc.miningPool[:maxTx])
    }
    
    bc.miningMu.Unlock()
    
    if len(transactions) == 0 {
        return
    }
    
    // Create new block
    latestBlock := bc.GetLatestBlock()
    newBlock := NewBlock(transactions, latestBlock.Hash(), latestBlock.Header.Height+1)
    newBlock.Header.Bits = bc.difficulty
    
    bc.logger.Info("Mining block %d with %d transactions", newBlock.Header.Height, len(transactions))
    
    // Mine the block
    if bc.pow.Mine(newBlock) {
        // Add block to chain
        if err := bc.AddBlock(newBlock); err != nil {
            bc.logger.Error("Failed to add mined block: %v", err)
        } else {
            bc.logger.Info("Successfully mined block %d", newBlock.Header.Height)
            
            // Adjust difficulty if needed
            if newBlock.Header.Height%2016 == 0 {
                bc.adjustDifficulty()
            }
        }
    }
}

// adjustDifficulty adjusts the mining difficulty
func (bc *Blockchain) adjustDifficulty() {
    // Simple difficulty adjustment
    // In production, this should be based on block time
    bc.mu.Lock()
    defer bc.mu.Unlock()
    
    // For now, just log
    bc.logger.Info("Difficulty adjustment check at height %d", bc.currentHeight)
}

// removeMinedTransactions removes mined transactions from the pool
func (bc *Blockchain) removeMinedTransactions(minedTxs []*Transaction) {
    bc.miningMu.Lock()
    defer bc.miningMu.Unlock()
    
    newPool := make([]*Transaction, 0)
    
    for _, poolTx := range bc.miningPool {
        found := false
        for _, minedTx := range minedTxs {
            if poolTx.ID == minedTx.ID {
                found = true
                break
            }
        }
        if !found {
            newPool = append(newPool, poolTx)
        }
    }
    
    bc.miningPool = newPool
}

// inquiryExists checks if an inquiry ID already exists in the blockchain
func (bc *Blockchain) inquiryExists(inquiryID string) bool {
    // Check in blockchain
    for _, block := range bc.blocks {
        for _, tx := range block.Transactions {
            if tx.InquiryID == inquiryID {
                return true
            }
        }
    }
    
    // Check in mining pool
    for _, tx := range bc.miningPool {
        if tx.InquiryID == inquiryID {
            return true
        }
    }
    
    return false
}

// GetCertificationByPublicKey finds a certification by public key
func (bc *Blockchain) GetCertificationByPublicKey(publicKey string) (*Transaction, error) {
    // First check database cache
    cert, err := bc.db.GetCertificationByPublicKey(publicKey)
    if err == nil && cert != nil {
        // Convert to transaction
        tx := &Transaction{
            PublicKey: cert.PublicKey,
            Name:      cert.Name,
            Surname:   cert.Surname,
            InquiryID: cert.InquiryID,
            Datetime:  cert.Datetime,
        }
        return tx, nil
    }
    
    // Search in blockchain
    bc.mu.RLock()
    defer bc.mu.RUnlock()
    
    // Search from newest to oldest
    for i := len(bc.blocks) - 1; i >= 0; i-- {
        block := bc.blocks[i]
        for _, tx := range block.Transactions {
            if tx.PublicKey == publicKey {
                return tx, nil
            }
        }
    }
    
    return nil, fmt.Errorf("certification not found")
}

// GetCertificationByIdentity finds a certification by name and surname
func (bc *Blockchain) GetCertificationByIdentity(name, surname string) (*Transaction, error) {
    // First check database cache
    cert, err := bc.db.GetCertificationByIdentity(name, surname)
    if err == nil && cert != nil {
        // Convert to transaction
        tx := &Transaction{
            PublicKey: cert.PublicKey,
            Name:      cert.Name,
            Surname:   cert.Surname,
            InquiryID: cert.InquiryID,
            Datetime:  cert.Datetime,
        }
        return tx, nil
    }
    
    // Search in blockchain
    bc.mu.RLock()
    defer bc.mu.RUnlock()
    
    // Search from newest to oldest
    for i := len(bc.blocks) - 1; i >= 0; i-- {
        block := bc.blocks[i]
        for _, tx := range block.Transactions {
            if tx.Name == name && tx.Surname == surname {
                return tx, nil
            }
        }
    }
    
    return nil, fmt.Errorf("certification not found")
}

// GetAllBlocks returns all blocks in the blockchain
func (bc *Blockchain) GetAllBlocks() []*Block {
    bc.mu.RLock()
    defer bc.mu.RUnlock()
    
    blocks := make([]*Block, len(bc.blocks))
    copy(blocks, bc.blocks)
    return blocks
}