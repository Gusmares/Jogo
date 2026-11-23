// NEON ENGINE — qual projeto as ferramentas estão usando.
// Um projeto é uma pasta com neon.project.json (ex.: projects/neon-coast). A engine nunca grava fora dele.
// Ordem: variável NEON_PROJECT  >  pasta do script que foi chamado (ferramentas do próprio projeto)  >  pasta atual  >  projects/neon-coast.
'use strict';
const fs = require('fs'), path = require('path');
const ENGINE = path.resolve(__dirname, '..'), REPO = path.resolve(ENGINE, '..');
const MANIFEST = 'neon.project.json';
const isProject = d => !!d && fs.existsSync(path.join(d, MANIFEST));
function findUp(dir) { let d = path.resolve(dir); for (;;) { if (isProject(d)) return d; const p = path.dirname(d); if (p === d) return null; d = p; } }
function projectRoot() {
  if (process.env.NEON_PROJECT && isProject(process.env.NEON_PROJECT)) return path.resolve(process.env.NEON_PROJECT);
  const main = require.main && require.main.filename;
  return (main && findUp(path.dirname(main))) || findUp(process.cwd()) || path.join(REPO, 'projects', 'neon-coast');
}
function readManifest(root) { try { return JSON.parse(fs.readFileSync(path.join(root, MANIFEST), 'utf8')); } catch (e) { return null; } }
/* projetos que ficam ao lado da engine (pasta projects/) */
function listProjects() {
  const dir = path.join(REPO, 'projects'); if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map(n => path.join(dir, n)).filter(isProject).map(p => ({ root: p, ...readManifest(p) }));
}
module.exports = { ENGINE, REPO, MANIFEST, isProject, projectRoot, readManifest, listProjects, root: projectRoot };
