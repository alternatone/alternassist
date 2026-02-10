import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			pages: '../public-svelte',
			assets: '../public-svelte',
			fallback: 'index.html', // SPA mode for client-side routing
			precompress: false,
			strict: true
		}),
		paths: {
			base: '' // Express serves from root
		}
	}
};

export default config;
