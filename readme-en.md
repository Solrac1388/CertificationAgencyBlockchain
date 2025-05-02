# CertificationAgencyBlockchain

🇪🇸 [Ver en Español](README.md) | 🇬🇧 [View in English](readme-en.md)

## Description

CertificationAgencyBlockchain is a decentralized system for certifying the identity of public key owners using blockchain technology with proof of work. The system uses the Persona Verification API to verify users' identities and associate them with their public keys, thus creating a reliable digital identity certification system.

## System Components

### Mobile App
- User interface for Persona Verification
- RSA key generator
- Local storage of certificates on the device
- Sending encrypted key files via email
- Communication with blockchain nodes
- Certificate management (loading from device and local deletion)

### Blockchain Nodes
- Processing certification requests
- Identity verification through Persona API
- Blockchain maintenance through proof of work
- Key-value database for quick queries
- Identity and public key query service

## Workflow

1. **User Verification**: 
   - The user accesses the mobile app
   - Completes the verification process through Persona interface
   - An inquiry code (session code) is generated

2. **Key Generation**:
   - The app generates an RSA key pair
   - The key pair is encrypted with a password provided by the user
   - The keys are stored locally on the device
   - The encrypted file is sent to the user's email

3. **Certification Request**:
   - The app sends to nodes: public key (id), inquiry code, and RSA signature
   - Nodes verify the request by querying the Persona API
   - Valid requests are added to a pool of pending certifications

4. **Block Mining**:
   - Nodes participate in proof of work to create new blocks
   - Blocks contain validated certifications
   - The chain is updated and distributed among all nodes

5. **Queries**:
   - Users can query the identity associated with a public key
   - Users can query the public key associated with an identity

6. **Certificate Management**:
   - Users can manage certificates stored locally on the device
   - It's possible to import existing certificates from the device storage
   - Certificates can be deleted from the application at any time
   - To add a new certificate to the blockchain network, a new identity verification is required for each certificate

## Technical Architecture

### Blockchain Structure
- Blocks linked through hashes
- Proof of work for block validation
- Distributed consensus mechanism

### Integration with Persona API
- Identity verification through REST API
- Secure authentication
- Verification status query

### Security
- RSA encryption for digital signatures
- Protection of private keys through password encryption
- Cryptographic verification of chain integrity

## System Requirements

### Dependencies
- Python 3.8+
- Cryptography libraries
- Internet connection to access the Persona API

### Configuration
- Node configuration and connection points
- Difficulty parameters for proof of work
- API credentials for Persona Verification

## Installation and Usage

### Node Configuration
```
python node.py --port=5000
```

The script will automatically install all necessary dependencies on its first execution.

### Mobile App Execution
The mobile app is available for Android and can be downloaded from this repository.

## Future Development
- Integration with other identity verification systems
- Development of web interfaces for public queries

## License

This work is licensed under a Creative Commons "Attribution-NonCommercial-ShareAlike 4.0 International" License (CC BY-NC-SA 4.0).

This means you can:
- Share: copy and redistribute the material in any medium or format
- Adapt: remix, transform, and build upon the material

Under the following terms:
- Attribution: You must give appropriate credit, provide a link to the license, and indicate if changes were made.
- NonCommercial: You may not use the material for commercial purposes.
- ShareAlike: If you remix, transform, or build upon the material, you must distribute your contributions under the same license as the original.

For more information, visit: [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)