package storage

import (
    "encoding/json"
    "fmt"
    "time"
    
    "github.com/dgraph-io/badger/v4"
)

// Database represents the key-value database
type Database struct {
    db *badger.DB
}

// Certification represents a stored certification
type Certification struct {
    PublicKey string    `json:"public_key"`
    Name      string    `json:"name"`
    Surname   string    `json:"surname"`
    InquiryID string    `json:"inquiry_id"`
    Datetime  time.Time `json:"datetime"`
    BlockHash string    `json:"block_hash"`
    Height    uint64    `json:"height"`
}

// NewDatabase creates a new database instance
func NewDatabase(dataDir string) (*Database, error) {
    opts := badger.DefaultOptions(dataDir)
    opts.Logger = nil // Disable badger logging
    
    db, err := badger.Open(opts)
    if err != nil {
        return nil, fmt.Errorf("failed to open database: %w", err)
    }
    
    return &Database{db: db}, nil
}

// Close closes the database
func (d *Database) Close() error {
    return d.db.Close()
}

// SaveBlock saves a block to the database
func (d *Database) SaveBlock(block interface{}) error {
    // Convert block to JSON
    data, err := json.Marshal(block)
    if err != nil {
        return fmt.Errorf("failed to marshal block: %w", err)
    }
    
    // Get block height and hash from interface
    var height uint64
    var hash string
    
    if b, ok := block.(interface {
        Hash() string
        Header struct {
            Height uint64
        }
    }); ok {
        height = b.Header.Height
        hash = b.Hash()
    } else {
        return fmt.Errorf("invalid block type")
    }
    
    return d.db.Update(func(txn *badger.Txn) error {
        // Save block by height
        heightKey := fmt.Sprintf("block:height:%d", height)
        if err := txn.Set([]byte(heightKey), data); err != nil {
            return err
        }
        
        // Save block by hash
        hashKey := fmt.Sprintf("block:hash:%s", hash)
        if err := txn.Set([]byte(hashKey), data); err != nil {
            return err
        }
        
        // Update latest block height
        if err := txn.Set([]byte("blockchain:height"), []byte(fmt.Sprintf("%d", height))); err != nil {
            return err
        }
        
        return nil
    })
}

// GetBlock gets a block by height
func (d *Database) GetBlock(height uint64) ([]byte, error) {
    var data []byte
    
    err := d.db.View(func(txn *badger.Txn) error {
        key := fmt.Sprintf("block:height:%d", height)
        item, err := txn.Get([]byte(key))
        if err != nil {
            return err
        }
        
        data, err = item.ValueCopy(nil)
        return err
    })
    
    if err != nil {
        return nil, err
    }
    
    return data, nil
}

// GetBlockByHash gets a block by hash
func (d *Database) GetBlockByHash(hash string) ([]byte, error) {
    var data []byte
    
    err := d.db.View(func(txn *badger.Txn) error {
        key := fmt.Sprintf("block:hash:%s", hash)
        item, err := txn.Get([]byte(key))
        if err != nil {
            return err
        }
        
        data, err = item.ValueCopy(nil)
        return err
    })
    
    if err != nil {
        return nil, err
    }
    
    return data, nil
}

// GetAllBlocks returns all blocks from the database
func (d *Database) GetAllBlocks() ([]interface{}, error) {
    // This is a simplified version - in production, you'd need proper block deserialization
    return nil, nil
}

// SaveCertification saves a certification to the database
func (d *Database) SaveCertification(cert *Certification) error {
    data, err := json.Marshal(cert)
    if err != nil {
        return fmt.Errorf("failed to marshal certification: %w", err)
    }
    
    return d.db.Update(func(txn *badger.Txn) error {
        // Save by public key
        pkKey := fmt.Sprintf("cert:pk:%s", cert.PublicKey)
        if err := txn.Set([]byte(pkKey), data); err != nil {
            return err
        }
        
        // Save by identity (name + surname)
        idKey := fmt.Sprintf("cert:id:%s:%s", cert.Name, cert.Surname)
        if err := txn.Set([]byte(idKey), data); err != nil {
            return err
        }
        
        // Save by inquiry ID
        inqKey := fmt.Sprintf("cert:inq:%s", cert.InquiryID)
        if err := txn.Set([]byte(inqKey), data); err != nil {
            return err
        }
        
        return nil
    })
}

