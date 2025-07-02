/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

// Import polyfills at the very beginning
import './src/utils/polyfills';

AppRegistry.registerComponent(appName, () => App);