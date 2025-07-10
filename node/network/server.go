package network

import (
    "context"
    "encoding/json"
    "fmt"
    "net"
    "net/http"
    "sync"
    "time"
    
    "github.com/CertificationAgencyBlockchain/node/api"
    "github.com/CertificationAgencyBlockchain/node/blockchain"
    "github.com/CertificationAgencyBlockchain/node/config"
    "github.com/CertificationAgencyBlockchain/node/storage"
    "github.com/CertificationAgencyBlockchain/node/utils"
    "github.com/gorilla/mux"
)

// Server represents the network server
type Server struct {
    config       *config.Config
    blockchain   *blockchain.Blockchain
    db           *storage.Database
    logger       *utils.Logger
    router       *mux.Router
    httpServer   *http.Server
    udpConn      *net.UDPConn
    peers        map[string]*Peer
    peersMu      sync.RWMutex
    personaClient interface {
        VerifyIdentity(inquiryID string, expectedName, expectedSurname string) (*api.VerificationResult, error)
    }
}

// Peer represents a network peer
type Peer struct {
    Address    string    `json:"address"`
    LastSeen   time.Time `json:"last_seen"`
    Version    string    `json:"version"`
    Height     uint64    `json:"height"`
}

// NewServer creates a new network server
func NewServer(cfg *config.Config, bc *blockchain.Blockchain, db *storage.Database, logger *utils.Logger) (*Server, error) {
    s := &Server{
        config:     cfg,
        blockchain: bc,
        db:         db,
        logger:     logger,
        peers:      make(map[string]*Peer),
    }
    
    // Initialize Persona client
    if cfg.API.PersonaAPIKey != "" {
        s.personaClient = api.NewPersonaClient(cfg.API.PersonaBaseURL, cfg.API.PersonaAPIKey)
    } else {
        // Use mock client for testing
        s.personaClient = api.NewMockPersonaClient()
    }
    
    // Setup routes
    s.setupRoutes()
    
    return s, nil
}

// setupRoutes sets up HTTP routes
func (s *Server) setupRoutes() {
    s.router = mux.NewRouter()
    
    // CORS middleware for all routes
    s.router.Use(s.corsMiddleware)
    
    // Legacy endpoints for app compatibility
    s.router.HandleFunc("/peers", s.handleGetPeersLegacy).Methods("GET", "OPTIONS")
    s.router.HandleFunc("/api/certifications", s.handleSubmitCertification).Methods("POST", "OPTIONS")
    
    // API routes
    api := s.router.PathPrefix("/api/v1").Subrouter()
    
    // Certification endpoints
    api.HandleFunc("/certifications", s.handleSubmitCertification).Methods("POST", "OPTIONS")
    api.HandleFunc("/certifications/by-public-key/{publicKey}", s.handleGetByPublicKey).Methods("GET")
    api.HandleFunc("/certifications/by-identity", s.handleGetByIdentity).Methods("GET")
    
    // Blockchain endpoints
    api.HandleFunc("/blocks", s.handleGetBlocks).Methods("GET")
    api.HandleFunc("/blocks/{height}", s.handleGetBlock).Methods("GET")
    api.HandleFunc("/blocks/latest", s.handleGetLatestBlock).Methods("GET")
    
    // Network endpoints
    api.HandleFunc("/peers", s.handleGetPeers).Methods("GET")
    api.HandleFunc("/peers", s.handleAddPeer).Methods("POST")
    
    // Health check
    api.HandleFunc("/health", s.handleHealthCheck).Methods("GET")
}

// corsMiddleware adds CORS headers to all responses
func (s *Server) corsMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Access-Control-Allow-Origin", "*")
        w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Client-ID, X-Network-Flag")
        
        if r.Method == "OPTIONS" {
            w.WriteHeader(http.StatusOK)
            return
        }
        
        next.ServeHTTP(w, r)
    })
}

// Start starts the server
func (s *Server) Start(ctx context.Context) error {
    // Start HTTP server
    s.httpServer = &http.Server{
        Addr:    fmt.Sprintf("%s:%d", s.config.Network.Host, s.config.Network.Port),
        Handler: s.router,
    }
    
    go func() {
        s.logger.Info("HTTP server listening on %s", s.httpServer.Addr)
        if err := s.httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            s.logger.Error("HTTP server error: %v", err)
        }
    }()
    
    // Start UDP listener for flag detection
    go s.startUDPListener(ctx)
    
    // Start peer maintenance
    go s.maintainPeers(ctx)
    
    return nil
}

// Stop stops the server
func (s *Server) Stop() {
    if s.httpServer != nil {
        ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
        defer cancel()
        s.httpServer.Shutdown(ctx)
    }
    
    if s.udpConn != nil {
        s.udpConn.Close()
    }
}

