import { defineConfig } from 'vite';

// On GitHub Actions, GITHUB_REPOSITORY is "owner/repo" and the site is served from
// https://owner.github.io/repo/ — unless repo IS "owner.github.io", which serves from the domain root.
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
const base = repo && !repo.endsWith('.github.io') ? `/${repo}/` : '/';

export default defineConfig({
  base,
  server: {
    port: 5173,
  },
});
