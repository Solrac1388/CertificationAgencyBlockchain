import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Provider as PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PermissionsAndroid, Platform, Alert } from 'react-native';

// Import polyfills
import 'react-native-get-random-values';
import './src/utils/polyfills';

// Screens
import WalletScreen from './src/screens/WalletScreen';
import PersonaScreen from './src/screens/PersonaScreen';
import CertificatesScreen from './src/screens/CertificatesScreen';
import DocumentVerificationScreen from './src/screens/DocumentVerificationScreen';

// Services
import { BlockchainClient } from './src/services/BlockchainClient';

const Stack = createNativeStackNavigator();

export default function App() {
  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Request permissions on Android
      if (Platform.OS === 'android') {
        await requestAndroidPermissions();
      }

      // Initialize blockchain client
      await BlockchainClient.getInstance().initialize();
    } catch (error) {
      console.error('App initialization error:', error);
      Alert.alert('Error', 'Failed to initialize app: ' + error.message);
    }
  };

  const requestAndroidPermissions = async () => {
    try {
      const permissions = [
        PermissionsAndroid.PERMISSIONS.INTERNET,
        PermissionsAndroid.PERMISSIONS.CAMERA,
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        PermissionsAndroid.PERMISSIONS.ACCESS_NETWORK_STATE,
      ];

      const results = await PermissionsAndroid.requestMultiple(permissions);
      
      const allGranted = Object.values(results).every(
        result => result === PermissionsAndroid.RESULTS.GRANTED
      );

      if (!allGranted) {
        Alert.alert(
          'Permissions Required',
          'The app needs all permissions to function correctly. Please enable them in settings.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Permission request error:', error);
    }
  };

  return (
    <SafeAreaProvider>
      <PaperProvider>
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName="Wallet"
            screenOptions={{
              headerStyle: {
                backgroundColor: '#2196F3',
              },
              headerTintColor: '#fff',
              headerTitleStyle: {
                fontWeight: 'bold',
              },
            }}
          >
            <Stack.Screen 
              name="Wallet" 
              component={WalletScreen}
              options={{ title: 'Blockchain Wallet' }}
            />
            <Stack.Screen 
              name="Persona" 
              component={PersonaScreen}
              options={{ title: 'Identity Verification' }}
            />
            <Stack.Screen 
              name="Certificates" 
              component={CertificatesScreen}
              options={{ title: 'My Certificates' }}
            />
            <Stack.Screen 
              name="DocumentVerification" 
              component={DocumentVerificationScreen}
              options={{ title: 'Document Verification' }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </PaperProvider>
    </SafeAreaProvider>
  );
}