// startUDPListener starts the UDP listener for flag detection
func (s *Server) startUDPListener(ctx context.Context) {
    addr, err := net.ResolveUDPAddr("udp", fmt.Sprintf(":%d", s.config.Network.DiscoveryPort))
    if err != nil {
        s.logger.Error("Failed to resolve UDP address: %v", err)
        return
    }
    
    s.udpConn, err = net.ListenUDP("udp", addr)
    if err != nil {
        s.logger.Error("Failed to start UDP listener: %v", err)
        return
    }
    
    s.logger.Info("UDP listener started on port %d", s.config.Network.DiscoveryPort)
    
    buffer := make([]byte, 1024)
    
    for {
        select {
        case <-ctx.Done():
            return
        default:
            s.udpConn.SetReadDeadline(time.Now().Add(1 * time.Second))
            n, clientAddr, err := s.udpConn.ReadFromUDP(buffer)
            if err != nil {
                if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
                    continue
                }
                s.logger.Error("UDP read error: %v", err)
                continue
            }
            
            // Parse JSON message from app
            var msg struct {
                Flag      string `json:"flag"`
                Version   string `json:"version"`
                Type      string `json:"type"`
                ClientID  string `json:"client_id"`
                Timestamp int64  `json:"timestamp"`
            }
            
            if err := json.Unmarshal(buffer[:n], &msg); err != nil {
                // Try legacy format
                message := string(buffer[:n])
                if message == s.config.Network.Flag {
                    s.logger.Info("Received legacy flag from %s", clientAddr)
                    response := fmt.Sprintf("NODE:%s:%d", s.config.Network.Host, s.config.Network.Port)
                    s.udpConn.WriteToUDP([]byte(response), clientAddr)
                }
                continue
            }
            
            // Check if it's a valid discovery message
            if msg.Flag == s.config.Network.Flag && msg.Type == "client_discovery" {
                s.logger.Info("Received discovery from client %s at %s", msg.ClientID, clientAddr)
                
                // Send node announce response
                response := map[string]interface{}{
                    "flag":      s.config.Network.Flag,
                    "version":   "1.0",
                    "type":      "node_announce",
                    "port":      s.config.Network.Port,
                    "timestamp": time.Now().Unix(),
                }
                
                responseBytes, _ := json.Marshal(response)
                s.udpConn.WriteToUDP(responseBytes, clientAddr)
            }
        }
    }
}

// handleSubmitCertification handles certification submission
func (s *Server) handleSubmitCertification(w http.ResponseWriter, r *http.Request) {
    var req struct {
        PublicKey string    `json:"public_key"`
        Name      string    `json:"name"`
        Surname   string    `json:"surname"`
        InquiryID string    `json:"inquiry_id"`
        Datetime  time.Time `json:"datetime"`
        Signature string    `json:"signature"`
    }
    
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "Invalid request body", http.StatusBadRequest)
        return
    }
    
    // If datetime is not provided, use current time
    if req.Datetime.IsZero() {
        req.Datetime = time.Now()
    }
    
    // Create transaction
    tx := blockchain.NewTransaction(
        req.PublicKey,
        req.Name,
        req.Surname,
        req.InquiryID,
        req.Datetime,
        req.Signature,
    )
    
    // Validate transaction
    if err := tx.Validate(); err != nil {
        http.Error(w, fmt.Sprintf("Invalid transaction: %v", err), http.StatusBadRequest)
        return
    }
    
    // Verify signature
    if err := tx.VerifySignature(); err != nil {
        http.Error(w, fmt.Sprintf("Invalid signature: %v", err), http.StatusBadRequest)
        return
    }
    
    // Verify identity with Persona
    result, err := s.personaClient.VerifyIdentity(req.InquiryID, req.Name, req.Surname)
    if err != nil {
        http.Error(w, fmt.Sprintf("Identity verification failed: %v", err), http.StatusBadRequest)
        return
    }
    
    if !result.Verified {
        http.Error(w, "Identity not verified", http.StatusBadRequest)
        return
    }
    
    // Add to blockchain mining pool
    if err := s.blockchain.AddTransaction(tx); err != nil {
        http.Error(w, fmt.Sprintf("Failed to add transaction: %v", err), http.StatusInternalServerError)
        return
    }
    
    // Return success
    w.Header().Set("Content-Type", "application/json")
    w.Header().Set("Access-Control-Allow-Origin", "*")
    json.NewEncoder(w).Encode(map[string]interface{}{
        "success": true,
        "transaction_id": tx.ID,
        "message": "Certification submitted successfully",
    })
}

// handleGetByPublicKey handles getting certification by public key
func (s *Server) handleGetByPublicKey(w http.ResponseWriter, r *http.Request) {
    vars := mux.Vars(r)
    publicKey := vars["publicKey"]
    
    cert, err := s.blockchain.GetCertificationByPublicKey(publicKey)
    if err != nil {
        http.Error(w, "Certification not found", http.StatusNotFound)
        return
    }
    
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(cert)
}

