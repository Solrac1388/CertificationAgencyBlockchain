import React from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { PERSONA_CONFIG } from '../config/network';

const PersonaWebView = ({ onComplete, onError, onCancel }) => {
  const generatePersonaHTML = () => {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Identity Verification</title>
        <script src="https://cdn.withpersona.com/dist/persona-v5.2.1.js"></script>
        <style>
          body {
            margin: 0;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
          }
          .container {
            max-width: 400px;
            margin: 0 auto;
            text-align: center;
          }
          .loading {
            padding: 40px;
            color: #666;
          }
          .error {
            padding: 20px;
            background: #fee;
            color: #c33;
            border-radius: 8px;
            margin: 20px 0;
          }
          .success {
            padding: 20px;
            background: #efe;
            color: #3c3;
            border-radius: 8px;
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div id="loading" class="loading">
            <p>Loading identity verification...</p>
          </div>
          <div id="error" class="error" style="display: none;">
            <p id="error-message"></p>
          </div>
          <div id="success" class="success" style="display: none;">
            <p>Verification completed successfully</p>
          </div>
        </div>
        
        <script>
          function showError(message) {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('error-message').textContent = message;
            document.getElementById('error').style.display = 'block';
            
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'error',
              message: message
            }));
          }
          
          function showSuccess() {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('success').style.display = 'block';
          }
          
          try {
            const client = new Persona.Client({
              templateId: "${PERSONA_CONFIG.templateId}",
              environmentId: "${PERSONA_CONFIG.environmentId}",
              
              onLoad: () => {
                console.log('Persona loaded');
                document.getElementById('loading').style.display = 'none';
              },
              
              onReady: () => {
                console.log('Persona ready');
                client.open();
              },
              
              onComplete: ({ inquiryId, status, fields }) => {
                console.log('Verification completed:', inquiryId, status);
                showSuccess();
                
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'complete',
                  inquiryId: inquiryId,
                  status: status,
                  fields: fields
                }));
              },
              
              onCancel: ({ inquiryId, sessionToken }) => {
                console.log('Verification cancelled:', inquiryId);
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'cancel',
                  inquiryId: inquiryId || ''
                }));
              },
              
              onError: (error) => {
                console.error('Persona error:', error);
                showError('Verification failed: ' + error.message);
              }
            });
            
          } catch (error) {
            console.error('Failed to initialize Persona:', error);
            showError('Error loading verification system');
          }
        </script>
      </body>
      </html>
    `;
  };

  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      switch (data.type) {
        case 'complete':
          onComplete(data.inquiryId, data.status, data.fields);
          break;
        case 'error':
          onError(data.message);
          break;
        case 'cancel':
          onCancel(data.inquiryId);
          break;
      }
    } catch (error) {
      console.error('WebView message error:', error);
    }
  };

  return (
    <View style={styles.container}>
      <WebView
        source={{ html: generatePersonaHTML() }}
        onMessage={handleMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        mixedContentMode="compatibility"
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default PersonaWebView;