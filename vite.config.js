import { defineConfig } from 'vite';
import { resolve } from 'path';

// Multi-page routes: /catalogue, //catalogue and /catalogue/ should all open the catalogue.
// (Without this, Vite's dev server falls back to the home page for the slash-less URL.)
const PAGES = ['catalogue', 'tree-grate'];
const trailingSlashPages = () => (req, res, next) => {
  const [path, query = ''] = req.url.split('?');
  const clean = path.replace(/\/{2,}/g, '/');
  const name = clean.replace(/^\/|\/$/g, '');
  if (PAGES.includes(name) && path !== `/${name}/`) {
    res.statusCode = 302;
    res.setHeader('Location', `/${name}/${query ? '?' + query : ''}`);
    return res.end();
  }
  next();
};
const pageRoutes = {
  name: 'page-routes',
  configureServer(server) { server.middlewares.use(trailingSlashPages()); },
  configurePreviewServer(server) { server.middlewares.use(trailingSlashPages()); },
};

export default defineConfig({
  base: './',
  plugins: [pageRoutes],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        treeGrate: resolve(__dirname, 'tree-grate/index.html'),
        catalogue: resolve(__dirname, 'catalogue/index.html'),
      },
    },
  },
});
