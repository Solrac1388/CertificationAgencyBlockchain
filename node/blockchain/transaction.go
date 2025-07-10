package blockchain

import (
    "bytes"
    "crypto/sha256"
    "encoding/binary"
    "encoding/hex"
    "encoding/json"
    "fmt"
    "time"
    
    "github.com/CertificationAgencyBlockchain/node/crypto"
)

// Transaction represents a certification transaction
type Transaction struct {
    ID        string    `json:"id"`
    PublicKey string    `json:"public_key"`
    Name      string    `json:"name"`
    Surname   string    `json:"surname"`
    InquiryID string    `json:"inquiry_id"`
    Datetime  time.Time `json:"datetime"`
    Signature string    `json:"signature"`
    Status    string    `json:"status"`
}

// NewTransaction creates a new transaction
func NewTransaction(publicKey, name, surname, inquiryID string, datetime time.Time, signature string) *Transaction {
    tx := &Transaction{
        PublicKey: publicKey,
        Name:      name,
        Surname:   surname,
        InquiryID: inquiryID,
        Datetime:  datetime,
        Signature: signature,
        Status:    "pending",
    }
    
    tx.ID = tx.Hash()
    return tx
}

// Hash calculates the hash of the transaction
func (tx *Transaction) Hash() string {
    var buf bytes.Buffer
    
    buf.WriteString(tx.PublicKey)
    buf.WriteString(tx.Name)
    buf.WriteString(tx.Surname)
    buf.WriteString(tx.InquiryID)
    binary.Write(&buf, binary.BigEndian, tx.Datetime.Unix())
    
    hash := sha256.Sum256(buf.Bytes())
    return hex.EncodeToString(hash[:])
}

// Validate validates the transaction
func (tx *Transaction) Validate() error {
    // Check required fields
    if tx.PublicKey == "" {
        return fmt.Errorf("public key is required")
    }
    
    if tx.Name == "" || tx.Surname == "" {
        return fmt.Errorf("name and surname are required")
    }
    
    if tx.InquiryID == "" {
        return fmt.Errorf("inquiry ID is required")
    }
    
    if tx.Signature == "" {
        return fmt.Errorf("signature is required")
    }
    
    // Validate datetime is not too old (24 hours)
    if time.Since(tx.Datetime) > 24*time.Hour {
        return fmt.Errorf("transaction datetime is too old")
    }
    
    // Validate datetime is not in the future
    if tx.Datetime.After(time.Now().Add(5 * time.Minute)) {
        return fmt.Errorf("transaction datetime is in the future")
    }
    
    return nil
}

// VerifySignature verifies the RSA signature of the transaction
func (tx *Transaction) VerifySignature() error {
    // Create the message that was signed
    message := tx.GetSignableMessage()
    
    // Verify the signature
    return crypto.VerifyRSASignature(tx.PublicKey, message, tx.Signature)
}

// GetSignableMessage returns the message that should be signed
func (tx *Transaction) GetSignableMessage() string {
    return fmt.Sprintf("%s|%s|%s|%s|%d",
        tx.PublicKey,
        tx.Name,
        tx.Surname,
        tx.InquiryID,
        tx.Datetime.Unix(),
    )
}

// Serialize serializes the transaction to bytes
func (tx *Transaction) Serialize() ([]byte, error) {
    var buf bytes.Buffer
    
    // Write fields with length prefixes
    writeString := func(s string) error {
        if err := binary.Write(&buf, binary.BigEndian, uint32(len(s))); err != nil {
            return err
        }
        _, err := buf.WriteString(s)
        return err
    }
    
    if err := writeString(tx.ID); err != nil {
        return nil, err
    }
    
    if err := writeString(tx.PublicKey); err != nil {
        return nil, err
    }
    
    if err := writeString(tx.Name); err != nil {
        return nil, err
    }
    
    if err := writeString(tx.Surname); err != nil {
        return nil, err
    }
    
    if err := writeString(tx.InquiryID); err != nil {
        return nil, err
    }
    
    if err := binary.Write(&buf, binary.BigEndian, tx.Datetime.Unix()); err != nil {
        return nil, err
    }
    
    if err := writeString(tx.Signature); err != nil {
        return nil, err
    }
    
    if err := writeString(tx.Status); err != nil {
        return nil, err
    }
    
    return buf.Bytes(), nil
}

// Deserialize deserializes a transaction from bytes
func DeserializeTransaction(data []byte) (*Transaction, error) {
    buf := bytes.NewReader(data)
    tx := &Transaction{}
    
    readString := func() (string, error) {
        var length uint32
        if err := binary.Read(buf, binary.BigEndian, &length); err != nil {
            return "", err
        }
        
        strBytes := make([]byte, length)
        if _, err := buf.Read(strBytes); err != nil {
            return "", err
        }
        
        return string(strBytes), nil
    }
    
    var err error
    
    if tx.ID, err = readString(); err != nil {
        return nil, err
    }
    
    if tx.PublicKey, err = readString(); err != nil {
        return nil, err
    }
    
    if tx.Name, err = readString(); err != nil {
        return nil, err
    }
    
    if tx.Surname, err = readString(); err != nil {
        return nil, err
    }
    
    if tx.InquiryID, err = readString(); err != nil {
        return nil, err
    }
    
    var timestamp int64
    if err := binary.Read(buf, binary.BigEndian, &timestamp); err != nil {
        return nil, err
    }
    tx.Datetime = time.Unix(timestamp, 0)
    
    if tx.Signature, err = readString(); err != nil {
        return nil, err
    }
    
    if tx.Status, err = readString(); err != nil {
        return nil, err
    }
    
    return tx, nil
}

// ToJSON converts the transaction to JSON
func (tx *Transaction) ToJSON() ([]byte, error) {
    return json.Marshal(tx)
}

// FromJSON creates a transaction from JSON
func FromJSON(data []byte) (*Transaction, error) {
    var tx Transaction
    if err := json.Unmarshal(data, &tx); err != nil {
        return nil, err
    }
    return &tx, nil
}

// Clone creates a deep copy of the transaction
func (tx *Transaction) Clone() *Transaction {
    return &Transaction{
        ID:        tx.ID,
        PublicKey: tx.PublicKey,
        Name:      tx.Name,
        Surname:   tx.Surname,
        InquiryID: tx.InquiryID,
        Datetime:  tx.Datetime,
        Signature: tx.Signature,
        Status:    tx.Status,
    }
}

// IsExpired checks if the certification has expired
func (tx *Transaction) IsExpired(expiryDuration time.Duration) bool {
    return time.Since(tx.Datetime) > expiryDuration
}