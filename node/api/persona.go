package api

import (
    "encoding/json"
    "fmt"
    "io"
    "net/http"
    "time"
)

// PersonaClient represents a client for the Persona API
type PersonaClient struct {
    baseURL    string
    apiKey     string
    httpClient *http.Client
}

// NewPersonaClient creates a new Persona API client
func NewPersonaClient(baseURL, apiKey string) *PersonaClient {
    return &PersonaClient{
        baseURL: baseURL,
        apiKey:  apiKey,
        httpClient: &http.Client{
            Timeout: 30 * time.Second,
        },
    }
}

// InquiryResponse represents the response from the Persona API
type InquiryResponse struct {
    Data struct {
        Type       string `json:"type"`
        ID         string `json:"id"`
        Attributes struct {
            Status      string    `json:"status"`
            CreatedAt   time.Time `json:"created_at"`
            CompletedAt time.Time `json:"completed_at"`
            Fields      struct {
                NameFirst string `json:"name_first"`
                NameLast  string `json:"name_last"`
            } `json:"fields"`
        } `json:"attributes"`
    } `json:"data"`
}

// VerificationResult represents the verification result
type VerificationResult struct {
    Status    string
    FirstName string
    LastName  string
    CreatedAt time.Time
    Verified  bool
}

// GetInquiry retrieves inquiry details from Persona
func (c *PersonaClient) GetInquiry(inquiryID string) (*InquiryResponse, error) {
    url := fmt.Sprintf("%s/inquiries/%s", c.baseURL, inquiryID)
    
    req, err := http.NewRequest("GET", url, nil)
    if err != nil {
        return nil, fmt.Errorf("failed to create request: %w", err)
    }
    
    // Set headers
    req.Header.Set("Authorization", "Bearer "+c.apiKey)
    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("Accept", "application/json")
    
    // Make request
    resp, err := c.httpClient.Do(req)
    if err != nil {
        return nil, fmt.Errorf("failed to make request: %w", err)
    }
    defer resp.Body.Close()
    
    // Check status code
    if resp.StatusCode != http.StatusOK {
        body, _ := io.ReadAll(resp.Body)
        return nil, fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(body))
    }
    
    // Parse response
    var inquiryResp InquiryResponse
    if err := json.NewDecoder(resp.Body).Decode(&inquiryResp); err != nil {
        return nil, fmt.Errorf("failed to decode response: %w", err)
    }
    
    return &inquiryResp, nil
}

// VerifyIdentity verifies an identity using an inquiry ID
func (c *PersonaClient) VerifyIdentity(inquiryID string, expectedName, expectedSurname string) (*VerificationResult, error) {
    // Get inquiry details
    inquiry, err := c.GetInquiry(inquiryID)
    if err != nil {
        return nil, fmt.Errorf("failed to get inquiry: %w", err)
    }
    
    result := &VerificationResult{
        Status:    inquiry.Data.Attributes.Status,
        FirstName: inquiry.Data.Attributes.Fields.NameFirst,
        LastName:  inquiry.Data.Attributes.Fields.NameLast,
        CreatedAt: inquiry.Data.Attributes.CreatedAt,
        Verified:  false,
    }
    
    // Check if inquiry is completed
    if result.Status != "completed" && result.Status != "approved" {
        return result, fmt.Errorf("inquiry not completed, status: %s", result.Status)
    }
    
    // If expectedName and expectedSurname are provided, verify they match
    if expectedName != "" && expectedSurname != "" {
        if result.FirstName != expectedName || result.LastName != expectedSurname {
            return result, fmt.Errorf("name mismatch: expected %s %s, got %s %s", 
                expectedName, expectedSurname, result.FirstName, result.LastName)
        }
    }
    
    // Check if inquiry is not too old (24 hours)
    if time.Since(result.CreatedAt) > 24*time.Hour {
        return result, fmt.Errorf("inquiry too old: created at %s", result.CreatedAt)
    }
    
    result.Verified = true
    return result, nil
}

// CheckInquiryStatus checks the status of an inquiry
func (c *PersonaClient) CheckInquiryStatus(inquiryID string) (string, error) {
    inquiry, err := c.GetInquiry(inquiryID)
    if err != nil {
        return "", err
    }
    
    return inquiry.Data.Attributes.Status, nil
}

// MockPersonaClient is a mock implementation for testing
type MockPersonaClient struct {
    mockData map[string]*InquiryResponse
}

// NewMockPersonaClient creates a new mock Persona client
func NewMockPersonaClient() *MockPersonaClient {
    return &MockPersonaClient{
        mockData: make(map[string]*InquiryResponse),
    }
}

// AddMockInquiry adds a mock inquiry for testing
func (m *MockPersonaClient) AddMockInquiry(inquiryID, status, firstName, lastName string) {
    m.mockData[inquiryID] = &InquiryResponse{
        Data: struct {
            Type       string `json:"type"`
            ID         string `json:"id"`
            Attributes struct {
                Status      string    `json:"status"`
                CreatedAt   time.Time `json:"created_at"`
                CompletedAt time.Time `json:"completed_at"`
                Fields      struct {
                    NameFirst string `json:"name_first"`
                    NameLast  string `json:"name_last"`
                } `json:"fields"`
            } `json:"attributes"`
        }{
            Type: "inquiry",
            ID:   inquiryID,
            Attributes: struct {
                Status      string    `json:"status"`
                CreatedAt   time.Time `json:"created_at"`
                CompletedAt time.Time `json:"completed_at"`
                Fields      struct {
                    NameFirst string `json:"name_first"`
                    NameLast  string `json:"name_last"`
                } `json:"fields"`
            }{
                Status:      status,
                CreatedAt:   time.Now(),
                CompletedAt: time.Now(),
                Fields: struct {
                    NameFirst string `json:"name_first"`
                    NameLast  string `json:"name_last"`
                }{
                    NameFirst: firstName,
                    NameLast:  lastName,
                },
            },
        },
    }
}

// GetInquiry retrieves a mock inquiry
func (m *MockPersonaClient) GetInquiry(inquiryID string) (*InquiryResponse, error) {
    inquiry, ok := m.mockData[inquiryID]
    if !ok {
        return nil, fmt.Errorf("inquiry not found")
    }
    return inquiry, nil
}

// VerifyIdentity verifies a mock identity
func (m *MockPersonaClient) VerifyIdentity(inquiryID string, expectedName, expectedSurname string) (*VerificationResult, error) {
    inquiry, err := m.GetInquiry(inquiryID)
    if err != nil {
        return nil, err
    }
    
    result := &VerificationResult{
        Status:    inquiry.Data.Attributes.Status,
        FirstName: inquiry.Data.Attributes.Fields.NameFirst,
        LastName:  inquiry.Data.Attributes.Fields.NameLast,
        CreatedAt: inquiry.Data.Attributes.CreatedAt,
        Verified:  false,
    }
    
    if result.Status == "completed" || result.Status == "approved" {
        if result.FirstName == expectedName && result.LastName == expectedSurname {
            result.Verified = true
        }
    }
    
    return result, nil
}