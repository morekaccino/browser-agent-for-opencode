import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Browser Agent for opencode',
    short_name: 'Browser Agent',
    description: 'Drive Chrome with a local opencode AI agent — page snapshots, clicks, typing, navigation, console access, and scheduled tasks.',
    homepage_url: 'https://morekaccino.github.io/browser-agent-for-opencode/',
    minimum_chrome_version: '114',
    permissions: ['storage', 'tabs', 'scripting', 'debugger', 'sidePanel', 'alarms', 'tabGroups', 'downloads', 'notifications'],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: 'Browser Agent for opencode',
    },
  },
});
