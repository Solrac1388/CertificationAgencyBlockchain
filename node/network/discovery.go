package network

import (
    "context"
    "encoding/json"
    "fmt"
    "net"
    "net/http"
    "sync"
    "time"
    
    "github.com/CertificationAgencyBlockchain/node/utils"
)

// Discovery handles peer discovery
type Discovery struct {
    server        *Server
    logger        *utils.Logger
    knownPeers    map[string]bool
    mu            sync.RWMutex
    discoveryFlag string
}

// NewDiscovery creates a new discovery service
func NewDiscovery(server *Server, logger *utils.Logger) *Discovery {
    return &Discovery{
        server:        server,
        logger:        logger,
        knownPeers:    make(map[string]bool),
        discoveryFlag: server.config.Network.Flag,
    }
}

// Start starts the discovery service
func (d *Discovery) Start(ctx context.Context) {
    // Start with trusted nodes
    d.addTrustedNodes()
    
    // Start UDP broadcast listener
    go d.listenForBroadcasts(ctx)
    
    // Periodic discovery
    ticker := time.NewTicker(5 * time.Minute)
    defer ticker.Stop()
    
    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:
            d.discoverPeers()
        }
    }
}

// addTrustedNodes adds trusted nodes from configuration
func (d *Discovery) addTrustedNodes() {
    for _, node := range d.server.config.Network.TrustedNodes {
        d.addKnownPeer(node)
        d.server.AddPeer(node)
        d.logger.Info("Added trusted node: %s", node)
    }
}

// listenForBroadcasts listens for UDP broadcasts
func (d *Discovery) listenForBroadcasts(ctx context.Context) {
    addr, err := net.ResolveUDPAddr("udp", fmt.Sprintf(":%d", d.server.config.Network.DiscoveryPort))
    if err != nil {
        d.logger.Error("Failed to resolve UDP address: %v", err)
        return
    }
    
    conn, err := net.ListenUDP("udp", addr)
    if err != nil {
        d.logger.Error("Failed to start UDP listener: %v", err)
        return
    }
    defer conn.Close()
    
    buffer := make([]byte, 1024)
    
    for {
        select {
        case <-ctx.Done():
            return
        default:
            conn.SetReadDeadline(time.Now().Add(1 * time.Second))
            n, clientAddr, err := conn.ReadFromUDP(buffer)
            if err != nil {
                if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
                    continue
                }
                d.logger.Error("UDP read error: %v", err)
                continue
            }
            
            message := string(buffer[:n])
            
            // Check if it's a discovery broadcast
            if message == d.discoveryFlag {
                d.logger.Debug("Received discovery broadcast from %s", clientAddr)
                
                // Respond with node info
                nodeInfo := fmt.Sprintf("NODE:%s:%d", 
                    d.server.config.Network.Host, 
                    d.server.config.Network.Port)
                    
                conn.WriteToUDP([]byte(nodeInfo), clientAddr)
            }
        }
    }
}

// SendBroadcast sends a discovery broadcast
func (d *Discovery) SendBroadcast() error {
    conn, err := net.Dial("udp", fmt.Sprintf("255.255.255.255:%d", d.server.config.Network.DiscoveryPort))
    if err != nil {
        return fmt.Errorf("failed to create UDP connection: %w", err)
    }
    defer conn.Close()
    
    _, err = conn.Write([]byte(d.discoveryFlag))
    if err != nil {
        return fmt.Errorf("failed to send broadcast: %w", err)
    }
    
    d.logger.Debug("Sent discovery broadcast")
    return nil
}

// discoverPeers discovers new peers from existing peers
func (d *Discovery) discoverPeers() {
    peers := d.server.GetPeers()
    
    for _, peer := range peers {
        go d.queryPeerForNodes(peer.Address)
    }
}

