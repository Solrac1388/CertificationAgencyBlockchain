# CertificationAgencyBlockchain

🇪🇸 [Ver en Español](README.md) | 🇬🇧 [View in English](readme-en.md)

## Description

CertificationAgencyBlockchain is a decentralized system for certifying the identity of public key owners using blockchain technology with proof of work. The system uses the Persona Verification API to verify users' identities and associate them with their public keys, creating a decentralized alternative to traditional digital certification authorities.

## Motivation

This project emerges as a response to the limitations of current centralized digital certification systems. Through blockchain technology, it seeks to distribute certification sovereignty among multiple nodes, eliminating dependence on a single authority and providing greater transparency and resistance to censorship.

## System Components

### Mobile App (React Native)
- Integrated Persona Verification user interface
- RSA key generator with password encryption
- Secure local certificate storage
- Automatic cascade node discovery
- Blockchain network communication via UDP/TCP
- Complete certificate lifecycle management

### Blockchain Nodes (Go)
- Processing and validation of certification requests
- Identity verification through Persona API
- Proof of work implementation with dynamic difficulty adjustment
- Hybrid database: JSON files for blockchain + Badger DB for indexes
- REST API for client application communication
- Peer-to-peer synchronization with fault tolerance

## Technical Architecture

### Blockchain Structure
- Blocks linked through SHA-256 hashes
- Proof of work (PoW) with 10-minute target block time
- Merkle trees to ensure transaction integrity
- Automatic difficulty adjustment every 2016 blocks

### Persona API Integration
- Biometric and document identity verification
- Unique inquiry codes as cryptographic proof
- Validation of coherence between verified data and requests

### Cryptographic Security
- 2048-bit RSA keys for digital signatures
- AES-256 encryption for private key protection
- Exhaustive signature verification across all nodes
- Replay attack prevention through unique inquiries

## Certification Flow

1. **Identity Verification**: User completes biometric verification with Persona API
2. **Key Generation**: App creates RSA pair and encrypts keys with user password
3. **Signed Request**: Request generated with RSA signature of all fields
4. **Network Discovery**: App locates available nodes via UDP broadcast
5. **Validation**: Nodes verify signature, query Persona API, and validate uniqueness
6. **Mining**: Valid requests included in new block through PoW
7. **Propagation**: Block distributed and synchronized across all nodes

## Impact and Benefits

### Social Advantages
- **Democratization**: Universal access without geographical barriers
- **Financial Inclusion**: Verifiable identity for marginalized populations
- **Portability**: Digital certificates independent of physical documents
- **Transparency**: Public verification of authenticity

### Environmental Benefits
- Significant reduction in paper consumption
- Elimination of travel for in-person procedures
- Dematerialization of administrative processes

## System Requirements

### Nodes
- Go 1.19+
- Docker (optional)
- Stable Internet connection
- Minimum 2GB RAM, 10GB storage

### Mobile Application
- Android 13+
- 100MB free space
- Camera for biometric verification

## Future Development

- Integration with additional verification systems
- Web interfaces for public queries
- More energy-efficient consensus mechanisms
- Improved horizontal scalability

## License

This work is licensed under a Creative Commons "Attribution-NonCommercial-ShareAlike 4.0 International" License (CC BY-NC-SA 4.0).

For more information: [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)

---

**Final Degree Project** - Universidad Politécnica de Madrid  
**Author**: Carlos Lafuente Sanz  
**Director**: Borja Bordel Sánchez  
**Date**: July 14, 2025