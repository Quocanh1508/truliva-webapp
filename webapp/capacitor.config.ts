import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.truliva.app',
  appName: 'TRULIVA',
  webDir: 'dist',
  server: {
    url: 'https://trulivaofficial.com',
    cleartext: true
  }
};

export default config;