// queryPeerForNodes queries a peer for its known nodes
func (d *Discovery) queryPeerForNodes(peerAddr string) {
    url := fmt.Sprintf("http://%s/api/v1/peers", peerAddr)
    
    client := &http.Client{Timeout: 10 * time.Second}
    resp, err := client.Get(url)
    if err != nil {
        d.logger.Debug("Failed to query peer %s: %v", peerAddr, err)
        return
    }
    defer resp.Body.Close()
    
    if resp.StatusCode != http.StatusOK {
        return
    }
    
    var peers []*Peer
    if err := json.NewDecoder(resp.Body).Decode(&peers); err != nil {
        d.logger.Debug("Failed to decode peer response: %v", err)
        return
    }
    
    // Add new peers
    for _, peer := range peers {
        if !d.isKnownPeer(peer.Address) {
            d.addKnownPeer(peer.Address)
            d.server.AddPeer(peer.Address)
            d.logger.Info("Discovered new peer: %s", peer.Address)
        }
    }
}

// ExecuteCascadeDiscovery performs cascade discovery
func (d *Discovery) ExecuteCascadeDiscovery(maxDepth int) {
    d.logger.Info("Starting cascade discovery with max depth %d", maxDepth)
    
    discovered := make(map[string]bool)
    toQuery := []string{}
    
    // Start with current peers
    for _, peer := range d.server.GetPeers() {
        toQuery = append(toQuery, peer.Address)
        discovered[peer.Address] = true
    }
    
    for depth := 0; depth < maxDepth && len(toQuery) > 0; depth++ {
        d.logger.Debug("Cascade discovery depth %d, querying %d peers", depth, len(toQuery))
        
        nextQuery := []string{}
        var wg sync.WaitGroup
        resultsChan := make(chan []string, len(toQuery))
        
        // Query all peers at this depth
        for _, peerAddr := range toQuery {
            wg.Add(1)
            go func(addr string) {
                defer wg.Done()
                
                newPeers := d.queryPeerForCascade(addr)
                resultsChan <- newPeers
            }(peerAddr)
        }
        
        // Wait for all queries to complete
        wg.Wait()
        close(resultsChan)
        
        // Collect results
        for newPeers := range resultsChan {
            for _, peer := range newPeers {
                if !discovered[peer] {
                    discovered[peer] = true
                    nextQuery = append(nextQuery, peer)
                    
                    // Add to known peers
                    d.addKnownPeer(peer)
                    d.server.AddPeer(peer)
                }
            }
        }
        
        toQuery = nextQuery
    }
    
    d.logger.Info("Cascade discovery completed, discovered %d total peers", len(discovered))
}

// queryPeerForCascade queries a peer and returns new peer addresses
func (d *Discovery) queryPeerForCascade(peerAddr string) []string {
    url := fmt.Sprintf("http://%s/api/v1/peers", peerAddr)
    
    client := &http.Client{Timeout: 5 * time.Second}
    resp, err := client.Get(url)
    if err != nil {
        return []string{}
    }
    defer resp.Body.Close()
    
    if resp.StatusCode != http.StatusOK {
        return []string{}
    }
    
    var peers []*Peer
    if err := json.NewDecoder(resp.Body).Decode(&peers); err != nil {
        return []string{}
    }
    
    addresses := make([]string, 0, len(peers))
    for _, peer := range peers {
        addresses = append(addresses, peer.Address)
    }
    
    return addresses
}

// addKnownPeer adds a peer to the known peers list
func (d *Discovery) addKnownPeer(address string) {
    d.mu.Lock()
    defer d.mu.Unlock()
    
    d.knownPeers[address] = true
}

// isKnownPeer checks if a peer is known
func (d *Discovery) isKnownPeer(address string) bool {
    d.mu.RLock()
    defer d.mu.RUnlock()
    
    return d.knownPeers[address]
}

// GetKnownPeers returns all known peers
func (d *Discovery) GetKnownPeers() []string {
    d.mu.RLock()
    defer d.mu.RUnlock()
    
    peers := make([]string, 0, len(d.knownPeers))
    for peer := range d.knownPeers {
        peers = append(peers, peer)
    }
    
    return peers
}

// PingPeer checks if a peer is alive
func (d *Discovery) PingPeer(address string) bool {
    url := fmt.Sprintf("http://%s/api/v1/health", address)
    
    client := &http.Client{Timeout: 3 * time.Second}
    resp, err := client.Get(url)
    if err != nil {
        return false
    }
    defer resp.Body.Close()
    
    return resp.StatusCode == http.StatusOK
}