// GetCertificationByPublicKey gets a certification by public key
func (d *Database) GetCertificationByPublicKey(publicKey string) (*Certification, error) {
    var cert Certification
    
    err := d.db.View(func(txn *badger.Txn) error {
        key := fmt.Sprintf("cert:pk:%s", publicKey)
        item, err := txn.Get([]byte(key))
        if err != nil {
            return err
        }
        
        return item.Value(func(val []byte) error {
            return json.Unmarshal(val, &cert)
        })
    })
    
    if err != nil {
        if err == badger.ErrKeyNotFound {
            return nil, nil
        }
        return nil, err
    }
    
    return &cert, nil
}

// GetCertificationByIdentity gets a certification by name and surname
func (d *Database) GetCertificationByIdentity(name, surname string) (*Certification, error) {
    var cert Certification
    
    err := d.db.View(func(txn *badger.Txn) error {
        key := fmt.Sprintf("cert:id:%s:%s", name, surname)
        item, err := txn.Get([]byte(key))
        if err != nil {
            return err
        }
        
        return item.Value(func(val []byte) error {
            return json.Unmarshal(val, &cert)
        })
    })
    
    if err != nil {
        if err == badger.ErrKeyNotFound {
            return nil, nil
        }
        return nil, err
    }
    
    return &cert, nil
}

// GetCertificationByInquiryID gets a certification by inquiry ID
func (d *Database) GetCertificationByInquiryID(inquiryID string) (*Certification, error) {
    var cert Certification
    
    err := d.db.View(func(txn *badger.Txn) error {
        key := fmt.Sprintf("cert:inq:%s", inquiryID)
        item, err := txn.Get([]byte(key))
        if err != nil {
            return err
        }
        
        return item.Value(func(val []byte) error {
            return json.Unmarshal(val, &cert)
        })
    })
    
    if err != nil {
        if err == badger.ErrKeyNotFound {
            return nil, nil
        }
        return nil, err
    }
    
    return &cert, nil
}

// DeleteExpiredCertifications deletes certifications older than the expiry duration
func (d *Database) DeleteExpiredCertifications(expiryDuration time.Duration) error {
    keysToDelete := [][]byte{}
    
    // Find expired certifications
    err := d.db.View(func(txn *badger.Txn) error {
        opts := badger.DefaultIteratorOptions
        opts.PrefetchSize = 10
        it := txn.NewIterator(opts)
        defer it.Close()
        
        prefix := []byte("cert:")
        for it.Seek(prefix); it.ValidForPrefix(prefix); it.Next() {
            item := it.Item()
            
            var cert Certification
            err := item.Value(func(val []byte) error {
                return json.Unmarshal(val, &cert)
            })
            
            if err == nil && time.Since(cert.Datetime) > expiryDuration {
                k := item.KeyCopy(nil)
                keysToDelete = append(keysToDelete, k)
            }
        }
        
        return nil
    })
    
    if err != nil {
        return err
    }
    
    // Delete expired certifications
    return d.db.Update(func(txn *badger.Txn) error {
        for _, key := range keysToDelete {
            if err := txn.Delete(key); err != nil {
                return err
            }
        }
        return nil
    })
}

// GetStats returns database statistics
func (d *Database) GetStats() map[string]interface{} {
    stats := make(map[string]interface{})
    
    var certCount, blockCount int
    
    d.db.View(func(txn *badger.Txn) error {
        opts := badger.DefaultIteratorOptions
        opts.PrefetchValues = false
        it := txn.NewIterator(opts)
        defer it.Close()
        
        // Count certifications
        prefix := []byte("cert:pk:")
        for it.Seek(prefix); it.ValidForPrefix(prefix); it.Next() {
            certCount++
        }
        
        // Count blocks
        prefix = []byte("block:height:")
        for it.Seek(prefix); it.ValidForPrefix(prefix); it.Next() {
            blockCount++
        }
        
        return nil
    })
    
    stats["certifications"] = certCount
    stats["blocks"] = blockCount
    
    return stats
}