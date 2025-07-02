module.exports = {
  dependencies: {
    'react-native-vector-icons': {
      platforms: {
        ios: {
          xcodeprojPath: 'ios/BlockchainClient.xcodeproj',
          plistPath: 'ios/BlockchainClient/Info.plist',
        },
      },
    },
  },
  assets: ['./src/assets/fonts/', './src/assets/images/'],
};