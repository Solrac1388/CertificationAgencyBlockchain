package network

import (
    "bytes"
    "encoding/json"
    "fmt"
    "io"
    "net/http"
    "time"
    
    "github.com/CertificationAgencyBlockchain/node/blockchain"
)

// Client handles outgoing network requests
type Client struct {
    httpClient *http.Client
    timeout    time.Duration
}

// NewClient creates a new network client
func NewClient(timeout time.Duration) *Client {
    return &Client{
        httpClient: &http.Client{
            Timeout: timeout,
        },
        timeout: timeout,
    }
}

// SubmitCertification submits a certification to a peer
func (c *Client) SubmitCertification(peerAddr string, tx *blockchain.Transaction) error {
    url := fmt.Sprintf("http://%s/api/v1/certifications", peerAddr)
    
    payload := map[string]interface{}{
        "public_key": tx.PublicKey,
        "name":       tx.Name,
        "surname":    tx.Surname,
        "inquiry_id": tx.InquiryID,
        "datetime":   tx.Datetime,
        "signature":  tx.Signature,
    }
    
    body, err := json.Marshal(payload)
    if err != nil {
        return fmt.Errorf("failed to marshal payload: %w", err)
    }
    
    req, err := http.NewRequest("POST", url, bytes.NewBuffer(body))
    if err != nil {
        return fmt.Errorf("failed to create request: %w", err)
    }
    
    req.Header.Set("Content-Type", "application/json")
    
    resp, err := c.httpClient.Do(req)
    if err != nil {
        return fmt.Errorf("failed to send request: %w", err)
    }
    defer resp.Body.Close()
    
    if resp.StatusCode != http.StatusOK {
        body, _ := io.ReadAll(resp.Body)
        return fmt.Errorf("server returned status %d: %s", resp.StatusCode, string(body))
    }
    
    return nil
}

// GetBlock retrieves a block from a peer
func (c *Client) GetBlock(peerAddr string, height uint64) (*blockchain.Block, error) {
    url := fmt.Sprintf("http://%s/api/v1/blocks/%d", peerAddr, height)
    
    resp, err := c.httpClient.Get(url)
    if err != nil {
        return nil, fmt.Errorf("failed to get block: %w", err)
    }
    defer resp.Body.Close()
    
    if resp.StatusCode != http.StatusOK {
        return nil, fmt.Errorf("block not found")
    }
    
    var block blockchain.Block
    if err := json.NewDecoder(resp.Body).Decode(&block); err != nil {
        return nil, fmt.Errorf("failed to decode block: %w", err)
    }
    
    return &block, nil
}

// GetLatestBlock retrieves the latest block from a peer
func (c *Client) GetLatestBlock(peerAddr string) (*blockchain.Block, error) {
    url := fmt.Sprintf("http://%s/api/v1/blocks/latest", peerAddr)
    
    resp, err := c.httpClient.Get(url)
    if err != nil {
        return nil, fmt.Errorf("failed to get latest block: %w", err)
    }
    defer resp.Body.Close()
    
    if resp.StatusCode != http.StatusOK {
        return nil, fmt.Errorf("latest block not found")
    }
    
    var block blockchain.Block
    if err := json.NewDecoder(resp.Body).Decode(&block); err != nil {
        return nil, fmt.Errorf("failed to decode block: %w", err)
    }
    
    return &block, nil
}

// GetPeers retrieves the peer list from a node
func (c *Client) GetPeers(peerAddr string) ([]*Peer, error) {
    url := fmt.Sprintf("http://%s/api/v1/peers", peerAddr)
    
    resp, err := c.httpClient.Get(url)
    if err != nil {
        return nil, fmt.Errorf("failed to get peers: %w", err)
    }
    defer resp.Body.Close()
    
    if resp.StatusCode != http.StatusOK {
        return nil, fmt.Errorf("failed to get peers")
    }
    
    var peers []*Peer
    if err := json.NewDecoder(resp.Body).Decode(&peers); err != nil {
        return nil, fmt.Errorf("failed to decode peers: %w", err)
    }
    
    return peers, nil
}