// handleGetByIdentity handles getting certification by identity
func (s *Server) handleGetByIdentity(w http.ResponseWriter, r *http.Request) {
    name := r.URL.Query().Get("name")
    surname := r.URL.Query().Get("surname")
    
    if name == "" || surname == "" {
        http.Error(w, "Name and surname are required", http.StatusBadRequest)
        return
    }
    
    cert, err := s.blockchain.GetCertificationByIdentity(name, surname)
    if err != nil {
        http.Error(w, "Certification not found", http.StatusNotFound)
        return
    }
    
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(cert)
}

// handleGetBlocks handles getting all blocks
func (s *Server) handleGetBlocks(w http.ResponseWriter, r *http.Request) {
    blocks := s.blockchain.GetAllBlocks()
    
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(blocks)
}

// handleGetBlock handles getting a specific block
func (s *Server) handleGetBlock(w http.ResponseWriter, r *http.Request) {
    vars := mux.Vars(r)
    var height uint64
    fmt.Sscanf(vars["height"], "%d", &height)
    
    block, err := s.blockchain.GetBlock(height)
    if err != nil {
        http.Error(w, "Block not found", http.StatusNotFound)
        return
    }
    
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(block)
}

// handleGetLatestBlock handles getting the latest block
func (s *Server) handleGetLatestBlock(w http.ResponseWriter, r *http.Request) {
    block := s.blockchain.GetLatestBlock()
    if block == nil {
        http.Error(w, "No blocks found", http.StatusNotFound)
        return
    }
    
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(block)
}

// handleGetPeers handles getting the list of peers
func (s *Server) handleGetPeers(w http.ResponseWriter, r *http.Request) {
    s.peersMu.RLock()
    peers := make([]*Peer, 0, len(s.peers))
    for _, peer := range s.peers {
        peers = append(peers, peer)
    }
    s.peersMu.RUnlock()
    
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(peers)
}

// handleGetPeersLegacy handles legacy /peers endpoint for app compatibility
func (s *Server) handleGetPeersLegacy(w http.ResponseWriter, r *http.Request) {
    s.peersMu.RLock()
    peerAddresses := make([]string, 0, len(s.peers))
    for _, peer := range s.peers {
        peerAddresses = append(peerAddresses, peer.Address)
    }
    s.peersMu.RUnlock()
    
    // App expects this format
    response := map[string]interface{}{
        "peers": peerAddresses,
        "network_id": s.config.Network.NetworkID,
        "timestamp": time.Now().Unix(),
    }
    
    w.Header().Set("Content-Type", "application/json")
    w.Header().Set("Access-Control-Allow-Origin", "*")
    json.NewEncoder(w).Encode(response)
}

// handleAddPeer handles adding a new peer
func (s *Server) handleAddPeer(w http.ResponseWriter, r *http.Request) {
    var peer Peer
    if err := json.NewDecoder(r.Body).Decode(&peer); err != nil {
        http.Error(w, "Invalid request body", http.StatusBadRequest)
        return
    }
    
    s.AddPeer(peer.Address)
    
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]interface{}{
        "success": true,
        "message": "Peer added successfully",
    })
}

// handleHealthCheck handles health check requests
func (s *Server) handleHealthCheck(w http.ResponseWriter, r *http.Request) {
    health := map[string]interface{}{
        "status": "healthy",
        "blockchain": map[string]interface{}{
            "height": s.blockchain.GetHeight(),
            "latest_hash": func() string {
                if block := s.blockchain.GetLatestBlock(); block != nil {
                    return block.Hash()
                }
                return ""
            }(),
        },
        "network": map[string]interface{}{
            "peer_count": len(s.peers),
            "network_id": s.config.Network.NetworkID,
        },
        "timestamp": time.Now(),
    }
    
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(health)
}

// AddPeer adds a new peer
func (s *Server) AddPeer(address string) {
    s.peersMu.Lock()
    defer s.peersMu.Unlock()
    
    s.peers[address] = &Peer{
        Address:  address,
        LastSeen: time.Now(),
    }
    
    s.logger.Info("Added peer: %s", address)
}

// RemovePeer removes a peer
func (s *Server) RemovePeer(address string) {
    s.peersMu.Lock()
    defer s.peersMu.Unlock()
    
    delete(s.peers, address)
    s.logger.Info("Removed peer: %s", address)
}

// GetPeers returns the list of peers
func (s *Server) GetPeers() []*Peer {
    s.peersMu.RLock()
    defer s.peersMu.RUnlock()
    
    peers := make([]*Peer, 0, len(s.peers))
    for _, peer := range s.peers {
        peers = append(peers, peer)
    }
    
    return peers
}

// maintainPeers maintains the peer list
func (s *Server) maintainPeers(ctx context.Context) {
    ticker := time.NewTicker(30 * time.Second)
    defer ticker.Stop()
    
    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:
            s.peersMu.Lock()
            for address, peer := range s.peers {
                if time.Since(peer.LastSeen) > 5*time.Minute {
                    delete(s.peers, address)
                    s.logger.Info("Removed inactive peer: %s", address)
                }
            }
            s.peersMu.Unlock()
        }
    }
}