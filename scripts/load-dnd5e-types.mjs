// generate-types.mjs
import fs from 'fs';
import path from 'path';

const srcDir = './externals/dnd5e/module';
const destDir = './external-types/dnd5e/module';

if (!fs.existsSync(srcDir)) {
    throw new Error(
        `Missing ${srcDir}. Run 'git submodule update --init --recursive' first.`
    );
}

function processDirectory(dir) {
    const entries = fs.readdirSync(dir, {withFileTypes: true});

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            processDirectory(fullPath);
        } else if (entry.name === '_types.mjs') {
            const relativePath = path.relative(srcDir, fullPath);
            const destPath = path.join(destDir, relativePath);

            fs.mkdirSync(path.dirname(destPath), {recursive: true});

            let content = fs.readFileSync(fullPath, 'utf-8');

            // 1. Regex Magic: Find every @typedef and inject an @exports tag right before it
            content = content.replace(/\*\s+@typedef\s+(?:\{([^}]+)\}\s+)?(\w+)/g, (match, typeDef, typeName) => {
                // If Foundry provided a type (like {object}), keep it. If not, force {Object}.
                const typeStr = typeDef ? `{${typeDef}}` : `{Object}`;

                // CRITICAL FIX: Put @exports ABOVE the @typedef so the @property chain isn't broken!
                return `* @exports ${typeName}\n * @typedef ${typeStr} ${typeName}`;
            });

            // 2. Add the module export at the bottom if it's missing
            const hasExport = /(?:^|[\r\n])\s*export\s+/.test(content);
            if (!hasExport) {
                content += '\n\n// Auto-injected to expose types to TypeScript\nexport {};\n';
            }

            fs.writeFileSync(destPath, content);
        }
    }
}

console.log('Extracting and injecting @exports into D&D 5e types...');
processDirectory(srcDir);
console.log('Done! All types are fully exported in external-types/');