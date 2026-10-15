import { fileURLToPath, URL } from 'url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { visualizer } from "rollup-plugin-visualizer";


// On Vercel api/overture.mjs runs as a serverless function. The dev server
// would serve its source code instead, so run the same handler here.
function overtureApi() {
  return {
    name: 'overture-api',
    configureServer(server) {
      server.middlewares.use('/api/overture', async (req, res) => {
        try {
          let {default: handler} = await server.ssrLoadModule('/api/overture.mjs');
          await handler(req, res);
        } catch (err) {
          console.error(err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({error: String(err && err.message || err)}));
        }
      });
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [overtureApi(), vue(), visualizer({
  //  template: 'network'
  })],
  base: '',
  server: {
    port: 8080
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})
