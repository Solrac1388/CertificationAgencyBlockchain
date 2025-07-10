package main

import (
    "context"
    "flag"
    "fmt"
    "log"
    "os"
    "os/signal"
    "syscall"
    
    "github.com/CertificationAgencyBlockchain/node/blockchain"
    "github.com/CertificationAgencyBlockchain/node/config"
    "github.com/CertificationAgencyBlockchain/node/network"
    "github.com/CertificationAgencyBlockchain/node/storage"
    "github.com/CertificationAgencyBlockchain/node/utils"
)

func main() {
    // Parse command line flags
    var (
        configPath = flag.String("config", "config/config.yaml", "Path to configuration file")
        port       = flag.Int("port", 8080, "Port to listen on")
        dataDir    = flag.String("data", "./data", "Data directory")
        debug      = flag.Bool("debug", false, "Enable debug logging")
    )
    flag.Parse()

    // Initialize logger
    logger := utils.NewLogger(*debug)
    logger.Info("Starting Certification Blockchain Node")

    // Load configuration
    cfg, err := config.LoadConfig(*configPath)
    if err != nil {
        logger.Fatal("Failed to load configuration: %v", err)
    }
    
    // Override with command line flags
    if *port != 8080 {
        cfg.Network.Port = *port
    }
    if *dataDir != "./data" {
        cfg.Storage.DataDir = *dataDir
    }

    // Initialize storage
    db, err := storage.NewDatabase(cfg.Storage.DataDir)
    if err != nil {
        logger.Fatal("Failed to initialize database: %v", err)
    }
    defer db.Close()

    // Initialize blockchain
    bc, err := blockchain.NewBlockchain(db, logger)
    if err != nil {
        logger.Fatal("Failed to initialize blockchain: %v", err)
    }

    // Initialize network server
    server, err := network.NewServer(cfg, bc, db, logger)
    if err != nil {
        logger.Fatal("Failed to initialize network server: %v", err)
    }

    // Start services
    ctx, cancel := context.WithCancel(context.Background())
    defer cancel()

    // Start blockchain mining
    go bc.StartMining(ctx)

    // Start network server
    go server.Start(ctx)

    // Start peer discovery
    discovery := network.NewDiscovery(server, logger)
    go discovery.Start(ctx)

    // Setup graceful shutdown
    sigChan := make(chan os.Signal, 1)
    signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

    logger.Info("Node started successfully on port %d", cfg.Network.Port)
    logger.Info("Data directory: %s", cfg.Storage.DataDir)
    logger.Info("Network ID: %s", cfg.Network.NetworkID)

    // Wait for shutdown signal
    <-sigChan
    logger.Info("Shutting down node...")

    // Cancel context to stop all services
    cancel()

    // Wait for services to stop
    server.Stop()
    bc.StopMining()
    
    logger.Info("Node shutdown complete")
}