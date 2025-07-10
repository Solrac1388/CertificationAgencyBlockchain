#!/bin/bash

# Certification Blockchain Node Startup Script
# This script helps with initial setup and running the node

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
CONFIG_FILE="config/config.yaml"
DATA_DIR="./data"
PORT=8080
DEBUG=false

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --config)
            CONFIG_FILE="$2"
            shift 2
            ;;
        --data)
            DATA_DIR="$2"
            shift 2
            ;;
        --port)
            PORT="$2"
            shift 2
            ;;
        --debug)
            DEBUG=true
            shift
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  --config FILE    Path to config file (default: config/config.yaml)"
            echo "  --data DIR       Data directory (default: ./data)"
            echo "  --port PORT      Port to listen on (default: 8080)"
            echo "  --debug          Enable debug logging"
            echo "  --help           Show this help message"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Header
echo "================================================"
echo "     Certification Blockchain Node Launcher     "
echo "================================================"
echo ""

# Check for Go installation
if ! command_exists go; then
    print_error "Go is not installed. Please install Go 1.21 or higher."
    exit 1
fi

# Check Go version
GO_VERSION=$(go version | awk '{print $3}' | sed 's/go//')
REQUIRED_VERSION="1.21"
if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$GO_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    print_error "Go version $GO_VERSION is too old. Please upgrade to Go $REQUIRED_VERSION or higher."
    exit 1
fi

print_info "Go version: $GO_VERSION ✓"

# Check for Persona API key
if [ -z "$PERSONA_API_KEY" ]; then
    print_warning "PERSONA_API_KEY environment variable is not set."
    echo -n "Enter your Persona API key (or press Enter to use mock mode): "
    read -s PERSONA_API_KEY
    echo ""
    
    if [ -z "$PERSONA_API_KEY" ]; then
        print_warning "Running in mock mode without real identity verification."
        export PERSONA_API_KEY="mock"
    else
        export PERSONA_API_KEY
        print_info "Persona API key configured."
    fi
fi

# Create data directory if it doesn't exist
if [ ! -d "$DATA_DIR" ]; then
    print_info "Creating data directory: $DATA_DIR"
    mkdir -p "$DATA_DIR"
fi

# Check if config file exists
if [ ! -f "$CONFIG_FILE" ]; then
    print_error "Config file not found: $CONFIG_FILE"
    
    # Offer to create a default config
    echo -n "Would you like to create a default config file? (y/n): "
    read -r CREATE_CONFIG
    
    if [ "$CREATE_CONFIG" = "y" ] || [ "$CREATE_CONFIG" = "Y" ]; then
        mkdir -p "$(dirname "$CONFIG_FILE")"
        cat > "$CONFIG_FILE" << EOF
network:
  port: $PORT
  host: "0.0.0.0"
  network_id: "CERT_BLOCKCHAIN_NET"
  flag: "BLOCKCHAIN_CERT_AGENCY_FLAG_V1"
  trusted_nodes: []

blockchain:
  block_time: 10m
  cert_expiry: 8760h

storage:
  data_dir: "$DATA_DIR"

api:
  persona_base_url: "https://api.withpersona.com/api/v1"
  persona_api_key: "\${PERSONA_API_KEY}"

mining:
  enabled: true
  threads: 4
  initial_difficulty: 16
EOF
        print_info "Created default config file: $CONFIG_FILE"
    else
        exit 1
    fi
fi

# Build the node if binary doesn't exist
if [ ! -f "./certnode" ]; then
    print_info "Building the node..."
    go build -o certnode .
    
    if [ $? -eq 0 ]; then
        print_info "Build successful! ✓"
    else
        print_error "Build failed!"
        exit 1
    fi
fi

# Display startup information
echo ""
print_info "Starting Certification Blockchain Node"
print_info "Config file: $CONFIG_FILE"
print_info "Data directory: $DATA_DIR"
print_info "Port: $PORT"
print_info "Debug mode: $DEBUG"
echo ""

# Construct command
CMD="./certnode --config $CONFIG_FILE --data $DATA_DIR --port $PORT"

if [ "$DEBUG" = true ]; then
    CMD="$CMD --debug"
fi

# Check if node is already running
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    print_error "Port $PORT is already in use. Is another node running?"
    exit 1
fi

# Start the node
print_info "Launching node..."
echo "================================================"
echo ""

exec $CMD