// GetHealth checks the health of a peer
func (c *Client) GetHealth(peerAddr string) (map[string]interface{}, error) {
    url := fmt.Sprintf("http://%s/api/v1/health", peerAddr)
    
    resp, err := c.httpClient.Get(url)
    if err != nil {
        return nil, fmt.Errorf("failed to get health: %w", err)
    }
    defer resp.Body.Close()
    
    if resp.StatusCode != http.StatusOK {
        return nil, fmt.Errorf("node unhealthy")
    }
    
    var health map[string]interface{}
    if err := json.NewDecoder(resp.Body).Decode(&health); err != nil {
        return nil, fmt.Errorf("failed to decode health: %w", err)
    }
    
    return health, nil
}

// BroadcastTransaction broadcasts a transaction to multiple peers
func (c *Client) BroadcastTransaction(peers []string, tx *blockchain.Transaction) error {
    errChan := make(chan error, len(peers))
    
    for _, peer := range peers {
        go func(peerAddr string) {
            errChan <- c.SubmitCertification(peerAddr, tx)
        }(peer)
    }
    
    // Wait for all broadcasts to complete
    var lastErr error
    successCount := 0
    
    for i := 0; i < len(peers); i++ {
        if err := <-errChan; err != nil {
            lastErr = err
        } else {
            successCount++
        }
    }
    
    if successCount == 0 && lastErr != nil {
        return fmt.Errorf("failed to broadcast to any peer: %w", lastErr)
    }
    
    return nil
}

// SyncBlockchain synchronizes the blockchain with a peer
func (c *Client) SyncBlockchain(peerAddr string, currentHeight uint64) ([]*blockchain.Block, error) {
    // Get peer's latest block
    latestBlock, err := c.GetLatestBlock(peerAddr)
    if err != nil {
        return nil, fmt.Errorf("failed to get peer's latest block: %w", err)
    }
    
    if latestBlock.Header.Height <= currentHeight {
        // Nothing to sync
        return nil, nil
    }
    
    // Download missing blocks
    blocks := make([]*blockchain.Block, 0)
    
    for height := currentHeight + 1; height <= latestBlock.Header.Height; height++ {
        block, err := c.GetBlock(peerAddr, height)
        if err != nil {
            return nil, fmt.Errorf("failed to get block %d: %w", height, err)
        }
        
        blocks = append(blocks, block)
    }
    
    return blocks, nil
}

// QueryCertificationByPublicKey queries a certification by public key
func (c *Client) QueryCertificationByPublicKey(peerAddr, publicKey string) (*blockchain.Transaction, error) {
    url := fmt.Sprintf("http://%s/api/v1/certifications/by-public-key/%s", peerAddr, publicKey)
    
    resp, err := c.httpClient.Get(url)
    if err != nil {
        return nil, fmt.Errorf("failed to query certification: %w", err)
    }
    defer resp.Body.Close()
    
    if resp.StatusCode == http.StatusNotFound {
        return nil, fmt.Errorf("certification not found")
    }
    
    if resp.StatusCode != http.StatusOK {
        return nil, fmt.Errorf("query failed")
    }
    
    var cert blockchain.Transaction
    if err := json.NewDecoder(resp.Body).Decode(&cert); err != nil {
        return nil, fmt.Errorf("failed to decode certification: %w", err)
    }
    
    return &cert, nil
}

// QueryCertificationByIdentity queries a certification by identity
func (c *Client) QueryCertificationByIdentity(peerAddr, name, surname string) (*blockchain.Transaction, error) {
    url := fmt.Sprintf("http://%s/api/v1/certifications/by-identity?name=%s&surname=%s", 
        peerAddr, name, surname)
    
    resp, err := c.httpClient.Get(url)
    if err != nil {
        return nil, fmt.Errorf("failed to query certification: %w", err)
    }
    defer resp.Body.Close()
    
    if resp.StatusCode == http.StatusNotFound {
        return nil, fmt.Errorf("certification not found")
    }
    
    if resp.StatusCode != http.StatusOK {
        return nil, fmt.Errorf("query failed")
    }
    
    var cert blockchain.Transaction
    if err := json.NewDecoder(resp.Body).Decode(&cert); err != nil {
        return nil, fmt.Errorf("failed to decode certification: %w", err)
    }
    
    return &cert, nil
}