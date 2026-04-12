// Simulate what Expo's config loader does
const config = require('./app.config.ts');
console.log('Loaded config successfully');
console.log('Has exports:', !!config);
console.log('Has plugins:', !!config.plugins);
