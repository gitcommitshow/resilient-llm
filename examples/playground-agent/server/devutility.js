import { readFileSync, realpathSync, readlinkSync, lstatSync } from 'fs';
import { createRequire } from 'module';
import { dirname, resolve } from 'path';

/**
 * Get library version and source info
 * @returns {Object} { version: string, source: 'local'|'npm', sourcePath: string }
 */
export function getLibraryInfo() {
    try {
        const require = createRequire(import.meta.url);
        let packagePath = require.resolve('resilient-llm/package.json');
        
        // Simple check: use env var if set, otherwise check if path contains node_modules
        const isLocal = process.env.RESILIENT_LLM_SOURCE === 'local' || 
                       !packagePath.includes('node_modules');
        
        // For local installs, ALWAYS resolve the symlink to get the actual source package.json
        // This ensures we read the latest version from the source, not a cached copy
        if (isLocal) {
            try {
                packagePath = realpathSync(packagePath);
            } catch (error) {
                // If realpath fails, try to resolve the symlink manually
                const packageDir = dirname(packagePath);
                try {
                    const stats = lstatSync(packageDir);
                    if (stats.isSymbolicLink()) {
                        const symlinkTarget = readlinkSync(packageDir);
                        const resolvedTarget = symlinkTarget.startsWith('/') 
                            ? symlinkTarget 
                            : resolve(packageDir, symlinkTarget);
                        packagePath = resolve(resolvedTarget, 'package.json');
                    }
                } catch {
                    // Keep original path
                }
            }
        }
        
        const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
        const version = packageJson.version;
        
        // Get source path for link
        let sourcePath = 'https://www.npmjs.com/package/resilient-llm';
        if (isLocal) {
            // For local, resolve the actual path (follow symlinks) to get the real source folder
            try {
                const packageDir = dirname(packagePath);
                
                // Try to resolve the symlink chain
                // realpathSync follows all symlinks to the final destination
                const realPath = realpathSync(packagePath);
                const libDir = dirname(realPath);
                
                // If the resolved path is still in node_modules, it means the symlink
                // points to another location. Let's check the symlink directly.
                if (libDir.includes('node_modules')) {
                    // Check if packageDir itself is a symlink
                    try {
                        const stats = lstatSync(packageDir);
                        if (stats.isSymbolicLink()) {
                            const symlinkTarget = readlinkSync(packageDir);
                            // Resolve the symlink target
                            const resolvedTarget = symlinkTarget.startsWith('/') 
                                ? symlinkTarget 
                                : resolve(packageDir, symlinkTarget);
                            sourcePath = `file://${resolvedTarget}`;
                        } else {
                            // Not a direct symlink, but realpath resolved to node_modules
                            // This shouldn't happen for local installs, but use the resolved path
                            sourcePath = `file://${libDir}`;
                        }
                    } catch {
                        sourcePath = `file://${libDir}`;
                    }
                } else {
                    // Resolved to a path outside node_modules - this is the source!
                    sourcePath = `file://${libDir}`;
                }
            } catch (error) {
                // Fallback
                const libDir = dirname(packagePath);
                sourcePath = `file://${libDir}`;
            }
        }
        
        return {
            version,
            source: isLocal ? 'local' : 'npm',
            sourcePath
        };
    } catch (error) {
        return { 
            version: 'unknown', 
            source: 'unknown',
            sourcePath: '#'
        };
    }
}

