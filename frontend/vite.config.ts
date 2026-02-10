import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		port: 5173,
		proxy: {
			'/api': {
				target: 'http://localhost:3000',
				changeOrigin: false,
				cookieDomainRewrite: 'localhost',
				cookiePathRewrite: '/',
				secure: false,
				ws: true,
				configure: (proxy, _options) => {
					proxy.on('proxyRes', (proxyRes, req, res) => {
						// Log Set-Cookie headers for debugging
						const setCookie = proxyRes.headers['set-cookie'];
						if (setCookie) {
							console.log('[Proxy] Set-Cookie:', setCookie);
						}
					});
				}
			},
			'/share': {
				target: 'http://localhost:3000',
				changeOrigin: false,
				cookieDomainRewrite: 'localhost'
			},
			'/dl': {
				target: 'http://localhost:3000',
				changeOrigin: false,
				cookieDomainRewrite: 'localhost'
			}
		}
	}
});
