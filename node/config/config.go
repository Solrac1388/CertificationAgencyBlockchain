package config

import (
    "fmt"
    "time"
    
    "github.com/spf13/viper"
)

// Config holds all configuration for the node
type Config struct {
    Network    NetworkConfig    `yaml:"network"`
    Blockchain BlockchainConfig `yaml:"blockchain"`
    Storage    StorageConfig    `yaml:"storage"`
    API        APIConfig        `yaml:"api"`
    Mining     MiningConfig     `yaml:"mining"`
    Security   SecurityConfig   `yaml:"security"`
}

// NetworkConfig holds network-related configuration
type NetworkConfig struct {
    Port           int           `yaml:"port"`
    Host           string        `yaml:"host"`
    NetworkID      string        `yaml:"network_id"`
    MaxPeers       int           `yaml:"max_peers"`
    DiscoveryPort  int           `yaml:"discovery_port"`
    TrustedNodes   []string      `yaml:"trusted_nodes"`
    Flag           string        `yaml:"flag"`
    Timeout        time.Duration `yaml:"timeout"`
}

// BlockchainConfig holds blockchain-related configuration
type BlockchainConfig struct {
    GenesisHash    string        `yaml:"genesis_hash"`
    BlockTime      time.Duration `yaml:"block_time"`
    MaxBlockSize   int           `yaml:"max_block_size"`
    CertExpiry     time.Duration `yaml:"cert_expiry"`
    MagicValue     uint32        `yaml:"magic_value"`
}

// StorageConfig holds storage-related configuration
type StorageConfig struct {
    DataDir      string `yaml:"data_dir"`
    CacheSize    int    `yaml:"cache_size"`
    MaxDBSize    int64  `yaml:"max_db_size"`
}

// APIConfig holds API-related configuration
type APIConfig struct {
    PersonaBaseURL string `yaml:"persona_base_url"`
    PersonaAPIKey  string `yaml:"persona_api_key"`
    RateLimit      int    `yaml:"rate_limit"`
    Timeout        time.Duration `yaml:"timeout"`
}

// MiningConfig holds mining-related configuration
type MiningConfig struct {
    Enabled            bool          `yaml:"enabled"`
    Threads            int           `yaml:"threads"`
    InitialDifficulty  int           `yaml:"initial_difficulty"`
    DifficultyAdjust   int           `yaml:"difficulty_adjust"`
    TargetBlockTime    time.Duration `yaml:"target_block_time"`
    MaxTransPerBlock   int           `yaml:"max_trans_per_block"`
}

// SecurityConfig holds security-related configuration
type SecurityConfig struct {
    RequireSignature   bool          `yaml:"require_signature"`
    MaxInquiryAge      time.Duration `yaml:"max_inquiry_age"`
    EnableRateLimit    bool          `yaml:"enable_rate_limit"`
    MaxRequestsPerMin  int           `yaml:"max_requests_per_min"`
}

// LoadConfig loads configuration from file
func LoadConfig(path string) (*Config, error) {
    viper.SetConfigFile(path)
    viper.SetConfigType("yaml")
    
    // Set defaults
    setDefaults()
    
    // Read configuration
    if err := viper.ReadInConfig(); err != nil {
        return nil, fmt.Errorf("failed to read config: %w", err)
    }
    
    var config Config
    if err := viper.Unmarshal(&config); err != nil {
        return nil, fmt.Errorf("failed to unmarshal config: %w", err)
    }
    
    // Validate configuration
    if err := config.Validate(); err != nil {
        return nil, fmt.Errorf("invalid configuration: %w", err)
    }
    
    return &config, nil
}

// setDefaults sets default configuration values
func setDefaults() {
    // Network defaults
    viper.SetDefault("network.port", 8333)
    viper.SetDefault("network.host", "0.0.0.0")
    viper.SetDefault("network.network_id", "CertificationBlockchain")
    viper.SetDefault("network.max_peers", 50)
    viper.SetDefault("network.discovery_port", 45678)
    viper.SetDefault("network.flag", "CERTIFICATION-BLOCKCHAIN-CLS")
    viper.SetDefault("network.timeout", "30s")
    
    // Blockchain defaults
    viper.SetDefault("blockchain.block_time", "10m")
    viper.SetDefault("blockchain.max_block_size", 1048576) // 1MB
    viper.SetDefault("blockchain.cert_expiry", "8760h") // 1 year
    viper.SetDefault("blockchain.magic_value", 0xD9B4BEF9)
    
    // Storage defaults
    viper.SetDefault("storage.data_dir", "./data")
    viper.SetDefault("storage.cache_size", 100)
    viper.SetDefault("storage.max_db_size", 10737418240) // 10GB
    
    // API defaults
    viper.SetDefault("api.persona_base_url", "https://api.withpersona.com/api/v1")
    viper.SetDefault("api.rate_limit", 100)
    viper.SetDefault("api.timeout", "30s")
    
    // Mining defaults
    viper.SetDefault("mining.enabled", true)
    viper.SetDefault("mining.threads", 4)
    viper.SetDefault("mining.initial_difficulty", 16)
    viper.SetDefault("mining.difficulty_adjust", 2016)
    viper.SetDefault("mining.target_block_time", "10m")
    viper.SetDefault("mining.max_trans_per_block", 1000)
    
    // Security defaults
    viper.SetDefault("security.require_signature", true)
    viper.SetDefault("security.max_inquiry_age", "24h")
    viper.SetDefault("security.enable_rate_limit", true)
    viper.SetDefault("security.max_requests_per_min", 60)
}

// Validate validates the configuration
func (c *Config) Validate() error {
    if c.Network.Port < 1 || c.Network.Port > 65535 {
        return fmt.Errorf("invalid port: %d", c.Network.Port)
    }
    
    if c.Network.NetworkID == "" {
        return fmt.Errorf("network ID cannot be empty")
    }
    
    if c.API.PersonaAPIKey == "" {
        return fmt.Errorf("Persona API key is required")
    }
    
    if c.Mining.Threads < 1 {
        return fmt.Errorf("mining threads must be at least 1")
    }
    
    if c.Mining.InitialDifficulty < 1 {
        return fmt.Errorf("initial difficulty must be at least 1")
    }
    
    return nil
}