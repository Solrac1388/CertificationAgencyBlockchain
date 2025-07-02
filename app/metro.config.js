const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

const config = {
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
  resolver: {
    alias: {
      crypto: 'react-native-crypto',
      stream: 'readable-stream',
      vm: 'vm-browserify',
    },
  },
};

module.exports = mergeConfig(defaultConfig, config);