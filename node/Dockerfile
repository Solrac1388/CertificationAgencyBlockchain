# Build stage
FROM golang:1.21-alpine AS builder

# Install dependencies
RUN apk add --no-cache git make gcc g++ libc-dev

# Set working directory
WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=1 GOOS=linux go build -a -installsuffix cgo -o node .

# Runtime stage
FROM alpine:latest

# Install ca-certificates for HTTPS
RUN apk --no-cache add ca-certificates

# Create non-root user
RUN addgroup -g 1000 -S blockchain && \
    adduser -u 1000 -S blockchain -G blockchain

# Set working directory
WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/node .

# Copy config file
COPY config/config.yaml ./config/

# Create data directory
RUN mkdir -p /app/data && \
    chown -R blockchain:blockchain /app

# Switch to non-root user
USER blockchain

# Expose ports
# HTTP API
EXPOSE 8333
# UDP Discovery
EXPOSE 45678/udp

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8333/api/v1/health || exit 1

# Set environment variables
ENV PERSONA_API_KEY=""
ENV LOG_LEVEL="info"

# Volume for blockchain data
VOLUME ["/app/data"]

# Run the node
ENTRYPOINT ["./node"]
CMD ["--config", "/app/config/config.yaml", "--data", "/app/data"]